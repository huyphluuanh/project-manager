// Logic nghiệp vụ thuần (không phụ thuộc DB/UI) -> dễ test.

import { PRIORITY_RANK } from './labels';
import type { Priority, Project, Subtask, Task, TaskDependency, TaskFilters, SortKey } from './types';
import { daysBetween, todayKey } from './utils';

// ---------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------

const STATUS_PROGRESS: Record<Task['status'], number> = {
  todo: 0, in_progress: 40, review: 80, blocked: 20, done: 100,
};

export function taskProgress(task: Task, subtasks: Subtask[] = []): number {
  if (task.progress_mode === 'manual' && task.manual_progress != null) return task.manual_progress;
  if (task.status === 'done') return 100;
  const live = subtasks.filter((s) => !s.deleted_at);
  if (live.length > 0) return Math.round((100 * live.filter((s) => s.is_done).length) / live.length);
  return STATUS_PROGRESS[task.status];
}

export function projectProgress(project: Project, tasks: Task[]): number {
  if (project.progress_mode === 'manual' && project.manual_progress != null) return project.manual_progress;
  const live = tasks.filter((t) => !t.deleted_at && t.project_id === project.id);
  if (live.length === 0) return project.status === 'completed' ? 100 : 0;
  return Math.round((100 * live.filter((t) => t.status === 'done').length) / live.length);
}

// ---------------------------------------------------------------------
// Due helpers
// ---------------------------------------------------------------------

export const isOpen = (t: Task) => t.status !== 'done' && !t.deleted_at;
export const isOverdue = (t: Task, today = todayKey()) => isOpen(t) && !!t.due_date && t.due_date < today;
export const isDueToday = (t: Task, today = todayKey()) => isOpen(t) && t.due_date === today;
export function isDueWithin(t: Task, days: number, today = todayKey()) {
  if (!isOpen(t) || !t.due_date) return false;
  const d = daysBetween(today, t.due_date);
  return d >= 0 && d <= days;
}

// ---------------------------------------------------------------------
// Priority score
// ---------------------------------------------------------------------

const PRIORITY_POINTS: Record<Priority, number> = { critical: 100, high: 70, medium: 40, low: 10 };
const PROJECT_POINTS: Record<Priority, number> = { critical: 15, high: 10, medium: 5, low: 0 };

export interface ScoreContext {
  today?: string;
  projectsById?: Map<string, Project>;
  /** số task đang mở bị task này chặn */
  blocksCount?: Map<string, number>;
  /** task đang bị chặn bởi task chưa xong */
  blockedIds?: Set<string>;
}

/**
 * Điểm ưu tiên tự động. Ví dụ: Critical (100) + hạn ngày mai (40) = 140 -> lên đầu.
 */
export function priorityScore(task: Task, ctx: ScoreContext = {}): number {
  if (task.status === 'done' || task.deleted_at) return -1000;
  const today = ctx.today ?? todayKey();
  let score = PRIORITY_POINTS[task.priority];

  if (task.due_date) {
    const d = daysBetween(today, task.due_date);
    if (d < 0) score += 60 + Math.min(-d * 2, 20);
    else if (d === 0) score += 50;
    else if (d === 1) score += 40;
    else if (d <= 3) score += 30;
    else if (d <= 7) score += 15;
  }

  const project = ctx.projectsById?.get(task.project_id);
  if (project) score += PROJECT_POINTS[project.priority];

  const blocks = ctx.blocksCount?.get(task.id) ?? 0;
  score += Math.min(blocks * 10, 30);

  if (task.is_pinned) score += 20;
  if (task.my_day_date === today) score += 10;
  if (task.status === 'blocked' || ctx.blockedIds?.has(task.id)) score -= 30;
  if (task.snoozed_until && task.snoozed_until > new Date().toISOString()) score -= 50;
  return score;
}

/** Tính các map phụ thuộc dùng cho score và cảnh báo */
export function dependencyIndex(tasks: Task[], deps: TaskDependency[]) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const blocksCount = new Map<string, number>();
  const blockedBy = new Map<string, Task[]>();
  for (const d of deps) {
    if (d.deleted_at || d.type !== 'blocked_by') continue;
    const blocker = byId.get(d.depends_on_task_id);
    const blocked = byId.get(d.task_id);
    if (!blocker || !blocked || blocker.deleted_at || blocked.deleted_at) continue;
    if (blocker.status !== 'done' && blocked.status !== 'done') {
      blocksCount.set(blocker.id, (blocksCount.get(blocker.id) ?? 0) + 1);
      blockedBy.set(blocked.id, [...(blockedBy.get(blocked.id) ?? []), blocker]);
    }
  }
  return { blocksCount, blockedBy, blockedIds: new Set(blockedBy.keys()) };
}

// ---------------------------------------------------------------------
// Risk detection
// ---------------------------------------------------------------------

export interface ProjectRisk {
  level: 'none' | 'medium' | 'high';
  reasons: string[];
}

