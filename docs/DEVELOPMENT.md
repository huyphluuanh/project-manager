# Phát triển, build và deploy

> Trên Windows, nếu PowerShell báo `running scripts is disabled`, hãy gõ `npm.cmd` / `npx.cmd` thay cho `npm` / `npx`.

## 1. Biến môi trường

| Biến | Dùng ở | Ví dụ |
|---|---|---|
| `VITE_SUPABASE_URL` | Web + Windows (lúc build) | `https://ukxoxtjjapomeossebzx.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Web + Windows (lúc build) | `sb_publishable_...` |
| `VITE_BASE` | Tùy chọn: đường dẫn gốc khi host chỗ khác | mặc định `/project-manager/` |
| `VITE_PUBLIC_WEB_HOST` | Tùy chọn: link trong email gửi từ app Windows | mặc định `huyphluuanh.github.io/project-manager/` |

- **Máy local:** đặt các biến trong file `.env.local` (đã có trong `.gitignore`).
- **GitHub Actions:** đặt trong *Settings → Secrets and variables → Actions*.
- **Không bao giờ** dùng Secret key / `service_role` trong app.

## 2. Chạy môi trường dev

```bash
npm install
```

```bash
npm run dev
```

Mở http://localhost:5173.

**Chế độ kiểm thử giao diện** (chỉ có khi chạy dev, không có trong bản build): http://localhost:5173/?uitest. Dữ liệu nằm trong trình duyệt, không kết nối server. Bấm *Load Demo Data* để có dữ liệu mẫu.

## 3. Build production web

```bash
npm run build
```

Kết quả nằm ở `dist/`. Xem thử bằng `npm run preview`.

**Deploy:** push lên nhánh `main`, workflow [deploy-web.yml](../.github/workflows/deploy-web.yml) sẽ chạy typecheck, test, build rồi đưa lên GitHub Pages. Muốn host chỗ khác (Vercel, Netlify, Cloudflare Pages): build command `npm run build`, output `dist`, đặt `VITE_BASE=/`.

## 4. Build app Windows (.exe)

### Cách 1: GitHub Actions (khuyến nghị, không cần cài gì)

1. Tăng `version` trong `package.json` (ví dụ `0.2.0`) và commit.
2. Tạo tag rồi push:
   ```bash
   git tag v0.2.0
   ```
   ```bash
   git push origin v0.2.0
   ```
3. Workflow [release-desktop.yml](../.github/workflows/release-desktop.yml) sẽ build và đăng lên trang **Releases**:
   - `ProjectManagerSetup.exe`: bộ cài (cài cho user hiện tại, có shortcut Start Menu và Desktop, gỡ cài đặt trong Settings của Windows).
   - `ProjectManager.exe`: bản chạy trực tiếp, không cần cài.

### Cách 2: Build trên máy

1. Cài [Rust](https://rustup.rs) và *Microsoft C++ Build Tools* (chọn "Desktop development with C++").
2. Chạy:
   ```bash
   npm run desktop:dev
   ```
   ```bash
   npm run desktop:build
   ```
   Kết quả nằm ở `src-tauri/target/release/bundle/nsis/`.

Icon: sửa `scripts/make-icon.mjs` rồi chạy `npm run icons`.

## 5. Backend (Supabase)

Không có server riêng để deploy. Thay đổi database bằng migration:

```bash
npm run db:new ten_thay_doi
```

Viết SQL vào file mới trong `supabase/migrations/`, rồi push lên `main`. Workflow [db-migrate.yml](../.github/workflows/db-migrate.yml) sẽ chạy `supabase db push`.

- **Không sửa** file migration đã chạy; muốn sửa thì tạo migration mới.
- **Gói Free** của Supabase sẽ tạm dừng project sau 7 ngày không hoạt động. Vào Dashboard bấm *Restore* là chạy lại.

## 6. Backup & Restore

| Cách | Thao tác |
|---|---|
| Backup thủ công | Settings → Data → **Backup Now**: tải file JSON chứa toàn bộ dữ liệu của tài khoản |
| Backup tự động | Mỗi ngày app lưu 1 bản trong máy (IndexedDB), giữ 7 bản; khôi phục ở Settings → Data |
| Restore / Import | Settings → Data → **Restore / Import JSON** → xem trước → chọn *Chỉ thêm mới* hoặc *Thêm mới + cập nhật bản cũ hơn* |
| Import task từ CSV | Cột: `title, project, status, priority, due_date, start_date, tags, description` (dòng lỗi được đánh dấu và bỏ qua) |
| Backup cấp server | Supabase Dashboard → Database → Backups (gói Free: tải bản dump bằng `supabase db dump`) |

Import ghi trong **một transaction**: nếu lỗi giữa chừng thì không có gì bị thay đổi.

## 7. Test

```bash
npm test
```

```bash
npm run typecheck
```

**Unit test (21 test, chạy tự động trên CI):**
- Quick Add (tiếng Anh và tiếng Việt)
- Priority score
- Progress, risk
- Tìm kiếm, filter
- CSV
- Sync engine trên Supabase giả lập: tạo offline rồi đồng bộ; mất response và gửi lại không trùng; conflict cùng trường; tự gộp khi khác trường; pull giữ thay đổi local; server từ chối; rebase khi đang gửi; autoBlock theo phụ thuộc.

**Checklist test thủ công (2 thiết bị, ví dụ Windows + điện thoại):**

| Nhóm | Bước | Kỳ vọng |
|---|---|---|
| Auth | Đăng ký, xác nhận email, đăng nhập, sai mật khẩu, quên mật khẩu, đăng xuất, mở lại trình duyệt | Thông báo lỗi dễ hiểu; "Ghi nhớ đăng nhập" giữ phiên |
| Project | Tạo, sửa, archive, restore, xóa, khôi phục từ Thùng rác | Dữ liệu đúng trên cả 2 thiết bị |
| Task | Tạo, sửa, hoàn thành, mở lại, đổi ưu tiên, đổi deadline, xóa, Undo | Activity log có đủ sự kiện |
| Kanban | Kéo thẻ sang cột khác | Status đổi, thiết bị kia cập nhật trong vài giây |
| Calendar | Bấm + ở 1 ngày để tạo task; kéo task sang ngày khác | Deadline đổi |
| Reminder | Tạo nhắc 5 phút; chờ; Snooze 10 phút; Done | Thông báo hiện; task được hoàn thành |
| Sync | Sửa trên Windows, xem trên mobile; và ngược lại | Cập nhật realtime |
| Offline | Tắt mạng, tạo và sửa task, bật lại mạng | Trạng thái chuyển Offline → Syncing → Synced; dữ liệu lên server |
| Conflict | Tắt mạng thiết bị A, sửa tên task trên A và B, bật mạng A | Hiện "1 xung đột", chọn được bản muốn giữ |
| Backup | Backup Now, xóa 1 task, Restore file vừa tải | Task quay lại |
