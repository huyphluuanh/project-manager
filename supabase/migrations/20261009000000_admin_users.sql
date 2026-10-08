-- Người quản lý: được tạo / đặt lại mật khẩu / xóa tài khoản người dùng khác
-- (qua Edge Function "admin-users", vì thao tác này cần khóa service_role ở phía server).
-- Đăng ký tự do được tắt trong cấu hình Auth.

create table public.app_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.app_admins enable row level security;

-- Mỗi người chỉ xem được mình có phải admin không; ghi chỉ qua SQL / service_role
create policy app_admins_self on public.app_admins for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.app_admins from anon;
grant select on public.app_admins to authenticated;

-- Tài khoản đầu tiên (chủ app) là admin
insert into public.app_admins (user_id)
select id from auth.users order by created_at limit 1
on conflict do nothing;
