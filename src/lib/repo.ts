// Các thao tác nghiệp vụ. Mọi ghi đều đi qua store (local-first + outbox).

import { getDb } from './db';
import { DEFAULT_SETTINGS, getUserId } from './session';
import { insertRow, restoreDeleted, softDelete, updateRow } from './store';
import { supabase } from './supabase';
import type {
  AppNotification, AppSettings, Attachment, Milestone, NotificationType, Priority, Project, Reminder,
  SavedView, Subtask, Tag, Task, TaskDependency, TimeEntry,
} from './types';
import { deterministicUuid, nowIso, todayKey, uuid } from './utils';

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------

export async function getSettings(): Promise<AppSettings> {
  const row = await getDb().t('user_settings').get(getUserId());
  return { ...DEFAULT_SETTINGS, ...(row?.settings ?? {}) };
}

export async function updateSettings(patch: Partial<AppSettings>, theme?: 'light' | 'dark' | 'system') {
  const uid = getUserId();
  const row = await getDb().t('user_settings').get(uid);
  const next = { settings: { ...(row?.settings ?? {}), ...patch }, ...(theme ? { theme } : {}) };
  if (row) await updateRow('user_settings', uid, next);
  else await insertRow('user_settings', { user_id: uid, theme: theme ?? 'system', settings: next.settings, created_at: '', updated_at: '', version: 0 });
}

// ---------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------

export async function createProject(input: Partial<Project> & { name: string }): Promise<Project> {
  const count = await getDb().t('projects').count();
  return insertRow('projects', {
    id: uuid(),
    owner_id: getUserId(),
    description: '',
    status: 'planning',
    priority: 'medium',
    start_date: null,
    deadline: null,
    progress_mode: 'auto',
    manual_progress: null,
    color: null,
    is_favorite: false,
    sort_order: count,
    archived_at: null,
    deleted_at: null,
    created_at: '',
    updated_at: '',
    version: 0,
    ...input,
    name: input.name.trim(),
  });
}

export const updateProject = (id: string, patch: Partial<Project>) => updateRow('projects', id, patch);
export const archiveProject = (id: string) => updateRow('projects', id, { archived_at: nowIso() });
export const unarchiveProject = (id: string) => updateRow('projects', id, { archived_at: null });
export const deleteProject = (id: string) => softDelete('projects', id);
export const restoreProject = (id: string) => restoreDeleted('projects', id);

// ---------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------

export interface NewTaskInput extends Partial<Task> {
  title: string;
  project_id: string;
  tagNames?: string[];
}

export async function createTask({ tagNames, ...input }: NewTaskInput): Promise<Task> {
  const task = await insertRow('tasks', {
    id: uuid(),
    created_by: getUserId(),
    assignee_id: getUserId(),
    description: '',
    status: 'todo',
    priority: 'medium',
    start_date: null,
    due_date: null,
    due_time: null,
    progress_mode: 'auto',
    manual_progress: null,
    estimate_minutes: null,
    is_pinned: false,
    my_day_date: null,
    snoozed_until: null,
    sort_order: Date.now(),
    completed_at: input.status === 'done' ? nowIso() : null,
    deleted_at: null,
    created_at: '',
    updated_at: '',
    version: 0,
    ...input,
    title: input.title.trim(),
  });
  if (tagNames?.length) {
    const ids = await Promise.all(tagNames.map(ensureTag));
    await setTaskTags(task.id, ids);
  }
  return task;
}

export async function updateTask(id: string, patch: Partial<Task>) {
  const db = getDb();
  const before = await db.t('tasks').get(id);
  if (!before) return;
  const p = { ...patch };
  if (p.status && p.status !== before.status) {
    p.completed_at = p.status === 'done' ? nowIso() : null;
  }
  await updateRow('tasks', id, p);
  if (p.status && p.status !== before.status) await afterStatusChange(id, p.status);
}

/** Khi task xong -> mở khóa các task đang chờ nó (nếu bật autoBlock) */
async function afterStatusChange(taskId: string, status: Task['status']) {
  const settings = await getSettings();
  if (!settings.autoBlock) return;
  const db = getDb();
  const dependents = (await db.t('task_dependencies').where('depends_on_task_id').equals(taskId).toArray())
    .filter((d) => !d.deleted_at && d.type === 'blocked_by');
  for (const dep of dependents) {
    const t = await db.t('tasks').get(dep.task_id);
    if (!t || t.deleted_at || t.status === 'done') continue;
    if (status === 'done' && t.status === 'blocked') {
      if (!(await hasOpenBlockers(t.id))) await updateRow('tasks', t.id, { status: 'todo' });
    } else if (status !== 'done' && t.status === 'todo') {
      await updateRow('tasks', t.id, { status: 'blocked' });
    }
  }
}

