import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/feedback';
import { Button, IconButton, Segmented } from '../components/ui';
import { useUI } from '../hooks/useUI';
import { useWorkspace } from '../hooks/useWorkspace';
import { getDb } from '../lib/db';
import { PRIORITY_COLOR } from '../lib/labels';
import * as repo from '../lib/repo';
import type { Milestone, Project, Reminder, Task } from '../lib/types';
import { cx, toDateKey } from '../lib/utils';

type Mode = 'month' | 'week' | 'day';

interface DayItems {
  tasks: Task[];
  milestones: Milestone[];
  deadlines: Project[];
  reminders: Reminder[];
}

export function Calendar() {
  const ws = useWorkspace();
  const ui = useUI();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(() => (window.innerWidth < 640 ? 'week' : 'month'));
  const [cursor, setCursor] = useState(new Date());
  const [showDone, setShowDone] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
  );
  const reminders = useLiveQuery(async () => (await getDb().t('reminders').toArray()).filter((r) => !r.deleted_at && r.status !== 'dismissed'), []) ?? [];

  const start = mode === 'month' ? startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }) : mode === 'week' ? startOfWeek(cursor, { weekStartsOn: 1 }) : cursor;
  const end = mode === 'month' ? endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) : mode === 'week' ? endOfWeek(cursor, { weekStartsOn: 1 }) : cursor;
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(toDateKey(d));

  const itemsFor = (key: string): DayItems => ({
    tasks: ws.tasks.filter((t) => t.due_date === key && (showDone || t.status !== 'done') && !ws.projectsById.get(t.project_id)?.archived_at)
      .sort((a, b) => (a.due_time ?? '99').localeCompare(b.due_time ?? '99')),
    milestones: ws.milestones.filter((m) => m.due_date === key),
    deadlines: ws.activeProjects.filter((p) => p.deadline === key),
    reminders: reminders.filter((r) => toDateKey(new Date(r.status === 'snoozed' && r.snoozed_until ? r.snoozed_until : r.remind_at)) === key),
  });

  const move = (dir: number) => setCursor((c) => (mode === 'month' ? addMonths(c, dir) : mode === 'week' ? addWeeks(c, dir) : addDays(c, dir)));
  const title = mode === 'month'
    ? format(cursor, 'MMMM yyyy', { locale: vi })
    : mode === 'week'
      ? `${format(start, 'dd/MM')} – ${format(end, 'dd/MM/yyyy')}`
      : format(cursor, 'EEEE, dd/MM/yyyy', { locale: vi });

  const onDragEnd = (e: DragEndEvent) => {
    const date = e.over?.id ? String(e.over.id) : null;
    const task = ws.tasksById.get(String(e.active.id));
    if (!date || !task || task.due_date === date) return;
    void toast.run(async () => {
      const prev = task.due_date;
      await repo.updateTask(task.id, { due_date: date });
      toast.show(`Đã dời deadline sang ${date.slice(8)}/${date.slice(5, 7)}`, { action: { label: 'Hoàn tác', onClick: () => void repo.updateTask(task.id, { due_date: prev }) } });
    });
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <IconButton label="Trước" onClick={() => move(-1)}><ChevronLeft className="size-5" /></IconButton>
          <IconButton label="Sau" onClick={() => move(1)}><ChevronRight className="size-5" /></IconButton>
        </div>
        <h1 className="text-lg font-semibold first-letter:uppercase">{title}</h1>
        <Button size="sm" onClick={() => setCursor(new Date())}>Hôm nay</Button>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="size-4 accent-[var(--accent)]" /> Hiện task đã xong
        </label>
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        {mode === 'month' ? (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted">
              {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => <div key={d} className="py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map((key) => (
                <DayCell key={key} dateKey={key} items={itemsFor(key)} compact outside={parseISO(key).getMonth() !== cursor.getMonth()}
                  today={key === ws.today} onAdd={() => ui.openQuickAdd({ due_date: key })} onOpenDay={() => { setCursor(parseISO(key)); setMode('day'); }} />
              ))}
            </div>
          </div>
        ) : (
          <div className={cx('grid gap-2', mode === 'week' ? 'md:grid-cols-7' : '')}>
            {days.map((key) => (
              <div key={key} className="overflow-hidden rounded-xl border border-border bg-surface">
                <DayCell dateKey={key} items={itemsFor(key)} today={key === ws.today} header onAdd={() => ui.openQuickAdd({ due_date: key })} />
              </div>
            ))}
          </div>
        )}
      </DndContext>
      <p className="mt-3 text-xs text-muted">Kéo task sang ngày khác để đổi deadline. 🏁 Milestone · 🎯 Deadline dự án · ⏰ Nhắc việc</p>
    </div>
  );
}

