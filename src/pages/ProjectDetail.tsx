import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Archive, ArchiveRestore, ArrowLeft, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../components/feedback';
import { ActivityList, AttachmentList, AutoInput, NotesEditor, Section } from '../components/shared';
import { PriorityBadge } from '../components/task/badges';
import { TaskBoard } from '../components/task/TaskBoard';
import { Button, Card, EmptyState, IconButton, Input, Menu, ProgressBar, Segmented, Select } from '../components/ui';
import { useUI } from '../hooks/useUI';
import { useWorkspace } from '../hooks/useWorkspace';
import { getDb } from '../lib/db';
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL } from '../lib/labels';
import * as repo from '../lib/repo';
import type { Project } from '../lib/types';
import { cx, daysBetween, formatDateVi, formatDuration } from '../lib/utils';
import { useProjectActions } from './Projects';

export function ProjectDetail() {
  const { id } = useParams();
  const ws = useWorkspace();
  const project = id ? ws.projectsById.get(id) : undefined;
  if (!project) {
    return <EmptyState title="Không tìm thấy dự án" description="Dự án có thể đã bị xóa." action={<Link to="/projects" className="text-accent">← Danh sách dự án</Link>} />;
  }
  return <ProjectView key={project.id} project={project} />;
}

function ProjectView({ project: p }: { project: Project }) {
  const ws = useWorkspace();
  const ui = useUI();
  const toast = useToast();
  const navigate = useNavigate();
  const actions = useProjectActions();
  const [tab, setTab] = useState<'tasks' | 'milestones' | 'notes' | 'activity'>('tasks');
  const tasks = ws.tasks.filter((t) => t.project_id === p.id);
  const done = tasks.filter((t) => t.status === 'done').length;
  const overdue = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date < ws.today).length;
  const prog = ws.projectProgressOf(p);
  const risk = ws.projectRiskOf(p);
  const seconds = useLiveQuery(async () => (await getDb().t('time_entries').where('project_id').equals(p.id).toArray())
    .filter((e) => !e.deleted_at).reduce((s, e) => s + repo.entrySeconds(e), 0), [p.id]) ?? 0;
  const daysLeft = p.deadline ? daysBetween(ws.today, p.deadline) : null;

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <Link to="/projects" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> Projects</Link>
      {p.archived_at && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          Dự án đã được lưu trữ.
          <Button size="sm" icon={<ArchiveRestore className="size-4" />} onClick={() => void toast.run(() => repo.unarchiveProject(p.id), 'Đã khôi phục')}>Restore</Button>
        </div>
      )}
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-2 size-3 shrink-0 rounded-full" style={{ background: p.color ?? 'var(--accent)' }} />
        <div className="min-w-0 flex-1">
          <AutoInput aria-label="Tên dự án" className="h-auto border-transparent bg-transparent px-1 py-1 text-xl font-semibold hover:border-border"
            value={p.name} onSave={(v) => v.trim() && void repo.updateProject(p.id, { name: v.trim() })} />
          {p.description && <p className="px-1 text-sm text-muted">{p.description}</p>}
        </div>
        <IconButton label={p.is_favorite ? 'Bỏ yêu thích' : 'Yêu thích'} onClick={() => void actions.toggleFavorite(p)}>
          <Star className={cx('size-5', p.is_favorite && 'text-warn')} fill={p.is_favorite ? 'currentColor' : 'none'} />
        </IconButton>
        <Menu trigger={(t) => <IconButton label="Thêm" {...t}><MoreHorizontal className="size-5" /></IconButton>} items={[
          { label: 'Sửa thông tin', icon: <Pencil className="size-4" />, onClick: () => ui.openProjectForm(p) },
          p.archived_at
            ? { label: 'Restore', icon: <ArchiveRestore className="size-4" />, onClick: () => void repo.unarchiveProject(p.id) }
            : { label: 'Archive', icon: <Archive className="size-4" />, onClick: () => void actions.archive(p) },
          { label: 'Xóa dự án', icon: <Trash2 className="size-4" />, danger: true, onClick: async () => { if (await actions.remove(p)) navigate('/projects'); } },
        ]} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Card className="col-span-2 p-3 md:col-span-1">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Tiến độ</span>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={p.progress_mode === 'auto'} onChange={(e) => void repo.updateProject(p.id, e.target.checked ? { progress_mode: 'auto' } : { progress_mode: 'manual', manual_progress: prog })} />
              tự tính
            </label>
          </div>
          <p className="text-2xl font-semibold tabular-nums">{prog}%</p>
          {p.progress_mode === 'manual'
            ? <input type="range" min={0} max={100} step={5} value={p.manual_progress ?? 0} aria-label="Tiến độ thủ công" className="w-full accent-[var(--accent)]" onChange={(e) => void repo.updateProject(p.id, { manual_progress: Number(e.target.value) })} />
            : <ProgressBar value={prog} className="mt-1" tone={risk.level === 'high' ? 'danger' : 'accent'} />}
        </Card>
        <Stat label="Task hoàn thành" value={`${done}/${tasks.length}`} />
        <Stat label="Quá hạn" value={overdue} tone={overdue ? 'text-danger' : undefined} />
        <Stat label="Deadline" value={p.deadline ? formatDateVi(p.deadline) : '—'} sub={daysLeft === null ? undefined : daysLeft >= 0 ? `còn ${daysLeft} ngày` : `quá ${-daysLeft} ngày`} tone={daysLeft !== null && daysLeft < 0 && prog < 100 ? 'text-danger' : undefined} />
        <Stat label="Thời gian đã làm" value={formatDuration(seconds)} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Select aria-label="Trạng thái dự án" className="h-8 w-auto" value={p.status} onChange={(e) => void repo.updateProject(p.id, { status: e.target.value as Project['status'] })}>
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
        </Select>
        <PriorityBadge priority={p.priority} />
        {p.start_date && <span className="text-xs text-muted">Bắt đầu {formatDateVi(p.start_date)}</span>}
      </div>

      {risk.level !== 'none' && (
        <div className={cx('mb-4 rounded-lg px-3 py-2 text-sm', risk.level === 'high' ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn')} role="alert">
          <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="size-4" />{risk.level === 'high' ? 'Project có nguy cơ trễ deadline.' : 'Project cần chú ý.'}</p>
          <ul className="mt-1 list-disc pl-6 text-xs">{risk.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}

      <div className="mb-4">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'tasks', label: 'Tasks' }, { value: 'milestones', label: 'Milestones' }, { value: 'notes', label: 'Ghi chú & File' }, { value: 'activity', label: 'Lịch sử' },
        ]} />
      </div>

      {tab === 'tasks' && <TaskBoard projectId={p.id} />}
      {tab === 'milestones' && <Milestones project={p} />}
      {tab === 'notes' && (
        <Card>
          <Section title="Ghi chú" className="border-t-0"><NotesEditor projectId={p.id} /></Section>
          <Section title="File đính kèm"><AttachmentList projectId={p.id} /></Section>
        </Card>
      )}
      {tab === 'activity' && <Card><Section title="Lịch sử dự án" className="border-t-0"><ActivityList projectId={p.id} /></Section></Card>}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={cx('text-xl font-semibold tabular-nums', tone)}>{value}</p>
      {sub && <p className={cx('text-xs', tone ?? 'text-muted')}>{sub}</p>}
    </Card>
  );
}