export async function hasOpenBlockers(taskId: string): Promise<boolean> {
  const db = getDb();
  const deps = (await db.t('task_dependencies').where('task_id').equals(taskId).toArray())
    .filter((d) => !d.deleted_at && d.type === 'blocked_by');
  for (const d of deps) {
    const blocker = await db.t('tasks').get(d.depends_on_task_id);
    if (blocker && !blocker.deleted_at && blocker.status !== 'done') return true;
  }
  return false;
}

export const completeTask = (id: string) => updateTask(id, { status: 'done' });
export const reopenTask = (id: string) => updateTask(id, { status: 'todo' });
export const deleteTask = (id: string) => softDelete('tasks', id);
export const restoreTask = (id: string) => restoreDeleted('tasks', id);
export const setPriority = (id: string, priority: Priority) => updateTask(id, { priority });
export const togglePin = (t: Task) => updateTask(t.id, { is_pinned: !t.is_pinned });
export const setMyDay = (id: string, on: boolean) => updateTask(id, { my_day_date: on ? todayKey() : null });
export const snoozeTask = (id: string, untilIso: string | null) => updateTask(id, { snoozed_until: untilIso });

// ---------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------

export async function addSubtask(taskId: string, title: string): Promise<Subtask> {
  return insertRow('subtasks', {
    id: uuid(), task_id: taskId, title: title.trim(), is_done: false, sort_order: Date.now(),
    completed_at: null, deleted_at: null, created_at: '', updated_at: '', version: 0,
  });
}

export const toggleSubtask = (s: Subtask) =>
  updateRow('subtasks', s.id, { is_done: !s.is_done, completed_at: s.is_done ? null : nowIso() });
export const renameSubtask = (id: string, title: string) => updateRow('subtasks', id, { title });
export const deleteSubtask = (id: string) => softDelete('subtasks', id);

// ---------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------

export async function wouldCreateCycle(taskId: string, dependsOnId: string): Promise<boolean> {
  const deps = (await getDb().t('task_dependencies').toArray()).filter((d) => !d.deleted_at && d.type === 'blocked_by');
  const seen = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const d of deps) if (d.task_id === cur) stack.push(d.depends_on_task_id);
  }
  return false;
}

export async function addDependency(taskId: string, dependsOnId: string, type: TaskDependency['type'] = 'blocked_by') {
  if (taskId === dependsOnId) throw new Error('Task không thể phụ thuộc chính nó.');
  if (type === 'blocked_by' && (await wouldCreateCycle(taskId, dependsOnId))) {
    throw new Error('Không thể thêm: sẽ tạo vòng phụ thuộc.');
  }
  const db = getDb();
  const existing = (await db.t('task_dependencies').where('task_id').equals(taskId).toArray())
    .find((d) => d.depends_on_task_id === dependsOnId && d.type === type);
  if (existing && !existing.deleted_at) return;
  if (existing) await restoreDeleted('task_dependencies', existing.id);
  else {
    await insertRow('task_dependencies', {
      id: uuid(), task_id: taskId, depends_on_task_id: dependsOnId, type,
      deleted_at: null, created_at: '', updated_at: '', version: 0,
    });
  }
  if (type === 'blocked_by') {
    const settings = await getSettings();
    const [task, blocker] = await Promise.all([db.t('tasks').get(taskId), db.t('tasks').get(dependsOnId)]);
    if (settings.autoBlock && task?.status === 'todo' && blocker && blocker.status !== 'done') {
      await updateRow('tasks', taskId, { status: 'blocked' });
    }
  }
}

export async function removeDependency(dep: TaskDependency) {
  await softDelete('task_dependencies', dep.id);
  const settings = await getSettings();
  const task = await getDb().t('tasks').get(dep.task_id);
  if (settings.autoBlock && task?.status === 'blocked' && !(await hasOpenBlockers(task.id))) {
    await updateRow('tasks', task.id, { status: 'todo' });
  }
}

// ---------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------

