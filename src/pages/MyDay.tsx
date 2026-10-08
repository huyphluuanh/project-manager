import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { ChevronDown, GripVertical, Plus, Sun, SunDim } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useToast } from '../components/feedback';
import { TaskCard } from '../components/task/TaskItem';
import { Button, EmptyState, IconButton } from '../components/ui';
import { useUI } from '../hooks/useUI';
import { useWorkspace } from '../hooks/useWorkspace';
import { isDueToday, isDueWithin, isOverdue, sortTasks } from '../lib/logic';
import * as repo from '../lib/repo';
import type { Task } from '../lib/types';
import { cx, toDateKey } from '../lib/utils';

export function MyDay() {
  const ws = useWorkspace();
  const ui = useUI();
  const toast = useToast();
  const [showDone, setShowDone] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );

  const nowIso = new Date().toISOString();
  const open = ws.tasks.filter((t) => t.status !== 'done' && !(t.snoozed_until && t.snoozed_until > nowIso));
  const sort = (xs: Task[]) => ws.settings.autoSort
    ? sortTasks(xs, 'score', 'asc', { projectsById: ws.projectsById, blocksCount: ws.blocksCount, blockedIds: ws.blockedIds })
    : sortTasks(xs, 'due_date', 'asc');

  const today = sort(open.filter((t) => t.my_day_date === ws.today));
  const inToday = new Set(today.map((t) => t.id));
  const rest = open.filter((t) => !inToday.has(t.id));
  const used = new Set<string>();
  const take = (xs: Task[]) => xs.filter((t) => !used.has(t.id) && used.add(t.id));
  const groups: { title: string; tasks: Task[]; tone?: string }[] = [
    { title: 'Quá hạn', tasks: take(sort(rest.filter((t) => isOverdue(t, ws.today)))), tone: 'text-danger' },
    { title: 'Đến hạn hôm nay', tasks: take(sort(rest.filter((t) => isDueToday(t, ws.today)))), tone: 'text-warn' },
    { title: 'Critical', tasks: take(sort(rest.filter((t) => t.priority === 'critical'))) },
    { title: 'Đã ghim', tasks: take(sort(rest.filter((t) => t.is_pinned))) },
    { title: 'High', tasks: take(sort(rest.filter((t) => t.priority === 'high'))) },
    { title: 'Sắp đến hạn (7 ngày)', tasks: take(sort(rest.filter((t) => isDueWithin(t, ws.settings.dueSoonDays, ws.today)))) },
  ].filter((g) => g.tasks.length > 0);

  const doneToday = ws.tasks.filter((t) => t.status === 'done' && t.completed_at && toDateKey(new Date(t.completed_at)) === ws.today);

  const onDragEnd = (e: DragEndEvent) => {
    if (e.over?.id === 'today-zone') void toast.run(() => repo.setMyDay(String(e.active.id), true), 'Đã thêm vào My Day');
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="mx-auto grid max-w-6xl gap-6 p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section>
          <div className="mb-4 flex items-end justify-between gap-2">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-semibold"><Sun className="size-5 text-warn" /> My Day</h1>
              <p className="text-sm text-muted first-letter:uppercase">{format(new Date(), 'EEEE, dd/MM/yyyy', { locale: vi })}</p>
            </div>
            <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => ui.openQuickAdd({ my_day: true, due_date: ws.today })}>Thêm</Button>
          </div>
          <TodayZone>
            {today.length === 0 ? (
              <EmptyState icon={<SunDim className="size-10" />} title="Danh sách hôm nay đang trống"
                description="Kéo task từ cột gợi ý vào đây, hoặc bấm ☀ trên task để thêm vào My Day." />
            ) : (
              <div className="space-y-2">
                {today.map((t) => (
                  <div key={t.id} className="flex items-center gap-1">
                    <div className="min-w-0 flex-1"><TaskCard task={t} /></div>
                    <IconButton label="Bỏ khỏi My Day" onClick={() => void repo.setMyDay(t.id, false)}><SunDim className="size-4" /></IconButton>
                  </div>
                ))}
              </div>
            )}
          </TodayZone>
          {doneToday.length > 0 && (
            <div className="mt-4">
              <button type="button" className="flex items-center gap-1 text-sm text-muted" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
                <ChevronDown className={cx('size-4 transition-transform', !showDone && '-rotate-90')} /> Đã hoàn thành hôm nay ({doneToday.length})
              </button>
              {showDone && <div className="mt-2 space-y-2">{doneToday.map((t) => <TaskCard key={t.id} task={t} />)}</div>}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-1 font-semibold">Gợi ý cho hôm nay</h2>
          <p className="mb-4 text-sm text-muted">Tự tổng hợp theo hạn, mức ưu tiên và ghim. <span className="hidden md:inline">Kéo thả sang trái để thêm.</span></p>
          {groups.length === 0 && <p className="text-sm text-muted">Không còn gợi ý nào. Tuyệt vời!</p>}
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.title}>
                <h3 className={cx('mb-2 text-xs font-semibold tracking-wide uppercase', g.tone ?? 'text-muted')}>{g.title} · {g.tasks.length}</h3>
                <div className="space-y-2">
                  {g.tasks.slice(0, 8).map((t) => (
                    <Suggestion key={t.id} task={t} onAdd={() => void toast.run(() => repo.setMyDay(t.id, true), 'Đã thêm vào My Day')} />
                  ))}
                  {g.tasks.length > 8 && <p className="text-xs text-muted">+{g.tasks.length - 8} task khác</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DndContext>
  );
}

function TodayZone({ children }: { children: ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'today-zone' });
  return (
    <div ref={setNodeRef} className={cx('min-h-40 rounded-2xl border-2 border-dashed p-2 transition-colors', isOver ? 'border-accent bg-accent-soft' : 'border-transparent')}>
      {children}
    </div>
  );
}

function Suggestion({ task, onAdd }: { task: Task; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 20, position: 'relative' } : undefined}
      className={cx('flex items-center gap-1', isDragging && 'opacity-80 shadow-xl')}>
      <button type="button" className="hidden cursor-grab touch-none p-1 text-muted md:block" aria-label="Kéo vào My Day" {...listeners} {...attributes}>
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1"><TaskCard task={task} /></div>
      <IconButton label="Thêm vào My Day" onClick={onAdd}><Sun className="size-4" /></IconButton>
    </div>
  );
}
