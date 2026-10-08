import { AlertTriangle, Archive, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfirm, useToast } from '../components/feedback';
import { PriorityBadge } from '../components/task/badges';
import { Button, EmptyState, IconButton, Menu, ProgressBar, Segmented } from '../components/ui';
import { useUI } from '../hooks/useUI';
import { useWorkspace } from '../hooks/useWorkspace';
import { PRIORITY_RANK, PROJECT_STATUS_LABEL } from '../lib/labels';
import * as repo from '../lib/repo';
import type { Project } from '../lib/types';
import { cx, daysBetween, formatDateVi } from '../lib/utils';

type Show = 'active' | 'favorite' | 'completed' | 'all';

export function useProjectActions() {
  const toast = useToast();
  const confirm = useConfirm();
  return {
    toggleFavorite: (p: Project) => toast.run(() => repo.updateProject(p.id, { is_favorite: !p.is_favorite })),
    archive: (p: Project) => toast.run(async () => {
      await repo.archiveProject(p.id);
      toast.show(`Đã lưu trữ "${p.name}"`, { action: { label: 'Hoàn tác', onClick: () => void repo.unarchiveProject(p.id) } });
    }),
    remove: async (p: Project) => {
      const ok = await confirm({
        title: 'Xóa dự án?',
        message: <>Dự án <b>{p.name}</b> và toàn bộ task bên trong sẽ bị ẩn (khôi phục được trong mục Lưu trữ → Thùng rác).</>,
        confirmLabel: 'Xóa dự án',
        danger: true,
      });
      if (!ok) return false;
      await toast.run(async () => {
        await repo.deleteProject(p.id);
        toast.show('Đã xóa dự án', { action: { label: 'Hoàn tác', onClick: () => void repo.restoreProject(p.id) } });
      });
      return true;
    },
  };
}

export function Projects() {
  const ws = useWorkspace();
  const ui = useUI();
  const actions = useProjectActions();
  const [show, setShow] = useState<Show>('active');

  const list = ws.activeProjects
    .filter((p) => show === 'all'
      || (show === 'favorite' && p.is_favorite)
      || (show === 'completed' && ['completed', 'cancelled'].includes(p.status))
      || (show === 'active' && !['completed', 'cancelled'].includes(p.status)))
    .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto hidden text-xl font-semibold md:block">Projects</h1>
        <Segmented size="sm" value={show} onChange={setShow} options={[
          { value: 'active', label: 'Đang chạy' }, { value: 'favorite', label: 'Yêu thích' }, { value: 'completed', label: 'Đã xong' }, { value: 'all', label: 'Tất cả' },
        ]} />
        <Button size="sm" variant="primary" className="ml-auto md:ml-0" icon={<Plus className="size-4" />} onClick={() => ui.openProjectForm()}>Dự án mới</Button>
      </div>
      {list.length === 0 ? (
        <EmptyState title="Không có dự án" description="Tạo dự án mới để bắt đầu." action={<Button variant="primary" onClick={() => ui.openProjectForm()}>Tạo dự án</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const tasks = ws.tasks.filter((t) => t.project_id === p.id);
            const done = tasks.filter((t) => t.status === 'done').length;
            const prog = ws.projectProgressOf(p);
            const risk = ws.projectRiskOf(p);
            const daysLeft = p.deadline ? daysBetween(ws.today, p.deadline) : null;
            return (
              <div key={p.id} className="relative rounded-xl border border-border bg-surface transition-colors hover:border-accent">
                <div className="h-1 rounded-t-xl" style={{ background: p.color ?? 'var(--accent)' }} />
                <Link to={`/projects/${p.id}`} className="block p-4 pr-20">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="mt-0.5 line-clamp-2 min-h-8 text-xs text-muted">{p.description || ' '}</p>
                </Link>
                <div className="absolute top-3 right-2 flex">
                  <IconButton label={p.is_favorite ? 'Bỏ yêu thích' : 'Yêu thích'} onClick={() => void actions.toggleFavorite(p)}>
                    <Star className={cx('size-4', p.is_favorite && 'text-warn')} fill={p.is_favorite ? 'currentColor' : 'none'} />
                  </IconButton>
                  <Menu trigger={(t) => <IconButton label="Thêm" {...t}><MoreHorizontal className="size-4" /></IconButton>} items={[
                    { label: 'Sửa', icon: <Pencil className="size-4" />, onClick: () => ui.openProjectForm(p) },
                    { label: 'Lưu trữ', icon: <Archive className="size-4" />, onClick: () => void actions.archive(p) },
                    { label: 'Xóa', icon: <Trash2 className="size-4" />, danger: true, onClick: () => void actions.remove(p) },
                  ]} />
                </div>
                <Link to={`/projects/${p.id}`} className="block px-4 pb-4">
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-medium">{PROJECT_STATUS_LABEL[p.status]}</span>
                    <PriorityBadge priority={p.priority} />
                    {p.deadline && (
                      <span className={cx(daysLeft! < 0 && prog < 100 ? 'text-danger' : 'text-muted')}>
                        {formatDateVi(p.deadline)}{daysLeft! >= 0 ? ` · còn ${daysLeft} ngày` : prog < 100 ? ` · trễ ${-daysLeft!} ngày` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <ProgressBar value={prog} tone={risk.level === 'high' ? 'danger' : risk.level === 'medium' ? 'warn' : prog === 100 ? 'ok' : 'accent'} />
                    <span className="w-9 text-right text-xs text-muted tabular-nums">{prog}%</span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">{done}/{tasks.length} task hoàn thành</p>
                  {risk.level !== 'none' && (
                    <p className={cx('mt-2 flex items-start gap-1 text-xs', risk.level === 'high' ? 'text-danger' : 'text-warn')}>
                      <AlertTriangle className="mt-px size-3.5 shrink-0" />
                      <span>{risk.level === 'high' ? 'Có nguy cơ trễ deadline. ' : ''}{risk.reasons[0]}</span>
                    </p>
                  )}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
