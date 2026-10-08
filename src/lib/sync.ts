// Sync engine
//
// PUSH: lần lượt gửi từng mục trong outbox (đúng thứ tự).
//   - insert: insert; nếu trùng khóa (đã gửi thành công trước khi mất mạng) -> coi như xong.
//   - update: "update ... where version = base_version". 0 dòng -> lấy bản server:
//       * cột mình sửa mà server KHÔNG đổi  -> gửi lại với version mới (tự gộp)
//       * cột cả 2 bên cùng đổi khác nhau   -> CONFLICT: giữ bản server, lưu bản của mình
//         vào bảng conflicts để người dùng chọn. Không bao giờ ghi đè âm thầm.
// PULL: lấy các dòng có updated_at >= cursor - 5s (chồng lấn để không sót), gộp với
//       các thay đổi local đang chờ.
// REALTIME: nghe postgres_changes -> pull bảng tương ứng.

import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  dexieKey, getDb, getMeta, rowKey, setMeta, TABLE_NAMES, TABLES,
  type AnyRow, type ConflictItem, type OutboxItem, type TableName,
} from './db';
import { applyPending, onLocalChange } from './store';
import { supabase } from './supabase';
import { isEqualValue, nowIso, pick, uuid } from './utils';

// ---------------------------------------------------------------------
// Trạng thái để hiển thị trên UI
// ---------------------------------------------------------------------

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  pending: number;
  lastSyncedAt: string | null;
  error: string | null;
  initialLoaded: boolean;
}

let state: SyncState = { status: 'syncing', pending: 0, lastSyncedAt: null, error: null, initialLoaded: false };
const stateListeners = new Set<() => void>();

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSyncState(fn: () => void): () => void {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const fn of stateListeners) fn();
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

const PAGE = 1000;
const OVERLAP_MS = 5000;

interface PgError { code?: string; message: string; status?: number }

type PushResult =
  | { kind: 'ok'; row: AnyRow; conflict?: ConflictItem }
  | { kind: 'transient'; error: string }
  | { kind: 'rejected'; error: string };

function toServer(table: TableName, row: AnyRow): AnyRow {
  const def = TABLES[table] as { generated?: string[] };
  const out: AnyRow = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('_') || k === 'version' || k === 'updated_at') continue;
    if (def.generated?.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

function isTransient(err: PgError): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const code = err.code ?? '';
  if (!code) return true; // lỗi fetch / mạng
  if (code.startsWith('PGRST3')) return true; // JWT hết hạn
  if (code.startsWith('08') || code.startsWith('53') || code === '57014') return true;
  return false;
}

interface Filterable { eq(col: string, v: unknown): Filterable }

function filterByKey<Q>(q: Q, table: TableName, key: string): Q {
  const parts = key.split('|');
  let f = q as unknown as Filterable;
  TABLES[table].pk.forEach((col, i) => { f = f.eq(col, parts[i]); });
  return f as unknown as Q;
}

async function fetchServerRow(table: TableName, key: string): Promise<{ row: AnyRow | null; error?: PgError }> {
  const { data, error } = await filterByKey(supabase.from(table).select('*'), table, key).maybeSingle();
  if (error) return { row: null, error };
  return { row: data as AnyRow | null };
}

function describe(table: TableName, row: AnyRow | undefined): string {
  const name = (row?.title ?? row?.name ?? row?.file_name ?? '') as string;
  const labels: Partial<Record<TableName, string>> = {
    tasks: 'Task', projects: 'Dự án', subtasks: 'Subtask', milestones: 'Milestone', notes: 'Ghi chú', reminders: 'Nhắc việc',
  };
  return `${labels[table] ?? table}${name ? `: ${name}` : ''}`;
}

// ---------------------------------------------------------------------
// PUSH
// ---------------------------------------------------------------------

async function pushInsert(item: OutboxItem): Promise<PushResult> {
  const { data, error } = await supabase.from(item.table).insert(toServer(item.table, item.row!)).select().single();
  if (!error) return { kind: 'ok', row: data as AnyRow };
  if (error.code === '23505') {
    const existing = await fetchServerRow(item.table, item.key);
    if (existing.row) return { kind: 'ok', row: existing.row };
  }
  return isTransient(error) ? { kind: 'transient', error: error.message } : { kind: 'rejected', error: error.message };
}