function DayCell({ dateKey, items, compact, outside, today, header, onAdd, onOpenDay }: {
  dateKey: string; items: DayItems; compact?: boolean; outside?: boolean; today?: boolean; header?: boolean; onAdd: () => void; onOpenDay?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });
  const navigate = useNavigate();
  const ui = useUI();
  const max = compact ? 3 : 50;
  const total = items.tasks.length + items.milestones.length + items.deadlines.length + items.reminders.length;
  const d = parseISO(dateKey);

  return (
    <div ref={setNodeRef} className={cx(
      'group flex flex-col gap-1 p-1.5',
      compact && 'min-h-24 border-r border-b border-border [&:nth-child(7n)]:border-r-0 md:min-h-28',
      outside && 'bg-surface-2/50 text-muted',
      isOver && 'bg-accent-soft',
      !compact && 'min-h-24',
    )}>
      <div className="flex items-center justify-between">
        <button type="button" onClick={onOpenDay} disabled={!onOpenDay}
          className={cx('flex items-center gap-1.5 rounded-md px-1 text-xs font-medium', today && 'bg-accent text-accent-fg')}>
          {header ? format(d, 'EEEE dd/MM', { locale: vi }) : format(d, 'd')}
        </button>
        <button type="button" aria-label={`Thêm task ngày ${dateKey}`} onClick={onAdd}
          className="rounded p-0.5 text-muted opacity-100 hover:bg-surface-2 md:opacity-0 md:group-hover:opacity-100">
          <Plus className="size-3.5" />
        </button>
      </div>
      {items.deadlines.map((p) => (
        <button key={p.id} type="button" onClick={() => navigate(`/projects/${p.id}`)} className="truncate rounded bg-danger-soft px-1.5 py-0.5 text-left text-[11px] font-medium text-danger">🎯 {p.name}</button>
      ))}
      {items.milestones.map((m) => (
        <button key={m.id} type="button" onClick={() => navigate(`/projects/${m.project_id}`)} className={cx('truncate rounded bg-accent-soft px-1.5 py-0.5 text-left text-[11px] font-medium text-accent', m.is_done && 'line-through opacity-60')}>🏁 {m.title}</button>
      ))}
      {items.tasks.slice(0, max).map((t) => <TaskChip key={t.id} task={t} />)}
      {!compact && items.reminders.map((r) => (
        <button key={r.id} type="button" onClick={() => r.task_id && ui.openTask(r.task_id)} className="truncate rounded px-1.5 py-0.5 text-left text-[11px] text-muted hover:bg-surface-2">
          ⏰ {format(new Date(r.remind_at), 'HH:mm')} {r.title}
        </button>
      ))}
      {compact && total > max + items.deadlines.length + items.milestones.length && (
        <button type="button" onClick={onOpenDay} className="text-left text-[11px] text-muted hover:text-fg">+{total - max - items.deadlines.length - items.milestones.length} khác</button>
      )}
      {!compact && total === 0 && <p className="px-1 text-xs text-muted">—</p>}
    </div>
  );
}

function TaskChip({ task }: { task: Task }) {
  const { openTask } = useUI();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => openTask(task.id)}
      style={{ transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined, borderLeftColor: PRIORITY_COLOR[task.priority] }}
      className={cx(
        'touch-manipulation truncate rounded border-l-[3px] bg-surface-2 px-1.5 py-0.5 text-left text-[11px] hover:bg-border',
        task.status === 'done' && 'text-muted line-through',
        isDragging && 'relative z-30 shadow-lg',
      )}
      title={task.title}
    >
      {task.due_time && <span className="text-muted">{task.due_time.slice(0, 5)} </span>}
      {task.title}
    </button>
  );
}
