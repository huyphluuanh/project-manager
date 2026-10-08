# Project Manager

Hệ thống quản lý dự án cá nhân đa thiết bị:

- **Windows app** (Tauri): `ProjectManagerSetup.exe`, có khay hệ thống và thông báo Windows.
- **Web app / PWA** responsive, ưu tiên mobile: https://huyphluuanh.github.io/project-manager/
- **Dữ liệu dùng chung** trên Supabase, đồng bộ realtime, làm việc được khi offline.

| Tài liệu | Nội dung |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Cấu hình Supabase + GitHub lần đầu |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Chạy dev, build web, build `.exe`, deploy, biến môi trường, backup/restore, test |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Kiến trúc, database schema, API, cơ chế đồng bộ & conflict |

## Công nghệ

| Phần | Lựa chọn | Lý do |
|---|---|---|
| UI | React 19 + TypeScript + Vite + Tailwind CSS 4 | Nhanh, phổ biến, dễ bảo trì |
| Dữ liệu local | IndexedDB (Dexie) | Offline-first, UI phản hồi tức thì |
| Backend | Supabase (Postgres + Auth + Realtime + Storage) | Không phải tự vận hành server; bảo mật bằng RLS |
| Windows | Tauri 2 | File cài đặt nhỏ (~5–10 MB), dùng WebView2 có sẵn trên Win 10/11 |
| Biểu đồ | Recharts | |
| Kéo thả | dnd-kit | Hỗ trợ cả chuột và cảm ứng |
| CI/CD | GitHub Actions + GitHub Pages + Releases | Miễn phí |

## Cấu trúc thư mục

```
├── .github/workflows/
│   ├── deploy-web.yml        # push main -> test -> build -> GitHub Pages
│   ├── release-desktop.yml   # tag v* -> build ProjectManagerSetup.exe -> Releases
│   └── db-migrate.yml        # migration mới -> supabase db push
├── docs/                     # Tài liệu
├── public/                   # favicon, icon PWA
├── scripts/make-icon.mjs     # Sinh icon (npm run icons)
├── src/
│   ├── lib/                  # Lõi, không phụ thuộc UI
│   │   ├── db.ts             #   IndexedDB: bảng đồng bộ + outbox + conflicts + backups
│   │   ├── store.ts          #   Ghi local-first + xếp hàng outbox
│   │   ├── sync.ts           #   Push/pull/realtime, phát hiện & xử lý conflict
│   │   ├── repo.ts           #   Thao tác nghiệp vụ (project, task, subtask, reminder…)
│   │   ├── logic.ts          #   Priority score, progress, risk, filter/sort
│   │   ├── quickAdd.ts       #   Phân tích "Fix bug tomorrow high priority"
│   │   ├── search.ts         #   Cú pháp tìm kiếm priority:/project:/overdue
│   │   ├── notifier.ts       #   Nhắc việc, thông báo đến hạn/quá hạn
│   │   ├── exporter.ts       #   CSV / Excel / JSON backup
│   │   ├── importer.ts       #   Import có preview + validation, ghi nguyên tử
│   │   └── platform.ts       #   Khác biệt Windows (Tauri) và trình duyệt
│   ├── hooks/                # useAuth, useWorkspace, useUI, useTaskActions
│   ├── components/           # AppShell, TaskDetail, Kanban, Timeline, QuickAdd, …
│   ├── pages/                # Dashboard, MyDay, Tasks, Projects, Calendar, Reports, …
│   └── test/                 # Supabase giả lập cho unit test
├── src-tauri/                # App Windows (Rust): khay hệ thống, autostart, installer
└── supabase/
    ├── config.toml
    └── migrations/           # Schema + RLS + trigger (nguồn sự thật của database)
```

## Chức năng đã hoàn thành

**Core:** Project (tạo/sửa/xóa/archive/restore/yêu thích, màu, deadline, trạng thái, ưu tiên, progress tự tính hoặc thủ công), Task (đủ trường trong spec), Status, Priority, Deadline + giờ, Progress.

**Productivity:**
- Dashboard: 9 KPI, tiến độ dự án, cảnh báo rủi ro, milestone, 6 biểu đồ, bộ lọc dự án/thời gian/trạng thái/ưu tiên/người phụ trách.
- My Day: tự gợi ý; kéo thả vào Today trên desktop, nút ☀ trên mobile.
- Calendar: Day/Week/Month, kéo thả để đổi deadline, hiện milestone, deadline dự án, nhắc việc.
- Reminder: 5p, 15p, 30p, 1h, 1 ngày hoặc giờ tùy chọn; Snooze/Dismiss/Done.
- Tìm kiếm toàn cục `Ctrl+K` với cú pháp `priority:` `status:` `project:` `tag:` `assignee:` `overdue` `today`.
- Filter + Sort + Saved Views.
- Kanban kéo thả, cuộn ngang trên mobile.

