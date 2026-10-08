import type { AppSettings } from './types';

export const REMEMBER_KEY = 'pm:remember';
export const SESSION_MARK = 'pm:session-alive';

let userId: string | null = null;

export function setSessionUserId(id: string | null) {
  userId = id;
}

export function getUserId(): string {
  if (!userId) throw new Error('Chưa đăng nhập');
  return userId;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoSort: true,
  autoBlock: true,
  notificationsEnabled: true,
  overdueNotifications: true,
  browserNotifications: false,
  reminderSound: true,
  defaultReminderMinutes: 15,
  dueSoonDays: 7,
};
