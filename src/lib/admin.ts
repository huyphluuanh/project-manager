// Quản lý tài khoản (chỉ admin). Gọi Edge Function "admin-users" — khóa service_role nằm ở server.

import { getUserId } from './session';
import { supabase } from './supabase';

export interface ManagedUser {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  is_self: boolean;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!navigator.onLine) throw new Error('Cần kết nối Internet để quản lý tài khoản.');
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    // Lấy thông báo lỗi tiếng Việt do function trả về
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const payload = await ctx.json().catch(() => null);
      if (payload?.error) throw new Error(payload.error);
    }
    throw new Error(error.message);
  }
  return data as T;
}

export async function isAdmin(): Promise<boolean> {
  const { data, error } = await supabase.from('app_admins').select('user_id').eq('user_id', getUserId()).maybeSingle();
  return !error && !!data;
}

export const listUsers = () => call<{ users: ManagedUser[] }>({ action: 'list' }).then((r) => r.users);
export const createUser = (email: string, password: string, full_name: string) =>
  call<{ user: { id: string } }>({ action: 'create', email, password, full_name });
export const resetUserPassword = (user_id: string, password: string) => call({ action: 'reset_password', user_id, password });
export const deleteUser = (user_id: string) => call({ action: 'delete', user_id });

/** Mật khẩu dễ đọc, dễ gõ: bỏ các ký tự dễ nhầm (0/O, 1/l/I) */
export function generatePassword(length = 10): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}