async function pushUpdate(item: OutboxItem): Promise<PushResult> {
  let patch = { ...item.patch! };
  let base = { ...item.base };
  let baseVersion = item.base_version ?? 0;
  let conflict: ConflictItem | undefined;

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await filterByKey(
      supabase.from(item.table).update(toServer(item.table, patch)),
      item.table, item.key,
    ).eq('version', baseVersion).select();

    if (error) {
      return isTransient(error) ? { kind: 'transient', error: error.message } : { kind: 'rejected', error: error.message };
    }
    if (data && data.length === 1) return { kind: 'ok', row: data[0] as AnyRow, conflict };

    // version không khớp -> có người khác đã sửa
    const server = await fetchServerRow(item.table, item.key);
    if (server.error) {
      return isTransient(server.error) ? { kind: 'transient', error: server.error.message } : { kind: 'rejected', error: server.error.message };
    }
    const S = server.row;
    if (!S) return { kind: 'rejected', error: 'Dữ liệu không còn tồn tại hoặc bạn không còn quyền sửa.' };

    const conflictFields = Object.keys(patch).filter(
      (f) => !isEqualValue(S[f], base[f]) && !isEqualValue(S[f], patch[f]),
    );

    if (conflictFields.length > 0) {
      conflict = {
        id: item.id,
        kind: 'conflict',
        table: item.table,
        key: item.key,
        label: describe(item.table, S),
        fields: conflictFields,
        ours: pick(patch, conflictFields),
        theirs: pick(S, conflictFields),
        created_at: nowIso(),
      };
      const rest: AnyRow = {};
      for (const [f, v] of Object.entries(patch)) {
        if (!conflictFields.includes(f) && !isEqualValue(S[f], v)) rest[f] = v;
      }
      if (Object.keys(rest).length === 0) return { kind: 'ok', row: S, conflict };
      patch = rest;
    }
    // Không đụng nhau -> gửi lại trên version mới nhất
    base = pick(S, Object.keys(patch));
    baseVersion = Number(S.version);
  }
  return { kind: 'transient', error: 'Dữ liệu thay đổi liên tục, sẽ thử lại.' };
}

async function logSyncEvent(item: OutboxItem, status: 'conflict' | 'rejected', error?: string) {
  try {
    const deviceId = await getMeta<string>('device_id', 'unknown');
    await supabase.from('sync_events').insert({
      id: item.id,
      device_id: deviceId,
      entity_type: item.table,
      entity_id: item.key.split('|')[0],
      op: item.op,
      payload: item.op === 'insert' ? item.row : item.patch,
      base_version: item.base_version ?? null,
      status,
      error: error ?? null,
    });
  } catch {
    /* chỉ là log, bỏ qua lỗi */
  }
}

async function onPushOk(item: OutboxItem, row: AnyRow, conflict?: ConflictItem) {
  const db = getDb();
  const touched = item.op === 'insert' ? Object.keys(item.row ?? {}) : Object.keys(item.patch ?? {});
  await db.transaction('rw', db.table(item.table), db.outbox, db.conflicts, async () => {
    await db.outbox.delete(item.seq!);
    const rest = await db.outbox.where('[table+key]').equals([item.table, item.key]).sortBy('seq');
    // Các thay đổi sau được tạo trên nền thay đổi vừa gửi -> rebase lên version mới
    for (const r of rest) {
      if (r.op !== 'update') continue;
      r.base_version = Number(row.version);
      for (const f of touched) if (r.base && f in r.base) r.base[f] = row[f];
      await db.outbox.put(r);
    }
    await db.table(item.table).put(applyPending(row, rest));
    if (conflict) await db.conflicts.put(conflict);
  });
  if (conflict) void logSyncEvent(item, 'conflict');
}

async function onPushRejected(item: OutboxItem, error: string) {
  const db = getDb();
  const server = await fetchServerRow(item.table, item.key).catch(() => ({ row: null }));
  await db.transaction('rw', db.table(item.table), db.outbox, db.conflicts, async () => {
    const local = (await db.table(item.table).get(dexieKey(item.table, item.key))) as AnyRow | undefined;
    // Bỏ mục lỗi và các thay đổi phía sau của cùng dòng (chúng dựa trên mục lỗi)
    const all = await db.outbox.where('[table+key]').equals([item.table, item.key]).toArray();
    await db.outbox.bulkDelete(all.map((x) => x.seq!));
    if (server.row) await db.table(item.table).put(server.row);
    else await db.table(item.table).delete(dexieKey(item.table, item.key));
    await db.conflicts.put({
      id: item.id,
      kind: 'rejected',
      table: item.table,
      key: item.key,
      label: describe(item.table, local),
      fields: Object.keys(item.patch ?? item.row ?? {}),
      ours: item.patch ?? item.row ?? {},
      theirs: server.row ?? {},
      message: error,
      created_at: nowIso(),
    });
  });
  void logSyncEvent(item, 'rejected', error);
}

/** true = đẩy hết; false = dừng vì lỗi mạng tạm thời */
async function pushAll(): Promise<boolean> {
  const db = getDb();
  for (;;) {
    const item = await db.transaction('rw', db.outbox, async () => {
      const first = await db.outbox.orderBy('seq').first();
      if (first) {
        first.inflight = 1;
        await db.outbox.put(first);
      }
      return first;
    });
    if (!item) return true;

    let result: PushResult;
    try {
      result = item.op === 'insert' ? await pushInsert(item) : await pushUpdate(item);
    } catch (e) {
      result = { kind: 'transient', error: e instanceof Error ? e.message : String(e) };
    }

    if (result.kind === 'ok') {
      await onPushOk(item, result.row, result.conflict);
    } else if (result.kind === 'rejected') {
      await onPushRejected(item, result.error);
    } else {
      await db.outbox.update(item.seq!, { inflight: 0, attempts: item.attempts + 1, last_error: result.error });
      setState({ error: result.error });
      return false;
    }
  }
}