export async function ensureTag(name: string): Promise<string> {
  const clean = name.trim().replace(/^#/, '');
  const db = getDb();
  const all = await db.t('tags').toArray();
  const found = all.find((t) => t.name.toLowerCase() === clean.toLowerCase());
  if (found) {
    if (found.deleted_at) await restoreDeleted('tags', found.id);
    return found.id;
  }
  const tag = await insertRow('tags', {
    id: uuid(), owner_id: getUserId(), name: clean, color: null,
    deleted_at: null, created_at: '', updated_at: '', version: 0,
  });
  return tag.id;
}

export async function setTaskTags(taskId: string, tagIds: string[]) {
  const db = getDb();
  const rows = await db.t('task_tags').where('task_id').equals(taskId).toArray();
  for (const r of rows) {
    const want = tagIds.includes(r.tag_id);
    if (want && r.deleted_at) await restoreDeleted('task_tags', `${taskId}|${r.tag_id}`);
    if (!want && !r.deleted_at) await softDelete('task_tags', `${taskId}|${r.tag_id}`);
  }
  for (const id of tagIds) {
    if (!rows.some((r) => r.tag_id === id)) {
      await insertRow('task_tags', { task_id: taskId, tag_id: id, deleted_at: null, created_at: '', updated_at: '', version: 0 });
    }
  }
}

export const updateTag = (id: string, patch: Partial<Tag>) => updateRow('tags', id, patch);
export const deleteTag = (id: string) => softDelete('tags', id);

// ---------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------

export function createMilestone(projectId: string, title: string, due_date: string | null): Promise<Milestone> {
  return insertRow('milestones', {
    id: uuid(), project_id: projectId, title: title.trim(), due_date, is_done: false, completed_at: null,
    sort_order: Date.now(), deleted_at: null, created_at: '', updated_at: '', version: 0,
  });
}

export const updateMilestone = (id: string, patch: Partial<Milestone>) => updateRow('milestones', id, patch);
export const toggleMilestone = (m: Milestone) =>
  updateRow('milestones', m.id, { is_done: !m.is_done, completed_at: m.is_done ? null : nowIso() });
export const deleteMilestone = (id: string) => softDelete('milestones', id);

// ---------------------------------------------------------------------
// Notes (1 ghi chú cho mỗi task / project)
// ---------------------------------------------------------------------

export async function saveNote(entity: { project_id?: string; task_id?: string }, content: string) {
  const db = getDb();
  const existing = entity.task_id
    ? await db.t('notes').where('task_id').equals(entity.task_id).first()
    : await db.t('notes').where('project_id').equals(entity.project_id!).first();
  if (existing) {
    await updateRow('notes', existing.id, { content_md: content, deleted_at: null });
  } else if (content.trim()) {
    await insertRow('notes', {
      id: uuid(), project_id: entity.project_id ?? null, task_id: entity.task_id ?? null, content_md: content,
      created_by: getUserId(), deleted_at: null, created_at: '', updated_at: '', version: 0,
    });
  }
}

// ---------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------

export function createReminder(input: Partial<Reminder> & { remind_at: string }): Promise<Reminder> {
  return insertRow('reminders', {
    id: uuid(), user_id: getUserId(), task_id: null, project_id: null, milestone_id: null, title: '',
    offset_minutes: null, status: 'pending', snoozed_until: null, fired_at: null,
    deleted_at: null, created_at: '', updated_at: '', version: 0,
    ...input,
  });
}

export const snoozeReminder = (id: string, minutes: number) =>
  updateRow('reminders', id, { status: 'snoozed', snoozed_until: new Date(Date.now() + minutes * 60000).toISOString() });
export const dismissReminder = (id: string) => updateRow('reminders', id, { status: 'dismissed' });
export const deleteReminder = (id: string) => softDelete('reminders', id);

export async function reminderMarkDone(r: Reminder) {
  await updateRow('reminders', r.id, { status: 'done' });
  if (r.task_id) await completeTask(r.task_id);
}

/** Thời điểm nhắc = hạn (ngày + giờ, mặc định 09:00) trừ đi offset phút */
export function reminderTimeFor(task: Pick<Task, 'due_date' | 'due_time'>, offsetMinutes: number): string | null {
  if (!task.due_date) return null;
  const [h, m] = (task.due_time ?? '09:00').split(':').map(Number);
  const d = new Date(`${task.due_date}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return new Date(d.getTime() - offsetMinutes * 60000).toISOString();
}

// ---------------------------------------------------------------------
// Time tracking
// ---------------------------------------------------------------------

export async function getRunningEntry(): Promise<TimeEntry | undefined> {
  const uid = getUserId();
  return (await getDb().t('time_entries').toArray()).find((e) => !e.deleted_at && !e.ended_at && e.user_id === uid);
}

export async function startTimer(task: Task) {
  const running = await getRunningEntry();
  if (running?.task_id === task.id) return;
  if (running) await updateRow('time_entries', running.id, { ended_at: nowIso() });
  await insertRow('time_entries', {
    id: uuid(), user_id: getUserId(), task_id: task.id, project_id: task.project_id,
    started_at: nowIso(), ended_at: null, note: '', deleted_at: null, created_at: '', updated_at: '', version: 0,
  });
  if (task.status === 'todo') await updateTask(task.id, { status: 'in_progress' });
}

/** Pause và Stop đều kết thúc đoạn đang chạy; Resume = start lại (tạo đoạn mới) */
export async function stopTimer() {
  const running = await getRunningEntry();
  if (running) await updateRow('time_entries', running.id, { ended_at: nowIso() });
}

export const deleteTimeEntry = (id: string) => softDelete('time_entries', id);

export function addTimeEntry(task: Task, startedAt: string, endedAt: string, note = ''): Promise<TimeEntry> {
  if (endedAt < startedAt) throw new Error('Thời gian kết thúc phải sau thời gian bắt đầu.');
  return insertRow('time_entries', {
    id: uuid(), user_id: getUserId(), task_id: task.id, project_id: task.project_id,
    started_at: startedAt, ended_at: endedAt, note, deleted_at: null, created_at: '', updated_at: '', version: 0,
  });
}

export function entrySeconds(e: TimeEntry, now = Date.now()): number {
  const end = e.ended_at ? new Date(e.ended_at).getTime() : now;
  return Math.max(0, Math.floor((end - new Date(e.started_at).getTime()) / 1000));
}

// ---------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------

/** Tạo thông báo với id cố định theo dedupeKey -> không trùng giữa các thiết bị */
export async function pushNotification(
  type: NotificationType, title: string, body: string,
  refs: { task_id?: string | null; project_id?: string | null } = {},
  dedupeKey?: string,
): Promise<AppNotification | null> {
  const id = dedupeKey ? await deterministicUuid(`${getUserId()}:${dedupeKey}`) : uuid();
  if (await getDb().t('notifications').get(id)) return null;
  return insertRow('notifications', {
    id, user_id: getUserId(), type, title, body, project_id: refs.project_id ?? null, task_id: refs.task_id ?? null,
    read_at: null, deleted_at: null, created_at: '', updated_at: '', version: 0,
  });
}

export const markNotificationRead = (id: string) => updateRow('notifications', id, { read_at: nowIso() });
export const deleteNotification = (id: string) => softDelete('notifications', id);

export async function markAllNotificationsRead() {
  const unread = (await getDb().t('notifications').toArray()).filter((n) => !n.read_at && !n.deleted_at);
  for (const n of unread) await markNotificationRead(n.id);
}

// ---------------------------------------------------------------------
// Attachments (cần online)
// ---------------------------------------------------------------------

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const ALLOWED_MIME = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/csv', 'text/markdown',
  'application/zip', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

export async function uploadAttachment(file: File, projectId: string, taskId: string | null): Promise<Attachment> {
  if (!navigator.onLine) throw new Error('Cần kết nối Internet để tải file lên.');
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('File vượt quá 20 MB.');
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.includes(mime)) throw new Error(`Không hỗ trợ loại file này (${mime || 'không rõ'}).`);
  const id = uuid();
  const safeName = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-100);
  const path = `${projectId}/${id}-${safeName}`;
  const { error } = await supabase.storage.from('attachments').upload(path, file, { contentType: mime, upsert: false });
  if (error) throw new Error(`Tải file lên thất bại: ${error.message}`);
  return insertRow('attachments', {
    id, project_id: projectId, task_id: taskId, uploaded_by: getUserId(), file_name: file.name, mime_type: mime,
    size_bytes: file.size, storage_path: path, deleted_at: null, created_at: '', updated_at: '', version: 0,
  });
}

export async function attachmentUrl(a: Attachment): Promise<string> {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(a.storage_path, 300, { download: a.file_name });
  if (error || !data) throw new Error('Không lấy được link tải file.');
  return data.signedUrl;
}

export async function deleteAttachment(a: Attachment) {
  await softDelete('attachments', a.id);
  if (navigator.onLine) await supabase.storage.from('attachments').remove([a.storage_path]);
}

// ---------------------------------------------------------------------
// Saved views
// ---------------------------------------------------------------------

export function createSavedView(v: Pick<SavedView, 'name' | 'view_type' | 'filters' | 'sort'>): Promise<SavedView> {
  return insertRow('saved_views', {
    id: uuid(), user_id: getUserId(), ...v, deleted_at: null, created_at: '', updated_at: '', version: 0,
  });
}

export const deleteSavedView = (id: string) => softDelete('saved_views', id);