function Milestones({ project }: { project: Project }) {
  const ws = useWorkspace();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const list = ws.milestones.filter((m) => m.project_id === project.id).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  const prog = ws.projectProgressOf(project);

  return (
    <Card className="p-4">
      <p className="mb-3 text-sm text-muted">Tiến độ dự án hiện tại: <b className="text-fg">{prog}%</b></p>
      <ol className="relative space-y-3 border-l-2 border-border pl-5">
        {list.map((m) => {
          const late = !m.is_done && m.due_date && m.due_date < ws.today;
          return (
            <li key={m.id} className="relative">
              <span className={cx('absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-surface', m.is_done ? 'bg-ok' : late ? 'bg-danger' : 'bg-border')} />
              <div className="group flex flex-wrap items-center gap-2">
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={m.is_done} onChange={() => void repo.toggleMilestone(m)} aria-label={`Hoàn thành ${m.title}`} />
                <AutoInput className={cx('h-8 w-48 border-transparent bg-transparent px-1 font-medium hover:border-border', m.is_done && 'text-muted line-through')}
                  value={m.title} onSave={(v) => v.trim() && void repo.updateMilestone(m.id, { title: v.trim() })} aria-label="Tên milestone" />
                <Input type="date" className="h-8 w-40" value={m.due_date ?? ''} onChange={(e) => void repo.updateMilestone(m.id, { due_date: e.target.value || null })} aria-label="Ngày" />
                {late && <span className="text-xs text-danger">Trễ hạn</span>}
                {m.due_date && !m.is_done && !late && <span className="text-xs text-muted">còn {daysBetween(ws.today, m.due_date)} ngày</span>}
                <IconButton label="Xóa milestone" className="opacity-60 group-hover:opacity-100" onClick={() => void repo.deleteMilestone(m.id)}><Trash2 className="size-4" /></IconButton>
              </div>
            </li>
          );
        })}
        {list.length === 0 && <li className="text-sm text-muted">Chưa có milestone (VD: Prototype, Alpha, Beta, Launch).</li>}
      </ol>
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        void toast.run(async () => { await repo.createMilestone(project.id, title, date || null); setTitle(''); setDate(''); });
      }}>
        <Input className="h-9 w-48" placeholder="Tên milestone" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Tên milestone mới" />
        <Input className="h-9 w-40" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Ngày milestone" />
        <Button size="sm" type="submit" className="h-9" icon={<Plus className="size-4" />}>Thêm</Button>
      </form>
    </Card>
  );
}
