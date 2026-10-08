import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE: link email trả về ?code=... nên không đụng với hash router
    flowType: 'pkce',
  },
  realtime: { params: { eventsPerSecond: 10 } },
});

/** URL gốc của app, dùng cho link xác nhận email / reset mật khẩu */
export function appBaseUrl(): string {
  if (isTauri()) return 'https://' + (import.meta.env.VITE_PUBLIC_WEB_HOST ?? 'huyphluuanh.github.io/project-manager/');
  return window.location.origin + import.meta.env.BASE_URL;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
