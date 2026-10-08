// Nhập nhanh: "Fix payment bug tomorrow high priority #bug @website"
// -> title "Fix payment bug", due = ngày mai, priority = high, tag bug, project website.
// Hỗ trợ cả tiếng Việt: "Sửa lỗi thanh toán ngày mai ưu tiên cao 14h".

import { addDays, addMonths, endOfMonth, nextDay, parseISO, type Day } from 'date-fns';
import type { Priority, Project } from './types';
import { toDateKey, todayKey } from './utils';

export interface QuickAddResult {
  title: string;
  due_date: string | null;
  due_time: string | null;
  priority: Priority | null;
  projectId: string | null;
  tagNames: string[];
}

// Ranh giới từ hỗ trợ tiếng Việt (\b của JS không hiểu dấu)
const B = '(?<=^|[\\s,;])';
const E = '(?=$|[\\s,;.!?])';

function rx(body: string): RegExp {
  return new RegExp(`${B}(?:${body})${E}`, 'iu');
}

const PRIORITY_WORDS: Record<string, Priority> = {
  critical: 'critical', urgent: 'critical', 'khẩn': 'critical', 'khẩn cấp': 'critical', 'gấp': 'critical',
  high: 'high', cao: 'high',
  medium: 'medium', normal: 'medium', 'trung bình': 'medium', vừa: 'medium',
  low: 'low', 'thấp': 'low',
};

const PRIORITY_RULES: { re: RegExp; get: (m: RegExpMatchArray) => Priority }[] = [
  { re: rx('(critical|high|medium|low|urgent)\\s+priority'), get: (m) => PRIORITY_WORDS[m[1].toLowerCase()] },
  { re: rx('priority\\s*:?\\s*(critical|high|medium|low)'), get: (m) => PRIORITY_WORDS[m[1].toLowerCase()] },
  { re: rx('(?:độ\\s+)?ưu\\s+tiên\\s+(khẩn cấp|khẩn|cao|trung bình|vừa|thấp)'), get: (m) => PRIORITY_WORDS[m[1].toLowerCase()] },
  { re: rx('p([1-4])'), get: (m) => (['critical', 'high', 'medium', 'low'] as Priority[])[Number(m[1]) - 1] },
  { re: rx('(!{1,3})'), get: (m) => (['high', 'high', 'critical'] as Priority[])[m[1].length - 1] },
  { re: rx('(critical|urgent|khẩn cấp|gấp)'), get: (m) => PRIORITY_WORDS[m[1].toLowerCase()] },
  { re: rx('(high)'), get: () => 'high' },
];

const EN_DAYS: Record<string, Day> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};
const VI_DAYS: Record<string, Day> = {
  'chủ nhật': 0, cn: 0, '2': 1, hai: 1, '3': 2, ba: 2, '4': 3, 'tư': 3, '5': 4, 'năm': 4, '6': 5, 'sáu': 5, '7': 6, 'bảy': 6,
};

type DateRule = { re: RegExp; get: (m: RegExpMatchArray, today: Date) => Date | null };

const DATE_RULES: DateRule[] = [
  { re: rx('(?:hôm nay|hnay|today|tonight|tối nay)'), get: (_, t) => t },
  { re: rx('(?:day after tomorrow|ngày kia|ngày mốt|mốt)'), get: (_, t) => addDays(t, 2) },
  { re: rx('(?:tomorrow|tmr|ngày mai|mai)'), get: (_, t) => addDays(t, 1) },
  { re: rx('(?:next week|tuần sau|tuần tới)'), get: (_, t) => nextDay(t, 1) },
  { re: rx('(?:end of (?:the )?week|cuối tuần)'), get: (_, t) => (t.getDay() === 5 ? t : nextDay(t, 5)) },
  { re: rx('(?:end of (?:the )?month|cuối tháng)'), get: (_, t) => endOfMonth(t) },
  { re: rx('(?:next month|tháng sau|tháng tới)'), get: (_, t) => addMonths(t, 1) },
  { re: rx('in\\s+(\\d{1,3})\\s+days?'), get: (m, t) => addDays(t, Number(m[1])) },
  { re: rx('(?:sau\\s+)?(\\d{1,3})\\s+ngày(?:\\s+nữa)?'), get: (m, t) => addDays(t, Number(m[1])) },
  {
    re: rx('(?:on\\s+|next\\s+)?(sunday|sun|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat)'),
    get: (m, t) => nextDay(t, EN_DAYS[m[1].toLowerCase()]),
  },
  {
    re: rx('(?:thứ\\s*(2|3|4|5|6|7|hai|ba|tư|năm|sáu|bảy)|t([2-7])|(chủ nhật|cn))(?:\\s+tuần\\s+sau)?'),
    get: (m, t) => {
      const key = (m[1] ?? m[2] ?? m[3]).toLowerCase();
      return nextDay(t, VI_DAYS[key]);
    },
  },
  { re: rx('(\\d{4})-(\\d{2})-(\\d{2})'), get: (m) => safeDate(+m[1], +m[2], +m[3]) },
  {
    re: rx('(?:ngày\\s+)?(\\d{1,2})[/.-](\\d{1,2})(?:[/.-](\\d{2,4}))?'),
    get: (m, t) => {
      let year = m[3] ? Number(m[3]) : t.getFullYear();
      if (year < 100) year += 2000;
      const d = safeDate(year, Number(m[2]), Number(m[1]));
      // dd/mm không có năm mà đã qua -> năm sau
      if (d && !m[3] && toDateKey(d) < toDateKey(t)) return safeDate(year + 1, Number(m[2]), Number(m[1]));
      return d;
    },
  },
];

