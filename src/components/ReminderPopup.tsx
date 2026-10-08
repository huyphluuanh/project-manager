import { useLiveQuery } from 'dexie-react-hooks';
import { AlarmClock, Check, Clock, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useUI } from '../hooks/useUI';
import { useWorkspace } from '../hooks/useWorkspace';
import { getDb } from '../lib/db';
import { bringToFront } from '../lib/platform';
import * as repo from '../lib/repo';
import { playChime } from '../lib/sound';
import type { Reminder } from '../lib/types';
import { formatDateTimeVi } from '../lib/utils';
import { CuteCat } from './CuteCat';
import { useToast } from './feedback';

export const REMINDER_PREVIEW_EVENT = 'app:reminder-preview';

/** Nhắc việc ở giữa màn hình: mèo động + chuông nhẹ; Done / Snooze / Dismiss */
export function ReminderPopup() {
  const ws = useWorkspace();
  const ui = useUI();
  const toast = useToast();
  const [preview, setPreview] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const fired = useLiveQuery(
    async () => (await getDb().t('reminders').where('status').equals('fired').toArray())
      .filter((r) => !r.deleted_at)
      .sort((a, b) => (a.fired_at ?? '').localeCompare(b.fired_at ?? '')),
    [],
  );

  // Chuông + đưa app lên trước khi có nhắc việc MỚI
  useEffect(() => {
    if (!fired) return;
    const ids = new Set(fired.map((r) => r.id));
    const recent = (r: Reminder) => !!r.fired_at && Date.now() - new Date(r.fired_at).getTime() < 5 * 60000;
    const fresh = seen.current === null ? fired.filter(recent) : fired.filter((r) => !seen.current!.has(r.id));
    seen.current = ids;
    if (fresh.length) {
      if (ws.settings.reminderSound) void playChime();
      void bringToFront();
    }
  }, [fired, ws.settings.reminderSound]);

  // "Xem thử" từ Settings
  useEffect(() => {
    const on = () => {
      setPreview(true);
      if (ws.settings.reminderSound) void playChime();
    };
    window.addEventListener(REMINDER_PREVIEW_EVENT, on);
    return () => window.removeEventListener(REMINDER_PREVIEW_EVENT, on);
  }, [ws.settings.reminderSound]);

  const current = fired?.[0];
  if (!current && !preview) return null;

  const isPreview = !current;
  const task = current?.task_id ? ws.tasksById.get(current.task_id) : undefined;
  const project = task ? ws.projectsById.get(task.project_id) : current?.project_id ? ws.projectsById.get(current.project_id) : undefined;
  const title = isPreview ? 'Họp review thiết kế với khách hàng' : task?.title || current!.title || 'Nhắc việc';
  const when = isPreview ? 'Ví dụ xem thử' : task?.due_date
    ? `Hạn ${task.due_date.split('-').reverse().join('/')}${task.due_time ? ` lúc ${task.due_time.slice(0, 5)}` : ''}`
    : formatDateTimeVi(current!.remind_at);

  const act = (fn: () => Promise<unknown>, msg?: string) => {
    if (isPreview) return setPreview(false);
    void toast.run(fn, msg);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]" role="alertdialog" aria-modal="true" aria-labelledby="reminder-title">
      <div className="pop-in w-full max-w-sm rounded-3xl border border-border bg-surface px-6 pt-4 pb-6 text-center text-fg shadow-2xl">
        <div className="flex justify-center"><CuteCat size={150} /></div>
        <p className="text-sm font-medium text-accent">Đến giờ rồi nè!{fired && fired.length > 1 ? ` · còn ${fired.length - 1} nhắc khác` : ''}</p>
        <h2 id="reminder-title" className="mt-1 text-xl leading-snug font-semibold">
          <button type="button" className="hover:underline" disabled={isPreview || !task} onClick={() => task && ui.openTask(task.id)}>{title}</button>
        </h2>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted">
          <Clock className="size-4" /> {when}{project ? ` · ${project.name}` : ''}
        </p>

        <div className="mt-5 grid gap-2">
          {(isPreview || task) && (
            <button type="button" autoFocus onClick={() => act(() => repo.reminderMarkDone(current!), 'Đã hoàn thành task')}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-accent text-base font-semibold text-accent-fg hover:opacity-90">
              <Check className="size-5" /> Xong rồi
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => act(() => repo.snoozeReminder(current!.id, 10), 'Sẽ nhắc lại sau 10 phút')}
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-medium hover:bg-surface-2">
              <AlarmClock className="size-4" /> 10 phút nữa
            </button>
            <button type="button" onClick={() => act(() => repo.snoozeReminder(current!.id, 60), 'Sẽ nhắc lại sau 1 giờ')}
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-medium hover:bg-surface-2">
              <AlarmClock className="size-4" /> 1 giờ nữa
            </button>
          </div>
          <button type="button" onClick={() => act(() => repo.dismissReminder(current!.id))}
            className="flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm text-muted hover:bg-surface-2 hover:text-fg">
            <X className="size-4" /> Bỏ qua
          </button>
        </div>
      </div>
    </div>
  );
}
