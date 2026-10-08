// Khác biệt giữa Windows app (Tauri) và trình duyệt được gom về đây.

import { isTauri } from './supabase';

export { isTauri };

export function notificationPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (isTauri()) return 'granted';
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (isTauri()) {
    const n = await import('@tauri-apps/plugin-notification');
    if (await n.isPermissionGranted()) return true;
    return (await n.requestPermission()) === 'granted';
  }
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

export async function showSystemNotification(title: string, body: string, tag?: string) {
  try {
    if (isTauri()) {
      const n = await import('@tauri-apps/plugin-notification');
      if (await n.isPermissionGranted()) n.sendNotification({ title, body });
      return;
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Android Chrome chỉ cho hiện thông báo qua service worker
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: `${import.meta.env.BASE_URL}icons/pwa-192.png` });
    else new Notification(title, { body, tag });
  } catch (e) {
    console.warn('Notification failed', e);
  }
}

export async function getAutostart(): Promise<boolean> {
  if (!isTauri()) return false;
  const a = await import('@tauri-apps/plugin-autostart');
  return a.isEnabled();
}

export async function setAutostart(on: boolean) {
  if (!isTauri()) return;
  const a = await import('@tauri-apps/plugin-autostart');
  if (on) await a.enable();
  else await a.disable();
}

export async function setMinimizeToTray(on: boolean) {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_minimize_to_tray', { enabled: on });
}

/** App Windows đang ẩn ở khay -> hiện cửa sổ lên trước để thấy nhắc việc */
export async function bringToFront() {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const w = getCurrentWindow();
    await w.unminimize();
    await w.show();
    await w.setFocus();
  } catch (e) {
    console.warn('bringToFront failed', e);
  }
}

/** Mở link ngoài: trình duyệt mặc định (Windows app) hoặc tab mới (web) */
export async function openExternal(url: string) {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

/** Áp lựa chọn "thu nhỏ xuống khay" đã lưu khi app Windows khởi động */
export async function restoreDesktopPrefs() {
  if (!isTauri()) return;
  let tray = true;
  try { tray = localStorage.getItem('pm:tray') !== '0'; } catch { /* ignore */ }
  await setMinimizeToTray(tray);
}

/** Nghe lệnh từ menu khay hệ thống (Tauri): payload là route hoặc 'quick-add' */
export async function onTrayCommand(cb: (cmd: string) => void): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  const { listen } = await import('@tauri-apps/api/event');
  return listen<string>('tray-command', (e) => cb(e.payload));
}
