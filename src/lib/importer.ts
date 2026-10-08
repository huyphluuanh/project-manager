// Nhập dữ liệu có PREVIEW + VALIDATION. Ghi trong 1 transaction -> lỗi giữa chừng thì
// không thay đổi gì (không làm mất dữ liệu hiện có).

import { getDb, TABLES, rowKey, dexieKey, type AnyRow, type TableName } from './db';
import { BACKUP_TABLES, parseCsv, type BackupFile } from './exporter';
import { PRIORITIES, PROJECT_STATUSES, TASK_STATUSES } from './labels';
import { getUserId } from './session';
import { insertRow, updateRow } from './store';
import type { Priority, TaskStatus } from './types';
import { uuid } from './utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const REQUIRED: Partial<Record<TableName, string[]>> = {
  projects: ['id', 'name', 'status', 'priority'],
  tasks: ['id', 'project_id', 'title', 'status', 'priority'],
  subtasks: ['id', 'task_id', 'title'],
  task_dependencies: ['id', 'task_id', 'depends_on_task_id', 'type'],
  tags: ['id', 'name'],
  task_tags: ['task_id', 'tag_id'],
  project_tags: ['project_id', 'tag_id'],
  milestones: ['id', 'project_id', 'title'],
  reminders: ['id', 'remind_at'],
  time_entries: ['id', 'project_id', 'started_at'],
  notes: ['id'],
  attachments: ['id', 'project_id', 'storage_path'],
  saved_views: ['id', 'name'],
};

/** Cột tham chiếu: bảng cha phải tồn tại (trong máy hoặc trong file nhập) */
const REFS: Partial<Record<TableName, [string, TableName][]>> = {
  tasks: [['project_id', 'projects']],
  subtasks: [['task_id', 'tasks']],
  task_dependencies: [['task_id', 'tasks'], ['depends_on_task_id', 'tasks']],
  task_tags: [['task_id', 'tasks'], ['tag_id', 'tags']],
  project_tags: [['project_id', 'projects'], ['tag_id', 'tags']],
  milestones: [['project_id', 'projects']],
  time_entries: [['project_id', 'projects']],
  attachments: [['project_id', 'projects']],
};

const OWNER_COLS = ['owner_id', 'user_id', 'created_by', 'uploaded_by'];

export interface TablePreview {
  table: TableName;
  add: number;
  update: number;
  same: number;
  invalid: number;
}

export interface ImportPlan {
  previews: TablePreview[];
  errors: string[];
  apply: (mode: 'add-only' | 'overwrite') => Promise<number>;
}

function validateRow(table: TableName, row: AnyRow): string | null {
  for (const col of REQUIRED[table] ?? []) {
    if (row[col] === undefined || row[col] === null || row[col] === '') return `thiếu "${col}"`;
  }
  for (const col of TABLES[table].pk) if (!UUID_RE.test(String(row[col]))) return `"${col}" không phải UUID`;
  if (table === 'tasks') {
    if (!TASK_STATUSES.includes(row.status as TaskStatus)) return `status không hợp lệ (${row.status})`;
    if (!PRIORITIES.includes(row.priority as Priority)) return `priority không hợp lệ (${row.priority})`;
    for (const c of ['due_date', 'start_date']) if (row[c] && !DATE_RE.test(String(row[c]))) return `${c} sai định dạng`;
  }
  if (table === 'projects') {
    if (!PROJECT_STATUSES.includes(row.status as never)) return `status không hợp lệ (${row.status})`;
    if (!PRIORITIES.includes(row.priority as Priority)) return `priority không hợp lệ (${row.priority})`;
  }
  return null;
}

