import { useLiveQuery } from 'dexie-react-hooks';
import { AlarmClock, AlertTriangle, Bell, BellRing, CheckCheck, Clock, Flag, Link2, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/feedback';
import { Button, EmptyState, IconButton, Segmented } from '../components/ui';
import { useUI } from '../hooks/useUI';
import { getDb } from '../lib/db';
import * as repo from '../lib/repo';
import type { AppNotification, NotificationType } from '../lib/types';
import { cx, formatDateTimeVi } from '../lib/utils';

const ICON: Record<NotificationType, typeof Bell> = {
  task_due: Clock, task_overdue: AlertTriangle, project_deadline: Flag, assignment: UserPlus, mention: Bell,
  dependency_blocked: Link2, sync_error: RefreshCw, reminder: AlarmClock, system: BellRing,
};

export function Notifications() {
  const toast = useToast();
  const ui = useUI();
  const navigate = useNavigate();
  const [show, setShow] = useState<'unread' | 'all'>('unread');
  const items = useLiveQuery(
    async () => (await getDb().t('notifications').toArray()).filter((n) => !n.deleted_at).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [],
  ) ?? [];
  const list = (show === 'unread' ? items.filter((n) => !n.read_at) : items).slice(0, 300);
  const unread = items.filter((n) => !n.read_at).length;

  const open = (n: AppNotification) => {
    if (!n.read_at) void repo.markNotificationRead(n.id);
    if (n.task_id) ui.openTask(n.task_id);
    else if (n.project_id) navigate(`/projects/${n.project_id}`);
  };

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">Notifications</h1>
        <Segmented size="sm" value={show} onChange={setShow} options={[{ value: 'unread', label: `Chưa đọc (${unread})` }, { value: 'all', label: 'Tất cả' }]} />
        <Button size="sm" icon={<CheckCheck className="size-4" />} disabled={!unread} onClick={() => void toast.run(repo.markAllNotificationsRead, 'Đã đánh dấu tất cả là đã đọc')}>
          Mark all as read
        </Button>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Bell className="size-10" />} title={show === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo'} />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {list.map((n) => {
            const Icon = ICON[n.type] ?? Bell;
            return (
              <li key={n.id} className={cx('group flex items-start gap-3 border-b border-border px-4 py-3 last:border-0', !n.read_at && 'bg-accent-soft/40')}>
                <Icon className={cx('mt-0.5 size-4 shrink-0', n.type === 'task_overdue' || n.type === 'sync_error' ? 'text-danger' : 'text-muted')} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open(n)}>
                  <p className={cx('text-sm', !n.read_at && 'font-medium')}>{n.title}</p>
                  {n.body && <p className="text-xs text-muted">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-muted">{formatDateTimeVi(n.created_at)}</p>
                </button>
                {!n.read_at && (
                  <IconButton label="Đánh dấu đã đọc" onClick={() => void repo.markNotificationRead(n.id)}><CheckCheck className="size-4" /></IconButton>
                )}
                <IconButton label="Xóa thông báo" onClick={() => void repo.deleteNotification(n.id)}><Trash2 className="size-4" /></IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
