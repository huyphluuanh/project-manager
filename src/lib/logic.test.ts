import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './exporter';
import { filterTasks, priorityScore, projectProgress, projectRisk, sortTasks, taskProgress } from './logic';
import { parseQuickAdd } from './quickAdd';
import { parseSearch, searchTasks } from './search';
import type { Project, Subtask, Task } from './types';

const TODAY = '2026-10-08'; // thứ Năm

function task(p: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2), project_id: 'p1', created_by: null, assignee_id: null, title: 't', description: '',
    status: 'todo', priority: 'medium', start_date: null, due_date: null, due_time: null, progress_mode: 'auto', manual_progress: null,
    estimate_minutes: null, is_pinned: false, my_day_date: null, snoozed_until: null, sort_order: 0, completed_at: null,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', deleted_at: null, version: 1, ...p,
  };
}

const project = (p: Partial<Project> = {}): Project => ({
  id: 'p1', owner_id: 'u', name: 'Website', description: '', status: 'in_progress', priority: 'medium', start_date: '2026-09-28',
  deadline: '2026-10-10', progress_mode: 'auto', manual_progress: null, color: null, is_favorite: false, sort_order: 0, archived_at: null,
  created_at: '2026-09-28T00:00:00Z', updated_at: '2026-09-28T00:00:00Z', deleted_at: null, version: 1, ...p,
});

describe('quick add', () => {
  it('nhận diện ví dụ trong spec', () => {
    expect(parseQuickAdd('Fix payment bug tomorrow high priority', { today: TODAY })).toMatchObject({
      title: 'Fix payment bug', due_date: '2026-10-09', priority: 'high',
    });
  });
  it('tiếng Việt + giờ + tag + dự án', () => {
    const r = parseQuickAdd('Sửa lỗi thanh toán ngày mai 14h ưu tiên cao #bug @web', { today: TODAY, projects: [project()] });
    expect(r).toMatchObject({ title: 'Sửa lỗi thanh toán', due_date: '2026-10-09', due_time: '14:00', priority: 'high', projectId: 'p1', tagNames: ['bug'] });
  });
  it('thứ trong tuần, dd/mm, N ngày nữa, critical', () => {
    expect(parseQuickAdd('Họp thứ 6', { today: TODAY })).toMatchObject({ title: 'Họp', due_date: '2026-10-09' });
    expect(parseQuickAdd('Nộp báo cáo 25/12 critical', { today: TODAY })).toMatchObject({ title: 'Nộp báo cáo', due_date: '2026-12-25', priority: 'critical' });
    expect(parseQuickAdd('Gọi khách 3 ngày nữa', { today: TODAY })).toMatchObject({ title: 'Gọi khách', due_date: '2026-10-11' });
    expect(parseQuickAdd('Deploy next monday p1', { today: TODAY })).toMatchObject({ title: 'Deploy', due_date: '2026-10-12', priority: 'critical' });
  });
  it('không có gì để nhận diện -> giữ nguyên', () => {
    expect(parseQuickAdd('Viết tài liệu', { today: TODAY })).toMatchObject({ title: 'Viết tài liệu', due_date: null, priority: null });
  });
});

describe('priority score', () => {
  it('Critical + deadline ngày mai lên đầu danh sách', () => {
    const a = task({ title: 'critical tomorrow', priority: 'critical', due_date: '2026-10-09' });
    const b = task({ title: 'high today', priority: 'high', due_date: TODAY });
    const c = task({ title: 'medium overdue', priority: 'medium', due_date: '2026-10-01' });
    const d = task({ title: 'low none', priority: 'low' });
    const e = task({ title: 'done critical', priority: 'critical', status: 'done' });
    expect(priorityScore(a, { today: TODAY })).toBe(140);
    const sorted = sortTasks([d, c, b, e, a], 'score', 'asc', { today: TODAY }).map((t) => t.title);
    expect(sorted[0]).toBe('critical tomorrow');
    expect(sorted.at(-1)).toBe('done critical');
  });
  it('task đang chặn task khác được cộng điểm, task bị block bị trừ', () => {
    const t = task({ priority: 'medium' });
    expect(priorityScore(t, { today: TODAY, blocksCount: new Map([[t.id, 2]]) })).toBe(60);
    expect(priorityScore(t, { today: TODAY, blockedIds: new Set([t.id]) })).toBe(10);
  });
});

describe('progress & risk', () => {
  it('progress project = % task done (VD spec: 6/10 = 60%)', () => {
    const tasks = [...Array(6)].map(() => task({ status: 'done' })).concat([...Array(2)].map(() => task({ status: 'in_progress' })), [...Array(2)].map(() => task({})));
    expect(projectProgress(project(), tasks)).toBe(60);
    expect(projectProgress(project({ progress_mode: 'manual', manual_progress: 35 }), tasks)).toBe(35);
  });
  it('progress task từ subtask (3/5)', () => {
    const subs = [true, true, true, false, false].map((d, i) => ({ id: String(i), task_id: 'x', title: '', is_done: d, deleted_at: null } as Subtask));
    expect(taskProgress(task({}), subs)).toBe(60);
  });
  it('còn 2 ngày mà mới 40% -> nguy cơ trễ', () => {
    const r = projectRisk(project({ deadline: '2026-10-10' }), [], 40, TODAY);
    expect(r.level).toBe('high');
    expect(r.reasons[0]).toContain('40%');
  });
  it('đúng tiến độ -> không cảnh báo', () => {
    expect(projectRisk(project({ start_date: '2026-10-01', deadline: '2026-11-30' }), [], 20, TODAY).level).toBe('none');
  });
});

describe('search & filter', () => {
  const p = project();
  const tasks = [
    task({ title: 'Fix payment bug', priority: 'high', due_date: '2026-10-01' }),
    task({ title: 'Payment page UI', priority: 'low' }),
    task({ title: 'Write docs', status: 'done' }),
  ];
  const data = { tasks, projects: [p], tags: [], tagIdsByTask: new Map() };
  it('từ khóa + priority:high + overdue + project:', () => {
    expect(searchTasks(parseSearch('payment'), data)).toHaveLength(2);
    expect(searchTasks(parseSearch('payment priority:high'), data)).toHaveLength(1);
    expect(searchTasks(parseSearch('overdue'), data).map((t) => t.title)).toEqual(['Fix payment bug']);
    expect(searchTasks(parseSearch('project:web'), data)).toHaveLength(3);
    expect(searchTasks(parseSearch('project:khac'), data)).toHaveLength(0);
  });
  it('filter mặc định ẩn task đã xong', () => {
    expect(filterTasks(tasks, {}, { today: TODAY })).toHaveLength(2);
    expect(filterTasks(tasks, { showCompleted: true }, { today: TODAY })).toHaveLength(3);
    expect(filterTasks(tasks, { due: 'overdue' }, { today: TODAY })).toHaveLength(1);
  });
});

describe('csv', () => {
  it('round-trip có dấu phẩy, ngoặc kép, xuống dòng, tiếng Việt', () => {
    const rows = [['title', 'description'], ['Sửa lỗi, "gấp"', 'dòng 1\ndòng 2']];
    expect(parseCsv('﻿' + toCsv(rows))).toEqual(rows);
  });
});
