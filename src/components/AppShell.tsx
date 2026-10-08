import { useLiveQuery } from 'dexie-react-hooks';
import { Bell, Menu as MenuIcon, Plus, Search, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useUI } from '../hooks/useUI';
import { useSyncState, useWorkspace } from '../hooks/useWorkspace';
import { getDb } from '../lib/db';
import { autoBackupIfDue } from '../lib/exporter';
import { isOverdue } from '../lib/logic';
import { startNotifier, stopNotifier } from '../lib/notifier';
import { onTrayCommand, restoreDesktopPrefs } from '../lib/platform';
import { unlockAudio } from '../lib/sound';
import { cx } from '../lib/utils';
import { CommandPalette } from './CommandPalette';
import { ReminderPopup } from './ReminderPopup';
import { SAVE_EVENT } from './shared';
import { useToast } from './feedback';
import { NAV_ITEMS } from './navItems';
import { ProjectFormHost } from './ProjectForm';
import { QuickAddHost } from './QuickAdd';
import { SyncIndicator } from './SyncCenter';
import { TaskDetailHost } from './task/TaskDetail';
import { Button, IconButton, Kbd, Modal, Spinner } from './ui';

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function AppShell() {
  const ws = useWorkspace();
  const ui = useUI();
  const sync = useSyncState();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const unread = useLiveQuery(async () => (await getDb().t('notifications').toArray()).filter((n) => !n.read_at && !n.deleted_at).length, []) ?? 0;

  useEffect(() => setDrawer(false), [location.pathname]);

  // Thông báo / nhắc việc chạy sau khi đã tải dữ liệu lần đầu
  useEffect(() => {
    if (!sync.initialLoaded) return;
    startNotifier();
    void autoBackupIfDue().catch(() => undefined);
    return () => stopNotifier();
  }, [sync.initialLoaded]);

  // Phím tắt toàn cục
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && (k === 'k' || k === 'f')) { e.preventDefault(); ui.setSearchOpen(true); return; }
      if (mod && e.shiftKey && k === 'n') { e.preventDefault(); ui.openProjectForm(); return; }
      if (mod && k === 'n') { e.preventDefault(); ui.openQuickAdd(); return; }
      if (mod && k === 's') { e.preventDefault(); window.dispatchEvent(new Event(SAVE_EVENT)); toast.show('Đã lưu', { tone: 'success', duration: 1500 }); return; }
      if (mod || e.altKey || isTyping(e) || document.querySelector('[role="dialog"]')) return;
      if (k === 'n') { e.preventDefault(); ui.openQuickAdd(); }
      if (k === 'p') { e.preventDefault(); ui.openProjectForm(); }
      if (k === '/') { e.preventDefault(); ui.setSearchOpen(true); }
      if (e.key === '?') { e.preventDefault(); ui.setShortcutsOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ui, toast]);

  // Trình duyệt chỉ cho phát âm thanh sau lần tương tác đầu tiên
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Lệnh từ khay hệ thống (Windows)
  useEffect(() => {
    void restoreDesktopPrefs();
    let off: (() => void) | undefined;
    void onTrayCommand((cmd) => {
      if (cmd === 'quick-add') ui.openQuickAdd();
      else navigate(cmd);
    }).then((fn) => { off = fn; });
    return () => off?.();
  }, [navigate, ui]);

  const myDayCount = ws.tasks.filter((t) => t.status !== 'done' && (t.my_day_date === ws.today || t.due_date === ws.today)).length;
  const overdueCount = ws.tasks.filter((t) => isOverdue(t, ws.today)).length;
  const counts: Record<string, number> = { '/my-day': myDayCount, '/notifications': unread };
  const favorites = ws.activeProjects.filter((p) => p.is_favorite);
  const current = NAV_ITEMS.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)));

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Điều hướng chính">
      <div className="mb-3 flex items-center gap-2 px-2 py-1">
        <img src={`${import.meta.env.BASE_URL}icons/pwa-192.png`} alt="" className="size-7 rounded-lg" />
        <span className="font-semibold">Project Manager</span>
      </div>
      <Button variant="primary" className="mb-2 w-full" icon={<Plus className="size-4" />} onClick={() => ui.openQuickAdd()}>
        Thêm nhanh
      </Button>
      {NAV_ITEMS.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'}
          className={({ isActive }) => cx('flex h-9 items-center gap-3 rounded-lg px-3 text-sm', isActive ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
          <n.icon className="size-4" />
          <span className="flex-1">{n.label}</span>
          {n.to === '/tasks' && overdueCount > 0 && <span className="rounded-full bg-danger-soft px-1.5 text-xs font-medium text-danger" title="Quá hạn">{overdueCount}</span>}
          {counts[n.to] > 0 && <span className="text-xs text-muted">{counts[n.to]}</span>}
        </NavLink>
      ))}
      {favorites.length > 0 && (
        <div className="mt-4">
          <p className="px-3 pb-1 text-xs font-medium text-muted">Yêu thích</p>
          {favorites.map((p) => (
            <NavLink key={p.id} to={`/projects/${p.id}`} className={({ isActive }) => cx('flex h-8 items-center gap-2 rounded-lg px-3 text-sm', isActive ? 'bg-surface-2' : 'text-muted hover:bg-surface-2')}>
              <Star className="size-3.5" style={{ color: p.color ?? undefined }} fill="currentColor" />
              <span className="truncate">{p.name}</span>
            </NavLink>
          ))}
        </div>
      )}
      <div className="mt-auto border-t border-border pt-3">
        <UserBox />
      </div>
    </nav>
  );

  return (
    <div className="flex h-full">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:block no-print">{sidebar}</aside>

      {/* Drawer mobile */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 md:px-4 no-print">
          <IconButton label="Menu" className="md:hidden" onClick={() => setDrawer(true)}><MenuIcon className="size-5" /></IconButton>
          <h1 className="truncate font-semibold md:hidden">{current?.label ?? 'Project Manager'}</h1>
          <button type="button" onClick={() => ui.setSearchOpen(true)}
            className="ml-auto hidden h-9 w-72 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm text-muted md:ml-0 md:flex">
            <Search className="size-4" /> Tìm kiếm… <span className="ml-auto"><Kbd>Ctrl K</Kbd></span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <IconButton label="Tìm kiếm" className="md:hidden" onClick={() => ui.setSearchOpen(true)}><Search className="size-5" /></IconButton>
            <SyncIndicator compact={false} />
            <IconButton label={`Thông báo${unread ? ` (${unread} chưa đọc)` : ''}`} className="relative" onClick={() => navigate('/notifications')}>
              <Bell className="size-5" />
              {unread > 0 && <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{unread > 99 ? '99+' : unread}</span>}
            </IconButton>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto pb-24 md:pb-6">
          {!sync.initialLoaded && !ws.tasks.length ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted">
              <Spinner className="size-8" />
              {sync.status === 'offline' ? 'Đang offline — chưa có dữ liệu trên máy này. Hãy kết nối Internet.' : 'Đang tải dữ liệu…'}
            </div>
          ) : (
            <Outlet />
          )}
        </main>

        {/* Bottom nav mobile */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-safe md:hidden no-print" aria-label="Điều hướng">
          <div className="grid grid-cols-5">
            {NAV_ITEMS.filter((n) => n.mobile).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'}
                className={({ isActive }) => cx('relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]', isActive ? 'font-medium text-accent' : 'text-muted')}>
                <n.icon className="size-5" />
                {n.mobileLabel ?? n.label}
                {counts[n.to] > 0 && <span className="absolute top-1.5 right-[calc(50%-18px)] rounded-full bg-accent px-1 text-[10px] text-accent-fg">{counts[n.to]}</span>}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Quick Add FAB mobile */}
        <button type="button" aria-label="Thêm nhanh" onClick={() => ui.openQuickAdd()}
          className="fixed right-4 bottom-20 z-30 flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg active:scale-95 md:hidden no-print">
          <Plus className="size-7" />
        </button>
      </div>

      <TaskDetailHost />
      <QuickAddHost />
      <ProjectFormHost />
      <CommandPalette />
      <ShortcutsHelp />
      <ReminderPopup />
    </div>
  );
}

