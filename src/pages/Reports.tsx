import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileDown, FileSpreadsheet, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ChartCard, SimpleBars, TrendLine } from '../components/charts';
import { useToast } from '../components/feedback';
import { Button, Card, Input, ProgressBar, Segmented } from '../components/ui';
import { useWorkspace } from '../hooks/useWorkspace';
import { getDb } from '../lib/db';
import { downloadCsv, downloadExcel, readableProjectRow, readableTaskRow } from '../lib/exporter';
import { PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, TASK_STATUSES, TASK_STATUS_LABEL } from '../lib/labels';
import { isOverdue } from '../lib/logic';
import { entrySeconds } from '../lib/repo';
import { addDaysKey, daysBetween, formatDuration, toDateKey } from '../lib/utils';

type Preset = 'today' | 'week' | 'month' | 'custom';
type TimeGroup = 'project' | 'task' | 'day' | 'week' | 'month';

export function Reports() {
  const ws = useWorkspace();
  const toast = useToast();
  const [preset, setPreset] = useState<Preset>('week');
  const [from, setFrom] = useState(addDaysKey(ws.today, -29));
  const [to, setTo] = useState(ws.today);
  const [group, setGroup] = useState<TimeGroup>('project');
  const entries = useLiveQuery(async () => (await getDb().t('time_entries').toArray()).filter((e) => !e.deleted_at), []) ?? [];

  const now = new Date();
  const range = preset === 'today'
    ? [ws.today, ws.today]
    : preset === 'week'
      ? [toDateKey(startOfWeek(now, { weekStartsOn: 1 })), toDateKey(endOfWeek(now, { weekStartsOn: 1 }))]
      : preset === 'month'
        ? [toDateKey(startOfMonth(now)), toDateKey(endOfMonth(now))]
        : [from, to];
  const [rFrom, rTo] = range;
  const inRange = (iso: string | null) => {
    if (!iso) return false;
    const k = iso.length > 10 ? toDateKey(new Date(iso)) : iso;
    return k >= rFrom && k <= rTo;
  };

  const tasks = ws.tasks.filter((t) => !ws.projectsById.get(t.project_id)?.archived_at);
  const completed = tasks.filter((t) => t.status === 'done' && inRange(t.completed_at));
  const created = tasks.filter((t) => inRange(t.created_at));
  const overdue = tasks.filter((t) => isOverdue(t, ws.today));
  const rangeEntries = entries.filter((e) => inRange(e.started_at));
  const totalSeconds = rangeEntries.reduce((s, e) => s + entrySeconds(e), 0);
  const dayCount = Math.max(1, daysBetween(rFrom, rTo > ws.today ? ws.today : rTo) + 1);

  const trend = useMemo(() => {
    const n = Math.min(daysBetween(rFrom, rTo) + 1, 92);
    return Array.from({ length: n }, (_, i) => {
      const k = addDaysKey(rFrom, i);
      return {
        name: `${k.slice(8)}/${k.slice(5, 7)}`,
        'Hoàn thành': completed.filter((t) => toDateKey(new Date(t.completed_at!)) === k).length,
        'Giờ làm': Math.round(rangeEntries.filter((e) => toDateKey(new Date(e.started_at)) === k).reduce((s, e) => s + entrySeconds(e), 0) / 360) / 10,
      };
    });
  }, [rFrom, rTo, completed, rangeEntries]);

  const timeRows = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of rangeEntries) {
      const d = new Date(e.started_at);
      const key = group === 'project' ? ws.projectsById.get(e.project_id)?.name ?? '—'
        : group === 'task' ? (e.task_id ? ws.tasksById.get(e.task_id)?.title ?? '(task đã xóa)' : '(không gắn task)')
          : group === 'day' ? format(d, 'dd/MM/yyyy')
            : group === 'week' ? `Tuần ${format(startOfWeek(d, { weekStartsOn: 1 }), 'dd/MM')}`
              : format(d, 'MM/yyyy');
      map.set(key, (map.get(key) ?? 0) + entrySeconds(e));
    }
    return [...map.entries()].sort((a, b) => (group === 'project' || group === 'task' ? b[1] - a[1] : a[0].localeCompare(b[0])));
  }, [rangeEntries, group, ws]);

  const exportTasks = (kind: 'csv' | 'xlsx') => toast.run(async () => {
    const header = ['Task', 'Dự án', 'Trạng thái', 'Ưu tiên', 'Bắt đầu', 'Deadline', 'Tiến độ %', 'Tags', 'Hoàn thành lúc'];
    const rows = tasks.map((t) => readableTaskRow(t, ws.projectsById.get(t.project_id)?.name ?? '', ws.taskProgressOf(t), (ws.tagIdsByTask.get(t.id) ?? []).map((id) => ws.tagsById.get(id)?.name ?? '')));
    const projHeader = ['Dự án', 'Trạng thái', 'Ưu tiên', 'Bắt đầu', 'Deadline', 'Tiến độ %', 'Tổng task', 'Đã xong'];
    const projRows = ws.activeProjects.map((p) => {
      const pt = tasks.filter((t) => t.project_id === p.id);
      return readableProjectRow(p, ws.projectProgressOf(p), pt.length, pt.filter((t) => t.status === 'done').length);
    });
    const timeHeader = ['Nhóm', 'Giờ'];
    const timeData = timeRows.map(([k, s]) => [k, Math.round(s / 36) / 100]);
    const name = `bao-cao-${rFrom}_${rTo}`;
    if (kind === 'csv') downloadCsv([header, ...rows], `${name}-tasks.csv`);
    else await downloadExcel([
      { name: 'Tasks', header, rows },
      { name: 'Projects', header: projHeader, rows: projRows },
      { name: 'Time', header: timeHeader, rows: timeData },
    ], `${name}.xlsx`);
  });

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2 no-print">
        <h1 className="mr-auto hidden text-xl font-semibold md:block">Reports</h1>
        <Segmented size="sm" value={preset} onChange={setPreset} options={[
          { value: 'today', label: 'Hôm nay' }, { value: 'week', label: 'Tuần này' }, { value: 'month', label: 'Tháng này' }, { value: 'custom', label: 'Tùy chọn' },
        ]} />
        {preset === 'custom' && (
          <span className="flex items-center gap-1">
            <Input type="date" className="h-8 w-36" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Từ ngày" />
            –
            <Input type="date" className="h-8 w-36" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Đến ngày" />
          </span>
        )}
        <Button size="sm" icon={<FileDown className="size-4" />} onClick={() => void exportTasks('csv')}>CSV</Button>
        <Button size="sm" icon={<FileSpreadsheet className="size-4" />} onClick={() => void exportTasks('xlsx')}>Excel</Button>
        <Button size="sm" icon={<Printer className="size-4" />} onClick={() => window.print()}>PDF</Button>
      </div>
      <p className="text-sm text-muted">Khoảng thời gian: {rFrom.split('-').reverse().join('/')} – {rTo.split('-').reverse().join('/')}</p>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Kpi label="Task hoàn thành" value={completed.length} />
        <Kpi label="Task tạo mới" value={created.length} />
        <Kpi label="Đang quá hạn" value={overdue.length} tone={overdue.length ? 'text-danger' : undefined} />
        <Kpi label="Năng suất" value={`${(completed.length / dayCount).toFixed(1)}`} sub="task / ngày" />
        <Kpi label="Thời gian làm" value={formatDuration(totalSeconds)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Task hoàn thành theo ngày">
          <TrendLine data={trend} lines={[{ key: 'Hoàn thành', label: 'Hoàn thành', color: '#16a34a' }]} />
        </ChartCard>
        <ChartCard title="Giờ làm theo ngày">
          <TrendLine data={trend} lines={[{ key: 'Giờ làm', label: 'Giờ', color: '#4f46e5' }]} />
        </ChartCard>
        <ChartCard title="Phân bố mức ưu tiên (task chưa xong)">
          <SimpleBars data={PRIORITIES.map((p) => ({ name: PRIORITY_LABEL[p], value: tasks.filter((t) => t.status !== 'done' && t.priority === p).length, color: PRIORITY_COLOR[p] }))} />
        </ChartCard>
        <ChartCard title="Phân bố trạng thái">
          <SimpleBars data={TASK_STATUSES.map((s) => ({ name: TASK_STATUS_LABEL[s], value: tasks.filter((t) => t.status === s).length, color: STATUS_COLOR[s] }))} />
        </ChartCard>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Tiến độ dự án</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="pb-2 font-medium">Dự án</th><th className="pb-2 font-medium">Task</th><th className="w-40 pb-2 font-medium">Tiến độ</th></tr></thead>
            <tbody>
              {ws.activeProjects.map((p) => {
                const pt = tasks.filter((t) => t.project_id === p.id);
                const prog = ws.projectProgressOf(p);
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2 pr-2">{p.name}</td>
                    <td className="py-2 pr-2 text-muted tabular-nums">{pt.filter((t) => t.status === 'done').length}/{pt.length}</td>
                    <td className="py-2"><div className="flex items-center gap-2"><ProgressBar value={prog} /><span className="w-9 text-right text-xs tabular-nums">{prog}%</span></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Thời gian làm việc</h3>
            <Segmented size="sm" value={group} onChange={setGroup} options={[
              { value: 'project', label: 'Dự án' }, { value: 'task', label: 'Task' }, { value: 'day', label: 'Ngày' }, { value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng' },
            ]} />
          </div>
          {timeRows.length === 0 ? <p className="py-6 text-center text-sm text-muted">Chưa có dữ liệu bấm giờ trong khoảng này.</p> : (
            <table className="w-full text-sm">
              <tbody>
                {timeRows.map(([k, s]) => (
                  <tr key={k} className="border-t border-border first:border-0">
                    <td className="py-2 pr-2">{k}</td>
                    <td className="py-2 text-right tabular-nums">{formatDuration(s)}</td>
                    <td className="w-28 py-2 pl-3"><ProgressBar value={(s / Math.max(...timeRows.map((r) => r[1]))) * 100} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <Card className="p-3">
      <p className={`text-2xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
      <p className="text-xs text-muted">{label}{sub ? ` · ${sub}` : ''}</p>
    </Card>
  );
}
