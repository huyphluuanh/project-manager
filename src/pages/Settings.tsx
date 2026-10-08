import { useLiveQuery } from 'dexie-react-hooks';
import { BellRing, Database, Download, FileJson, FileSpreadsheet, Keyboard, LogOut, Monitor, Moon, RefreshCw, Sun, Upload, Volume2 } from 'lucide-react';
import { REMINDER_PREVIEW_EVENT } from '../components/ReminderPopup';
import { playChime } from '../lib/sound';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useConfirm, useToast } from '../components/feedback';
import { Button, Card, Field, Input, Modal, Segmented, Select, Toggle } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useUI } from '../hooks/useUI';
import { useSyncState, useWorkspace } from '../hooks/useWorkspace';
import { getDb } from '../lib/db';
import { loadDemoData } from '../lib/demo';
import { downloadBackup, downloadCsv, downloadExcel, readableProjectRow, readableTaskRow, TASK_HEADERS, taskRows } from '../lib/exporter';
import { applyCsvTasks, planJsonImport, previewCsvTasks, type CsvPreviewRow, type ImportPlan } from '../lib/importer';
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from '../lib/labels';
import { getAutostart, isTauri, notificationPermission, requestNotificationPermission, setAutostart, setMinimizeToTray } from '../lib/platform';
import * as repo from '../lib/repo';
import { getUserId } from '../lib/session';
import { updateRow } from '../lib/store';
import { supabase } from '../lib/supabase';
import { fullResync } from '../lib/sync';
import { applyTheme, type ThemePref } from '../lib/theme';
import type { AppSettings } from '../lib/types';
import { formatDateTimeVi, friendlyError, todayKey } from '../lib/utils';

export function Settings() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <General />
      <NotificationSettings />
      <DataSettings />
      <AccountSettings />
      <p className="pb-4 text-center text-xs text-muted">Project Manager v{__APP_VERSION__} · {isTauri() ? 'Windows app' : 'Web app'}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="mb-2 font-semibold">{title}</h2>
      <div className="divide-y divide-border">{children}</div>
    </Card>
  );
}

function useSettingsSaver() {
  const toast = useToast();
  return (patch: Partial<AppSettings>) => void toast.run(() => repo.updateSettings(patch));
}

// ---------------------------------------------------------------------

function General() {
  const ws = useWorkspace();
  const ui = useUI();
  const toast = useToast();
  const save = useSettingsSaver();
  const [autostart, setAutostartState] = useState(false);
  const [tray, setTray] = useState(() => { try { return localStorage.getItem('pm:tray') !== '0'; } catch { return true; } });

  useEffect(() => { if (isTauri()) void getAutostart().then(setAutostartState); }, []);

  const setTheme = (t: ThemePref) => {
    applyTheme(t);
    void toast.run(() => repo.updateSettings({}, t));
  };

  return (
    <Block title="General">
      <div className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span className="text-sm font-medium">Giao diện</span>
        <Segmented size="sm" value={ws.theme} onChange={setTheme} options={[
          { value: 'light', label: <><Sun className="size-3.5" />Light</> },
          { value: 'dark', label: <><Moon className="size-3.5" />Dark</> },
          { value: 'system', label: <><Monitor className="size-3.5" />System</> },
        ]} />
      </div>
      <div className="flex items-center justify-between gap-2 py-2">
        <span className="text-sm font-medium">Ngôn ngữ</span>
        <Select className="h-8 w-40" value="vi" disabled aria-label="Ngôn ngữ"><option value="vi">Tiếng Việt</option></Select>
      </div>
      <Toggle label="Tự động sắp xếp theo Priority Score" description="Task Critical + gần deadline luôn lên đầu" checked={ws.settings.autoSort} onChange={(v) => save({ autoSort: v })} />
      <Toggle label="Tự chuyển Blocked theo phụ thuộc" description="Task chờ task chưa xong sẽ là Blocked; tự mở khi task kia xong" checked={ws.settings.autoBlock} onChange={(v) => save({ autoBlock: v })} />
      <Toggle label="Tự động lưu" description="Mọi thay đổi được lưu ngay (Ctrl+S để lưu tức thì)" checked onChange={() => toast.show('Tự động lưu luôn bật để tránh mất dữ liệu.')} />
      {isTauri() && (
        <>
          <Toggle label="Khởi động cùng Windows" checked={autostart} onChange={(v) => void toast.run(async () => { await setAutostart(v); setAutostartState(v); })} />
          <Toggle label="Thu nhỏ xuống khay hệ thống khi đóng" description="App tiếp tục chạy nền để nhắc việc" checked={tray}
            onChange={(v) => void toast.run(async () => { await setMinimizeToTray(v); setTray(v); try { localStorage.setItem('pm:tray', v ? '1' : '0'); } catch { /* ignore */ } })} />
        </>
      )}
      <div className="flex items-center justify-between py-2">
        <span className="text-sm font-medium">Phím tắt</span>
        <Button size="sm" icon={<Keyboard className="size-4" />} onClick={() => ui.setShortcutsOpen(true)}>Xem phím tắt</Button>
      </div>
    </Block>
  );
}