// ---------------------------------------------------------------------
// PULL
// ---------------------------------------------------------------------

export async function mergeServerRows(table: TableName, rows: AnyRow[]) {
  if (rows.length === 0) return;
  const db = getDb();
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    for (const row of rows) {
      const key = rowKey(table, row);
      const pending = await db.outbox.where('[table+key]').equals([table, key]).sortBy('seq');
      await db.table(table).put(pending.length ? applyPending(row, pending) : row);
    }
  });
}

async function pullTable(table: TableName) {
  const cursorKey = `cursor:${table}`;
  const cursor = await getMeta<string | null>(cursorKey, null);
  const since = cursor ? new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString() : null;
  let maxSeen = cursor;

  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select('*').order('updated_at', { ascending: true });
    for (const col of TABLES[table].pk) q = q.order(col, { ascending: true });
    if (since) q = q.gte('updated_at', since);
    else if (TABLES[table].softDelete) q = q.is('deleted_at', null);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as AnyRow[];
    await mergeServerRows(table, rows);
    for (const r of rows) {
      const u = r.updated_at as string;
      if (!maxSeen || u > maxSeen) maxSeen = u;
    }
    if (rows.length < PAGE) break;
  }
  if (maxSeen && maxSeen !== cursor) await setMeta(cursorKey, maxSeen);
}

// ---------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------

let running = false;
let rerun = false;
let dirtyTables = new Set<TableName>(TABLE_NAMES);
let timer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let channel: RealtimeChannel | null = null;
let cleanup: (() => void)[] = [];
let retryDelay = 2000;

async function refreshPending() {
  const pending = await getDb().outbox.count();
  setState({ pending });
}

async function runSync() {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    do {
      rerun = false;
      if (!navigator.onLine) {
        await refreshPending();
        setState({ status: 'offline' });
        return;
      }
      setState({ status: 'syncing' });
      const pushed = await pushAll();
      const tables = [...dirtyTables];
      dirtyTables = new Set();
      try {
        for (const t of tables) await pullTable(t);
      } catch (e) {
        for (const t of tables) dirtyTables.add(t);
        throw e;
      }
      await refreshPending();
      if (!pushed) {
        scheduleRetry();
        setState({ status: navigator.onLine ? 'error' : 'offline' });
        return;
      }
      retryDelay = 2000;
      setState({ status: 'synced', lastSyncedAt: nowIso(), error: null, initialLoaded: true });
    } while (rerun);
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as PgError)?.message ?? String(e);
    await refreshPending().catch(() => undefined);
    setState({ status: navigator.onLine ? 'error' : 'offline', error: msg });
    scheduleRetry();
  } finally {
    running = false;
  }
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    requestSync();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 60000);
}

/** Yêu cầu đồng bộ (gộp các yêu cầu sát nhau) */
export function requestSync(tables?: TableName[], delay = 300) {
  for (const t of tables ?? TABLE_NAMES) dirtyTables.add(t);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runSync();
  }, delay);
}

export async function startSync() {
  stopSync();
  const db = getDb();
  if (!(await db.meta.get('device_id'))) await setMeta('device_id', uuid());
  // Mục đang "inflight" từ phiên trước (app bị đóng giữa chừng) -> gửi lại
  await db.outbox.where('seq').above(0).modify({ inflight: 0 });
  const hasCursor = Boolean(await db.meta.get('cursor:tasks'));
  setState({ status: 'syncing', initialLoaded: hasCursor, error: null });
  await refreshPending();

  cleanup.push(onLocalChange(() => {
    void refreshPending();
    requestSync([], 500);
  }));

  const online = () => requestSync();
  const offline = () => setState({ status: 'offline' });
  const visible = () => { if (document.visibilityState === 'visible') requestSync(); };
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  document.addEventListener('visibilitychange', visible);
  cleanup.push(() => {
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
    document.removeEventListener('visibilitychange', visible);
  });

  channel = supabase.channel(`sync-${uuid()}`);
  for (const table of TABLE_NAMES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => requestSync([table], 400));
  }
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') requestSync();
  });

  // Lưới an toàn nếu realtime bị rớt
  intervalId = setInterval(() => requestSync(), 120000);
  requestSync(undefined, 0);
}

export function stopSync() {
  for (const fn of cleanup) fn();
  cleanup = [];
  if (channel) void supabase.removeChannel(channel);
  channel = null;
  if (timer) clearTimeout(timer);
  if (retryTimer) clearTimeout(retryTimer);
  if (intervalId) clearInterval(intervalId);
  timer = retryTimer = intervalId = null;
}

/** Chế độ kiểm thử giao diện (dev): không kết nối server */
export function markLocalOnly() {
  setState({ status: 'offline', initialLoaded: true, error: null });
}

/** Chỉ dùng cho unit test */
export const __testing = { pushAll, pullTable };

/** Xóa cursor và tải lại toàn bộ từ server (giữ nguyên thay đổi đang chờ) */
export async function fullResync() {
  const db = getDb();
  await db.meta.where('key').startsWith('cursor:').delete();
  requestSync(undefined, 0);
}