export function projectRisk(project: Project, tasks: Task[], progress: number, today = todayKey(), blockedIds?: Set<string>): ProjectRisk {
  const reasons: string[] = [];
  if (project.deleted_at || project.archived_at || ['completed', 'cancelled'].includes(project.status)) {
    return { level: 'none', reasons };
  }
  const live = tasks.filter((t) => t.project_id === project.id && !t.deleted_at);
  const open = live.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => t.due_date && t.due_date < today).length;
  const blocked = open.filter((t) => t.status === 'blocked' || blockedIds?.has(t.id)).length;
  const criticalOpen = open.filter((t) => t.priority === 'critical').length;
  let high = false;
  let medium = false;

  if (project.deadline) {
    const daysLeft = daysBetween(today, project.deadline);
    if (daysLeft < 0 && progress < 100) {
      high = true;
      reasons.push(`Đã quá deadline ${-daysLeft} ngày, mới đạt ${progress}%`);
    } else {
      if (daysLeft <= 2 && progress < 80) {
        high = true;
        reasons.push(`Còn ${daysLeft} ngày nhưng mới đạt ${progress}%`);
      }
      const start = project.start_date ?? project.created_at.slice(0, 10);
      const total = daysBetween(start, project.deadline);
      if (total > 0) {
        const elapsed = Math.min(Math.max(daysBetween(start, today) / total, 0), 1);
        const gap = elapsed - progress / 100;
        if (gap > 0.3) {
          high = true;
          reasons.push(`Thời gian đã trôi ${Math.round(elapsed * 100)}% nhưng tiến độ ${progress}%`);
        } else if (gap > 0.15) {
          medium = true;
          reasons.push(`Tiến độ chậm hơn kế hoạch ~${Math.round(gap * 100)}%`);
        }
      }
      if (criticalOpen > 0 && daysLeft <= 7) {
        medium = true;
        reasons.push(`${criticalOpen} task Critical chưa xong, còn ${daysLeft} ngày`);
      }
      if (open.length > 0 && daysLeft >= 0 && daysLeft < open.length / 3) {
        medium = true;
        reasons.push(`Còn ${open.length} task mở trong ${daysLeft} ngày`);
      }
    }
  }
  if (overdue > 0) {
    medium = true;
    reasons.push(`${overdue} task quá hạn`);
  }
  if (blocked > 0) {
    medium = true;
    reasons.push(`${blocked} task đang bị block`);
  }
  return { level: high ? 'high' : medium ? 'medium' : 'none', reasons };
}

// ---------------------------------------------------------------------
// Filter & sort
// ---------------------------------------------------------------------

export function filterTasks(tasks: Task[], f: TaskFilters, extra: { tagIdsByTask?: Map<string, string[]>; today?: string } = {}): Task[] {
  const today = extra.today ?? todayKey();
  const text = f.text?.trim().toLowerCase();
  return tasks.filter((t) => {
    if (t.deleted_at) return false;
    if (!f.showCompleted && t.status === 'done' && !f.statuses?.includes('done')) return false;
    if (f.projectIds?.length && !f.projectIds.includes(t.project_id)) return false;
    if (f.statuses?.length && !f.statuses.includes(t.status)) return false;
    if (f.priorities?.length && !f.priorities.includes(t.priority)) return false;
    if (f.assigneeIds?.length && !f.assigneeIds.includes(t.assignee_id ?? '')) return false;
    if (f.tagIds?.length) {
      const tags = extra.tagIdsByTask?.get(t.id) ?? [];
      if (!f.tagIds.some((id) => tags.includes(id))) return false;
    }
    if (f.due === 'overdue' && !isOverdue(t, today)) return false;
    if (f.due === 'today' && t.due_date !== today) return false;
    if (f.due === 'week' && !isDueWithin(t, 7, today)) return false;
    if (f.due === 'none' && t.due_date) return false;
    if (text && !(`${t.title} ${t.description}`.toLowerCase().includes(text))) return false;
    return true;
  });
}

export function sortTasks(tasks: Task[], key: SortKey, dir: 'asc' | 'desc', ctx: ScoreContext & { progressOf?: (t: Task) => number } = {}): Task[] {
  const sign = dir === 'asc' ? 1 : -1;
  const scores = key === 'score' ? new Map(tasks.map((t) => [t.id, priorityScore(t, ctx)])) : null;
  const cmp = (a: Task, b: Task): number => {
    switch (key) {
      case 'score': return (scores!.get(b.id)! - scores!.get(a.id)!) * sign;
      case 'priority': return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * sign;
      case 'due_date': {
        if (a.due_date === b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date) * sign;
      }
      case 'created_at': return a.created_at.localeCompare(b.created_at) * sign;
      case 'updated_at': return a.updated_at.localeCompare(b.updated_at) * sign;
      case 'progress': return ((ctx.progressOf?.(a) ?? 0) - (ctx.progressOf?.(b) ?? 0)) * sign;
      case 'title': return a.title.localeCompare(b.title, 'vi') * sign;
    }
  };
  return [...tasks].sort((a, b) => cmp(a, b) || a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}
