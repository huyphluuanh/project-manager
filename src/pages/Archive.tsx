import { useLiveQuery } from 'dexie-react-hooks';
import { ArchiveRestore, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/feedback';
import { Button, EmptyState, Segmented } from '../components/ui';
import { useWorkspace } from '../hooks/useWorkspace';
import { getDb } from '../lib/db';
import * as repo from '../lib/repo';
import { formatDateTimeVi } from '../lib/utils';

export function Archive() {
  const ws = useWorkspace();
  const toast = useToast();
  const [tab, setTab] = useState<'archived' | 'trash'>('archived');
  const trash = useLiveQuery(async () => {
    const db = getDb();
    const [projects, tasks] = await Promise.all([db.t('projects').toArray(), db.t('tasks').toArray()]);
    return {
      projects: projects.filter((p) => p.deleted_at).sort((a, b) => b.deleted_at!.localeCompare(a.deleted_at!)),
      tasks: tasks.filter((t) => t.deleted_at).sort((a, b) => b.deleted_at!.localeCompare(a.deleted_at!)).slice(0, 200),
    };
  }, []) ?? { projects: [], tasks: [] };
  const archived = ws.projects.filter((p) => p.archived_at);

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">Archive</h1>
        <Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'archived', label: `Đã lưu trữ (${archived.length})` }, { value: 'trash', label: 'Thùng rác' }]} />
      </div>

      {tab === 'archived' ? (
        archived.length === 0 ? <EmptyState title="Chưa có dự án lưu trữ" description="Dự án đã xong có thể lưu trữ để gọn danh sách, dữ liệu vẫn được giữ." /> : (
          <ul className="overflow-hidden rounded-xl border border-border bg-surface">
            {archived.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                <span className="size-2.5 rounded-full" style={{ background: p.color ?? 'var(--accent)' }} />
                <Link to={`/projects/${p.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{p.name}</Link>
                <span className="hidden text-xs text-muted sm:block">Lưu trữ {formatDateTimeVi(p.archived_at)}</span>
                <Button size="sm" icon={<ArchiveRestore className="size-4" />} onClick={() => void toast.run(() => repo.unarchiveProject(p.id), 'Đã khôi phục dự án')}>Restore</Button>
              </li>
            ))}
          </ul>
        )
      ) : trash.projects.length + trash.tasks.length === 0 ? (
        <EmptyState title="Thùng rác trống" />
      ) : (
        <div className="space-y-4">
          {trash.projects.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Dự án</h2>
              <ul className="overflow-hidden rounded-xl border border-border bg-surface">
                {trash.projects.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                    <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                    <span className="hidden text-xs text-muted sm:block">Xóa {formatDateTimeVi(p.deleted_at)}</span>
                    <Button size="sm" icon={<RotateCcw className="size-4" />} onClick={() => void toast.run(() => repo.restoreProject(p.id), 'Đã khôi phục')}>Khôi phục</Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {trash.tasks.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Task</h2>
              <ul className="overflow-hidden rounded-xl border border-border bg-surface">
                {trash.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    <span className="hidden text-xs text-muted sm:block">{ws.projectsById.get(t.project_id)?.name ?? '(dự án đã xóa)'}</span>
                    <Button size="sm" icon={<RotateCcw className="size-4" />} onClick={() => void toast.run(() => repo.restoreTask(t.id), 'Đã khôi phục')}>Khôi phục</Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
