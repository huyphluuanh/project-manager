// Xuất / nhập dữ liệu: JSON (backup đầy đủ), CSV, Excel.

import { getDb, TABLE_NAMES, type AnyRow, type TableName } from './db';
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL, TASK_STATUS_LABEL } from './labels';
import type { Project, Task } from './types';
import { downloadBlob, formatDateTimeVi, toDateKey, todayKey } from './utils';

// ---------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

/** CSV có BOM để Excel đọc đúng tiếng Việt */
export function downloadCsv(rows: (string | number | null | undefined)[][], fileName: string) {
  downloadBlob(new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }), fileName);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------------
// Bảng task / project dạng phẳng
// ---------------------------------------------------------------------

export const TASK_HEADERS = ['title', 'project', 'status', 'priority', 'start_date', 'due_date', 'progress', 'tags', 'description', 'created_at', 'completed_at'];

export function taskRows(tasks: Task[], ctx: { projectName: (id: string) => string; tagNames: (id: string) => string[]; progress: (t: Task) => number }) {
  return tasks.map((t) => [
    t.title,
    ctx.projectName(t.project_id),
    t.status,
    t.priority,
    t.start_date ?? '',
    t.due_date ?? '',
    ctx.progress(t),
    ctx.tagNames(t.id).join(' '),
    t.description,
    t.created_at,
    t.completed_at ?? '',
  ]);
}

export async function downloadExcel(sheets: { name: string; header: string[]; rows: (string | number | null)[][] }[], fileName: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const blob = await writeXlsxFile(
    sheets.map((s) => ({
      sheet: s.name,
      data: [
        s.header.map((h) => ({ value: h, fontWeight: 'bold' as const })),
        ...s.rows.map((r) => r.map((v) => (v === null || v === '' ? null : { value: v }))),
      ],
    })),
  ).toBlob();
  downloadBlob(blob, fileName);
}

export function readableTaskRow(t: Task, projectName: string, progress: number, tags: string[]) {
  return [
    t.title, projectName, TASK_STATUS_LABEL[t.status], PRIORITY_LABEL[t.priority], t.start_date ?? '', t.due_date ?? '',
    progress, tags.join(', '), formatDateTimeVi(t.completed_at),
  ];
}

export function readableProjectRow(p: Project, progress: number, total: number, done: number) {
  return [p.name, PROJECT_STATUS_LABEL[p.status], PRIORITY_LABEL[p.priority], p.start_date ?? '', p.deadline ?? '', progress, total, done];
}

// ---------------------------------------------------------------------
// Backup JSON (toàn bộ dữ liệu của tài khoản)
// ---------------------------------------------------------------------

export interface BackupFile {
  app: 'project-manager';
  format: 1;
  exported_at: string;
  tables: Partial<Record<TableName, AnyRow[]>>;
}

/** Bảng đưa vào backup (bỏ bảng chỉ đọc / gắn với tài khoản) */
export const BACKUP_TABLES: TableName[] = TABLE_NAMES.filter((t) => !['profiles', 'project_members', 'user_settings', 'notifications'].includes(t));

export async function buildBackup(): Promise<BackupFile> {
  const db = getDb();
  const tables: BackupFile['tables'] = {};
  for (const t of BACKUP_TABLES) tables[t] = (await db.table(t).toArray()) as AnyRow[];
  return { app: 'project-manager', format: 1, exported_at: new Date().toISOString(), tables };
}

export async function downloadBackup() {
  const data = await buildBackup();
  downloadBlob(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `project-manager-backup-${todayKey()}.json`);
}

let backupRunning: Promise<boolean> | null = null;

/** Bản sao lưu tự động lưu ngay trong máy (IndexedDB), mỗi ngày 1 bản, giữ 7 bản gần nhất */
export function autoBackupIfDue(): Promise<boolean> {
  backupRunning ??= (async () => {
    const db = getDb();
    const last = await db.backups.orderBy('created_at').last();
    if (last && toLocalDay(last.created_at) === todayKey()) return false;
    if ((await db.t('projects').count()) === 0) return false;
    const data = JSON.stringify(await buildBackup());
    await db.backups.add({ created_at: new Date().toISOString(), size: data.length, data });
    const all = await db.backups.orderBy('created_at').toArray();
    if (all.length > 7) await db.backups.bulkDelete(all.slice(0, all.length - 7).map((b) => b.id!));
    return true;
  })().finally(() => { backupRunning = null; });
  return backupRunning;
}

const toLocalDay = (iso: string) => toDateKey(new Date(iso));
