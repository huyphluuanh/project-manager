// Kiểu dữ liệu khớp 1-1 với bảng trong supabase/migrations.

export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'blocked' | 'done';
export type ProjectStatus = 'planning' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
export type ProgressMode = 'auto' | 'manual';
export type ReminderStatus = 'pending' | 'fired' | 'snoozed' | 'dismissed' | 'done';
export type NotificationType =
  | 'task_due' | 'task_overdue' | 'project_deadline' | 'assignment'
  | 'mention' | 'dependency_blocked' | 'sync_error' | 'reminder' | 'system';

export interface RowMeta {
  created_at: string;
  updated_at: string;
  version: number;
}

export interface SoftDelete {
  deleted_at: string | null;
}

export interface Profile extends RowMeta {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  timezone: string;
  locale: string;
}

export interface UserSettingsRow extends RowMeta {
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  settings: Partial<AppSettings>;
}

export interface AppSettings {
  autoSort: boolean;
  autoBlock: boolean;
  notificationsEnabled: boolean;
  overdueNotifications: boolean;
  browserNotifications: boolean;
  defaultReminderMinutes: number;
  dueSoonDays: number;
}

export interface Project extends RowMeta, SoftDelete {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  start_date: string | null;
  deadline: string | null;
  progress_mode: ProgressMode;
  manual_progress: number | null;
  color: string | null;
  is_favorite: boolean;
  sort_order: number;
  archived_at: string | null;
}

export interface ProjectMember extends RowMeta {
  project_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
}

export interface Task extends RowMeta, SoftDelete {
  id: string;
  project_id: string;
  created_by: string | null;
  assignee_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  due_time: string | null;
  progress_mode: ProgressMode;
  manual_progress: number | null;
  estimate_minutes: number | null;
  is_pinned: boolean;
  my_day_date: string | null;
  snoozed_until: string | null;
  sort_order: number;
  completed_at: string | null;
}

export interface Subtask extends RowMeta, SoftDelete {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  sort_order: number;
  completed_at: string | null;
}

export interface TaskDependency extends RowMeta, SoftDelete {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  type: 'blocked_by' | 'related_to';
}

export interface Tag extends RowMeta, SoftDelete {
  id: string;
  owner_id: string;
  name: string;
  color: string | null;
}

export interface TaskTag extends RowMeta, SoftDelete {
  task_id: string;
  tag_id: string;
}

export interface ProjectTag extends RowMeta, SoftDelete {
  project_id: string;
  tag_id: string;
}

export interface Milestone extends RowMeta, SoftDelete {
  id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  is_done: boolean;
  completed_at: string | null;
  sort_order: number;
}

export interface Reminder extends RowMeta, SoftDelete {
  id: string;
  user_id: string;
  task_id: string | null;
  project_id: string | null;
  milestone_id: string | null;
  title: string;
  remind_at: string;
  offset_minutes: number | null;
  status: ReminderStatus;
  snoozed_until: string | null;
  fired_at: string | null;
}

export interface TimeEntry extends RowMeta, SoftDelete {
  id: string;
  user_id: string;
  task_id: string | null;
  project_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds?: number | null;
  note: string;
}

export interface Note extends RowMeta, SoftDelete {
  id: string;
  project_id: string | null;
  task_id: string | null;
  content_md: string;
  created_by: string | null;
}

export interface Attachment extends RowMeta, SoftDelete {
  id: string;
  project_id: string;
  task_id: string | null;
  uploaded_by: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
}

export interface AppNotification extends RowMeta, SoftDelete {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  project_id: string | null;
  task_id: string | null;
  read_at: string | null;
}

export interface SavedView extends RowMeta, SoftDelete {
  id: string;
  user_id: string;
  name: string;
  view_type: 'list' | 'kanban' | 'calendar' | 'timeline';
  filters: TaskFilters;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
}

export interface ActivityLog {
  id: number;
  project_id: string | null;
  task_id: string | null;
  actor_id: string | null;
  entity_type: 'project' | 'task';
  entity_id: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export type SortKey = 'score' | 'priority' | 'due_date' | 'created_at' | 'updated_at' | 'progress' | 'title';

export interface TaskFilters {
  projectIds?: string[];
  statuses?: TaskStatus[];
  priorities?: Priority[];
  tagIds?: string[];
  assigneeIds?: string[];
  due?: 'overdue' | 'today' | 'week' | 'none' | 'any';
  showCompleted?: boolean;
  text?: string;
}
