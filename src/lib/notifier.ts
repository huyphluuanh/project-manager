// Kiểm tra định kỳ (30s) khi app đang mở:
//  - Reminder đến giờ -> thông báo hệ thống + Notification Center + popup có Snooze/Dismiss/Done
//  - Mỗi ngày 1 lần: task đến hạn hôm nay, task quá hạn, project sắp tới deadline
// Thông báo dùng id cố định -> nhiều thiết bị không tạo trùng.
// Lưu ý: web chỉ nhắc khi tab/PWA đang mở; app Windows chạy nền ở khay hệ thống.

import { getDb } from './db';
import { daysBetween, todayKey } from './utils';
import { getSettings, pushNotification } from './repo';
import { getUserId } from './session';
import { updateRow } from './store';
import { showSystemNotification } from './platform';

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

export function startNotifier() {
  stopNotifier();
  void tick();
  timer = setInterval(() => void tick(), 30000);
}

export function stopNotifier() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const settings = await getSettings();
    if (!settings.notificationsEnabled) return;
    await fireReminders(settings.browserNotifications);
    await dailyDigest(settings.overdueNotifications, settings.browserNotifications);
  } catch (e) {
    console.warn('notifier', e);
  } finally {
    ticking = false;
  }
}

async function fireReminders(system: boolean) {
  const db = getDb();
  const uid = getUserId();
  const now = new Date().toISOString();
  const due = (await db.t('reminders').toArray()).filter((r) =>
    !r.deleted_at && r.user_id === uid &&
    ((r.status === 'pending' && r.remind_at <= now) || (r.status === 'snoozed' && !!r.snoozed_until && r.snoozed_until <= now)),
  );
  for (const r of due) {
    const task = r.task_id ? await db.t('tasks').get(r.task_id) : undefined;
    if (task?.status === 'done' || task?.deleted_at) {
      await updateRow('reminders', r.id, { status: 'done' });
      continue;
    }
    const at = r.status === 'snoozed' ? r.snoozed_until! : r.remind_at;
    await updateRow('reminders', r.id, { status: 'fired', fired_at: now });
    const title = `⏰ ${task?.title || r.title || 'Nhắc việc'}`;
    const body = task?.due_date ? `Hạn: ${task.due_date}${task.due_time ? ' ' + task.due_time.slice(0, 5) : ''}` : 'Đến giờ nhắc việc';
    await pushNotification('reminder', title, body, { task_id: r.task_id, project_id: r.project_id }, `rem:${r.id}:${at}`);
    if (system) await showSystemNotification(title, body, r.id);
  }
}

/** Chạy mỗi lượt; id thông báo cố định theo (task, ngày) nên mỗi việc chỉ báo 1 lần */
async function dailyDigest(overdueOn: boolean, system: boolean) {
  const today = todayKey();
  const uid = getUserId();
  const db = getDb();
  const projects = (await db.t('projects').toArray()).filter((p) => !p.deleted_at && !p.archived_at);
  const live = new Set(projects.map((p) => p.id));
  const tasks = (await db.t('tasks').toArray()).filter((t) =>
    !t.deleted_at && t.status !== 'done' && live.has(t.project_id) && (!t.assignee_id || t.assignee_id === uid),
  );

  let dueCount = 0;
  let overdueCount = 0;
  for (const t of tasks) {
    if (!t.due_date) continue;
    if (t.due_date === today) {
      if (await pushNotification('task_due', `Đến hạn hôm nay: ${t.title}`, '', { task_id: t.id, project_id: t.project_id }, `due:${t.id}:${t.due_date}`)) dueCount++;
    } else if (overdueOn && t.due_date < today) {
      if (await pushNotification('task_overdue', `Quá hạn: ${t.title}`, `Hạn ${t.due_date}`, { task_id: t.id, project_id: t.project_id }, `overdue:${t.id}:${t.due_date}`)) overdueCount++;
    }
  }
  for (const p of projects) {
    if (!p.deadline || ['completed', 'cancelled'].includes(p.status)) continue;
    const d = daysBetween(today, p.deadline);
    if (d >= 0 && d <= 3) {
      await pushNotification('project_deadline', `Dự án "${p.name}" ${d === 0 ? 'đến hạn hôm nay' : `còn ${d} ngày`}`, '', { project_id: p.id }, `pdl:${p.id}:${p.deadline}`);
    }
  }
  // Chỉ hiện thông báo hệ thống khi có việc MỚI cần báo
  if (system && (dueCount || overdueCount)) {
    const parts = [dueCount && `${dueCount} task đến hạn hôm nay`, overdueCount && `${overdueCount} task quá hạn`].filter(Boolean);
    await showSystemNotification('Project Manager', parts.join(', '), `digest-${today}`);
  }
}
