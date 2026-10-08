# Project Manager — hướng dẫn cho Claude

App quản lý dự án cá nhân: web/PWA + app Windows (Tauri), dữ liệu trên Supabase.
Chủ dự án: GitHub `huyphluuanh`. Trao đổi bằng **tiếng Việt**.

## Cách làm việc với chủ dự án (quan trọng)

- Người dùng không chuyên kỹ thuật và rất mệt khi bị giao nhiều bước. **Tự làm mọi thứ có thể** (code, test,
  commit, push, phát hành, cập nhật app trên máy). Chỉ nhờ người dùng việc bắt buộc phải là họ (đăng nhập),
  gom thành MỘT danh sách ngắn ngay từ đầu, không nhỏ giọt thêm bước.
- Ưu tiên hướng dẫn bấm trên web hơn dòng lệnh. Làm xong phải tự kiểm tra (test, build, mở thử) rồi mới báo.

## Nơi mọi thứ nằm

| Thứ | Ở đâu |
|---|---|
| Code | https://github.com/huyphluuanh/project-manager (public, nhánh `main`) |
| Web app | https://huyphluuanh.github.io/project-manager/ (GitHub Pages, tự deploy khi push `main`) |
| File cài Windows | GitHub Releases, tạo bằng tag `vX.Y.Z` |
| Database / đăng nhập / file | Supabase project ref `ukxoxtjjapomeossebzx` (region Singapore) |
| Cấu hình công khai | `.env.production` (URL + publishable key — được phép public, đã có RLS) |
| Tài liệu | `README.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/SETUP.md` |

## Quy trình thay đổi

1. Sửa code → `npm run typecheck` → `npm test` → `npm run build`.
2. Kiểm tra giao diện không cần đăng nhập: `npm run dev` rồi mở `http://localhost:5173/?uitest`
   (chỉ có ở dev; dữ liệu local, Settings → Load Demo Data). Không đăng nhập Supabase thay người dùng.
3. Kiểm tra build bản Windows: đặt `TAURI_ENV_PLATFORM=windows` rồi `npx vite build`
   (máy không có Rust; phần Rust chỉ build trên GitHub Actions).
4. Commit + push `main` → web tự deploy (workflow `deploy-web.yml`).
5. App Windows: tăng `version` trong `package.json`, tạo tag `vX.Y.Z`, push tag → `release-desktop.yml`
   build `ProjectManagerSetup.exe` + `ProjectManager.exe` lên Releases. Theo dõi Actions đến khi xong; lỗi thì
   đọc log job, sửa, chạy lại.
6. Cập nhật app đã cài trên máy người dùng: tải `ProjectManagerSetup.exe` của release mới, dừng tiến trình
   `ProjectManager`, chạy installer với `/S` (cài cho user hiện tại, giữ dữ liệu), mở lại
   `%LOCALAPPDATA%\ProjectManager\ProjectManager.exe`.
7. Thay đổi database: `npm run db:new <tên>` viết SQL mới (không sửa migration cũ). Cách dễ cho người dùng:
   dán SQL vào Supabase Dashboard → SQL Editor. Workflow `db-migrate.yml` chỉ chạy tay (cần secrets SUPABASE_*).

## Lưu ý môi trường Windows của người dùng

- PowerShell chặn `npm.ps1` → dùng `npm.cmd` / `npx.cmd`.
- Git nằm ở `C:\Program Files\Git\cmd\git.exe`; đăng nhập GitHub lưu trong Git Credential Manager.
- Shell của Claude Code đặt `GCM_INTERACTIVE=never` và `GIT_TERMINAL_PROMPT=0` → push hoặc đọc credential
  thì xóa 2 biến này và chạy ngoài sandbox. Cửa sổ PowerShell mở bằng `Start-Process` cũng thừa hưởng
  2 biến này — phải xóa trong lệnh của cửa sổ đó.
- Gọi GitHub API (xem log Actions) có xác thực: lấy token bằng `git credential fill` với input là file ASCII
  đưa qua `cmd /c "... < file"` (pipe trong PowerShell 5.1 làm hỏng input); không bao giờ in token ra.
- Supabase gói Free tạm dừng sau 7 ngày không hoạt động → Dashboard → Restore project.

## Kiến trúc tóm tắt

React 19 + Vite + Tailwind 4; dữ liệu local-first trong IndexedDB (Dexie) với outbox; `src/lib/sync.ts`
đẩy/kéo với Supabase, phát hiện conflict bằng cột `version` (không bao giờ ghi đè âm thầm).
Logic nghiệp vụ ở `src/lib` (có unit test), giao diện ở `src/pages` + `src/components`,
app Windows ở `src-tauri` (khay hệ thống, autostart, thông báo). Chi tiết: `docs/ARCHITECTURE.md`.
