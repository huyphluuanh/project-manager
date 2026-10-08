import type { Priority, ProjectStatus, TaskStatus } from './types';

export const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];
export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review', 'blocked', 'done'];
export const PROJECT_STATUSES: ProjectStatus[] = ['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'];

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planning',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Màu dùng cho biểu đồ (giữ ít màu, đồng nhất light/dark) */
export const PRIORITY_COLOR: Record<Priority, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#2563eb',
  low: '#94a3b8',
};

export const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: '#94a3b8',
  in_progress: '#2563eb',
  review: '#7c3aed',
  blocked: '#dc2626',
  done: '#16a34a',
};

export const PROJECT_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#7c3aed', '#475569'];
