import { AlarmClock, Check, Pin, Sun, Trash2 } from 'lucide-react';
import { memo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTaskActions } from '../../hooks/useTaskActions';
import { useUI } from '../../hooks/useUI';
import { useWorkspace } from '../../hooks/useWorkspace';
import { PRIORITIES, PRIORITY_LABEL } from '../../lib/labels';
import type { Task } from '../../lib/types';
import { cx } from '../../lib/utils';
import { Modal, ProgressBar } from '../ui';
import { Avatar, DueLabel, PriorityBadge, StatusBadge, StatusIcon, TagChip } from './badges';

// ---------------------------------------------------------------------
// Checkbox hoàn thành
// ---------------------------------------------------------------------

export function DoneCheckbox({ task, className }: { task: Task; className?: string }) {
  const { toggleDone } = useTaskActions();
  const done = task.status === 'done';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? 'Mở lại task' : 'Đánh dấu hoàn thành'}
      onClick={(e) => { e.stopPropagation(); void toggleDone(task); }}
      className={cx(
        'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        done ? 'border-ok bg-ok text-white' : 'border-border hover:border-accent',
        className,
      )}
    >
      {done && <Check className="size-3" strokeWidth={3} />}
    </button>
  );
}

function useRowKeys(task: Task) {
  const { openTask, setFocusedTaskId } = useUI();
  const { toggleDone, remove } = useTaskActions();
  return {
    tabIndex: 0,
    onFocus: () => setFocusedTaskId(task.id),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter') { e.preventDefault(); openTask(task.id); }
      if (e.key === ' ') { e.preventDefault(); void toggleDone(task); }
      if (e.key === 'Delete') { e.preventDefault(); void remove(task); }
    },
  };
}

function Meta({ task }: { task: Task }) {
  const ws = useWorkspace();
  const subs = ws.subtasksByTask.get(task.id) ?? [];
  const tagIds = ws.tagIdsByTask.get(task.id) ?? [];
  const blockers = ws.blockedBy.get(task.id);
  return (
    <>
      {subs.length > 0 && <span className="text-xs text-muted">{subs.filter((s) => s.is_done).length}/{subs.length}</span>}
      {blockers && task.status !== 'done' && (
        <span className="text-xs text-danger" title={`Bị chặn bởi: ${blockers.map((b) => b.title).join(', ')}`}>⛔ chờ {blockers.length}</span>
      )}
      {tagIds.slice(0, 3).map((id) => {
        const tag = ws.tagsById.get(id);
        return tag ? <TagChip key={id} name={tag.name} color={tag.color} /> : null;
      })}
    </>
  );
}

// ---------------------------------------------------------------------
// Dòng trong List view (desktop)
// ---------------------------------------------------------------------

export const TaskRow = memo(function TaskRow({ task, showProject = true }: { task: Task; showProject?: boolean }) {
  const ws = useWorkspace();
  const { openTask } = useUI();
  const keys = useRowKeys(task);
  const project = ws.projectsById.get(task.project_id);
  const progress = ws.taskProgressOf(task);
  const assignee = ws.profiles.find((p) => p.id === task.assignee_id);
  const done = task.status === 'done';

  return (
    <div
      {...keys}
      onClick={() => openTask(task.id)}
      className="group grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-3 py-2.5 hover:bg-surface-2 focus:bg-surface-2 lg:grid-cols-[auto_70px_minmax(0,1fr)_150px_110px_100px_90px_32px]"
    >
      <DoneCheckbox task={task} />
      <span className="hidden lg:block"><PriorityBadge priority={task.priority} /></span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="lg:hidden"><PriorityBadge priority={task.priority} compact /></span>
          {task.is_pinned && <Pin className="size-3.5 shrink-0 text-accent" aria-label="Đã ghim" />}
          <span className={cx('truncate text-sm', done && 'text-muted line-through')}>{task.title}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 lg:hidden">
          {showProject && project && <span className="text-xs text-muted">{project.name}</span>}
          <DueLabel date={task.due_date} time={task.due_time} done={done} />
          <Meta task={task} />
        </div>
        <div className="hidden flex-wrap items-center gap-1.5 lg:flex"><Meta task={task} /></div>
      </div>
      <span className="hidden truncate text-xs text-muted lg:block">{showProject ? project?.name : ''}</span>
      <span className="hidden lg:block"><StatusBadge status={task.status} /></span>
      <span className="hidden lg:block"><DueLabel date={task.due_date} time={task.due_time} done={done} /></span>
      <span className="hidden items-center gap-2 lg:flex">
        <ProgressBar value={progress} tone={done ? 'ok' : 'accent'} className="w-12" />
        <span className="text-xs text-muted tabular-nums">{progress}%</span>
      </span>
      <span className="justify-self-end">
        {assignee ? <Avatar name={assignee.full_name || assignee.email} /> : <span className="lg:hidden"><StatusIcon status={task.status} /></span>}
      </span>
    </div>
  );
});

