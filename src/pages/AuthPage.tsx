import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Field, Input } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { REMEMBER_KEY, SESSION_MARK } from '../lib/session';
import { appBaseUrl, supabase } from '../lib/supabase';
import { friendlyError } from '../lib/utils';

type Mode = 'login' | 'register' | 'forgot';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src={`${import.meta.env.BASE_URL}icons/pwa-192.png`} alt="" className="size-14 rounded-2xl" />
          <h1 className="text-xl font-semibold">Project Manager</h1>
          <p className="text-sm text-muted">Quản lý dự án cá nhân trên mọi thiết bị</p>
        </div>
        <Card className="p-5">{children}</Card>
      </div>
    </div>
  );
}

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [remember, setRemember] = useState(() => {
    try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch { return true; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Email không hợp lệ.');
    if (mode !== 'forgot' && password.length < 8) return setError('Mật khẩu tối thiểu 8 ký tự.');
    if (mode === 'register' && password !== password2) return setError('Mật khẩu nhập lại không khớp.');
    setBusy(true);
    try {
      if (mode === 'login') {
        try {
          localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
          sessionStorage.setItem(SESSION_MARK, '1');
        } catch { /* ignore */ }
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else if (mode === 'register') {
        const { data, error: err } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: appBaseUrl() },
        });
        if (err) throw err;
        if (!data.session) setDone(`Đã gửi email xác nhận tới ${email}. Mở email và bấm link để kích hoạt tài khoản, sau đó đăng nhập.`);
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appBaseUrl() });
        if (err) throw err;
        setDone(`Nếu ${email} đã đăng ký, bạn sẽ nhận được email đặt lại mật khẩu. Mở link trong email bằng trình duyệt trên máy này.`);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="size-10 text-ok" />
          <p className="text-sm">{done}</p>
          <Button onClick={() => { setDone(null); setMode('login'); }}>Quay lại đăng nhập</Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h2 className="mb-4 text-lg font-semibold">
        {mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Tạo tài khoản' : 'Quên mật khẩu'}
      </h2>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {mode === 'register' && (
          <Field label="Tên hiển thị">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}</Field>
        )}
        <Field label="Email">{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />}</Field>
        {mode !== 'forgot' && (
          <Field label="Mật khẩu" hint={mode === 'register' ? 'Tối thiểu 8 ký tự' : undefined}>
            {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />}
          </Field>
        )}
        {mode === 'register' && (
          <Field label="Nhập lại mật khẩu">{(id) => <Input id={id} type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />}</Field>
        )}
        {mode === 'login' && (
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-[var(--accent)]" />
              Ghi nhớ đăng nhập
            </label>
            <button type="button" className="text-accent hover:underline" onClick={() => { setMode('forgot'); setError(null); }}>Quên mật khẩu?</button>
          </div>
        )}
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          {mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Đăng ký' : 'Gửi email đặt lại'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {mode === 'login' ? (
          <>Chưa có tài khoản hoặc quên mật khẩu? Hãy nhờ người quản lý tạo / đặt lại cho bạn.</>
        ) : (
          <button type="button" className="text-accent hover:underline" onClick={() => { setMode('login'); setError(null); }}>← Quay lại đăng nhập</button>
        )}
      </p>
    </Shell>
  );
}

export function UpdatePasswordPage() {
  const { clearRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (password.length < 8) return setError('Mật khẩu tối thiểu 8 ký tự.');
    if (password !== password2) return setError('Mật khẩu nhập lại không khớp.');
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    clearRecovery();
  };

  return (
    <Shell>
      <h2 className="mb-4 text-lg font-semibold">Đặt mật khẩu mới</h2>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="Mật khẩu mới">{(id) => <Input id={id} type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}</Field>
        <Field label="Nhập lại">{(id) => <Input id={id} type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />}</Field>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>Lưu mật khẩu</Button>
      </form>
    </Shell>
  );
}