function NotificationSettings() {
  const ws = useWorkspace();
  const toast = useToast();
  const save = useSettingsSaver();
  const [perm, setPerm] = useState(notificationPermission());
  const s = ws.settings;

  return (
    <Block title="Notifications">
      <Toggle label="Bật thông báo & nhắc việc" checked={s.notificationsEnabled} onChange={(v) => save({ notificationsEnabled: v })} />
      <Toggle label="Thông báo task quá hạn" checked={s.overdueNotifications} onChange={(v) => save({ overdueNotifications: v })} />
      <Toggle label="Âm thanh nhắc việc" description="Tiếng chuông nhẹ khi đến giờ nhắc" checked={s.reminderSound} onChange={(v) => save({ reminderSound: v })} />
      <div className="flex flex-wrap gap-2 py-2">
        <Button size="sm" icon={<Volume2 className="size-4" />} onClick={() => void playChime()}>Nghe thử</Button>
        <Button size="sm" icon={<BellRing className="size-4" />} onClick={() => window.dispatchEvent(new Event(REMINDER_PREVIEW_EVENT))}>Xem thử nhắc việc</Button>
      </div>
      <Toggle
        label={isTauri() ? 'Thông báo Windows' : 'Thông báo trình duyệt'}
        description={perm === 'denied' ? 'Trình duyệt đang chặn — mở cài đặt trang web để cho phép.' : perm === 'unsupported' ? 'Trình duyệt không hỗ trợ.' : 'Hiện thông báo hệ thống khi đến giờ nhắc'}
        checked={s.browserNotifications && perm === 'granted'}
        onChange={async (v) => {
          if (v) {
            const ok = await requestNotificationPermission();
            setPerm(notificationPermission());
            if (!ok) return toast.show('Chưa được cấp quyền thông báo.', { tone: 'error' });
          }
          save({ browserNotifications: v });
        }}
      />
      <div className="flex items-center justify-between gap-2 py-2">
        <span className="text-sm font-medium">Nhắc mặc định trước hạn</span>
        <Select className="h-8 w-40" value={s.defaultReminderMinutes} onChange={(e) => save({ defaultReminderMinutes: Number(e.target.value) })} aria-label="Nhắc mặc định">
          <option value={5}>5 phút</option><option value={15}>15 phút</option><option value={30}>30 phút</option><option value={60}>1 giờ</option><option value={1440}>1 ngày</option>
        </Select>
      </div>
      <div className="flex items-center justify-between gap-2 py-2">
        <span className="text-sm font-medium">"Sắp đến hạn" trong vòng</span>
        <Select className="h-8 w-40" value={s.dueSoonDays} onChange={(e) => save({ dueSoonDays: Number(e.target.value) })} aria-label="Sắp đến hạn">
          <option value={3}>3 ngày</option><option value={7}>7 ngày</option><option value={14}>14 ngày</option>
        </Select>
      </div>
      {!isTauri() && <p className="py-2 text-xs text-muted">Trên web, nhắc việc chỉ hiện khi app đang mở (tab hoặc PWA). App Windows chạy nền ở khay hệ thống nên luôn nhắc đúng giờ.</p>}
    </Block>
  );
}

// ---------------------------------------------------------------------

