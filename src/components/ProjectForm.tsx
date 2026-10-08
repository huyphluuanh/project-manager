import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../hooks/useUI';
import { PRIORITIES, PRIORITY_LABEL, PROJECT_COLORS, PROJECT_STATUSES, PROJECT_STATUS_LABEL } from '../lib/labels';
import * as repo from '../lib/repo';
import type { Project } from '../lib/types';
import { cx } from '../lib/utils';
import { useToast } from './feedback';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';

export function ProjectFormHost() {
  const { projectForm, closeProjectForm } = useUI();
  if (!projectForm) return null;
  return <ProjectForm project={projectForm.project} onClose={closeProjectForm} />;
}

function ProjectForm({ project, onClose }: { project?: Project; onClose: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: project?.name ?? '',
    description: project?.description ?? '',
    status: project?.status ?? 'planning',
    priority: project?.priority ?? 'medium',
    start_date: project?.start_date ?? '',
    deadline: project?.deadline ?? '',
    color: project?.color ?? PROJECT_COLORS[0],
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) return setError('Nhập tên dự án.');
    if (form.start_date && form.deadline && form.deadline < form.start_date) return setError('Deadline phải sau ngày bắt đầu.');
    setError(null);
    setBusy(true);
    const data = {
      name: form.name.trim(),
      description: form.description,
      status: form.status,
      priority: form.priority,
      start_date: form.start_date || null,
      deadline: form.deadline || null,
      color: form.color,
    };
    const res = await toast.run(async () => {
      if (project) {
        await repo.updateProject(project.id, data);
        return project.id;
      }
      return (await repo.createProject(data)).id;
    }, project ? 'Đã lưu dự án' : 'Đã tạo dự án');
    setBusy(false);
    if (res) {
      onClose();
      if (!project) navigate(`/projects/${res}`);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={project ? 'Sửa dự án' : 'Dự án mới'}
      footer={<><Button onClick={onClose}>Hủy</Button><Button variant="primary" loading={busy} onClick={() => void submit()}>{project ? 'Lưu' : 'Tạo dự án'}</Button></>}
    >
      <form className="grid grid-cols-2 gap-3 p-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="Tên dự án *" className="col-span-2" error={error}>
          {(id) => <Input id={id} autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="VD: Website Redesign" />}
        </Field>
        <Field label="Mô tả" className="col-span-2">
          {(id) => <Textarea id={id} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
        <Field label="Trạng thái">
          {(id) => (
            <Select id={id} value={form.status} onChange={(e) => set('status', e.target.value as Project['status'])}>
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Ưu tiên">
          {(id) => (
            <Select id={id} value={form.priority} onChange={(e) => set('priority', e.target.value as Project['priority'])}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Ngày bắt đầu">
          {(id) => <Input id={id} type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />}
        </Field>
        <Field label="Deadline">
          {(id) => <Input id={id} type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />}
        </Field>
        <div className="col-span-2">
          <span className="text-xs font-medium text-muted">Màu</span>
          <div className="mt-1.5 flex gap-2">
            {PROJECT_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Màu ${c}`} aria-pressed={form.color === c} onClick={() => set('color', c)}
                className={cx('size-7 rounded-full ring-offset-2 ring-offset-surface', form.color === c && 'ring-2 ring-fg')} style={{ background: c }} />
            ))}
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
