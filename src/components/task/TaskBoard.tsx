import { useLiveQuery } from 'dexie-react-hooks';
import { BookmarkPlus, Filter, GanttChart, Kanban, List, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUI } from '../../hooks/useUI';
import { useWorkspace } from '../../hooks/useWorkspace';
import { getDb } from '../../lib/db';
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL } from '../../lib/labels';
import { filterTasks, sortTasks } from '../../lib/logic';
import * as repo from '../../lib/repo';
import type { Priority, SortKey, TaskFilters, TaskStatus } from '../../lib/types';
import { cx } from '../../lib/utils';
import { useToast } from '../feedback';
import { Button, EmptyState, IconButton, Input, Menu, Modal, Segmented, Select } from '../ui';
import { KanbanView } from './KanbanView';
import { TaskCard, TaskRow } from './TaskItem';
import { TimelineView } from './TimelineView';

type View = 'list' | 'kanban' | 'timeline';

const SORT_LABEL: Record<SortKey, string> = {
  score: 'Tự động (Priority Score)',
  priority: 'Ưu tiên',
  due_date: 'Deadline',
  created_at: 'Ngày tạo',
  updated_at: 'Cập nhật',
  progress: 'Tiến độ',
  title: 'Tên A→Z',
};

const PAGE = 100;

