// Edge Function: quản lý tài khoản người dùng (chỉ admin trong bảng app_admins).
// Dùng khóa service_role có sẵn trong môi trường Edge Function — không bao giờ lộ ra trình duyệt.
//
// POST { action: 'list' }
// POST { action: 'create', email, password, full_name }
// POST { action: 'reset_password', user_id, password }
// POST { action: 'delete', user_id }

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Xác thực người gọi
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Chưa đăng nhập.' }, 401);
  const { data: caller, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !caller.user) return json({ error: 'Phiên đăng nhập không hợp lệ.' }, 401);

  const { data: isAdmin } = await admin.from('app_admins').select('user_id').eq('user_id', caller.user.id).maybeSingle();
  if (!isAdmin) return json({ error: 'Chỉ người quản lý mới làm được việc này.' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, 400);
  }

  try {
    switch (body.action) {
      case 'list': {
        const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
        if (error) throw error;
        const { data: admins } = await admin.from('app_admins').select('user_id');
        const adminIds = new Set((admins ?? []).map((a) => a.user_id));
        const users = data.users
          .map((u) => ({
            id: u.id,
            email: u.email ?? '',
            full_name: (u.user_metadata?.full_name as string) ?? '',
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at ?? null,
            is_admin: adminIds.has(u.id),
            is_self: u.id === caller.user.id,
          }))
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        return json({ users });
      }

      case 'create': {
        const email = String(body.email ?? '').trim().toLowerCase();
        const password = String(body.password ?? '');
        const fullName = String(body.full_name ?? '').trim();
        if (!EMAIL_RE.test(email)) return json({ error: 'Email không hợp lệ.' }, 400);
        if (password.length < 8) return json({ error: 'Mật khẩu tối thiểu 8 ký tự.' }, 400);
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName || email.split('@')[0] },
        });
        if (error) {
          if (/already|registered|exists/i.test(error.message)) return json({ error: 'Email này đã có tài khoản.' }, 409);
          throw error;
        }
        return json({ user: { id: data.user.id, email } });
      }

      case 'reset_password': {
        const userId = String(body.user_id ?? '');
        const password = String(body.password ?? '');
        if (password.length < 8) return json({ error: 'Mật khẩu tối thiểu 8 ký tự.' }, 400);
        const { error } = await admin.auth.admin.updateUserById(userId, { password });
        if (error) throw error;
        return json({ ok: true });
      }

      case 'delete': {
        const userId = String(body.user_id ?? '');
        if (userId === caller.user.id) return json({ error: 'Không thể tự xóa tài khoản của chính mình.' }, 400);
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
        return json({ ok: true });
      }

      default:
        return json({ error: 'Thao tác không hợp lệ.' }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
