import DOMPurify from 'dompurify';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bold, CheckSquare, Download, Italic, List, ListOrdered, Paperclip, Trash2 } from 'lucide-react';
import { marked } from 'marked';
import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { getDb } from '../lib/db';
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL, TASK_STATUS_LABEL } from '../lib/labels';
import { openExternal } from '../lib/platform';
import * as repo from '../lib/repo';
import { supabase } from '../lib/supabase';
import type { ActivityLog, Attachment, Priority, ProjectStatus, TaskStatus } from '../lib/types';
import { cx, formatDateTimeVi, formatDateVi } from '../lib/utils';
import { useWorkspace } from '../hooks/useWorkspace';
import { useConfirm, useToast } from './feedback';
import { Button, IconButton, Input, Segmented, Spinner, Textarea } from './ui';

// ---------------------------------------------------------------------
// Ô nhập tự lưu (debounce + lưu khi blur + Ctrl+S)
// ---------------------------------------------------------------------

export const SAVE_EVENT = 'app:save';

function useAutosave(value: string, onSave: (v: string) => void, delay = 700) {
  const [local, setLocal] = useState(value);
  const editing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(local);
  latest.current = local;

  useEffect(() => {
    if (!editing.current) setLocal(value);
  }, [value]);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (latest.current !== value) onSave(latest.current);
  };

  useEffect(() => {
    const h = () => flush();
    window.addEventListener(SAVE_EVENT, h);
    return () => {
      window.removeEventListener(SAVE_EVENT, h);
    };
  });

  // Lưu nốt khi đóng panel
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  return {
    value: local,
    onChange: (v: string) => {
      setLocal(v);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    onFocus: () => { editing.current = true; },
    onBlur: () => { editing.current = false; flush(); },
  };
}

export function AutoInput({ value, onSave, ...rest }: { value: string; onSave: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const a = useAutosave(value, onSave);
  return <Input {...rest} value={a.value} onChange={(e) => a.onChange(e.target.value)} onFocus={a.onFocus} onBlur={a.onBlur} />;
}

export function AutoTextarea({ value, onSave, ...rest }: { value: string; onSave: (v: string) => void } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const a = useAutosave(value, onSave);
  return <Textarea {...rest} value={a.value} onChange={(e) => a.onChange(e.target.value)} onFocus={a.onFocus} onBlur={a.onBlur} />;
}

// ---------------------------------------------------------------------
// Ghi chú Markdown
// ---------------------------------------------------------------------

export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false, gfm: true, breaks: true }) as string;
  return DOMPurify.sanitize(html);
}