function UserBox() {
  const { session } = useAuth();
  const ws = useWorkspace();
  const me = ws.profiles.find((p) => p.id === session?.user.id);
  const name = me?.full_name || session?.user.email || '';
  return (
    <NavLink to="/settings" className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-2">
      <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{name.slice(0, 1).toUpperCase()}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block truncate text-xs text-muted">{session?.user.email}</span>
      </span>
    </NavLink>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl + K  /  Ctrl + F  /  /', 'Tìm kiếm'],
  ['Ctrl + N  /  N', 'Task mới'],
  ['Ctrl + Shift + N  /  P', 'Dự án mới'],
  ['Ctrl + S', 'Lưu ngay'],
  ['Esc', 'Đóng hộp thoại'],
  ['Enter', 'Mở task đang chọn'],
  ['Space', 'Hoàn thành task đang chọn'],
  ['Delete', 'Xóa task đang chọn'],
  ['Tab / Shift + Tab', 'Di chuyển giữa các task'],
  ['?', 'Bảng phím tắt'],
];

function ShortcutsHelp() {
  const { shortcutsOpen, setShortcutsOpen } = useUI();
  return (
    <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Phím tắt" size="sm">
      <table className="w-full text-sm">
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k} className="border-b border-border last:border-0">
              <td className="px-4 py-2 font-mono text-xs">{k}</td>
              <td className="px-4 py-2 text-muted">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-muted">Trên trình duyệt, Chrome giữ Ctrl+N / Ctrl+Shift+N cho cửa sổ mới — dùng phím N / P thay thế. App Windows dùng được tất cả.</p>
    </Modal>
  );
}
