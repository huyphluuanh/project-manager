# Kiến trúc

```
┌───────────── Thiết bị (Windows app / trình duyệt / điện thoại) ─────────────┐
│  React UI ──đọc──► IndexedDB (Dexie) ◄──ghi── repo.ts / store.ts            │
│                        │  bảng dữ liệu (bản sao local)                       │
│                        │  outbox  (thay đổi chờ gửi)                         │
│                        │  conflicts, backups, meta (cursor đồng bộ)          │
│                        ▼                                                     │
│                    sync.ts  ──push (insert / update ... where version)──┐    │
│                             ◄─pull (updated_at >= cursor)──────────────┐│    │
│                             ◄─realtime (postgres_changes)─────────────┐││    │
└───────────────────────────────────────────────────────────────────────┼┼┼────┘
                                                                        │││
┌────────────────────────────── Supabase ───────────────────────────────┼┼┼────┐
│  Auth (email/password, JWT)      PostgREST API  ◄──────────────────────┘┘┘   │
│  Postgres: bảng + RLS + trigger (version, updated_at, activity log)          │
│  Realtime publication            Storage bucket "attachments" (private)      │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Local-first**: mọi thao tác ghi vào IndexedDB trước, nên UI phản hồi tức thì và chạy được khi offline. Sau đó sync engine đẩy lên server.
- **Không có backend tự viết**: API là REST tự sinh của Supabase (PostgREST) theo schema. Bảo mật nằm ở database (RLS), nên client không thể vượt quyền dù dùng key công khai.
- Lớp `src/lib` không phụ thuộc React, có thể tái sử dụng cho app mobile native sau này.

## Database schema

Nguồn sự thật: [supabase/migrations/20261008000000_init.sql](../supabase/migrations/20261008000000_init.sql).

| Bảng | Khóa | Ghi chú |
|---|---|---|
| `profiles` | id (= auth.users.id) | Tự tạo khi đăng ký (trigger) |
| `user_settings` | user_id | theme + settings JSON |
| `projects` | id | status, priority, start_date, deadline, progress_mode/manual_progress, color, is_favorite, archived_at |
| `project_members` | (project_id, user_id) | role: owner/admin/editor/viewer; owner tự thêm khi tạo project |
| `tasks` | id | project_id, assignee_id, status, priority, start/due date, due_time, progress, is_pinned, my_day_date, snoozed_until, completed_at (trigger tự set) |
| `subtasks` | id | task_id, is_done |
| `task_dependencies` | id | task_id phụ thuộc depends_on_task_id; type blocked_by / related_to; trigger chặn vòng |
| `tags`, `task_tags`, `project_tags` | | Tag của từng user |
| `milestones` | id | project_id, due_date, is_done |
| `reminders` | id | remind_at, offset_minutes, status pending/fired/snoozed/dismissed/done |
| `time_entries` | id | started_at, ended_at, duration_seconds (cột tự tính); mỗi user chỉ 1 timer đang chạy (unique index) |
| `notes` | id | Markdown cho project **hoặc** task |
| `attachments` | id | Metadata; file nằm ở Storage `attachments/<project_id>/<uuid>-<tên>` |
| `notifications` | id | Có id cố định theo sự kiện → không trùng giữa thiết bị |
| `activity_logs` | id | Chỉ đọc; trigger ghi: created, status/priority/deadline/assignment changed, completed, reopened, moved, renamed, deleted, restored, archived |
| `saved_views` | id | filters + sort JSON |
| `sync_events` | id (= mutation id) | Log conflict / bị từ chối |
| View `project_stats`, `task_progress` | | Tiến độ tính sẵn (security_invoker → vẫn theo RLS) |

**Cột chung của các bảng đồng bộ:**
- `created_at`, `updated_at`: trigger tự set.
- `deleted_at`: soft delete, dùng làm tombstone cho đồng bộ.
- `version`: trigger tự tăng mỗi lần sửa.

## Phân quyền (RLS)

| Đối tượng | Đọc | Ghi |
|---|---|---|
| Project và dữ liệu thuộc project (task, subtask, milestone, note, attachment, tag gắn task) | Thành viên project | owner/admin/editor |
| Xóa cứng project | | Chỉ owner |
| Quản lý thành viên | Thành viên project | owner/admin |
| Tag, reminder, time entry, notification, settings, saved view | Chính chủ | Chính chủ |
| activity_logs | Thành viên project | Không ai (chỉ trigger) |
| Người chưa đăng nhập (`anon`) | Không | Không |

## API

App dùng `@supabase/supabase-js` gọi REST API tự sinh:

```
GET    /rest/v1/tasks?updated_at=gte.<cursor>&order=updated_at     (pull)
POST   /rest/v1/tasks                                             (insert)
PATCH  /rest/v1/tasks?id=eq.<id>&version=eq.<base_version>        (update có kiểm tra conflict)
GET    /rest/v1/activity_logs?task_id=eq.<id>                     (lịch sử)
POST   /auth/v1/token?grant_type=password                         (đăng nhập)
POST   /auth/v1/recover                                           (quên mật khẩu)
POST   /storage/v1/object/attachments/<path>                      (upload file)
WS     /realtime/v1                                               (thay đổi realtime)
```

Tài liệu đầy đủ từng bảng (tự sinh theo schema hiện tại): Supabase Dashboard → **API Docs**.

## Đồng bộ & xử lý conflict

**Ghi (store.ts):**
1. Cập nhật IndexedDB.
2. Thêm mục vào `outbox`, gồm `patch`, `base` (giá trị cũ của các trường bị sửa) và `base_version`.
3. Nếu mục trước đó của cùng dòng chưa được gửi thì gộp chung vào mục đó.

**Push (sync.ts),** từng mục theo đúng thứ tự:
- **insert:** nếu gặp lỗi trùng khóa `23505` (đã gửi thành công trước khi mất mạng) thì coi như đã xong, đảm bảo không tạo bản trùng.
- **update:** `PATCH ... where version = base_version`. Nếu 0 dòng bị ảnh hưởng, nghĩa là thiết bị khác đã sửa trước. App đọc bản server rồi xử lý từng trường:
  - Trường mình sửa mà server **không đổi**: gửi lại trên version mới (tự gộp).
  - Trường **cả hai bên cùng đổi** và khác nhau: **CONFLICT**. Giữ bản server, lưu bản của mình vào `conflicts` và báo người dùng chọn "Dùng bản của tôi" hoặc "Giữ bản hiện tại". **Không bao giờ ghi đè mà không báo.**
- **Lỗi mạng hoặc 5xx:** dừng, thử lại với backoff (2s đến 60s).
- **Server từ chối** (RLS, validation): khôi phục bản server, báo lỗi và ghi `sync_events`.

**Pull:** lấy các dòng có `updated_at >= cursor - 5s` (đọc chồng lấn để không sót), rồi gộp với các thay đổi local còn chờ gửi.

**Realtime:** nhận `postgres_changes` thì pull bảng tương ứng. Ngoài ra pull định kỳ mỗi 2 phút, khi có mạng lại, và khi mở lại app.

Các kịch bản trên đều có unit test trong [src/lib/sync.test.ts](../src/lib/sync.test.ts).

## Priority Score

```
Ưu tiên:   critical 100 · high 70 · medium 40 · low 10
Deadline:  quá hạn +60 (+2/ngày, tối đa +20) · hôm nay +50 · ngày mai +40 · ≤3 ngày +30 · ≤7 ngày +15
Dự án:     critical +15 · high +10 · medium +5
Đang chặn task khác: +10 mỗi task (tối đa +30)
Ghim +20 · Trong My Day +10 · Bị block −30 · Đang tạm hoãn −50 · Đã xong −1000
```

Ví dụ: Critical + deadline ngày mai = 140 điểm, lên đầu danh sách.

## Risk detection

- **High:** đã quá deadline chưa xong; hoặc còn ≤2 ngày mà tiến độ <80%; hoặc thời gian đã trôi nhiều hơn tiến độ quá 30%.
- **Medium:** chậm hơn kế hoạch quá 15%; có task quá hạn; có task bị block; còn task Critical khi chỉ còn ≤7 ngày; số task mở quá nhiều so với số ngày còn lại.
