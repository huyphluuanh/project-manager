import { CalendarDays, Clock, Flag, FolderKanban, Hash, Sun } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useUI } from '../hooks/useUI';
import { useWorkspace } from '../hooks/useWorkspace';
import { PRIORITIES, PRIORITY_LABEL } from '../lib/labels';
import { parseQuickAdd } from '../lib/quickAdd';
import * as repo from '../lib/repo';
import type { Priority } from '../lib/types';
import { formatDateVi, todayKey } from '../lib/utils';
import { useToast } from './feedback';
import { Button, Field, Input, Modal, Segmented, Select } from './ui';

type Kind = 'task' | 'reminder' | 'milestone';
const LAST_PROJECT_KEY = 'pm:lastProject';

function readLastProject(): string | null {
  try { return localStorage.getItem(LAST_PROJECT_KEY); } catch { return null; }
}

export function QuickAddHost() {
  const { quickAdd, closeQuickAdd, openProjectForm } = useUI();
  useEffect(() => {
    if (quickAdd?.kind === 'project') {
      closeQuickAdd();
      openProjectForm();
    }
  }, [quickAdd, closeQuickAdd, openProjectForm]);
  if (!quickAdd || quickAdd.kind === 'project') return null;
  return <QuickAddDialog />;
}

function QuickAddDialog() {
  const ws = useWorkspace();
  const toast = useToast();
  const { quickAdd, closeQuickAdd, openProjectForm, openTask } = useUI();
  const defaults = quickAdd ?? {};
  const [kind, setKind] = useState<Kind>((defaults.kind as Kind) ?? 'task');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const initialProject = defaults.project_id
    ?? ws.activeProjects.find((p) => p.id === readLastProject())?.id
    ?? ws.activeProjects.find((p) => p.is_favorite)?.id
    ?? ws.activeProjects[0]?.id
    ?? '';
  const [projectId, setProjectId] = useState(initialProject);
  const [priorityOverride, setPriorityOverride] = useState<Priority | ''>('');
  const [dueOverride, setDueOverride] = useState(defaults.due_date ?? '');
  const [myDay, setMyDay] = useState(!!defaults.my_day);
  const [when, setWhen] = useState('');

  const parsed = useMemo(() => parseQuickAdd(text, { projects: ws.activeProjects }), [text, ws.activeProjects]);
  const finalProject = parsed.projectId ?? projectId;
  const finalDue = dueOverride || parsed.due_date;
  const finalPriority = priorityOverride || parsed.priority || 'medium';

  const submit = async (keepOpen: boolean) => {
    if (!text.trim()) return;
    setBusy(true);
    const ok = await toast.run(async () => {
      if (kind === 'task') {
        let pid = finalProject;
        if (!pid) pid = (await repo.createProject({ name: 'Inbox', status: 'in_progress' })).id;
        const task = await repo.createTask({
          title: parsed.title,
          project_id: pid,
          due_date: finalDue,
          due_time: parsed.due_time,
          priority: finalPriority,
          status: defaults.status ?? 'todo',
          my_day_date: myDay ? todayKey() : null,
          tagNames: parsed.tagNames,
        });
        try { localStorage.setItem(LAST_PROJECT_KEY, pid); } catch { /* ignore */ }
        if (parsed.due_date || dueOverride) {
          const settings = ws.settings;
          if (settings.notificationsEnabled && parsed.due_time) {
            const at = repo.reminderTimeFor(task, settings.defaultReminderMinutes);
            if (at && at > new Date().toISOString()) {
              await repo.createReminder({ task_id: task.id, project_id: pid, title: task.title, remind_at: at, offset_minutes: settings.defaultReminderMinutes });
            }
          }
        }
        toast.show(`Đã tạo task "${task.title}"`, { tone: 'success', action: { label: 'Mở', onClick: () => openTask(task.id) } });
      } else if (kind === 'reminder') {
        if (!when) throw new Error('Chọn thời gian nhắc.');
        await repo.createReminder({ title: text.trim(), remind_at: new Date(when).toISOString(), project_id: finalProject || null });
        toast.show('Đã tạo nhắc việc', { tone: 'success' });
      } else {
        if (!finalProject) throw new Error('Chọn dự án cho milestone.');
        await repo.createMilestone(finalProject, text.trim(), dueOverride || parsed.due_date);
        toast.show('Đã tạo milestone', { tone: 'success' });
      }
      return true;
    });
    setBusy(false);
    if (ok) {
      setText('');
      if (!keepOpen) closeQuickAdd();
    }
  };

  return (
    <Modal
      open
      onClose={closeQuickAdd}
      title="Thêm nhanh"
      footer={
        <>
          {kind === 'task' && <Button onClick={() => void submit(true)} disabled={!text.trim()} loading={busy}>Lưu & thêm tiếp</Button>}
          <Button variant="primary" onClick={() => void submit(false)} disabled={!text.trim()} loading={busy}>Lưu</Button>
        </>
      }
    >
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented size="sm" value={kind} onChange={setKind} options={[
            { value: 'task', label: 'Task' }, { value: 'reminder', label: 'Reminder' }, { value: 'milestone', label: 'Milestone' },
          ]} />
          <Button size="sm" variant="ghost" icon={<FolderKanban className="size-4" />} onClick={() => { closeQuickAdd(); openProjectForm(); }}>
            Dự án mới
          </Button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void submit(false); }}>
          <Input
            autoFocus
            className="h-12 text-base"
            placeholder={kind === 'task' ? 'VD: Fix payment bug tomorrow high priority #bug' : kind === 'reminder' ? 'Nội dung nhắc…' : 'Tên milestone (VD: Beta)'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Nội dung"
          />
        </form>

        {kind === 'task' && text.trim() && (
          <div className="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
            <span className="text-muted">Nhận diện:</span>
            <span className="rounded-md bg-surface-2 px-2 py-1 font-medium">{parsed.title}</span>
            {finalDue && <Chip icon={<CalendarDays className="size-3.5" />}>{formatDateVi(finalDue)}</Chip>}
            {parsed.due_time && <Chip icon={<Clock className="size-3.5" />}>{parsed.due_time}</Chip>}
            {(priorityOverride || parsed.priority) && <Chip icon={<Flag className="size-3.5" />}>{PRIORITY_LABEL[finalPriority]}</Chip>}
            {parsed.projectId && <Chip icon={<FolderKanban className="size-3.5" />}>{ws.projectsById.get(parsed.projectId)?.name}</Chip>}
            {parsed.tagNames.map((t) => <Chip key={t} icon={<Hash className="size-3.5" />}>{t}</Chip>)}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {(kind !== 'reminder' || ws.activeProjects.length > 0) && (
            <Field label="Dự án" className="col-span-2 sm:col-span-1">
              {(id) => (
                <Select id={id} value={finalProject} onChange={(e) => setProjectId(e.target.value)} disabled={!!parsed.projectId}>
                  {kind === 'task' && ws.activeProjects.length === 0 && <option value="">Inbox (tự tạo)</option>}
                  {kind === 'reminder' && <option value="">— Không gắn dự án —</option>}
                  {ws.activeProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              )}
            </Field>
          )}
          {kind === 'reminder' ? (
            <Field label="Thời gian nhắc" className="col-span-2 sm:col-span-1">
              {(id) => <Input id={id} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}
            </Field>
          ) : (
            <Field label={kind === 'task' ? 'Deadline' : 'Ngày'} className="col-span-2 sm:col-span-1">
              {(id) => <Input id={id} type="date" value={finalDue ?? ''} onChange={(e) => setDueOverride(e.target.value)} />}
            </Field>
          )}
          {kind === 'task' && (
            <>
              <Field label="Ưu tiên">
                {(id) => (
                  <Select id={id} value={finalPriority} onChange={(e) => setPriorityOverride(e.target.value as Priority)}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                  </Select>
                )}
              </Field>
              <label className="mt-6 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={myDay} onChange={(e) => setMyDay(e.target.checked)} className="size-4 accent-[var(--accent)]" />
                <Sun className="size-4 text-warn" /> Thêm vào My Day
              </label>
            </>
          )}
        </div>
        {kind === 'task' && (
          <p className="text-xs text-muted">
            Mẹo: gõ <b>hôm nay</b>, <b>ngày mai</b>, <b>thứ 6</b>, <b>25/12</b>, <b>14h</b>, <b>high priority</b>, <b>ưu tiên cao</b>, <b>#tag</b>, <b>@dự-án</b>.
          </p>
        )}
      </div>
    </Modal>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 font-medium text-accent">{icon}{children}</span>;
}