export function TaskBoard({ projectId }: { projectId?: string }) {
  const ws = useWorkspace();
  const ui = useUI();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || 'list';
  const setView = (v: View) => { params.set('view', v); setParams(params, { replace: true }); };

  const [filters, setFilters] = useState<TaskFilters>(() => ({ due: (params.get('due') as TaskFilters['due']) || 'any' }));
  const [sortKey, setSortKey] = useState<SortKey>(ws.settings.autoSort ? 'score' : 'due_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [limit, setLimit] = useState(PAGE);
  const [filterOpen, setFilterOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState('');

  const savedViews = useLiveQuery(async () => (await getDb().t('saved_views').toArray()).filter((v) => !v.deleted_at), []) ?? [];

  const scoped = useMemo(() => ws.tasks.filter((t) => {
    const p = ws.projectsById.get(t.project_id);
    if (projectId) return t.project_id === projectId;
    return p && !p.archived_at;
  }), [ws.tasks, ws.projectsById, projectId]);

  const visible = useMemo(() => {
    const f = view === 'kanban' ? { ...filters, showCompleted: true } : filters;
    const filtered = filterTasks(scoped, f, { tagIdsByTask: ws.tagIdsByTask, today: ws.today });
    return sortTasks(filtered, sortKey, sortDir, {
      projectsById: ws.projectsById, blocksCount: ws.blocksCount, blockedIds: ws.blockedIds, progressOf: ws.taskProgressOf, today: ws.today,
    });
  }, [scoped, filters, sortKey, sortDir, view, ws]);

  const activeCount = [filters.projectIds?.length, filters.statuses?.length, filters.priorities?.length, filters.tagIds?.length, filters.assigneeIds?.length, filters.due && filters.due !== 'any', filters.showCompleted].filter(Boolean).length;
  const toggle = <T,>(arr: T[] | undefined, v: T) => (arr?.includes(v) ? arr.filter((x) => x !== v) : [...(arr ?? []), v]);

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={[
          { value: 'list', label: <><List className="size-4" /><span className="hidden sm:inline">List</span></>, title: 'List' },
          { value: 'kanban', label: <><Kanban className="size-4" /><span className="hidden sm:inline">Kanban</span></>, title: 'Kanban' },
          { value: 'timeline', label: <><GanttChart className="size-4" /><span className="hidden sm:inline">Timeline</span></>, title: 'Timeline / Gantt' },
        ]} />
        <Input className="h-9 w-40 flex-1 sm:max-w-xs" placeholder="Lọc theo tên…" value={filters.text ?? ''} onChange={(e) => setFilters({ ...filters, text: e.target.value })} aria-label="Lọc theo tên" />
        <Button size="sm" className="h-9" icon={<Filter className="size-4" />} onClick={() => setFilterOpen(true)}>
          Bộ lọc{activeCount ? ` (${activeCount})` : ''}
        </Button>
        {view !== 'kanban' && (
          <Select aria-label="Sắp xếp" className="h-9 w-auto" value={`${sortKey}:${sortDir}`} onChange={(e) => { const [k, d] = e.target.value.split(':'); setSortKey(k as SortKey); setSortDir(d as 'asc' | 'desc'); }}>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              k === 'score' ? <option key={k} value="score:asc">{SORT_LABEL[k]}</option> : (
                <optgroup key={k} label={SORT_LABEL[k]}>
                  <option value={`${k}:asc`}>{SORT_LABEL[k]} ↑</option>
                  <option value={`${k}:desc`}>{SORT_LABEL[k]} ↓</option>
                </optgroup>
              )
            ))}
          </Select>
        )}
        <Menu
          trigger={(p) => <Button size="sm" variant="ghost" className="h-9" icon={<BookmarkPlus className="size-4" />} {...p}>Views</Button>}
          items={[
            { label: 'Lưu view hiện tại…', icon: <BookmarkPlus className="size-4" />, onClick: () => setSaveOpen(true) },
            ...savedViews.map((v) => ({
              label: v.name,
              onClick: () => { setFilters(v.filters); setSortKey(v.sort.key); setSortDir(v.sort.dir); if (v.view_type !== 'calendar') setView(v.view_type); },
            })),
          ]}
        />
        <Button size="sm" variant="primary" className="ml-auto h-9" icon={<Plus className="size-4" />} onClick={() => ui.openQuickAdd({ project_id: projectId })}>
          Task
        </Button>
      </div>

      {activeCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          {filters.due && filters.due !== 'any' && <Pill onClear={() => setFilters({ ...filters, due: 'any' })}>{{ overdue: 'Quá hạn', today: 'Hôm nay', week: '7 ngày tới', none: 'Không có hạn' }[filters.due]}</Pill>}
          {filters.statuses?.map((s) => <Pill key={s} onClear={() => setFilters({ ...filters, statuses: toggle(filters.statuses, s) })}>{TASK_STATUS_LABEL[s]}</Pill>)}
          {filters.priorities?.map((p) => <Pill key={p} onClear={() => setFilters({ ...filters, priorities: toggle(filters.priorities, p) })}>{PRIORITY_LABEL[p]}</Pill>)}
          {filters.projectIds?.map((id) => <Pill key={id} onClear={() => setFilters({ ...filters, projectIds: toggle(filters.projectIds, id) })}>{ws.projectsById.get(id)?.name}</Pill>)}
          {filters.tagIds?.map((id) => <Pill key={id} onClear={() => setFilters({ ...filters, tagIds: toggle(filters.tagIds, id) })}>#{ws.tagsById.get(id)?.name}</Pill>)}
          {filters.showCompleted && <Pill onClear={() => setFilters({ ...filters, showCompleted: false })}>Gồm task đã xong</Pill>}
          <button type="button" className="text-accent hover:underline" onClick={() => setFilters({ due: 'any', text: filters.text })}>Xóa bộ lọc</button>
        </div>
      )}

      {/* Views */}
      {view === 'kanban' ? (
        <KanbanView tasks={visible} projectId={projectId} />
      ) : view === 'timeline' ? (
        <TimelineView tasks={visible} />
      ) : visible.length === 0 ? (
        <EmptyState title="Không có task nào" description={activeCount ? 'Thử bỏ bớt bộ lọc.' : 'Bấm “+ Task” hoặc phím N để thêm task.'} />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
            <div className="hidden grid-cols-[auto_70px_minmax(0,1fr)_150px_110px_100px_90px_32px] gap-3 border-b border-border px-3 py-2 text-xs font-medium text-muted lg:grid">
              <span className="w-5" /><span>Priority</span><span>Task</span><span>Project</span><span>Status</span><span>Deadline</span><span>Progress</span><span />
            </div>
            {visible.slice(0, limit).map((t) => <TaskRow key={t.id} task={t} showProject={!projectId} />)}
          </div>
          <div className="space-y-2 md:hidden">
            {visible.slice(0, limit).map((t) => <TaskCard key={t.id} task={t} showProject={!projectId} />)}
          </div>
          {visible.length > limit && (
            <div className="mt-3 text-center">
              <Button size="sm" onClick={() => setLimit(limit + PAGE)}>Hiển thị thêm ({visible.length - limit})</Button>
            </div>
          )}
          <p className="mt-2 text-xs text-muted">{visible.length} task</p>
        </>
      )}

      {/* Bộ lọc */}
      <Modal open={filterOpen} onClose={() => setFilterOpen(false)} title="Bộ lọc" footer={
        <><Button onClick={() => setFilters({ due: 'any', text: filters.text })}>Xóa tất cả</Button><Button variant="primary" onClick={() => setFilterOpen(false)}>Xong</Button></>
      }>
        <div className="space-y-4 p-4">
          <FilterGroup label="Deadline">
            {(['any', 'overdue', 'today', 'week', 'none'] as const).map((d) => (
              <Chip key={d} active={(filters.due ?? 'any') === d} onClick={() => setFilters({ ...filters, due: d })}>
                {{ any: 'Tất cả', overdue: 'Quá hạn', today: 'Hôm nay', week: '7 ngày tới', none: 'Không có hạn' }[d]}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup label="Trạng thái">
            {TASK_STATUSES.map((s) => <Chip key={s} active={!!filters.statuses?.includes(s)} onClick={() => setFilters({ ...filters, statuses: toggle(filters.statuses, s as TaskStatus) })}>{TASK_STATUS_LABEL[s]}</Chip>)}
          </FilterGroup>
          <FilterGroup label="Ưu tiên">
            {PRIORITIES.map((p) => <Chip key={p} active={!!filters.priorities?.includes(p)} onClick={() => setFilters({ ...filters, priorities: toggle(filters.priorities, p as Priority) })}>{PRIORITY_LABEL[p]}</Chip>)}
          </FilterGroup>
          {!projectId && (
            <FilterGroup label="Dự án">
              {ws.activeProjects.map((p) => <Chip key={p.id} active={!!filters.projectIds?.includes(p.id)} onClick={() => setFilters({ ...filters, projectIds: toggle(filters.projectIds, p.id) })}>{p.name}</Chip>)}
            </FilterGroup>
          )}
          {ws.tags.length > 0 && (
            <FilterGroup label="Tag">
              {ws.tags.map((t) => <Chip key={t.id} active={!!filters.tagIds?.includes(t.id)} onClick={() => setFilters({ ...filters, tagIds: toggle(filters.tagIds, t.id) })}>#{t.name}</Chip>)}
            </FilterGroup>
          )}
          {ws.profiles.length > 1 && (
            <FilterGroup label="Người phụ trách">
              {ws.profiles.map((p) => <Chip key={p.id} active={!!filters.assigneeIds?.includes(p.id)} onClick={() => setFilters({ ...filters, assigneeIds: toggle(filters.assigneeIds, p.id) })}>{p.full_name || p.email}</Chip>)}
            </FilterGroup>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={!!filters.showCompleted} onChange={(e) => setFilters({ ...filters, showCompleted: e.target.checked })} />
            Hiện cả task đã hoàn thành
          </label>
        </div>
      </Modal>

      {/* Lưu view */}
      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Lưu view" size="sm" footer={
        <>
          <Button onClick={() => setSaveOpen(false)}>Hủy</Button>
          <Button variant="primary" disabled={!viewName.trim()} onClick={() => void toast.run(async () => {
            await repo.createSavedView({ name: viewName.trim(), view_type: view, filters, sort: { key: sortKey, dir: sortDir } });
            setSaveOpen(false);
            setViewName('');
          }, 'Đã lưu view')}>Lưu</Button>
        </>
      }>
        <div className="space-y-3 p-4">
          <Input autoFocus placeholder="VD: Bug khẩn tuần này" value={viewName} onChange={(e) => setViewName(e.target.value)} aria-label="Tên view" />
          {savedViews.length > 0 && (
            <ul className="space-y-1">
              {savedViews.map((v) => (
                <li key={v.id} className="flex items-center justify-between text-sm">
                  {v.name}
                  <IconButton label="Xóa view" onClick={() => void repo.deleteSavedView(v.id)}><X className="size-4" /></IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cx('rounded-full border px-3 py-1 text-sm', active ? 'border-accent bg-accent-soft text-accent' : 'border-border hover:bg-surface-2')}>
      {children}
    </button>
  );
}

function Pill({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">
      {children}
      <button type="button" aria-label="Bỏ lọc" onClick={onClear}><X className="size-3" /></button>
    </span>
  );
}