**Advanced:** Subtask (x/y completed, progress tự tính); Dependency (Blocked by / Blocks / Related to, chặn vòng phụ thuộc, tự chuyển Blocked/Todo); Milestone; Time tracking (Start/Pause/Resume/Stop, chỉ 1 timer chạy cùng lúc); Reports (hôm nay/tuần/tháng/tùy chọn, xuất CSV/Excel/PDF); Activity log tự ghi bằng trigger database; Timeline/Gantt có mũi tên phụ thuộc; Priority Score bật/tắt được; Risk detection.

**Multi-device:**
- Đăng nhập email + mật khẩu, ghi nhớ đăng nhập, quên/đặt lại mật khẩu, đổi email/mật khẩu, đăng xuất thiết bị khác.
- Web responsive với navigation riêng cho mobile, nút + nổi, thẻ task có vuốt (phải = hoàn thành, trái = hoãn/đổi ưu tiên).
- Đồng bộ realtime; offline-first với outbox.
- Conflict detection theo từng trường kèm màn hình chọn bản giữ lại. Trạng thái Synced / Syncing / Offline / Sync Error.

**Polish:**
- Notification Center (đọc / đọc tất cả / xóa), thông báo Windows hoặc trình duyệt.
- PWA: Add to Home Screen, cache app shell.
- Backup Now, tự động backup hằng ngày (7 bản), Restore.
- Export JSON/CSV/Excel; Import JSON/CSV có preview và validation, ghi nguyên tử (lỗi giữa chừng thì không mất dữ liệu).
- Dark mode đồng bộ giữa các thiết bị; phím tắt; khả năng truy cập (focus rõ, ARIA, trạng thái không chỉ dựa vào màu).
- Error boundary theo trang; Undo cho xóa/hoàn thành/dời deadline; xác nhận trước khi xóa.
- Load Demo Data.
- Windows: khay hệ thống (Open, My Day, Add Task, Today's Tasks, Notifications, Quit), khởi động cùng Windows, thu nhỏ xuống khay, single instance, installer NSIS.

## Chưa triển khai / giới hạn đã biết

| Hạng mục | Tình trạng |
|---|---|
| App Windows chưa build thử trên máy này | Máy chưa có Rust. File `.exe` sẽ được build trên GitHub Actions ở lần tag đầu tiên. Nếu lỗi biên dịch, gửi log để sửa |
| Mời thành viên / team UI | Database và RLS đã sẵn (`project_members`, role owner/admin/editor/viewer), chưa có màn hình mời |
| Google / Microsoft login, 2FA | Supabase hỗ trợ sẵn, chưa bật |
| Nhắc việc trên web khi đã đóng tab | Cần Web Push + server gửi; hiện chỉ nhắc khi tab/PWA đang mở. App Windows nhắc được khi chạy nền |
| Đổi ngôn ngữ giao diện | Hiện chỉ có tiếng Việt (nhãn trạng thái/ưu tiên giữ tiếng Anh như spec) |
| Custom status | Database dùng CHECK constraint (đổi được bằng migration), chưa có UI |
| Mention | Chưa có bình luận nên chưa có @mention |
| Auto update app Windows | Chưa bật (cần khóa ký updater); tải bản mới ở trang Releases |
| Danh sách rất dài | Dùng phân trang "Hiển thị thêm" thay cho virtualized list |
| File đính kèm, xem lịch sử | Cần online |
| Test E2E tự động | Có 21 unit test lõi + checklist test thủ công trong DEVELOPMENT.md |

## Roadmap

1. **v0.2:** build & kiểm thử `.exe` trên CI; màn hình mời thành viên; Google login; xuất PDF đẹp hơn.
2. **v0.3:** Web Push (Supabase Edge Function + pg_cron) để nhắc việc khi đóng app; bình luận + @mention.
3. **v0.4:** Custom status/workflow theo dự án; recurring task; template dự án.
4. **v0.5:** Auto update cho Windows; i18n (EN); E2E test bằng Playwright.
5. **Sau đó:** app mobile native (Tauri mobile / React Native) dùng chung lớp `src/lib`.
