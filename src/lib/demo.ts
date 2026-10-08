// Dữ liệu mẫu: dự án "Website Redesign" với ~14 task đủ loại để Dashboard có số liệu ngay.

import * as repo from './repo';
import type { Priority, TaskStatus } from './types';
import { addDaysKey, todayKey } from './utils';

interface DemoTask {
  title: string;
  status: TaskStatus;
  priority: Priority;
  start: number;
  due: number | null;
  tags?: string[];
  subtasks?: [string, boolean][];
  myDay?: boolean;
  pinned?: boolean;
}

const TASKS: DemoTask[] = [
  { title: 'Khảo sát người dùng & phân tích website cũ', status: 'done', priority: 'high', start: -20, due: -14, tags: ['Research'] },
  { title: 'Wireframe trang chủ', status: 'done', priority: 'high', start: -14, due: -9, tags: ['Frontend'] },
  { title: 'Thiết kế UI kit (màu, font, component)', status: 'done', priority: 'medium', start: -12, due: -6, tags: ['Frontend'] },
  { title: 'Build Login', status: 'in_progress', priority: 'critical', start: -5, due: 1, tags: ['Frontend', 'Backend'], pinned: true,
    subtasks: [['UI', true], ['API', true], ['Database', true], ['Authentication', false], ['Testing', false]] },
  { title: 'Fix payment bug', status: 'todo', priority: 'critical', start: -3, due: -2, tags: ['Bug', 'Urgent', 'Backend'], myDay: true },
  { title: 'Tích hợp cổng thanh toán', status: 'blocked', priority: 'high', start: -2, due: 4, tags: ['Backend'] },
  { title: 'Trang sản phẩm responsive', status: 'review', priority: 'high', start: -6, due: 0, tags: ['Frontend'], myDay: true },
  { title: 'Viết API giỏ hàng', status: 'in_progress', priority: 'medium', start: -4, due: 3, tags: ['Backend'],
    subtasks: [['Thêm sản phẩm', true], ['Cập nhật số lượng', false], ['Xóa sản phẩm', false]] },
  { title: 'Tối ưu tốc độ tải trang (Lighthouse > 90)', status: 'todo', priority: 'medium', start: 0, due: 6, tags: ['Frontend'] },
  { title: 'Viết nội dung trang Giới thiệu', status: 'todo', priority: 'low', start: 2, due: 9, tags: ['Feature'] },
  { title: 'Họp review thiết kế với khách hàng', status: 'todo', priority: 'high', start: 0, due: 0, tags: ['Meeting'] },
  { title: 'Thiết lập CI/CD và môi trường staging', status: 'done', priority: 'medium', start: -10, due: -4, tags: ['Backend'] },
  { title: 'Kiểm thử trên mobile (iOS/Android)', status: 'todo', priority: 'medium', start: 5, due: 11 },
  { title: 'SEO: meta tags & sitemap', status: 'todo', priority: 'low', start: 7, due: null, tags: ['Feature'] },
];

export async function loadDemoData(): Promise<string> {
  const today = todayKey();
  const d = (n: number) => addDaysKey(today, n);
  const at = (dayOffset: number, hour: number, minute = 0) => {
    const x = new Date(`${d(dayOffset)}T00:00:00`);
    x.setHours(hour, minute, 0, 0);
    return x.toISOString();
  };
  const project = await repo.createProject({
    name: 'Website Redesign',
    description: 'Làm mới toàn bộ website công ty: giao diện mới, responsive, thanh toán online.',
    status: 'in_progress',
    priority: 'high',
    start_date: d(-21),
    deadline: d(14),
    color: '#4f46e5',
    is_favorite: true,
  });

  const ids: Record<string, string> = {};
  for (const t of TASKS) {
    const task = await repo.createTask({
      title: t.title,
      project_id: project.id,
      status: t.status,
      priority: t.priority,
      start_date: d(t.start),
      due_date: t.due === null ? null : d(t.due),
      tagNames: t.tags,
      my_day_date: t.myDay ? today : null,
      is_pinned: !!t.pinned,
      ...(t.status === 'done' && t.due !== null ? { completed_at: at(t.due, 16) } : {}),
    });
    ids[t.title] = task.id;
    // Bấm giờ mẫu: 1–3 phiên cho task đã/đang làm
    if (t.status !== 'todo') {
      const sessions = t.status === 'done' ? 3 : 1;
      for (let i = 0; i < sessions; i++) {
        const day = Math.min((t.due ?? 0) - i, 0);
        await repo.addTimeEntry(task, at(day, 9 + i), at(day, 10 + i, 15 + i * 10));
      }
    }
    for (const [title, done] of t.subtasks ?? []) {
      const s = await repo.addSubtask(task.id, title);
      if (done) await repo.toggleSubtask(s);
    }
  }

  // Dependencies: thanh toán chờ fix bug; kiểm thử mobile chờ trang sản phẩm
  await repo.addDependency(ids['Tích hợp cổng thanh toán'], ids['Fix payment bug']);
  await repo.addDependency(ids['Kiểm thử trên mobile (iOS/Android)'], ids['Trang sản phẩm responsive']);
  await repo.addDependency(ids['Build Login'], ids['Thiết kế UI kit (màu, font, component)'], 'related_to');

  await repo.toggleMilestone(await repo.createMilestone(project.id, 'Prototype', d(-8)));
  await repo.createMilestone(project.id, 'Beta', d(5));
  await repo.createMilestone(project.id, 'Launch', d(14));

  await repo.saveNote({ project_id: project.id }, [
    '## Mục tiêu',
    '- Tăng tỉ lệ chuyển đổi **20%**',
    '- Thời gian tải trang < 2 giây',
    '',
    '## Checklist bàn giao',
    '- [x] Thiết kế được duyệt',
    '- [ ] Tài liệu hướng dẫn quản trị',
  ].join('\n'));

  return project.id;
}
