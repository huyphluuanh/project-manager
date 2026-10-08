import { Copy, KeyRound, RefreshCw, Shield, Trash2, UserPlus, Wand2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import * as admin from '../lib/admin';
import type { ManagedUser } from '../lib/admin';
import { formatDateTimeVi } from '../lib/utils';
import { useConfirm, useToast } from './feedback';
import { Button, Card, Field, IconButton, Input, Modal, Spinner } from './ui';

const APP_URL = 'https://huyphluuanh.github.io/project-manager/';
const SETUP_URL = 'https://github.com/huyphluuanh/project-manager/releases/latest';

function inviteText(name: string, email: string, password: string) {
  return [
    `Chào ${name || 'bạn'}, mình đã tạo tài khoản Project Manager cho bạn:`,
    '',
    `• Mở app: ${APP_URL}`,
    `• Email: ${email}`,
    `• Mật khẩu: ${password}`,
    '',
    'Trên điện thoại: mở link → menu trình duyệt → "Thêm vào màn hình chính".',
    `Trên máy tính Windows có thể cài app: ${SETUP_URL} (tải ProjectManagerSetup.exe).`,
    'Sau khi đăng nhập, bạn nên đổi mật khẩu ở Settings → Account.',
  ].join('\n');
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Mục "Người dùng" trong Settings — chỉ hiện với người quản lý */
export function UserManagement() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    void admin.isAdmin().then(setAllowed).catch(() => setAllowed(false));
  }, []);
  if (!allowed) return null;
  return <UserManagementPanel />;
}

function UserManagementPanel() {
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: admin.generatePassword() });
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<ManagedUser | null>(null);
  const [newPw, setNewPw] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setUsers(await admin.listUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy(true);
    const ok = await toast.run(async () => {
      await admin.createUser(form.email.trim(), form.password, form.name.trim());
      return true;
    });
    setBusy(false);
    if (ok) {
      setInvite(inviteText(form.name.trim(), form.email.trim().toLowerCase(), form.password));
      setForm({ name: '', email: '', password: admin.generatePassword() });
      void load();
    }
  };

  const doReset = async () => {
    if (!resetFor) return;
    setBusy(true);
    const ok = await toast.run(async () => {
      await admin.resetUserPassword(resetFor.id, newPw);
      return true;
    });
    setBusy(false);
    if (ok) {
      setInvite(inviteText(resetFor.full_name, resetFor.email, newPw));
      setResetFor(null);
    }
  };

  const remove = async (u: ManagedUser) => {
    const ok = await confirm({
      title: 'Xóa tài khoản?',
      message: <>Tài khoản <b>{u.email}</b> và <b>toàn bộ dự án, task</b> của người này sẽ bị xóa vĩnh viễn, không khôi phục được.</>,
      confirmLabel: 'Xóa vĩnh viễn',
      danger: true,
    });
    if (!ok) return;
    await toast.run(() => admin.deleteUser(u.id), `Đã xóa ${u.email}`);
    void load();
  };

  const formError = form.email && !/^\S+@\S+\.\S+$/.test(form.email) ? 'Email không hợp lệ' : form.password && form.password.length < 8 ? 'Mật khẩu tối thiểu 8 ký tự' : null;

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Người dùng</h2>
        <IconButton label="Tải lại danh sách" onClick={() => void load()}><RefreshCw className="size-4" /></IconButton>
      </div>
      <p className="mb-3 text-sm text-muted">Chỉ bạn (người quản lý) thấy mục này. Đăng ký tự do đã tắt — người thân dùng tài khoản do bạn tạo. Mỗi người có dữ liệu riêng.</p>

      {/* Tạo tài khoản */}
      <form className="grid gap-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!formError) void create(); }}>
        <Field label="Tên người dùng">{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: Mẹ" />}</Field>
        <Field label="Email đăng nhập">{(id) => <Input id={id} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ten@gmail.com" autoComplete="off" />}</Field>
        <Field label="Mật khẩu" className="sm:col-span-2" error={formError}>
          {(id) => (
            <div className="flex gap-2">
              <Input id={id} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" className="font-mono" />
              <Button icon={<Wand2 className="size-4" />} onClick={() => setForm({ ...form, password: admin.generatePassword() })}>Tạo ngẫu nhiên</Button>
            </div>
          )}
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" loading={busy} disabled={!form.email || !!formError} icon={<UserPlus className="size-4" />}>Tạo tài khoản</Button>
        </div>
      </form>

      {/* Danh sách */}
      <div className="mt-4">
        {error ? (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
        ) : !users ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-border">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {u.full_name || u.email}
                    {u.is_admin && <span className="inline-flex items-center gap-0.5 rounded bg-accent-soft px-1.5 text-[11px] text-accent"><Shield className="size-3" />Quản lý</span>}
                    {u.is_self && <span className="text-xs text-muted">(bạn)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {u.email} · {u.last_sign_in_at ? `đăng nhập lần cuối ${formatDateTimeVi(u.last_sign_in_at)}` : 'chưa đăng nhập lần nào'}
                  </p>
                </div>
                {!u.is_self && (
                  <>
                    <Button size="sm" icon={<KeyRound className="size-4" />} onClick={() => { setResetFor(u); setNewPw(admin.generatePassword()); }}>Đặt lại mật khẩu</Button>
                    <IconButton label={`Xóa ${u.email}`} onClick={() => void remove(u)}><Trash2 className="size-4" /></IconButton>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Đặt lại mật khẩu */}
      <Modal open={!!resetFor} onClose={() => setResetFor(null)} title={`Đặt lại mật khẩu: ${resetFor?.email ?? ''}`} size="sm" footer={
        <><Button onClick={() => setResetFor(null)}>Hủy</Button><Button variant="primary" loading={busy} disabled={newPw.length < 8} onClick={() => void doReset()}>Lưu mật khẩu mới</Button></>
      }>
        <div className="space-y-2 p-4">
          <div className="flex gap-2">
            <Input value={newPw} onChange={(e) => setNewPw(e.target.value)} className="font-mono" aria-label="Mật khẩu mới" />
            <Button icon={<Wand2 className="size-4" />} onClick={() => setNewPw(admin.generatePassword())}>Ngẫu nhiên</Button>
          </div>
          <p className="text-xs text-muted">Tối thiểu 8 ký tự. Người dùng sẽ đăng nhập bằng mật khẩu này.</p>
        </div>
      </Modal>

      {/* Nội dung gửi người thân */}
      <Modal open={!!invite} onClose={() => setInvite(null)} title="Gửi thông tin đăng nhập" footer={
        <>
          <Button onClick={() => setInvite(null)}>Đóng</Button>
          <Button variant="primary" icon={<Copy className="size-4" />} onClick={async () => {
            if (await copy(invite!)) toast.show('Đã sao chép — dán vào Zalo / Messenger để gửi', { tone: 'success' });
            else toast.show('Không sao chép được, hãy bôi đen và copy thủ công.', { tone: 'error' });
          }}>Sao chép</Button>
        </>
      }>
        <div className="p-4">
          <p className="mb-2 text-sm text-muted">Sao chép đoạn dưới và gửi cho người thân qua Zalo, Messenger…</p>
          <pre className="rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap select-all">{invite}</pre>
        </div>
      </Modal>
    </Card>
  );
}
