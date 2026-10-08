import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';

export const uuid = (): string => crypto.randomUUID();

export const nowIso = (): string => new Date().toISOString();

/** Ngày local dạng yyyy-MM-dd */
export const toDateKey = (d: Date): string => format(d, 'yyyy-MM-dd');
export const todayKey = (): string => toDateKey(new Date());
export const addDaysKey = (key: string, days: number): string => toDateKey(addDays(parseISO(key), days));
export const daysBetween = (fromKey: string, toKey: string): number =>
  differenceInCalendarDays(parseISO(toKey), parseISO(fromKey));

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function pick<T extends Record<string, unknown>>(obj: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

export function isEqualValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'object' && typeof b === 'object' && a && b) return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

/** UUID cố định từ một chuỗi (dùng để chống tạo trùng thông báo giữa nhiều thiết bị) */
export async function deterministicUuid(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  const b = new Uint8Array(buf).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}p`;
  return `${h}g ${m.toString().padStart(2, '0')}p`;
}

export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((x) => x.toString().padStart(2, '0')).join(':');
}

export function formatDateVi(key: string | null | undefined): string {
  if (!key) return '';
  return format(parseISO(key), 'dd/MM/yyyy');
}

export function formatDateTimeVi(iso: string | null | undefined): string {
  if (!iso) return '';
  return format(new Date(iso), 'dd/MM/yyyy HH:mm');
}

export function relativeDueLabel(key: string | null, today = todayKey()): string {
  if (!key) return '';
  const d = daysBetween(today, key);
  if (d === 0) return 'Hôm nay';
  if (d === 1) return 'Ngày mai';
  if (d === -1) return 'Hôm qua';
  if (d < 0) return `Trễ ${-d} ngày`;
  if (d < 7) return `${d} ngày nữa`;
  return format(parseISO(key), 'dd/MM');
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Không kết nối được máy chủ. Kiểm tra Internet và thử lại.';
  if (/Invalid login credentials/i.test(msg)) return 'Email hoặc mật khẩu không đúng.';
  if (/Email not confirmed/i.test(msg)) return 'Email chưa được xác nhận. Hãy mở link trong email đăng ký.';
  if (/User already registered/i.test(msg)) return 'Email này đã được đăng ký.';
  if (/Password should be at least/i.test(msg)) return 'Mật khẩu quá ngắn (tối thiểu 8 ký tự).';
  if (/rate limit/i.test(msg)) return 'Thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.';
  return msg;
}
