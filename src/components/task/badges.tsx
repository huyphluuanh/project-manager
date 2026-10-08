import { Ban, CheckCircle2, Circle, CircleDot, Eye, Flag } from 'lucide-react';
import { PRIORITY_COLOR, PRIORITY_LABEL, TASK_STATUS_LABEL } from '../../lib/labels';
import type { Priority, TaskStatus } from '../../lib/types';
import { cx, daysBetween, relativeDueLabel, todayKey } from '../../lib/utils';

const STATUS_ICON: Record<TaskStatus, typeof Circle> = {
  todo: Circle, in_progress: CircleDot, review: Eye, blocked: Ban, done: CheckCircle2,
};

const STATUS_TONE: Record<TaskStatus, string> = {
  todo: 'text-muted',
  in_progress: 'text-accent',
  review: 'text-[#7c3aed] dark:text-[#a78bfa]',
  blocked: 'text-danger',
  done: 'text-ok',
};

export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const Icon = STATUS_ICON[status];
  return <Icon className={cx('size-4 shrink-0', STATUS_TONE[status], className)} aria-hidden />;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap">
      <StatusIcon status={status} className="size-3.5" />
      <span className={STATUS_TONE[status]}>{TASK_STATUS_LABEL[status]}</span>
    </span>
  );
}

/** Mức ưu tiên: cờ + nhãn chữ (không chỉ dựa vào màu) */
export function PriorityBadge({ priority, compact }: { priority: Priority; compact?: boolean }) {
  const filled = priority === 'critical' || priority === 'high';
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap"
      style={{ color: PRIORITY_COLOR[priority] }}
      title={`Ưu tiên: ${PRIORITY_LABEL[priority]}`}
    >
      <Flag className="size-3.5" fill={filled ? 'currentColor' : 'none'} aria-hidden />
      {!compact && PRIORITY_LABEL[priority]}
      {compact && <span className="sr-only">{PRIORITY_LABEL[priority]}</span>}
    </span>
  );
}

export function DueLabel({ date, time, done, className }: { date: string | null; time?: string | null; done?: boolean; className?: string }) {
  if (!date) return null;
  const today = todayKey();
  const d = daysBetween(today, date);
  const tone = done ? 'text-muted' : d < 0 ? 'text-danger font-semibold' : d === 0 ? 'text-warn font-semibold' : d <= 2 ? 'text-warn' : 'text-muted';
  return (
    <span className={cx('text-xs whitespace-nowrap', tone, className)}>
      {!done && d < 0 && <span aria-hidden>⚠ </span>}
      {relativeDueLabel(date, today)}
      {time && ` ${time.slice(0, 5)}`}
    </span>
  );
}

export function TagChip({ name, color }: { name: string; color?: string | null }) {
  return (
    <span
      className="inline-flex items-center rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted"
      style={color ? { color } : undefined}
    >
      #{name}
    </span>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';
  return (
    <span className={cx('inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent', className)} title={name}>
      {initials}
    </span>
  );
}