function DataSettings() {
  const ws = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const jsonRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [csvRows, setCsvRows] = useState<CsvPreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const backups = useLiveQuery(() => getDb().backups.orderBy('created_at').reverse().toArray(), []) ?? [];

  const tagNames = (id: string) => (ws.tagIdsByTask.get(id) ?? []).map((t) => ws.tagsById.get(t)?.name ?? '');

  const exportCsv = () => downloadCsv(
    [TASK_HEADERS, ...taskRows(ws.tasks, { projectName: (id) => ws.projectsById.get(id)?.name ?? '', tagNames, progress: ws.taskProgressOf })],
    `tasks-${todayKey()}.csv`,
  );
  const exportExcel = () => toast.run(() => downloadExcel([
    { name: 'Tasks', header: ['Task', 'Dự án', 'Trạng thái', 'Ưu tiên', 'Bắt đầu', 'Deadline', 'Tiến độ %', 'Tags', 'Hoàn thành lúc'],
      rows: ws.tasks.map((t) => readableTaskRow(t, ws.projectsById.get(t.project_id)?.name ?? '', ws.taskProgressOf(t), tagNames(t.id))) },
    { name: 'Projects', header: ['Dự án', 'Trạng thái', 'Ưu tiên', 'Bắt đầu', 'Deadline', 'Tiến độ %', 'Tổng task', 'Đã xong'],
      rows: ws.projects.map((p) => { const pt = ws.tasks.filter((t) => t.project_id === p.id); return readableProjectRow(p, ws.projectProgressOf(p), pt.length, pt.filter((t) => t.status === 'done').length); }) },
  ], `project-manager-${todayKey()}.xlsx`));

  const readFile = (f: File) => new Promise<string>((res, rej) => {
    if (f.size > 50 * 1024 * 1024) return rej(new Error('File quá lớn (tối đa 50 MB).'));
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Không đọc được file.'));
    r.readAsText(f);
  });

  const onJson = async (f?: File) => {
    if (!f) return;
    await toast.run(async () => setPlan(await planJsonImport(await readFile(f))));
    if (jsonRef.current) jsonRef.current.value = '';
  };
  const onCsv = async (f?: File) => {
    if (!f) return;
    await toast.run(async () => {
      const { rows, missingTitle } = previewCsvTasks(await readFile(f));
      if (missingTitle) throw new Error('Không thấy cột tên task (title / task / tên). Dòng đầu tiên phải là tiêu đề cột.');
      if (!rows.length) throw new Error('File không có dòng dữ liệu.');
      setCsvRows(rows);
    });
    if (csvRef.current) csvRef.current.value = '';
  };

  const applyPlan = async (mode: 'add-only' | 'overwrite') => {
    if (!plan) return;
    setBusy(true);
    try {
      const n = await plan.apply(mode);
      toast.show(`Đã nhập ${n} bản ghi. Dữ liệu sẽ được đồng bộ lên server.`, { tone: 'success' });
      setPlan(null);
    } catch (e) {
      toast.show(`Nhập thất bại, dữ liệu hiện tại KHÔNG bị thay đổi. ${friendlyError(e)}`, { tone: 'error', duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  const applyCsv = async () => {
    if (!csvRows) return;
    setBusy(true);
    try {
      const n = await applyCsvTasks(csvRows);
      toast.show(`Đã nhập ${n} task.`, { tone: 'success' });
      setCsvRows(null);
    } catch (e) {
      toast.show(`Nhập thất bại, dữ liệu hiện tại KHÔNG bị thay đổi. ${friendlyError(e)}`, { tone: 'error', duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  const restoreLocal = async (id: number) => {
    const b = await getDb().backups.get(id);
    if (b) await toast.run(async () => setPlan(await planJsonImport(b.data)));
  };

  return (
    <Block title="Data">
      <div className="space-y-2 py-3">
        <p className="text-sm font-medium">Backup & Restore</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" icon={<Download className="size-4" />} onClick={() => void toast.run(downloadBackup, 'Đã tải file backup')}>Backup Now</Button>
          <Button size="sm" icon={<Upload className="size-4" />} onClick={() => jsonRef.current?.click()}>Restore / Import JSON</Button>
        </div>
        <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={(e) => void onJson(e.target.files?.[0])} />
        <p className="text-xs text-muted">Automatic Backup: mỗi ngày app tự lưu 1 bản sao trong máy (giữ 7 bản gần nhất).</p>
        {backups.length > 0 && (
          <ul className="text-sm">
            {backups.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-1">
                <span className="text-muted">{formatDateTimeVi(b.created_at)} · {(b.size / 1024).toFixed(0)} KB</span>
                <Button size="sm" variant="ghost" onClick={() => void restoreLocal(b.id!)}>Khôi phục…</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-2 py-3">
        <p className="text-sm font-medium">Export</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<FileJson className="size-4" />} onClick={() => void toast.run(downloadBackup)}>JSON</Button>
          <Button size="sm" icon={<Download className="size-4" />} onClick={exportCsv}>CSV</Button>
          <Button size="sm" icon={<FileSpreadsheet className="size-4" />} onClick={() => void exportExcel()}>Excel</Button>
        </div>
      </div>
      <div className="space-y-2 py-3">
        <p className="text-sm font-medium">Import task từ CSV</p>
        <p className="text-xs text-muted">Cột hỗ trợ: title, project, status, priority, due_date, start_date, tags, description (dòng đầu là tiêu đề).</p>
        <Button size="sm" icon={<Upload className="size-4" />} onClick={() => csvRef.current?.click()}>Chọn file CSV</Button>
        <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => void onCsv(e.target.files?.[0])} />
      </div>
      <div className="flex flex-wrap gap-2 py-3">
        <Button size="sm" icon={<Database className="size-4" />} onClick={async () => {
          if (await confirm({ title: 'Tải dữ liệu mẫu?', message: 'Thêm dự án "Website Redesign" với ~14 task mẫu. Dữ liệu hiện có không bị ảnh hưởng.' })) {
            await toast.run(loadDemoData, 'Đã tải dữ liệu mẫu');
          }
        }}>Load Demo Data</Button>
        <Button size="sm" icon={<RefreshCw className="size-4" />} onClick={() => void toast.run(fullResync, 'Đang tải lại toàn bộ dữ liệu từ server…')}>Tải lại từ server</Button>
      </div>

      {/* Preview JSON import */}
      <Modal open={!!plan} onClose={() => setPlan(null)} title="Xem trước khi nhập" footer={
        <>
          <Button onClick={() => setPlan(null)}>Hủy</Button>
          <Button loading={busy} onClick={() => void applyPlan('add-only')}>Chỉ thêm mới</Button>
          <Button variant="primary" loading={busy} onClick={() => void applyPlan('overwrite')}>Thêm mới + cập nhật bản cũ hơn</Button>
        </>
      }>
        {plan && (
          <div className="space-y-3 p-4 text-sm">
            <table className="w-full">
              <thead><tr className="text-left text-xs text-muted"><th className="font-medium">Bảng</th><th className="font-medium">Thêm mới</th><th className="font-medium">Cập nhật</th><th className="font-medium">Giống/mới hơn</th><th className="font-medium">Lỗi</th></tr></thead>
              <tbody>
                {plan.previews.map((p) => (
                  <tr key={p.table} className="border-t border-border">
                    <td className="py-1.5">{p.table}</td><td>{p.add}</td><td>{p.update}</td><td className="text-muted">{p.same}</td>
                    <td className={p.invalid ? 'text-danger' : 'text-muted'}>{p.invalid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.errors.length > 0 && (
              <div className="rounded-lg bg-danger-soft p-3 text-xs text-danger">
                <p className="mb-1 font-medium">Các dòng lỗi sẽ được bỏ qua:</p>
                <ul className="list-disc pl-4">{plan.errors.map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
            )}
            <p className="text-xs text-muted">Dữ liệu hiện có không bị xóa. Nếu có lỗi trong quá trình ghi, toàn bộ thao tác nhập sẽ bị hủy.</p>
          </div>
        )}
      </Modal>

      {/* Preview CSV import */}
      <Modal open={!!csvRows} onClose={() => setCsvRows(null)} size="lg" title={`Xem trước ${csvRows?.length ?? 0} dòng`} footer={
        <><Button onClick={() => setCsvRows(null)}>Hủy</Button>
          <Button variant="primary" loading={busy} disabled={!csvRows?.some((r) => !r.error)} onClick={() => void applyCsv()}>
            Nhập {csvRows?.filter((r) => !r.error).length ?? 0} task hợp lệ
          </Button></>
      }>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted"><th className="pr-2 font-medium">Dòng</th><th className="pr-2 font-medium">Task</th><th className="pr-2 font-medium">Dự án</th><th className="pr-2 font-medium">Trạng thái</th><th className="pr-2 font-medium">Ưu tiên</th><th className="pr-2 font-medium">Deadline</th><th className="font-medium">Ghi chú</th></tr></thead>
            <tbody>
              {csvRows?.slice(0, 300).map((r) => (
                <tr key={r.line} className={`border-t border-border ${r.error ? 'text-danger' : ''}`}>
                  <td className="py-1 pr-2">{r.line}</td><td className="pr-2">{r.title}</td><td className="pr-2">{r.project}</td>
                  <td className="pr-2">{TASK_STATUS_LABEL[r.status]}</td><td className="pr-2">{PRIORITY_LABEL[r.priority]}</td><td className="pr-2">{r.due_date}</td>
                  <td>{r.error ?? '✓'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </Block>
  );
}

// ---------------------------------------------------------------------

function AccountSettings() {
  const { session, signOut } = useAuth();
  const ws = useWorkspace();
  const sync = useSyncState();
  const toast = useToast();
  const confirm = useConfirm();
  const me = ws.profiles.find((p) => p.id === session?.user.id);
  const [name, setName] = useState(me?.full_name ?? '');
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [pw, setPw] = useState('');
  useEffect(() => setName(me?.full_name ?? ''), [me?.full_name]);

  const saveName = () => toast.run(async () => {
    await updateRow('profiles', getUserId(), { full_name: name.trim() });
    await supabase.auth.updateUser({ data: { full_name: name.trim() } });
  }, 'Đã lưu tên');

  const saveEmail = () => toast.run(async () => {
    const { error } = await supabase.auth.updateUser({ email });
    if (error) throw error;
  }, 'Đã gửi email xác nhận tới địa chỉ mới. Mở link trong email để hoàn tất.');

  const savePw = () => toast.run(async () => {
    if (pw.length < 8) throw new Error('Mật khẩu tối thiểu 8 ký tự.');
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) throw error;
    setPw('');
  }, 'Đã đổi mật khẩu');

  const logout = async () => {
    if (sync.pending > 0 && !(await confirm({
      title: 'Còn thay đổi chưa đồng bộ',
      message: `Có ${sync.pending} thay đổi chưa gửi lên server. Chúng vẫn được giữ trên máy này và sẽ gửi khi bạn đăng nhập lại. Vẫn đăng xuất?`,
      confirmLabel: 'Đăng xuất', danger: true,
    }))) return;
    await toast.run(() => signOut('local'));
  };

  return (
    <Block title="Account">
      <div className="grid gap-3 py-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Tên hiển thị">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Button onClick={() => void saveName()} disabled={!name.trim() || name === me?.full_name}>Lưu</Button>
      </div>
      <div className="grid gap-3 py-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Email">{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Button onClick={() => void saveEmail()} disabled={email === session?.user.email}>Đổi email</Button>
      </div>
      <div className="grid gap-3 py-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Mật khẩu mới">{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
        <Button onClick={() => void savePw()} disabled={!pw}>Đổi mật khẩu</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div>
          <p className="text-sm font-medium">Sessions</p>
          <p className="text-xs text-muted">Đăng nhập lần cuối: {formatDateTimeVi(session?.user.last_sign_in_at)}</p>
        </div>
        <Button size="sm" onClick={async () => {
          if (await confirm({ title: 'Đăng xuất thiết bị khác?', message: 'Mọi thiết bị khác sẽ phải đăng nhập lại.', confirmLabel: 'Đăng xuất thiết bị khác' })) {
            await toast.run(() => signOut('others'), 'Đã đăng xuất các thiết bị khác');
          }
        }}>Đăng xuất thiết bị khác</Button>
      </div>
      <div className="py-3">
        <Button variant="danger" icon={<LogOut className="size-4" />} onClick={() => void logout()}>Logout</Button>
      </div>
    </Block>
  );
}
