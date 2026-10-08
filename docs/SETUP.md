# Cấu hình Supabase + GitHub

Thời gian: khoảng 20 phút. Cần: Node.js >= 20 (đã có), email.

## Kiến trúc

```
                  ┌─────────────── Supabase ───────────────┐
 Windows (Tauri) ─┤  Auth      : đăng nhập, reset mật khẩu  │
 Web / Mobile    ─┤  Postgres  : dữ liệu + RLS bảo mật       │
   (PWA)          │  Realtime  : đồng bộ tức thời            │
                  │  Storage   : file đính kèm               │
                  └─────────────────────────────────────────┘
 GitHub: lưu source code
         GitHub Actions → tự cập nhật database, build web, build file .exe
         GitHub Pages   → host web app
         GitHub Releases→ nơi tải ProjectManagerSetup.exe
```

App gọi thẳng Supabase bằng **Publishable key**. Key này công khai được. Mỗi user chỉ đọc ghi được dữ liệu của mình nhờ **Row Level Security (RLS)** đã viết sẵn trong [migration](../supabase/migrations/20261008000000_init.sql).

---

# Phần A – Supabase

## A1. Tạo tài khoản và project

1. Vào https://supabase.com → **Start your project**. Nên chọn **Continue with GitHub** để dùng chung tài khoản.
2. **New project**:
   - **Name**: `project-manager`
   - **Database Password**: bấm *Generate*, rồi **lưu lại ngay** (cần ở bước A4 và B4).
   - **Region**: `Southeast Asia (Singapore)` để nhanh nhất từ Việt Nam.
   - **Plan**: Free.
3. Chờ khoảng 2 phút để project khởi tạo.

> Gói Free sẽ **tạm dừng project nếu 7 ngày không có hoạt động**. Mở lại Dashboard và bấm *Restore* là chạy lại, dữ liệu không mất.

## A2. Lấy thông tin kết nối

Vào **Project Settings** (biểu tượng bánh răng):

| Cần lấy | Ở đâu | Ví dụ |
|---|---|---|
| **Project ref** | Settings → General → *Project ID* | `abcdwxyzabcdwxyz` |
| **Project URL** | Settings → Data API | `https://abcdwxyzabcdwxyz.supabase.co` |
| **Publishable key** | Settings → API Keys | `sb_publishable_...` (hoặc *anon* key ở tab Legacy) |

> 🔒 Trang API Keys còn có **Secret key** / **service_role**. Key này **bỏ qua toàn bộ bảo mật**. Không đưa vào app, không commit, không gửi cho ai.

## A3. Cấu hình đăng nhập

**Authentication → Sign In / Providers → Email**:
- Bật **Email**.
- Bật **Confirm email** (khuyến nghị).
- **Minimum password length**: `8`.

**Authentication → URL Configuration**:
- **Site URL**: `https://huyphluuanh.github.io/project-manager/`
- **Redirect URLs**: thêm lần lượt:
  ```
  https://huyphluuanh.github.io/project-manager/**
  http://localhost:5173/**
  ```
  Các URL này cho phép link xác nhận email và link reset mật khẩu mở được app.

> ⚠️ **Email**: dịch vụ gửi mail có sẵn của Supabase chỉ gửi tới email của thành viên trong team Supabase, và chỉ vài email mỗi giờ. Nếu bạn đăng ký app bằng chính email dùng để tạo tài khoản Supabase thì không sao. Muốn gửi cho người khác, vào **Authentication → Emails → SMTP Settings** để cấu hình SMTP riêng (ví dụ Resend, Gmail SMTP).

## A4. Tạo database (chạy migration)

Mở PowerShell, chuyển vào thư mục project rồi chạy lần lượt các lệnh bên dưới:

```bash
cd D:\Claude\App
```

> Nếu gặp lỗi `npm.ps1 cannot be loaded because running scripts is disabled`, hãy gõ `npm.cmd` / `npx.cmd` thay cho `npm` / `npx` (ví dụ `npx.cmd supabase login`). Một cách khác là chạy một lần lệnh `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` để bỏ chặn vĩnh viễn cho tài khoản của bạn.

```bash
npm install
```

```bash
npx supabase login
```

Lệnh này mở trình duyệt để bạn đăng nhập Supabase.

```bash
npx supabase link --project-ref <project-ref>
```

Lệnh sẽ hỏi Database Password đã lưu ở bước A1.

```bash
npx supabase db push
```

Gõ `Y` để xác nhận. Kết quả mong đợi: `Applying migration 20261008000000_init.sql... Finished supabase db push.`

**Cách thay thế, làm trên web (không dùng CLI):** vào **SQL Editor → New query**, dán toàn bộ nội dung file `supabase/migrations/20261008000000_init.sql`, rồi bấm **Run**. Tiếp theo, chạy thêm đoạn SQL dưới đây để đánh dấu migration đã được áp dụng. Nếu bỏ qua bước này, workflow GitHub ở Phần B sẽ cố chạy lại migration và báo lỗi.

