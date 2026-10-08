import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useSyncState } from '../hooks/useWorkspace';
import { getDb, type ConflictItem } from '../lib/db';
import { updateRow } from '../lib/store';
import { requestSync } from '../lib/sync';
import { cx, formatDateTimeVi } from '../lib/utils';
import { useToast } from './feedback';
import { Button, Modal } from './ui';

const FIELD_LABEL: Record<string, string> = {
  title: 'Tên', name: 'Tên', description: 'Mô tả', status: 'Trạng thái', priority: 'Ưu tiên', due_date: 'Deadline',
  deadline: 'Deadline', start_date: 'Ngày bắt đầu', assignee_id: 'Người phụ trách', project_id: 'Dự án',
  content_md: 'Ghi chú', is_done: 'Hoàn thành', deleted_at: 'Đã xóa', archived_at: 'Lưu trữ', manual_progress: 'Tiến độ',
};

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(trống)';
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 120 ? s.slice(0, 120) + '…' : s;
}

export function SyncIndicator({ compact }: { compact?: boolean }) {
  const s = useSyncState();
  const [open, setOpen] = useState(false);
  const conflicts = useLiveQuery(() => getDb().conflicts.count(), []) ?? 0;

  const view = conflicts > 0
    ? { icon: <AlertTriangle className="size-4" />, label: `${conflicts} xung đột`, tone: 'text-warn' }
    : s.status === 'offline'
      ? { icon: <CloudOff className="size-4" />, label: s.pending ? `Offline · ${s.pending} chờ` : 'Offline', tone: 'text-muted' }
      : s.status === 'syncing'
        ? { icon: <Loader2 className="size-4 animate-spin" />, label: 'Đang đồng bộ', tone: 'text-muted' }
        : s.status === 'error'
          ? { icon: <AlertTriangle className="size-4" />, label: 'Lỗi đồng bộ', tone: 'text-danger' }
          : { icon: <CheckCircle2 className="size-4" />, label: 'Đã đồng bộ', tone: 'text-ok' };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx('inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium hover:bg-surface-2', view.tone)} aria-label={`Trạng thái đồng bộ: ${view.label}`}>
        {view.icon}
        {!compact && <span>{view.label}</span>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Đồng bộ dữ liệu" size="md">
        <SyncDetails />
      </Modal>
    </>
  );
}

function SyncDetails() {
  const s = useSyncState();
  const toast = useToast();
  const conflicts = useLiveQuery(() => getDb().conflicts.orderBy('id').toArray(), []) ?? [];

  const keepMine = (c: ConflictItem) => toast.run(async () => {
    await updateRow(c.table, c.key, c.ours as never);
    await getDb().conflicts.delete(c.id);
  }, 'Đã áp dụng bản của bạn');

  const keepTheirs = (c: ConflictItem) => toast.run(() => getDb().conflicts.delete(c.id));

  return (
    <div className="space-y-4 p-4">
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted">Trạng thái</dt>
        <dd>{{ synced: 'Đã đồng bộ', syncing: 'Đang đồng bộ', offline: 'Offline', error: 'Lỗi đồng bộ' }[s.status]}</dd>
        <dt className="text-muted">Thay đổi chờ gửi</dt>
        <dd>{s.pending}</dd>
        <dt className="text-muted">Lần đồng bộ gần nhất</dt>
        <dd>{s.lastSyncedAt ? formatDateTimeVi(s.lastSyncedAt) : '—'}</dd>
      </dl>
      {s.error && s.status !== 'synced' && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{s.error}</p>}
      {s.status === 'offline' && <p className="text-sm text-muted">Bạn vẫn xem và sửa được dữ liệu. Thay đổi sẽ tự gửi khi có Internet.</p>}
      <Button size="sm" icon={<RefreshCw className="size-4" />} onClick={() => requestSync(undefined, 0)}>Đồng bộ ngay</Button>

      {conflicts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Cần bạn xử lý ({conflicts.length})</h3>
          {conflicts.map((c) => (
            <div key={c.id} className="rounded-xl border border-border p-3 text-sm">
              <p className="font-medium">{c.label}</p>
              {c.kind === 'conflict' ? (
                <>
                  <p className="mb-2 text-xs text-muted">Thiết bị khác đã sửa cùng lúc. Bản trên server đang được giữ — chọn bản muốn dùng:</p>
                  <table className="w-full text-xs">
                    <thead><tr className="text-muted"><th className="text-left font-medium">Trường</th><th className="text-left font-medium">Bản của bạn</th><th className="text-left font-medium">Bản hiện tại</th></tr></thead>
                    <tbody>
                      {c.fields.map((f) => (
                        <tr key={f} className="align-top">
                          <td className="py-1 pr-2 text-muted">{FIELD_LABEL[f] ?? f}</td>
                          <td className="py-1 pr-2">{show(c.ours[f])}</td>
                          <td className="py-1">{show(c.theirs[f])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => void keepMine(c)}>Dùng bản của tôi</Button>
                    <Button size="sm" variant="primary" onClick={() => void keepTheirs(c)}>Giữ bản hiện tại</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-1 text-xs text-danger">Server từ chối thay đổi: {c.message}</p>
                  <p className="mt-1 text-xs text-muted">Dữ liệu đã được khôi phục theo bản trên server.</p>
                  <Button size="sm" className="mt-2" onClick={() => void keepTheirs(c)}>Đã hiểu</Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