export async function planJsonImport(text: string): Promise<ImportPlan> {
  let data: BackupFile;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File không phải JSON hợp lệ.');
  }
  if (data?.app !== 'project-manager' || typeof data.tables !== 'object') {
    throw new Error('File không phải bản backup của Project Manager.');
  }

  const db = getDb();
  const uid = getUserId();
  const errors: string[] = [];
  const valid = new Map<TableName, AnyRow[]>();

  // Khóa đã có trong máy + trong file (để kiểm tra tham chiếu)
  const known = new Map<TableName, Set<string>>();
  for (const t of BACKUP_TABLES) {
    const local = (await db.table(t).toArray()) as AnyRow[];
    const keys = new Set(local.map((r) => rowKey(t, r)));
    for (const r of (data.tables[t] ?? []) as AnyRow[]) if (!validateRow(t, r)) keys.add(rowKey(t, r));
    known.set(t, keys);
  }

  const previews: TablePreview[] = [];
  for (const t of BACKUP_TABLES) {
    const rows = (data.tables[t] ?? []) as AnyRow[];
    if (!Array.isArray(rows)) { errors.push(`${t}: dữ liệu không phải mảng`); continue; }
    const p: TablePreview = { table: t, add: 0, update: 0, same: 0, invalid: 0 };
    const ok: AnyRow[] = [];
    for (const raw of rows) {
      let err = validateRow(t, raw);
      if (!err) {
        for (const [col, parent] of REFS[t] ?? []) {
          if (raw[col] && !known.get(parent)!.has(String(raw[col]))) { err = `tham chiếu ${col} không tồn tại`; break; }
        }
      }
      if (err) {
        p.invalid++;
        if (errors.length < 20) errors.push(`${t} ${String(raw.title ?? raw.name ?? raw.id ?? '')}: ${err}`);
        continue;
      }
      const row: AnyRow = { ...raw };
      for (const c of OWNER_COLS) if (c in row && row[c]) row[c] = uid;
      delete row.duration_seconds;
      const existing = (await db.table(t).get(dexieKey(t, rowKey(t, row)))) as AnyRow | undefined;
      if (!existing) p.add++;
      else if (String(existing.updated_at) >= String(row.updated_at ?? '')) p.same++;
      else p.update++;
      ok.push(row);
    }
    valid.set(t, ok);
    if (rows.length) previews.push(p);
  }

  const apply = async (mode: 'add-only' | 'overwrite') => {
    let written = 0;
    const scope = [...BACKUP_TABLES.map((t) => db.table(t)), db.outbox];
    await db.transaction('rw', scope, async () => {
      for (const t of BACKUP_TABLES) {
        for (const row of valid.get(t) ?? []) {
          const key = rowKey(t, row);
          const existing = (await db.table(t).get(dexieKey(t, key))) as AnyRow | undefined;
          if (!existing) {
            await insertRow(t, row as never);
            written++;
          } else if (mode === 'overwrite' && String(existing.updated_at) < String(row.updated_at ?? '')) {
            const patch: AnyRow = {};
            for (const [k, v] of Object.entries(row)) {
              if (!['created_at', 'updated_at', 'version', ...TABLES[t].pk].includes(k)) patch[k] = v;
            }
            await updateRow(t, key, patch as never);
            written++;
          }
        }
      }
    });
    return written;
  };

  return { previews, errors, apply };
}

// ---------------------------------------------------------------------
// CSV task import
// ---------------------------------------------------------------------

