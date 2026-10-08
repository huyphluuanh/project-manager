// Ghi dữ liệu kiểu local-first: ghi vào IndexedDB ngay lập tức (UI phản hồi tức thì,
// chạy được khi offline) và xếp một mục vào outbox để sync engine đẩy lên server sau.

import { dexieKey, getDb, rowKey, type AnyRow, type RowTypes, type TableName } from './db';
import { isEqualValue, nowIso, pick, uuid } from './utils';

type Listener = () => void;
const listeners = new Set<Listener>();

/** Sync engine đăng ký để biết khi nào có thay đổi local cần đẩy lên */
export function onLocalChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitLocalChange() {
  for (const fn of listeners) fn();
}

export async function insertRow<N extends TableName>(table: N, row: RowTypes[N]): Promise<RowTypes[N]> {
  const db = getDb();
  const now = nowIso();
  const full = { ...row, created_at: row.created_at || now, updated_at: now, version: 0 } as RowTypes[N];
  const key = rowKey(table, full as unknown as AnyRow);
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    await db.table(table).put(full);
    await db.outbox.add({
      id: uuid(), table, key, op: 'insert',
      row: full as unknown as AnyRow, created_at: now, attempts: 0,
    });
  });
  emitLocalChange();
  return full;
}

export async function updateRow<N extends TableName>(table: N, key: string, patch: Partial<RowTypes[N]>): Promise<void> {
  const db = getDb();
  const now = nowIso();
  let changedAny = false;
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    const current = (await db.table(table).get(dexieKey(table, key))) as AnyRow | undefined;
    if (!current) throw new Error(`Không tìm thấy dữ liệu (${table})`);

    const changed: AnyRow = {};
    for (const [k, v] of Object.entries(patch)) {
      if (!isEqualValue(current[k], v)) changed[k] = v;
    }
    if (Object.keys(changed).length === 0) return;
    changedAny = true;

    await db.table(table).put({ ...current, ...changed, updated_at: now });

    const pending = await db.outbox.where('[table+key]').equals([table, key]).sortBy('seq');
    const last = pending[pending.length - 1];
    if (last && !last.inflight) {
      // Gộp vào mục đang chờ (chưa gửi) để giảm số request
      if (last.op === 'insert') {
        last.row = { ...last.row, ...changed };
      } else {
        const base = { ...last.base };
        for (const k of Object.keys(changed)) if (!(k in base)) base[k] = current[k];
        last.patch = { ...last.patch, ...changed };
        last.base = base;
      }
      await db.outbox.put(last);
    } else {
      await db.outbox.add({
        id: uuid(), table, key, op: 'update',
        patch: changed,
        base: pick(current, Object.keys(changed)),
        base_version: Number(current.version ?? 0),
        created_at: now, attempts: 0,
      });
    }
  });
  if (changedAny) emitLocalChange();
}

export function softDelete(table: TableName, key: string): Promise<void> {
  return updateRow(table, key, { deleted_at: nowIso() } as never);
}

export function restoreDeleted(table: TableName, key: string): Promise<void> {
  return updateRow(table, key, { deleted_at: null } as never);
}

/** Áp các thay đổi đang chờ lên một dòng mới nhận từ server */
export function applyPending(serverRow: AnyRow, pending: { op: string; row?: AnyRow; patch?: AnyRow }[]): AnyRow {
  let row = { ...serverRow };
  for (const p of pending) {
    if (p.op === 'insert' && p.row) row = { ...p.row, ...row };
    if (p.op === 'update' && p.patch) row = { ...row, ...p.patch };
  }
  return row;
}