// ---------------------------------------------------------------------
// Card (mobile / kanban) có swipe
//   vuốt phải  -> hoàn thành
//   vuốt trái  -> menu: tạm hoãn / đổi ưu tiên / My Day / xóa
// ---------------------------------------------------------------------

const SWIPE = 80;

export const TaskCard = memo(function TaskCard({ task, showProject = true, swipe = true, dragHandleProps }: {
  task: Task; showProject?: boolean; swipe?: boolean; dragHandleProps?: Record<string, unknown>;
}) {
  const ws = useWorkspace();
  const { openTask } = useUI();
  const actions = useTaskActions();
  const keys = useRowKeys(task);
  const [dx, setDx] = useState(0);
  const [sheet, setSheet] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; locked: boolean | null } | null>(null);
  const project = ws.projectsById.get(task.project_id);
  const progress = ws.taskProgressOf(task);
  const done = task.status === 'done';

  const onPointerDown = (e: PointerEvent) => {
    if (!swipe || e.pointerType === 'mouse') return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, locked: null };
  };
  const onPointerMove = (e: PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (s.locked === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) s.locked = Math.abs(mx) > Math.abs(my);
    if (s.locked) setDx(Math.max(-140, Math.min(140, mx)));
  };
  const onPointerUp = () => {
    const s = start.current;
    start.current = null;
    if (!s?.locked) return;
    if (dx > SWIPE) void actions.toggleDone(task);
    else if (dx < -SWIPE) setSheet(true);
    setDx(0);
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-xl">
        {dx !== 0 && (
          <div className={cx('absolute inset-0 flex items-center px-4 text-sm font-medium', dx > 0 ? 'justify-start bg-ok text-white' : 'justify-end bg-accent text-accent-fg')}>
            {dx > 0 ? (done ? 'Mở lại' : '✓ Hoàn thành') : 'Tùy chọn…'}
          </div>
        )}
        <div
          {...keys}
          {...dragHandleProps}
          onClick={() => { if (dx === 0) openTask(task.id); }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { start.current = null; setDx(0); }}
          style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: 'pan-y' }}
          className={cx(
            'relative cursor-pointer rounded-xl border border-border bg-surface p-3 transition-transform',
            task.priority === 'critical' && !done && 'border-l-4 border-l-[#dc2626]',
            task.priority === 'high' && !done && 'border-l-4 border-l-[#ea580c]',
          )}
        >
          <div className="flex items-start gap-3">
            <DoneCheckbox task={task} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className={cx('text-sm leading-snug', done && 'text-muted line-through')}>
                {task.is_pinned && <Pin className="mr-1 inline size-3.5 text-accent" aria-label="Đã ghim" />}
                {task.title}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <PriorityBadge priority={task.priority} />
                <DueLabel date={task.due_date} time={task.due_time} done={done} />
                {showProject && project && <span className="max-w-[140px] truncate text-xs text-muted">{project.name}</span>}
                <Meta task={task} />
              </div>
              {progress > 0 && progress < 100 && <ProgressBar value={progress} className="mt-2" />}
            </div>
          </div>
        </div>
      </div>

      <Modal open={sheet} onClose={() => setSheet(false)} title={task.title} size="sm">
        <div className="grid gap-1 p-2">
          <SheetBtn icon={<Check className="size-4" />} label={done ? 'Mở lại' : 'Hoàn thành'} onClick={() => { setSheet(false); void actions.toggleDone(task); }} />
          <SheetBtn icon={<Sun className="size-4" />} label={task.my_day_date === ws.today ? 'Bỏ khỏi My Day' : 'Thêm vào My Day'} onClick={() => { setSheet(false); void actions.toggleMyDay(task, ws.today); }} />
          <SheetBtn icon={<AlarmClock className="size-4" />} label="Tạm hoãn tới mai" onClick={() => { setSheet(false); void actions.snooze(task, 1); }} />
          <SheetBtn icon={<AlarmClock className="size-4" />} label="Tạm hoãn 1 tuần" onClick={() => { setSheet(false); void actions.snooze(task, 7); }} />
          <div className="my-1 border-t border-border" />
          <p className="px-3 pt-1 text-xs text-muted">Đổi mức ưu tiên</p>
          <div className="grid grid-cols-4 gap-1 px-2 pb-1">
            {PRIORITIES.map((p) => (
              <button key={p} type="button" onClick={() => { setSheet(false); void actions.setPriority(task, p); }}
                className={cx('flex flex-col items-center gap-1 rounded-lg py-2 text-xs hover:bg-surface-2', task.priority === p && 'bg-accent-soft')}>
                <PriorityBadge priority={p} compact />
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-border" />
          <SheetBtn icon={<Trash2 className="size-4" />} label="Xóa" danger onClick={() => { setSheet(false); void actions.remove(task); }} />
        </div>
      </Modal>
    </>
  );
});

function SheetBtn({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cx('flex h-12 items-center gap-3 rounded-lg px-3 text-sm hover:bg-surface-2', danger && 'text-danger')}>
      {icon}
      {label}
    </button>
  );
}