export function NotesEditor({ taskId, projectId }: { taskId?: string; projectId?: string }) {
  const note = useLiveQuery(
    () => (taskId ? getDb().t('notes').where('task_id').equals(taskId).first() : getDb().t('notes').where('project_id').equals(projectId!).first()),
    [taskId, projectId],
  );
  const content = note && !note.deleted_at ? note.content_md : '';
  const [mode, setMode] = useState<'edit' | 'preview'>('preview');
  const ref = useRef<HTMLTextAreaElement>(null);
  const a = useAutosave(content, (v) => void repo.saveNote(taskId ? { task_id: taskId } : { project_id: projectId }, v));

  useEffect(() => { if (note !== undefined && !content) setMode('edit'); }, [note]); // eslint-disable-line react-hooks/exhaustive-deps

  const wrap = (before: string, after = before) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const next = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e);
    a.onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, e + before.length); });
  };
  const prefixLines = (prefix: (i: number) => string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    const block = value.slice(lineStart, e).split('\n').map((l, i) => prefix(i) + l).join('\n');
    a.onChange(value.slice(0, lineStart) + block + value.slice(e));
    requestAnimationFrame(() => el.focus());
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'edit', label: 'Soạn' }, { value: 'preview', label: 'Xem' }]} />
        {mode === 'edit' && (
          <div className="flex items-center">
            <IconButton label="In đậm" onClick={() => wrap('**')}><Bold className="size-4" /></IconButton>
            <IconButton label="In nghiêng" onClick={() => wrap('_')}><Italic className="size-4" /></IconButton>
            <IconButton label="Danh sách" onClick={() => prefixLines(() => '- ')}><List className="size-4" /></IconButton>
            <IconButton label="Danh sách số" onClick={() => prefixLines((i) => `${i + 1}. `)}><ListOrdered className="size-4" /></IconButton>
            <IconButton label="Checklist" onClick={() => prefixLines(() => '- [ ] ')}><CheckSquare className="size-4" /></IconButton>
          </div>
        )}
      </div>
      {mode === 'edit' ? (
        <Textarea
          ref={ref}
          rows={6}
          placeholder="Ghi chú… (hỗ trợ Markdown: **đậm**, _nghiêng_, - danh sách, - [ ] checklist)"
          value={a.value}
          onChange={(e) => a.onChange(e.target.value)}
          onFocus={a.onFocus}
          onBlur={a.onBlur}
        />
      ) : content ? (
        <div className="prose-note cursor-text rounded-lg border border-border px-3 py-2 text-sm" onDoubleClick={() => setMode('edit')} dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
      ) : (
        <button type="button" className="w-full rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted" onClick={() => setMode('edit')}>
          Chưa có ghi chú. Bấm để viết.
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Activity log (lấy từ server)
// ---------------------------------------------------------------------

const ACTION_LABEL: Record<string, string> = {
  created: 'Tạo mới',
  completed: 'Hoàn thành',
  reopened: 'Mở lại',
  status_changed: 'Đổi trạng thái',
  priority_changed: 'Đổi ưu tiên',
  deadline_changed: 'Đổi deadline',
  assignment_changed: 'Đổi người phụ trách',
  moved: 'Chuyển dự án',
  renamed: 'Đổi tên',
  deleted: 'Xóa',
  restored: 'Khôi phục',
  archived: 'Lưu trữ',
  unarchived: 'Bỏ lưu trữ',
};

function formatValue(field: string | null, v: string | null, names: Map<string, string>): string {
  if (v == null || v === '') return '(trống)';
  if (field === 'status') return TASK_STATUS_LABEL[v as TaskStatus] ?? PROJECT_STATUS_LABEL[v as ProjectStatus] ?? v;
  if (field === 'priority') return PRIORITY_LABEL[v as Priority] ?? v;
  if (field === 'due_date' || field === 'deadline') return formatDateVi(v);
  if (field === 'assignee_id' || field === 'project_id') return names.get(v) ?? '…';
  if (field === 'archived_at' || field === 'deleted_at') return formatDateTimeVi(v);
  return v;
}

export function ActivityList({ taskId, projectId }: { taskId?: string; projectId?: string }) {
  const ws = useWorkspace();
  const [logs, setLogs] = useState<ActivityLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLogs(null);
    setError(null);
    if (!navigator.onLine) {
      setError('Cần kết nối Internet để xem lịch sử.');
      return;
    }
    let q = supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100);
    q = taskId ? q.eq('task_id', taskId) : q.eq('project_id', projectId!).eq('entity_type', 'project');
    q.then(({ data, error: err }) => {
      if (!alive) return;
      if (err) setError('Không tải được lịch sử.');
      else setLogs((data ?? []) as ActivityLog[]);
    });
    return () => { alive = false; };
  }, [taskId, projectId]);

  const names = new Map<string, string>([
    ...ws.profiles.map((p) => [p.id, p.full_name || p.email] as [string, string]),
    ...ws.projects.map((p) => [p.id, p.name] as [string, string]),
  ]);

  if (error) return <p className="text-sm text-muted">{error}</p>;
  if (!logs) return <Spinner />;
  if (!logs.length) return <p className="text-sm text-muted">Chưa có lịch sử (thay đổi chưa đồng bộ sẽ hiện sau).</p>;
  return (
    <ol className="space-y-2">
      {logs.map((l) => (
        <li key={l.id} className="text-sm">
          <span className="text-xs text-muted tabular-nums">{formatDateTimeVi(l.created_at)}</span>
          {' — '}
          <span className="font-medium">{ACTION_LABEL[l.action] ?? l.action}</span>
          {l.field && l.action !== 'completed' && l.action !== 'reopened' && l.action !== 'deleted' && l.action !== 'restored' && (
            <span className="text-muted">: {formatValue(l.field, l.old_value, names)} → {formatValue(l.field, l.new_value, names)}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------
// File đính kèm
// ---------------------------------------------------------------------

export function AttachmentList({ projectId, taskId }: { projectId: string; taskId?: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const items = useLiveQuery(async () => {
    const rows = taskId
      ? await getDb().t('attachments').where('task_id').equals(taskId).toArray()
      : (await getDb().t('attachments').where('project_id').equals(projectId).toArray()).filter((a) => !a.task_id);
    return rows.filter((a) => !a.deleted_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [projectId, taskId]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      await toast.run(() => repo.uploadAttachment(f, projectId, taskId ?? null), `Đã tải lên ${f.name}`);
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const open = (a: Attachment) => toast.run(async () => openExternal(await repo.attachmentUrl(a)));

  const remove = async (a: Attachment) => {
    if (await confirm({ title: 'Xóa file đính kèm?', message: a.file_name, confirmLabel: 'Xóa', danger: true })) {
      await toast.run(() => repo.deleteAttachment(a), 'Đã xóa file');
    }
  };

  return (
    <div className="space-y-2">
      {items?.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
          <Paperclip className="size-4 shrink-0 text-muted" />
          <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => void open(a)}>{a.file_name}</button>
          <span className="text-xs text-muted">{(a.size_bytes / 1024 / 1024).toFixed(1)} MB</span>
          <IconButton label="Tải về" onClick={() => void open(a)}><Download className="size-4" /></IconButton>
          <IconButton label="Xóa" onClick={() => void remove(a)}><Trash2 className="size-4" /></IconButton>
        </div>
      ))}
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} accept={repo.ALLOWED_MIME.join(',')} />
      <Button size="sm" loading={busy} icon={<Paperclip className="size-4" />} onClick={() => inputRef.current?.click()}>
        Đính kèm file
      </Button>
      <p className="text-xs text-muted">Tối đa 20 MB/file: ảnh, PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP.</p>
    </div>
  );
}

export function Section({ title, children, right, className }: { title: string; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <section className={cx('border-t border-border px-4 py-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}
