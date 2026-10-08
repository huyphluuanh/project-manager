import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { closeUserDb, openUserDb } from '../lib/db';
import { setSessionUserId } from '../lib/session';
import { supabase } from '../lib/supabase';
import { REMEMBER_KEY, SESSION_MARK } from '../lib/session';
import { markLocalOnly, startSync, stopSync } from '../lib/sync';

const UI_TEST = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('uitest');

interface AuthState {
  loading: boolean;
  session: Session | null;
  /** true khi người dùng mở link reset mật khẩu */
  recovery: boolean;
  clearRecovery: () => void;
  signOut: (scope?: 'local' | 'others' | 'global') => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);
  const [readyUser, setReadyUser] = useState<string | null>(null);

  useEffect(() => {
    // Chỉ ở môi trường dev: ?uitest = dùng dữ liệu local, không kết nối server
    if (UI_TEST) {
      setSession({ user: { id: '00000000-0000-4000-8000-000000000001', email: 'uitest@local' } } as Session);
      setLoading(false);
      return;
    }
    void (async () => {
      // Không chọn "Ghi nhớ đăng nhập" -> đóng trình duyệt là phải đăng nhập lại
      let ephemeral = false;
      try {
        ephemeral = localStorage.getItem(REMEMBER_KEY) === '0' && !sessionStorage.getItem(SESSION_MARK);
      } catch { /* ignore */ }
      if (ephemeral) await supabase.auth.signOut({ scope: 'local' });
      // getSession đọc từ localStorage -> vẫn đăng nhập được khi offline
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoading(false);
    })();
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) {
      stopSync();
      setSessionUserId(null);
      setReadyUser(null);
      return;
    }
    openUserDb(userId);
    setSessionUserId(userId);
    setReadyUser(userId);
    if (UI_TEST) {
      markLocalOnly();
      return;
    }
    void startSync();
    return () => stopSync();
  }, [userId]);

  const signOut = async (scope: 'local' | 'others' | 'global' = 'local') => {
    if (scope === 'others') {
      await supabase.auth.signOut({ scope: 'others' });
      return;
    }
    stopSync();
    await supabase.auth.signOut({ scope });
    closeUserDb();
  };

  const value: AuthState = {
    loading: loading || (!!userId && readyUser !== userId),
    session: userId && readyUser === userId ? session : null,
    recovery,
    clearRecovery: () => setRecovery(false),
    signOut,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
