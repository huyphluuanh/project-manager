import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Database, FolderKanban, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChartCard, SimpleBars, StackedBars, TrendLine } from '../components/charts';
import { useToast } from '../components/feedback';
import { TaskRow } from '../components/task/TaskItem';
import { Button, Card, EmptyState, ProgressBar, Select } from '../components/ui';
import { useUI } from '../hooks/useUI';
import { useWorkspace } from '../hooks/useWorkspace';
import { getDb } from '../lib/db';
import { loadDemoData } from '../lib/demo';
import {
  PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, TASK_STATUSES, TASK_STATUS_LABEL,
} from '../lib/labels';
import { isDueToday, isDueWithin, isOverdue, sortTasks } from '../lib/logic';
import { entrySeconds } from '../lib/repo';
import type { Priority, TaskStatus } from '../lib/types';
import { addDaysKey, cx, toDateKey } from '../lib/utils';

type Range = 'all' | '7' | '30' | '90';

export function Dashboard() {
  const ws = useWorkspace();
  const ui = useUI();
  const toast = useToast();
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState('');
  const [range, setRange] = useState<Range>('30');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [assignee, setAssignee] = useState('');
  const [loadingDemo, setLoadingDemo] = useState(false);

  const timeEntries = useLiveQuery(async () => (await getDb().t('time_entries').toArray()).filter((e) => !e.deleted_at), []) ?? [];

  const since = range === 'all' ? null : addDaysKey(ws.today, -Number(range) + 1);
  const projects = ws.activeProjects.filter((p) => !projectId || p.id === projectId);
  const tasks = useMemo(() => ws.tasks.filter((t) => {
    const p = ws.projectsById.get(t.project_id);
    if (!p || p.archived_at) return false;
    if (projectId && t.project_id !== projectId) return false;
    if (status && t.status !== status) return false;
    if (priority && t.priority !== priority) return false;
    if (assignee && t.assignee_id !== assignee) return false;
    if (since) {
      const touched = [t.created_at.slice(0, 10), t.due_date, t.completed_at?.slice(0, 10)].some((d) => d && d >= since);
      const open = t.status !== 'done';
      if (!touched && !open) return false;
    }
    return true;
  }), [ws, projectId, status, priority, assignee, since]);

  if (ws.projects.length === 0) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <EmptyState
          icon={<FolderKanban className="size-12" />}
          title="Chào mừng bạn!"
          description="Bắt đầu bằng việc tạo dự án đầu tiên, hoặc tải dữ liệu mẫu để xem Dashboard hoạt động thế nào."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => ui.openProjectForm()}>Tạo dự án</Button>
              <Button icon={<Database className="size-4" />} loading={loadingDemo} onClick={async () => {
                setLoadingDemo(true);
                const id = await toast.run(loadDemoData, 'Đã tải dữ liệu mẫu');
                setLoadingDemo(false);
                if (id) navigate('/');
              }}>Load Demo Data</Button>
            </div>
          }
        />
      </div>
    );
  }

  const open = tasks.filter((t) => t.status !== 'done');
  const overdue = tasks.filter((t) => isOverdue(t, ws.today));
  const kpis = [
    { label: 'Tổng dự án', value: projects.length, to: '/projects' },
    { label: 'Dự án đang chạy', value: projects.filter((p) => ['planning', 'in_progress', 'on_hold'].includes(p.status)).length, to: '/projects' },
    { label: 'Dự án hoàn thành', value: projects.filter((p) => p.status === 'completed').length, to: '/projects' },
    { label: 'Tổng task', value: tasks.length, to: '/tasks' },
    { label: 'Task chưa xong', value: open.length, to: '/tasks' },
    { label: 'Quá hạn', value: overdue.length, tone: overdue.length ? 'danger' : undefined, to: '/tasks?due=overdue' },
    { label: 'Đến hạn hôm nay', value: tasks.filter((t) => isDueToday(t, ws.today)).length, tone: 'warn', to: '/my-day' },
    { label: 'Đến hạn 7 ngày', value: tasks.filter((t) => isDueWithin(t, 7, ws.today)).length, to: '/tasks?due=week' },
    { label: 'Critical / High', value: open.filter((t) => t.priority === 'critical' || t.priority === 'high').length, to: '/tasks' },
  ];

  // Hoàn thành theo ngày
  const days = Number(range === 'all' ? 30 : range);
  const trend = Array.from({ length: days }, (_, i) => {
    const key = addDaysKey(ws.today, i - days + 1);
    return {
      name: key.slice(8, 10) + '/' + key.slice(5, 7),
      'Hoàn thành': tasks.filter((t) => t.completed_at && toDateKey(new Date(t.completed_at)) === key).length,
      'Tạo mới': tasks.filter((t) => toDateKey(new Date(t.created_at)) === key).length,
    };
  });

  const workload = projects
    .map((p) => {
      const row: Record<string, string | number> = { name: p.name.length > 16 ? p.name.slice(0, 15) + '…' : p.name };
      for (const pr of PRIORITIES) row[pr] = open.filter((t) => t.project_id === p.id && t.priority === pr).length;
      return row;
    })
    .filter((r) => PRIORITIES.some((pr) => Number(r[pr]) > 0));

  const timeByProject = projects
    .map((p) => ({
      name: p.name.length > 16 ? p.name.slice(0, 15) + '…' : p.name,
      value: Math.round(timeEntries.filter((e) => e.project_id === p.id && (!since || e.started_at.slice(0, 10) >= since)).reduce((s, e) => s + entrySeconds(e), 0) / 360) / 10,
      color: p.color ?? undefined,
    }))
    .filter((x) => x.value > 0);

  const ctx = { projectsById: ws.projectsById, blocksCount: ws.blocksCount, blockedIds: ws.blockedIds };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto hidden text-xl font-semibold md:block">Dashboard</h1>
        <Select aria-label="Lọc dự án" className="h-9 w-auto" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Tất cả dự án</option>
          {ws.activeProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select aria-label="Khoảng thời gian" className="h-9 w-auto" value={range} onChange={(e) => setRange(e.target.value as Range)}>
          <option value="7">7 ngày</option>
          <option value="30">30 ngày</option>
          <option value="90">90 ngày</option>
          <option value="all">Tất cả</option>
        </Select>
        <Select aria-label="Trạng thái" className="h-9 w-auto" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | '')}>
          <option value="">Mọi trạng thái</option>
          {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
        </Select>
        <Select aria-label="Ưu tiên" className="h-9 w-auto" value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')}>
          <option value="">Mọi ưu tiên</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </Select>
        {ws.profiles.length > 1 && (
          <Select aria-label="Người phụ trách" className="h-9 w-auto" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Mọi người</option>
            {ws.profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </Select>
        )}
      </div>

      {/* KPI trước, biểu đồ sau (ưu tiên mobile) */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 lg:grid-cols-9">
        {kpis.map((k) => (
          <Link key={k.label} to={k.to} className="rounded-xl border border-border bg-surface p-3 hover:border-accent">
            <p className={cx('text-2xl font-semibold tabular-nums', k.tone === 'danger' && 'text-danger', k.tone === 'warn' && k.value > 0 && 'text-warn')}>{k.value}</p>
            <p className="text-xs leading-tight text-muted">{k.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="px-4 pt-4"><h3 className="text-sm font-semibold">Tiến độ dự án</h3></div>
          <ul className="divide-y divide-border p-2">
            {projects.filter((p) => !['completed', 'cancelled'].includes(p.status)).slice(0, 8).map((p) => {
              const prog = ws.projectProgressOf(p);
              const risk = ws.projectRiskOf(p);
              return (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`} className="block rounded-lg px-2 py-2.5 hover:bg-surface-2">
                    <div className="mb-1.5 flex items-center gap-2 text-sm">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color ?? 'var(--accent)' }} />
                      <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                      {risk.level !== 'none' && (
                        <span className={cx('inline-flex items-center gap-1 text-xs', risk.level === 'high' ? 'text-danger' : 'text-warn')} title={risk.reasons.join('\n')}>
                          <AlertTriangle className="size-3.5" /> {risk.level === 'high' ? 'Nguy cơ trễ' : 'Cần chú ý'}
                        </span>
                      )}
                      <span className="w-10 text-right text-xs text-muted tabular-nums">{prog}%</span>
                    </div>
                    <ProgressBar value={prog} tone={risk.level === 'high' ? 'danger' : risk.level === 'medium' ? 'warn' : 'accent'} />
                    {risk.level !== 'none' && <p className="mt-1 text-xs text-muted">{risk.reasons[0]}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <div className="flex items-center justify-between px-4 pt-4">
            <h3 className="text-sm font-semibold">Quá hạn</h3>
            <span className="text-xs text-muted">{overdue.length}</span>
          </div>
          <div className="p-2">
            {overdue.length === 0 ? <p className="px-2 py-6 text-center text-sm text-muted">Không có task quá hạn 🎉</p> :
              sortTasks(overdue, 'score', 'asc', ctx).slice(0, 6).map((t) => <TaskRow key={t.id} task={t} />)}
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <div className="px-4 pt-4"><h3 className="text-sm font-semibold">Milestone sắp tới</h3></div>
          <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
            {ws.milestones
              .filter((m) => !m.is_done && projects.some((p) => p.id === m.project_id))
              .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
              .slice(0, 4)
              .map((m) => {
                const p = ws.projectsById.get(m.project_id)!;
                const prog = ws.projectProgressOf(p);
                const late = m.due_date && m.due_date < ws.today;
                return (
                  <Link key={m.id} to={`/projects/${p.id}`} className="rounded-lg border border-border p-3 hover:border-accent">
                    <p className="truncate text-sm font-medium">🏁 {m.title}</p>
                    <p className="truncate text-xs text-muted">{p.name}</p>
                    <p className={cx('mt-1 text-xs', late ? 'text-danger' : 'text-muted')}>
                      {m.due_date ? (late ? `Trễ từ ${m.due_date.slice(8)}/${m.due_date.slice(5, 7)}` : `Hạn ${m.due_date.slice(8)}/${m.due_date.slice(5, 7)}`) : 'Chưa đặt ngày'} · dự án {prog}%
                    </p>
                    <ProgressBar value={prog} className="mt-2" tone={late ? 'danger' : 'accent'} />
                  </Link>
                );
              })}
            {!ws.milestones.some((m) => !m.is_done) && <p className="col-span-full py-4 text-center text-sm text-muted">Chưa có milestone. Thêm trong trang dự án.</p>}
          </div>
        </Card>

        <ChartCard title="Task theo trạng thái">
          <SimpleBars data={TASK_STATUSES.map((s) => ({ name: TASK_STATUS_LABEL[s], value: tasks.filter((t) => t.status === s).length, color: STATUS_COLOR[s] }))} />
        </ChartCard>
        <ChartCard title="Task chưa xong theo ưu tiên">
          <SimpleBars data={PRIORITIES.map((p) => ({ name: PRIORITY_LABEL[p], value: open.filter((t) => t.priority === p).length, color: PRIORITY_COLOR[p] }))} />
        </ChartCard>
        <ChartCard title="Thời gian theo dự án (giờ)">
          <SimpleBars horizontal data={timeByProject} unit="h" />
        </ChartCard>
        <ChartCard title="Hoàn thành theo thời gian" className="lg:col-span-2">
          <TrendLine data={trend} lines={[{ key: 'Hoàn thành', label: 'Hoàn thành', color: '#16a34a' }, { key: 'Tạo mới', label: 'Tạo mới', color: '#94a3b8' }]} />
        </ChartCard>
        <ChartCard title="Workload theo dự án (task mở)">
          <StackedBars data={workload} keys={PRIORITIES.map((p) => ({ key: p, label: PRIORITY_LABEL[p], color: PRIORITY_COLOR[p] }))} />
        </ChartCard>
      </div>
    </div>
  );
}
