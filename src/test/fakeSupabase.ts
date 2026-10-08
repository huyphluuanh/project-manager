// Supabase giả lập trong bộ nhớ, mô phỏng đúng các hành vi mà sync engine dựa vào:
// trigger version/updated_at, lỗi trùng khóa 23505, filter eq/gte/is, range, single/maybeSingle.

type Row = Record<string, unknown>;

let clock = Date.parse('2026-01-01T00:00:00Z');
const tick = () => new Date((clock += 1000)).toISOString();

const PK: Record<string, string[]> = {
  task_tags: ['task_id', 'tag_id'],
  project_tags: ['project_id', 'tag_id'],
  project_members: ['project_id', 'user_id'],
  user_settings: ['user_id'],
};

export class FakeServer {
  tables = new Map<string, Row[]>();
  online = true;
  calls: string[] = [];
  /** Lỗi trả về cho request kế tiếp (VD: { code: '42501' } = bị RLS từ chối) */
  failNext: { code: string; message: string } | null = null;
  /** Thực hiện request kế tiếp nhưng "mất" response (mất mạng giữa chừng) */
  dropResponseNext = false;

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  /** Mô phỏng thiết bị khác sửa trực tiếp trên server */
  externalUpdate(table: string, id: string, patch: Row) {
    const r = this.rows(table).find((x) => x.id === id)!;
    Object.assign(r, patch, { version: Number(r.version) + 1, updated_at: tick() });
  }

  from(table: string) {
    return new Query(this, table);
  }

  channel() {
    const ch = { on: () => ch, subscribe: () => ch };
    return ch;
  }

  removeChannel() {
    return Promise.resolve();
  }
}

class Query {
  private op: 'select' | 'insert' | 'update' = 'select';
  private payload: Row | null = null;
  private filters: ((r: Row) => boolean)[] = [];
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private from_ = 0;
  private to_ = Infinity;

  constructor(private server: FakeServer, private table: string) {}

  select() { return this; }
  insert(row: Row) { this.op = 'insert'; this.payload = row; return this; }
  update(patch: Row) { this.op = 'update'; this.payload = patch; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => String(r[c]) === String(v)); return this; }
  gte(c: string, v: string) { this.filters.push((r) => String(r[c]) >= v); return this; }
  is(c: string, v: null) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  order() { return this; }
  range(a: number, b: number) { this.from_ = a; this.to_ = b; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  then<T>(res: (v: { data: unknown; error: { code: string; message: string } | null }) => T, rej?: (e: unknown) => T) {
    return Promise.resolve().then(() => this.exec()).then(res, rej);
  }

  private exec(): { data: unknown; error: { code: string; message: string } | null } {
    const s = this.server;
    s.calls.push(`${this.op}:${this.table}`);
    if (!s.online) return { data: null, error: { code: '', message: 'TypeError: Failed to fetch' } };
    if (s.failNext) {
      const error = s.failNext;
      s.failNext = null;
      return { data: null, error };
    }
    if (s.dropResponseNext) {
      s.dropResponseNext = false;
      this.run();
      return { data: null, error: { code: '', message: 'TypeError: Failed to fetch' } };
    }
    return this.run();
  }

  private run(): { data: unknown; error: { code: string; message: string } | null } {
    const s = this.server;
    const rows = s.rows(this.table);
    const pk = PK[this.table] ?? ['id'];

    if (this.op === 'insert') {
      const row = { ...this.payload! };
      if (rows.some((r) => pk.every((c) => r[c] === row[c]))) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      const now = tick();
      const stored = { ...row, created_at: row.created_at ?? now, updated_at: now, version: 1 };
      rows.push(stored);
      return { data: { ...stored }, error: null };
    }

    const matched = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'update') {
      for (const r of matched) Object.assign(r, this.payload, { version: Number(r.version) + 1, updated_at: tick() });
      return { data: matched.map((r) => ({ ...r })), error: null };
    }

    const sorted = [...matched].sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
    const page = sorted.slice(this.from_, this.to_ + 1).map((r) => ({ ...r }));
    if (this.mode === 'single') return page.length === 1 ? { data: page[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not single' } };
    if (this.mode === 'maybe') return { data: page[0] ?? null, error: null };
    return { data: page, error: null };
  }
}