export interface CsvPreviewRow {
  line: number;
  title: string;
  project: string;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  start_date: string | null;
  tags: string[];
  description: string;
  error: string | null;
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');

const HEADER_ALIASES: Record<string, string> = {
  title: 'title', task: 'title', ten: 'title', tencongviec: 'title', congviec: 'title', name: 'title',
  project: 'project', duan: 'project',
  status: 'status', trangthai: 'status',
  priority: 'priority', uutien: 'priority',
  duedate: 'due_date', due: 'due_date', deadline: 'due_date', hanchot: 'due_date', han: 'due_date',
  startdate: 'start_date', start: 'start_date', ngaybatdau: 'start_date',
  tags: 'tags', tag: 'tags',
  description: 'description', mota: 'description', ghichu: 'description',
};

const STATUS_MAP: Record<string, TaskStatus> = {
  todo: 'todo', inprogress: 'in_progress', dangthuchien: 'in_progress', doing: 'in_progress',
  review: 'review', blocked: 'blocked', block: 'blocked', done: 'done', completed: 'done', hoanthanh: 'done', xong: 'done',
};
const PRIORITY_MAP: Record<string, Priority> = {
  critical: 'critical', khancap: 'critical', high: 'high', cao: 'high', medium: 'medium', trungbinh: 'medium', low: 'low', thap: 'low',
};

function parseDate(v: string): string | null | 'invalid' {
  const s = v.trim();
  if (!s) return null;
  if (DATE_RE.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return 'invalid';
}

export function previewCsvTasks(text: string): { rows: CsvPreviewRow[]; missingTitle: boolean } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], missingTitle: false };
  const cols = table[0].map((h) => HEADER_ALIASES[fold(h)] ?? null);
  const idx = (name: string) => cols.indexOf(name);
  if (idx('title') < 0) return { rows: [], missingTitle: true };
  const get = (r: string[], name: string) => (idx(name) >= 0 ? (r[idx(name)] ?? '').trim() : '');

  const rows = table.slice(1).map((r, i): CsvPreviewRow => {
    const errors: string[] = [];
    const title = get(r, 'title');
    if (!title) errors.push('thiếu tên task');
    const statusRaw = get(r, 'status');
    const status = statusRaw ? STATUS_MAP[fold(statusRaw)] : 'todo';
    if (!status) errors.push(`status "${statusRaw}" không hợp lệ`);
    const priorityRaw = get(r, 'priority');
    const priority = priorityRaw ? PRIORITY_MAP[fold(priorityRaw)] : 'medium';
    if (!priority) errors.push(`priority "${priorityRaw}" không hợp lệ`);
    const due = parseDate(get(r, 'due_date'));
    if (due === 'invalid') errors.push('deadline sai định dạng (yyyy-mm-dd hoặc dd/mm/yyyy)');
    const start = parseDate(get(r, 'start_date'));
    if (start === 'invalid') errors.push('ngày bắt đầu sai định dạng');
    return {
      line: i + 2,
      title,
      project: get(r, 'project') || 'Inbox',
      status: status ?? 'todo',
      priority: priority ?? 'medium',
      due_date: due === 'invalid' ? null : due,
      start_date: start === 'invalid' ? null : start,
      tags: get(r, 'tags').split(/[\s,;]+/).map((t) => t.replace(/^#/, '')).filter(Boolean),
      description: get(r, 'description'),
      error: errors.length ? errors.join('; ') : null,
    };
  });
  return { rows, missingTitle: false };
}

export async function applyCsvTasks(rows: CsvPreviewRow[]): Promise<number> {
  const db = getDb();
  const uid = getUserId();
  const good = rows.filter((r) => !r.error);
  const scope = [db.table('projects'), db.table('tasks'), db.table('tags'), db.table('task_tags'), db.outbox];
  await db.transaction('rw', scope, async () => {
    const projects = (await db.t('projects').toArray()).filter((p) => !p.deleted_at);
    const tags = (await db.t('tags').toArray()).filter((t) => !t.deleted_at);
    const projectId = async (name: string) => {
      const found = projects.find((p) => fold(p.name) === fold(name));
      if (found) return found.id;
      const p = await insertRow('projects', {
        id: uuid(), owner_id: uid, name, description: '', status: 'in_progress', priority: 'medium', start_date: null, deadline: null,
        progress_mode: 'auto', manual_progress: null, color: null, is_favorite: false, sort_order: Date.now(), archived_at: null,
        deleted_at: null, created_at: '', updated_at: '', version: 0,
      });
      projects.push(p);
      return p.id;
    };
    const tagId = async (name: string) => {
      const found = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (found) return found.id;
      const t = await insertRow('tags', { id: uuid(), owner_id: uid, name, color: null, deleted_at: null, created_at: '', updated_at: '', version: 0 });
      tags.push(t);
      return t.id;
    };
    for (const r of good) {
      const task = await insertRow('tasks', {
        id: uuid(), project_id: await projectId(r.project), created_by: uid, assignee_id: uid, title: r.title, description: r.description,
        status: r.status, priority: r.priority, start_date: r.start_date, due_date: r.due_date, due_time: null, progress_mode: 'auto',
        manual_progress: null, estimate_minutes: null, is_pinned: false, my_day_date: null, snoozed_until: null, sort_order: Date.now(),
        completed_at: r.status === 'done' ? new Date().toISOString() : null, deleted_at: null, created_at: '', updated_at: '', version: 0,
      });
      for (const name of r.tags) {
        await insertRow('task_tags', { task_id: task.id, tag_id: await tagId(name), deleted_at: null, created_at: '', updated_at: '', version: 0 });
      }
    }
  });
  return good.length;
}
