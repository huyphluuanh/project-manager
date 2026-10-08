import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlarmClock, Bell, Link2, MoreHorizontal, Pause, Pin, Play, Plus, Square, Sun, Trash2, X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTaskActions } from '../../hooks/useTaskActions';
import { useUI } from '../../hooks/useUI';
import { useWorkspace } from '../../hooks/useWorkspace';
import { getDb } from '../../lib/db';
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL } from '../../lib/labels';
import * as repo from '../../lib/repo';
import type { Reminder, Task, TaskDependency } from '../../lib/types';
import { cx, formatClock, formatDateTimeVi, formatDuration } from '../../lib/utils';
import { useToast } from '../feedback';
import { ActivityList, AttachmentList, AutoInput, AutoTextarea, NotesEditor, Section } from '../shared';
import { Button, Field, IconButton, Input, Menu, Modal, ProgressBar, Segmented, Select } from '../ui';
import { DoneCheckbox } from './TaskItem';
import { StatusIcon, TagChip } from './badges';

export function TaskDetailHost() {
  const { taskId, openTask } = useUI();
  const ws = useWorkspace();
  const task = taskId ? ws.tasksById.get(taskId) : undefined;
  return (
    <Modal open={!!task} onClose={() => openTask(null)} side>
      {task && <TaskDetail key={task.id} task={task} onClose={() => openTask(null)} />}
    </Modal>
  );
}

