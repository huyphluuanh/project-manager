import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useUI } from '../../hooks/useUI';
import { TASK_STATUSES, TASK_STATUS_LABEL } from '../../lib/labels';
import * as repo from '../../lib/repo';
import type { Task, TaskStatus } from '../../lib/types';
import { cx } from '../../lib/utils';
import { useToast } from '../feedback';
import { IconButton } from '../ui';
import { StatusIcon } from './badges';
import { TaskCard } from './TaskItem';

export function KanbanView({ tasks, projectId }: { tasks: Task[]; projectId?: string }) {
  const toast = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const active = tasks.find((t) => t.id === activeId);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const status = e.over?.id as TaskStatus | undefined;
    const task = tasks.find((t) => t.id === e.active.id);
    if (!status || !task || task.status === status) return;
    void toast.run(() => repo.updateTask(task.id, { status }));
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 scrollbar-thin md:snap-none">
        {TASK_STATUSES.map((s) => (
          <Column key={s} status={s} tasks={tasks.filter((t) => t.status === s)} projectId={projectId} />
        ))}
      </div>
      <DragOverlay>{active ? <div className="w-72 rotate-2"><TaskCard task={active} swipe={false} /></div> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ status, tasks, projectId }: { status: TaskStatus; tasks: Task[]; projectId?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const ui = useUI();
  const [limit, setLimit] = useState(50);
  return (
    <div ref={setNodeRef} className={cx('flex w-[85vw] shrink-0 snap-start flex-col rounded-2xl bg-surface-2 p-2 sm:w-72', isOver && 'ring-2 ring-accent')}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <StatusIcon status={status} />
        <span className="text-sm font-semibold">{TASK_STATUS_LABEL[status]}</span>
        <span className="text-xs text-muted">{tasks.length}</span>
        <IconButton label={`Thêm task vào ${TASK_STATUS_LABEL[status]}`} className="ml-auto size-7" onClick={() => ui.openQuickAdd({ status, project_id: projectId })}>
          <Plus className="size-4" />
        </IconButton>
      </div>
      <div className="flex min-h-24 flex-col gap-2 p-1">
        {tasks.slice(0, limit).map((t) => <DraggableCard key={t.id} task={t} />)}
        {tasks.length > limit && (
          <button type="button" className="py-2 text-xs text-muted hover:text-fg" onClick={() => setLimit(limit + 50)}>+ {tasks.length - limit} task khác</button>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} className={cx(isDragging && 'opacity-30')}>
      <TaskCard task={task} swipe={false} dragHandleProps={{ ...listeners, ...attributes, tabIndex: 0 }} />
    </div>
  );
}