const TIME_RULES: { re: RegExp; get: (m: RegExpMatchArray) => string | null }[] = [
  { re: rx('(?:at\\s+|lúc\\s+)?(\\d{1,2}):(\\d{2})'), get: (m) => hhmm(+m[1], +m[2]) },
  { re: rx('(?:at\\s+|lúc\\s+)?(\\d{1,2})\\s*(am|pm)'), get: (m) => hhmm((+m[1] % 12) + (m[2].toLowerCase() === 'pm' ? 12 : 0), 0) },
  { re: rx('(?:lúc\\s+)?(\\d{1,2})\\s*(?:h|giờ)\\s*(\\d{2})?'), get: (m) => hhmm(+m[1], m[2] ? +m[2] : 0) },
];

function safeDate(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

function hhmm(h: number, m: number): string | null {
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
}

export function parseQuickAdd(input: string, opts: { projects?: Project[]; today?: string } = {}): QuickAddResult {
  const today = parseISO(opts.today ?? todayKey());
  let text = ` ${input.trim()} `;
  const cut = (m: RegExpMatchArray) => {
    text = text.slice(0, m.index!) + ' ' + text.slice(m.index! + m[0].length);
  };

  // #tag
  const tagNames: string[] = [];
  for (const m of [...text.matchAll(/(?<=^|\s)#([\p{L}\p{N}_-]+)/gu)]) tagNames.push(m[1]);
  text = text.replace(/(?<=^|\s)#[\p{L}\p{N}_-]+/gu, ' ');

  // @project hoặc project:name
  let projectId: string | null = null;
  const pm = text.match(/(?<=^|\s)(?:@|project:)([\p{L}\p{N}_.-]+)/u);
  if (pm) {
    const q = normalize(pm[1]);
    const live = (opts.projects ?? []).filter((p) => !p.deleted_at && !p.archived_at);
    const found = live.find((p) => normalize(p.name) === q) ?? live.find((p) => normalize(p.name).startsWith(q)) ?? live.find((p) => normalize(p.name).includes(q));
    if (found) {
      projectId = found.id;
      cut(pm);
    }
  }

  let priority: Priority | null = null;
  for (const rule of PRIORITY_RULES) {
    const m = text.match(rule.re);
    if (m) {
      priority = rule.get(m);
      cut(m);
      break;
    }
  }

  let due: Date | null = null;
  for (const rule of DATE_RULES) {
    const m = text.match(rule.re);
    if (m) {
      const d = rule.get(m, today);
      if (d) {
        due = d;
        cut(m);
        break;
      }
    }
  }

  let due_time: string | null = null;
  for (const rule of TIME_RULES) {
    const m = text.match(rule.re);
    if (m) {
      const t = rule.get(m);
      if (t) {
        due_time = t;
        cut(m);
        break;
      }
    }
  }
  if (due_time && !due) due = today;

  const title = text.replace(/\s+/g, ' ').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '').trim();
  return {
    title: title || input.trim(),
    due_date: due ? toDateKey(due) : null,
    due_time,
    priority,
    projectId,
    tagNames,
  };
}