```sql
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20261008000000', 'init') on conflict (version) do nothing;
```

## A5. Kiểm tra

- **Table Editor**: thấy các bảng `projects`, `tasks`, `subtasks`, `milestones`, `reminders`, ... Mỗi bảng có nhãn **RLS enabled**.
- **Storage**: có bucket `attachments` (Private, giới hạn 20 MB/file).
- **Database → Publications → supabase_realtime**: các bảng chính đã được bật.

## A6. Tạo file `.env.local`

Copy `.env.example` thành `.env.local` và điền 2 giá trị ở bước A2:

```env
VITE_SUPABASE_URL=https://abcdwxyzabcdwxyz.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
```

---

# Phần B – GitHub

## B1. Cài Git

Máy bạn chưa có Git. Cài bằng lệnh sau, hoặc tải ở https://git-scm.com/download/win:

```bash
winget install --id Git.Git -e
```

**Đóng và mở lại PowerShell**, rồi khai báo tên và email:

```bash
git config --global user.name "Ten Cua Ban"
```

```bash
git config --global user.email "email-github-cua-ban@example.com"
```

## B2. Tạo repository

1. Vào https://github.com/new
2. **Repository name**: `project-manager`
3. **Public** hay **Private**:
   - **GitHub Pages trên repo Private cần gói trả phí** (GitHub Pro/Team).
   - Nếu dùng tài khoản Free: chọn **Public**. Code không chứa bí mật nào, vì Publishable key được thiết kế để công khai và dữ liệu đã có RLS bảo vệ.
   - Hoặc chọn **Private** và host web bằng **Vercel** / **Cloudflare Pages** (miễn phí, kết nối thẳng với GitHub).
4. **Không** tick *Add README*, *.gitignore*, hay *license* (repo phải trống).
5. **Create repository**.

## B3. Đẩy code lên

Tại `D:\Claude\App`:

```bash
git init -b main
```

```bash
git add .
```

```bash
git status
```

Kiểm tra trong danh sách **KHÔNG có** `.env.local` hoặc thư mục `secrets/`. Sau đó:

```bash
git commit -m "Project Manager v0.1.0"
```

```bash
git remote add origin https://github.com/huyphluuanh/project-manager.git
```

```bash
git push -u origin main
```

Lần đầu push, Windows sẽ mở cửa sổ đăng nhập GitHub.

## B4. Khai báo Secrets cho GitHub Actions

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Tên | Giá trị | Dùng cho |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Tạo tại https://supabase.com/dashboard/account/tokens | Tự chạy migration |
| `SUPABASE_DB_PASSWORD` | Database Password (bước A1) | Tự chạy migration |
| `SUPABASE_PROJECT_REF` | Project ref (bước A2) | Tự chạy migration |
| `VITE_SUPABASE_URL` | Project URL (bước A2) | Build web và file .exe |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key (bước A2) | Build web và file .exe |

Sau đó, mỗi khi có migration mới được push lên `main`, workflow [db-migrate.yml](../.github/workflows/db-migrate.yml) sẽ tự cập nhật database. Có thể chạy tay ở tab **Actions → Database migrations → Run workflow**.

## B5. Bật GitHub Pages (host web app)

Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Web app sẽ chạy tại `https://huyphluuanh.github.io/project-manager/`. Hãy kiểm tra **Site URL** ở bước A3 đã đúng địa chỉ này.

## B6. Cho phép Actions tạo Release (để phát hành file .exe)

Repo → **Settings → Actions → General → Workflow permissions** → chọn **Read and write permissions** → **Save**.

---

## Quy trình làm việc sau khi cấu hình xong

| Việc | Cách làm |
|---|---|
| Thay đổi database | `npm run db:new ten_thay_doi`, viết SQL vào file mới, rồi push lên GitHub. Actions sẽ tự áp dụng |
| Cập nhật web | Push lên `main`. Actions sẽ build và deploy lên Pages |
| Phát hành bản Windows | `git tag v1.0.0`, rồi `git push --tags`. Actions sẽ build `ProjectManagerSetup.exe` và đưa vào Releases |

**Không bao giờ sửa một file migration đã push.** Muốn sửa thì tạo migration mới.

## Lỗi thường gặp

| Lỗi | Cách sửa |
|---|---|
| `failed to connect ... password authentication failed` | Sai Database Password. Đặt lại ở Settings → Database → Reset password |
| `Cannot find project ref` | Chưa chạy `npx supabase link` |
| `Access token not provided` | Chạy `npx supabase login`, hoặc thiếu secret `SUPABASE_ACCESS_TOKEN` trên GitHub |
| `git` không nhận lệnh | Chưa mở lại PowerShell sau khi cài Git |
| Link xác nhận email mở ra trang lỗi | URL chưa nằm trong Redirect URLs (bước A3) |
| Không nhận được email đăng ký | Xem cảnh báo SMTP ở bước A3 |
| Pages báo cần nâng cấp | Repo Private trên tài khoản Free. Đổi repo sang Public hoặc dùng Vercel |