function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const ws = useWorkspace();
  const toast = useToast();
  const actions = useTaskActions();
  const [tab, setTab] = useState<'details' | 'notes' | 'activity'>('details');
  const save = (patch: Partial<Task>) => void toast.run(() => repo.updateTask(task.id, patch));
  const progress = ws.taskProgressOf(task);
  const blockers = ws.blockedBy.get(task.id);

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-border bg-surface px-4 py-3">
        <DoneCheckbox task={task} className="mt-2.5" />
        <AutoInput
          aria-label="Tên task"
          className="h-auto border-transparent bg-transparent px-1 py-1.5 text-base font-semibold hover:border-border"
          value={task.title}
          onSave={(v) => v.trim() && save({ title: v.trim() })}
        />
        <Menu
          trigger={(p) => <IconButton label="Thêm" {...p}><MoreHorizontal className="size-5" /></IconButton>}
          items={[
            { label: task.is_pinned ? 'Bỏ ghim' : 'Ghim', icon: <Pin className="size-4" />, onClick: () => void repo.togglePin(task) },
            { label: task.my_day_date === ws.today ? 'Bỏ khỏi My Day' : 'Thêm vào My Day', icon: <Sun className="size-4" />, onClick: () => void actions.toggleMyDay(task, ws.today) },
            { label: 'Tạm hoãn tới mai', icon: <AlarmClock className="size-4" />, onClick: () => void actions.snooze(task, 1) },
            task.snoozed_until ? { label: 'Bỏ tạm hoãn', icon: <AlarmClock className="size-4" />, onClick: () => save({ snoozed_until: null }) } : null,
            { label: 'Xóa task', icon: <Trash2 className="size-4" />, danger: true, onClick: async () => { if (await actions.remove(task)) onClose(); } },
          ]}
        />
        <IconButton label="Đóng (Esc)" onClick={onClose}><X className="size-5" /></IconButton>
      </div>

      {blockers && task.status !== 'done' && (
        <div className="mx-4 mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          ⛔ Đang chờ {blockers.length} task chưa xong: {blockers.map((b) => b.title).join(', ')}
        </div>
      )}
      {task.snoozed_until && task.snoozed_until > new Date().toISOString() && (
        <div className="mx-4 mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">⏰ Tạm hoãn tới {formatDateTimeVi(task.snoozed_until)}</div>
      )}

      <div className="px-4 pt-3">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'details', label: 'Chi tiết' }, { value: 'notes', label: 'Ghi chú & File' }, { value: 'activity', label: 'Lịch sử' },
        ]} />
      </div>

      {tab === 'details' && (
        <>
          <div className="grid grid-cols-2 gap-3 px-4 py-4">
            <Field label="Dự án">
              {(id) => (
                <Select id={id} value={task.project_id} onChange={(e) => save({ project_id: e.target.value })}>
                  {ws.activeProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Trạng thái">
              {(id) => (
                <Select id={id} value={task.status} onChange={(e) => save({ status: e.target.value as Task['status'] })}>
                  {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Ưu tiên">
              {(id) => (
                <Select id={id} value={task.priority} onChange={(e) => save({ priority: e.target.value as Task['priority'] })}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Người phụ trách">
              {(id) => (
                <Select id={id} value={task.assignee_id ?? ''} onChange={(e) => save({ assignee_id: e.target.value || null })}>
                  <option value="">— Chưa giao —</option>
                  {ws.profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Ngày bắt đầu">
              {(id) => <Input id={id} type="date" value={task.start_date ?? ''} onChange={(e) => save({ start_date: e.target.value || null })} />}
            </Field>
            <Field label="Deadline">
              {(id) => <Input id={id} type="date" value={task.due_date ?? ''} onChange={(e) => save({ due_date: e.target.value || null })} />}
            </Field>
            <Field label="Giờ hạn (tùy chọn)">
              {(id) => <Input id={id} type="time" value={task.due_time?.slice(0, 5) ?? ''} onChange={(e) => save({ due_time: e.target.value || null })} />}
            </Field>
            <Field label="Ước tính (phút)">
              {(id) => (
                <AutoInput id={id} type="number" min={0} value={task.estimate_minutes?.toString() ?? ''}
                  onSave={(v) => save({ estimate_minutes: v ? Math.max(0, Number(v)) : null })} />
              )}
            </Field>
          </div>

          <div className="px-4 pb-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">Tiến độ: {progress}%</span>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={task.progress_mode === 'auto'}
                  onChange={(e) => save(e.target.checked ? { progress_mode: 'auto' } : { progress_mode: 'manual', manual_progress: progress })} />
                Tự tính từ subtask/trạng thái
              </label>
            </div>
            {task.progress_mode === 'manual' ? (
              <input type="range" min={0} max={100} step={5} value={task.manual_progress ?? 0} aria-label="Tiến độ"
                className="w-full accent-[var(--accent)]" onChange={(e) => save({ manual_progress: Number(e.target.value) })} />
            ) : (
              <ProgressBar value={progress} tone={task.status === 'done' ? 'ok' : 'accent'} />
            )}
          </div>

          <div className="px-4 pb-4">
            <Field label="Mô tả">
              {(id) => <AutoTextarea id={id} rows={3} value={task.description} onSave={(v) => save({ description: v })} placeholder="Thêm mô tả…" />}
            </Field>
          </div>

          <TagEditor task={task} />
          <SubtaskEditor task={task} />
          <DependencyEditor task={task} />
          <TimeTracker task={task} />
          <ReminderEditor task={task} />

          <div className="border-t border-border px-4 py-3 text-xs text-muted">
            Tạo {formatDateTimeVi(task.created_at)} · Cập nhật {formatDateTimeVi(task.updated_at)}
            {task.completed_at && <> · Hoàn thành {formatDateTimeVi(task.completed_at)}</>}
          </div>
        </>
      )}

      {tab === 'notes' && (
        <>
          <Section title="Ghi chú"><NotesEditor taskId={task.id} /></Section>
          <Section title="File đính kèm"><AttachmentList projectId={task.project_id} taskId={task.id} /></Section>
        </>
      )}

      {tab === 'activity' && <Section title="Lịch sử thay đổi"><ActivityList taskId={task.id} /></Section>}
    </div>
  );
}

// ---------------------------------------------------------------------

function TagEditor({ task }: { task: Task }) {
  const ws = useWorkspace();
  const toast = useToast();
  const [text, setText] = useState('');
  const ids = ws.tagIdsByTask.get(task.id) ?? [];
  const add = () => toast.run(async () => {
    const name = text.trim().replace(/^#/, '');
    if (!name) return;
    const id = await repo.ensureTag(name);
    if (!ids.includes(id)) await repo.setTaskTags(task.id, [...ids, id]);
    setText('');
  });
  return (
    <Section title="Tags">
      <div className="flex flex-wrap items-center gap-1.5">
        {ids.map((id) => {
          const tag = ws.tagsById.get(id);
          if (!tag) return null;
          return (
            <span key={id} className="inline-flex items-center gap-0.5">
              <TagChip name={tag.name} color={tag.color} />
              <button type="button" aria-label={`Bỏ tag ${tag.name}`} className="text-muted hover:text-danger"
                onClick={() => void repo.setTaskTags(task.id, ids.filter((x) => x !== id))}><X className="size-3" /></button>
            </span>
          );
        })}
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <Input list="tag-suggestions" className="h-8 w-32" placeholder="+ tag" value={text} onChange={(e) => setText(e.target.value)} />
          <datalist id="tag-suggestions">{ws.tags.map((t) => <option key={t.id} value={t.name} />)}</datalist>
        </form>
      </div>
    </Section>
  );
}

function SubtaskEditor({ task }: { task: Task }) {
  const ws = useWorkspace();
  const toast = useToast();
  const [text, setText] = useState('');
  const subs = ws.subtasksByTask.get(task.id) ?? [];
  const done = subs.filter((s) => s.is_done).length;
  return (
    <Section title="Subtasks" right={subs.length > 0 && <span className="text-xs text-muted">{done}/{subs.length} completed</span>}>
      <ul className="space-y-1">
        {subs.map((s) => (
          <li key={s.id} className="group flex items-center gap-2">
            <input type="checkbox" checked={s.is_done} onChange={() => void repo.toggleSubtask(s)} className="size-4 accent-[var(--accent)]" aria-label={`Hoàn thành ${s.title}`} />
            <AutoInput className={cx('h-8 border-transparent bg-transparent px-1 hover:border-border', s.is_done && 'text-muted line-through')}
              value={s.title} onSave={(v) => v.trim() && void repo.renameSubtask(s.id, v.trim())} aria-label="Tên subtask" />
            <IconButton label="Xóa subtask" className="opacity-60 group-hover:opacity-100" onClick={() => void repo.deleteSubtask(s.id)}><Trash2 className="size-4" /></IconButton>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex gap-2" onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        void toast.run(() => repo.addSubtask(task.id, text));
        setText('');
      }}>
        <Input className="h-9" placeholder="Thêm subtask…" value={text} onChange={(e) => setText(e.target.value)} />
        <Button size="sm" type="submit" className="h-9" icon={<Plus className="size-4" />}>Thêm</Button>
      </form>
    </Section>
  );
}

function DependencyEditor({ task }: { task: Task }) {
  const ws = useWorkspace();
  const toast = useToast();
  const [adding, setAdding] = useState<TaskDependency['type'] | null>(null);
  const [query, setQuery] = useState('');
  const mine = ws.deps.filter((d) => d.task_id === task.id);
  const blocking = ws.deps.filter((d) => d.depends_on_task_id === task.id && d.type === 'blocked_by');
  const candidates = useMemo(() => {
    const q = query.toLowerCase();
    return ws.tasks.filter((t) => t.id !== task.id && t.title.toLowerCase().includes(q)).slice(0, 8);
  }, [ws.tasks, task.id, query]);

  const row = (d: TaskDependency, other: Task | undefined, label: string) => other && (
    <li key={d.id + label} className="flex items-center gap-2 text-sm">
      <span className="w-20 shrink-0 text-xs text-muted">{label}</span>
      <StatusIcon status={other.status} />
      <span className={cx('min-w-0 flex-1 truncate', other.status === 'done' && 'text-muted line-through')}>{other.title}</span>
      <IconButton label="Bỏ liên kết" onClick={() => void toast.run(() => repo.removeDependency(d))}><X className="size-4" /></IconButton>
    </li>
  );

  return (
    <Section title="Phụ thuộc" right={
      <Menu trigger={(p) => <Button size="sm" variant="ghost" icon={<Link2 className="size-4" />} {...p}>Thêm</Button>} items={[
        { label: 'Bị chặn bởi (Blocked by)…', onClick: () => setAdding('blocked_by') },
        { label: 'Liên quan (Related to)…', onClick: () => setAdding('related_to') },
      ]} />
    }>
      <ul className="space-y-1">
        {mine.map((d) => row(d, ws.tasksById.get(d.depends_on_task_id), d.type === 'blocked_by' ? 'Blocked by' : 'Related to'))}
        {blocking.map((d) => row(d, ws.tasksById.get(d.task_id), 'Blocks'))}
      </ul>
      {!mine.length && !blocking.length && !adding && <p className="text-sm text-muted">Chưa có liên kết.</p>}
      {adding && (
        <div className="mt-2 rounded-lg border border-border p-2">
          <div className="mb-2 flex items-center gap-2">
            <Input autoFocus className="h-9" placeholder={adding === 'blocked_by' ? 'Task này chờ task nào?' : 'Liên quan task nào?'} value={query} onChange={(e) => setQuery(e.target.value)} />
            <IconButton label="Hủy" onClick={() => { setAdding(null); setQuery(''); }}><X className="size-4" /></IconButton>
          </div>
          <ul>
            {candidates.map((c) => (
              <li key={c.id}>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                  onClick={() => void toast.run(async () => { await repo.addDependency(task.id, c.id, adding); setAdding(null); setQuery(''); })}>
                  <StatusIcon status={c.status} />
                  <span className="truncate">{c.title}</span>
                  <span className="ml-auto truncate text-xs text-muted">{ws.projectsById.get(c.project_id)?.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function TimeTracker({ task }: { task: Task }) {
  const toast = useToast();
  const entries = useLiveQuery(
    async () => (await getDb().t('time_entries').where('task_id').equals(task.id).toArray()).filter((e) => !e.deleted_at).sort((a, b) => b.started_at.localeCompare(a.started_at)),
    [task.id],
  ) ?? [];
  const running = entries.find((e) => !e.ended_at);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  const total = entries.reduce((s, e) => s + repo.entrySeconds(e, now), 0);

  return (
    <Section title="Bấm giờ" right={<span className="text-xs text-muted">Tổng: {formatDuration(total)}</span>}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx('font-mono text-lg tabular-nums', running ? 'text-accent' : 'text-muted')}>
          {formatClock(running ? repo.entrySeconds(running, now) : 0)}
        </span>
        {running ? (
          <>
            <Button size="sm" icon={<Pause className="size-4" />} onClick={() => void toast.run(repo.stopTimer)}>Pause</Button>
            <Button size="sm" icon={<Square className="size-4" />} onClick={() => void toast.run(repo.stopTimer, 'Đã dừng bấm giờ')}>Stop</Button>
          </>
        ) : (
          <Button size="sm" variant="primary" icon={<Play className="size-4" />} onClick={() => void toast.run(() => repo.startTimer(task))}>
            {entries.length ? 'Resume' : 'Start Timer'}
          </Button>
        )}
      </div>
      {entries.length > 0 && (
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
          {entries.map((e) => (
            <li key={e.id} className="group flex items-center gap-2 text-xs text-muted">
              <span className="tabular-nums">{formatDateTimeVi(e.started_at)}</span>
              <span>→ {e.ended_at ? formatDateTimeVi(e.ended_at).slice(11) : 'đang chạy'}</span>
              <span className="ml-auto font-medium text-fg">{formatDuration(repo.entrySeconds(e, now))}</span>
              {e.ended_at && (
                <button type="button" aria-label="Xóa đoạn thời gian" className="opacity-50 group-hover:opacity-100 hover:text-danger" onClick={() => void repo.deleteTimeEntry(e.id)}>
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

const REMINDER_PRESETS = [
  { label: '5 phút trước', minutes: 5 },
  { label: '15 phút trước', minutes: 15 },
  { label: '30 phút trước', minutes: 30 },
  { label: '1 giờ trước', minutes: 60 },
  { label: '1 ngày trước', minutes: 1440 },
];

const REMINDER_STATUS: Record<Reminder['status'], string> = {
  pending: 'Chờ', fired: 'Đã nhắc', snoozed: 'Tạm hoãn', dismissed: 'Đã bỏ qua', done: 'Xong',
};

function ReminderEditor({ task }: { task: Task }) {
  const toast = useToast();
  const [custom, setCustom] = useState('');
  const reminders = useLiveQuery(
    async () => (await getDb().t('reminders').where('task_id').equals(task.id).toArray()).filter((r) => !r.deleted_at).sort((a, b) => a.remind_at.localeCompare(b.remind_at)),
    [task.id],
  ) ?? [];

  const addPreset = (minutes: number) => toast.run(async () => {
    const at = repo.reminderTimeFor(task, minutes);
    if (!at) throw new Error('Hãy đặt Deadline cho task trước khi dùng nhắc việc theo deadline.');
    await repo.createReminder({ task_id: task.id, project_id: task.project_id, title: task.title, remind_at: at, offset_minutes: minutes });
  }, 'Đã thêm nhắc việc');

  const addCustom = () => toast.run(async () => {
    if (!custom) return;
    await repo.createReminder({ task_id: task.id, project_id: task.project_id, title: task.title, remind_at: new Date(custom).toISOString() });
    setCustom('');
  }, 'Đã thêm nhắc việc');

  return (
    <Section title="Nhắc việc">
      <ul className="mb-2 space-y-1">
        {reminders.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            <Bell className="size-4 text-muted" />
            <span className="tabular-nums">{formatDateTimeVi(r.status === 'snoozed' && r.snoozed_until ? r.snoozed_until : r.remind_at)}</span>
            <span className="text-xs text-muted">{REMINDER_STATUS[r.status]}</span>
            <IconButton label="Xóa nhắc việc" className="ml-auto" onClick={() => void repo.deleteReminder(r.id)}><Trash2 className="size-4" /></IconButton>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        {REMINDER_PRESETS.map((p) => (
          <Button key={p.minutes} size="sm" onClick={() => void addPreset(p.minutes)}>{p.label}</Button>
        ))}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void addCustom(); }}>
        <Input type="datetime-local" className="h-9" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Thời gian nhắc tùy chọn" />
        <Button size="sm" type="submit" className="h-9" disabled={!custom}>Custom</Button>
      </form>
    </Section>
  );
}
