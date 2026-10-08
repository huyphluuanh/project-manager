import Dexie, { type Table } from 'dexie';
import type {
  AppNotification, Attachment, Milestone, Note, Profile, Project, ProjectMember, ProjectTag,
  Reminder, SavedView, Subtask, Tag, Task, TaskDependency, TaskTag, TimeEntry, UserSettingsRow,
} from './types';

// ---------------------------------------------------------------------
// Bảng được đồng bộ với Supabase
// ---------------------------------------------------------------------

export interface TableDef {
  /** Khóa chính trên server (1 hoặc nhiều cột) */
  pk: string[];
  /** Chỉ mục Dexie (cột đầu tiên = khóa chính) */
  indexes: string;
  /** Bảng có cột deleted_at (tombstone) */
  softDelete: boolean;
  /** Client chỉ đọc, không đẩy thay đổi lên */
  readOnly?: boolean;
  /** Cột server tự tính, không bao giờ gửi lên */
  generated?: string[];
}

export const TABLES = {
  profiles:          { pk: ['id'], indexes: 'id', softDelete: false },
  user_settings:     { pk: ['user_id'], indexes: 'user_id', softDelete: false },
  project_members:   { pk: ['project_id', 'user_id'], indexes: '[project_id+user_id], project_id, user_id', softDelete: false, readOnly: true },
  projects:          { pk: ['id'], indexes: 'id, updated_at', softDelete: true },
  tasks:             { pk: ['id'], indexes: 'id, project_id, status, due_date, my_day_date, updated_at', softDelete: true },
  subtasks:          { pk: ['id'], indexes: 'id, task_id', softDelete: true },
  task_dependencies: { pk: ['id'], indexes: 'id, task_id, depends_on_task_id', softDelete: true },
  tags:              { pk: ['id'], indexes: 'id', softDelete: true },
  task_tags:         { pk: ['task_id', 'tag_id'], indexes: '[task_id+tag_id], task_id, tag_id', softDelete: true },
  project_tags:      { pk: ['project_id', 'tag_id'], indexes: '[project_id+tag_id], project_id, tag_id', softDelete: true },
  milestones:        { pk: ['id'], indexes: 'id, project_id, due_date', softDelete: true },
  reminders:         { pk: ['id'], indexes: 'id, task_id, remind_at, status', softDelete: true },
  time_entries:      { pk: ['id'], indexes: 'id, task_id, project_id, started_at', softDelete: true, generated: ['duration_seconds'] },
  notes:             { pk: ['id'], indexes: 'id, project_id, task_id', softDelete: true },
  attachments:       { pk: ['id'], indexes: 'id, project_id, task_id', softDelete: true },
  notifications:     { pk: ['id'], indexes: 'id, created_at', softDelete: true },
  saved_views:       { pk: ['id'], indexes: 'id', softDelete: true },
} satisfies Record<string, TableDef>;

export type TableName = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

export interface RowTypes {
  profiles: Profile;
  user_settings: UserSettingsRow;
  project_members: ProjectMember;
  projects: Project;
  tasks: Task;
  subtasks: Subtask;
  task_dependencies: TaskDependency;
  tags: Tag;
  task_tags: TaskTag;
  project_tags: ProjectTag;
  milestones: Milestone;
  reminders: Reminder;
  time_entries: TimeEntry;
  notes: Note;
  attachments: Attachment;
  notifications: AppNotification;
  saved_views: SavedView;
}

export type AnyRow = Record<string, unknown>;

/** Khóa dạng chuỗi cho mọi bảng, ví dụ "uuid" hoặc "taskId|tagId" */
export function rowKey(table: TableName, row: AnyRow): string {
  return TABLES[table].pk.map((c) => String(row[c])).join('|');
}

/** Khóa Dexie để get/delete: string hoặc mảng cho khóa ghép */
export function dexieKey(table: TableName, key: string): string | string[] {
  return TABLES[table].pk.length > 1 ? key.split('|') : key;
}

// ---------------------------------------------------------------------
// Bảng chỉ tồn tại ở máy local
// ---------------------------------------------------------------------

export interface OutboxItem {
  seq?: number;
  /** mutation id, cũng là id của sync_events trên server */
  id: string;
  table: TableName;
  key: string;
  op: 'insert' | 'update';
  /** insert: toàn bộ dòng */
  row?: AnyRow;
  /** update: các cột thay đổi */
  patch?: AnyRow;
  /** update: giá trị server của các cột trong patch tại thời điểm sửa */
  base?: AnyRow;
  base_version?: number;
  created_at: string;
  attempts: number;
  inflight?: 0 | 1;
  last_error?: string;
}

export interface ConflictItem {
  id: string;
  kind: 'conflict' | 'rejected';
  table: TableName;
  key: string;
  label: string;
  fields: string[];
  ours: AnyRow;
  theirs: AnyRow;
  message?: string;
  created_at: string;
}

export interface MetaItem {
  key: string;
  value: unknown;
}

export interface LocalBackup {
  id?: number;
  created_at: string;
  size: number;
  data: string;
}

export class AppDB extends Dexie {
  outbox!: Table<OutboxItem, number>;
  conflicts!: Table<ConflictItem, string>;
  meta!: Table<MetaItem, string>;
  backups!: Table<LocalBackup, number>;

  constructor(name: string) {
    super(name);
    const stores: Record<string, string> = {
      outbox: '++seq, [table+key], id',
      conflicts: 'id, table',
      meta: 'key',
      backups: '++id, created_at',
    };
    for (const t of TABLE_NAMES) stores[t] = TABLES[t].indexes;
    this.version(1).stores(stores);
  }

  t<N extends TableName>(name: N): Table<RowTypes[N], string | string[]> {
    return this.table(name);
  }
}

// Mỗi user một database riêng trên máy, tránh lẫn dữ liệu khi đổi tài khoản.
let current: AppDB | null = null;

export function openUserDb(userId: string): AppDB {
  const name = `pm-${userId}`;
  if (current?.name === name) return current;
  current?.close();
  current = new AppDB(name);
  return current;
}

export function getDb(): AppDB {
  if (!current) throw new Error('Local database is not open');
  return current;
}

export function closeUserDb() {
  current?.close();
  current = null;
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const item = await getDb().meta.get(key);
  return (item?.value as T) ?? fallback;
}

export async function setMeta(key: string, value: unknown) {
  await getDb().meta.put({ key, value });
}
