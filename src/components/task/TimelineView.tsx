import { useMemo, useState } from 'react';
import { useUI } from '../../hooks/useUI';
import { useWorkspace } from '../../hooks/useWorkspace';
import { PRIORITY_COLOR } from '../../lib/labels';
import type { Task } from '../../lib/types';
import { addDaysKey, cx, daysBetween } from '../../lib/utils';
import { Segmented } from '../ui';

const ROW = 36;
const LABEL_W = 220;

/** Timeline / Gantt: thanh từ ngày bắt đầu -> deadline, tiến độ, mũi tên phụ thuộc */
export function TimelineView({ tasks }: { tasks: Task[] }) {
  const ws = useWorkspace();
  const { openTask } = useUI();
  const [zoom, setZoom] = useState<'day' | 'week'>('day');
  const dayW = zoom === 'day' ? 32 : 12;

  const dated = useMemo(() => tasks
    .filter((t) => t.due_date || t.start_date)
    .map((t) => {
      const start = t.start_date ?? t.due_date!;
      const end = t.due_date && t.due_date >= start ? t.due_date : start;
      return { t, start, end };
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end)), [tasks]);
  const undated = tasks.filter((t) => !t.due_date && !t.start_date);

  if (!dated.length) {
    return <p className="p-6 text-center text-sm text-muted">Chưa có task nào có ngày bắt đầu hoặc deadline để hiển thị timeline.</p>;
  }

  const min = dated.reduce((m, x) => (x.start < m ? x.start : m), ws.today);
  const max = dated.reduce((m, x) => (x.end > m ? x.end : m), ws.today);
  const from = addDaysKey(min, -2);
  const totalDays = daysBetween(from, max) + 4;
  const width = totalDays * dayW;
  const rowIndex = new Map(dated.map((x, i) => [x.t.id, i]));
  const x0 = (key: string) => daysBetween(from, key) * dayW;
  const todayX = x0(ws.today) + dayW / 2;

  const arrows = ws.deps
    .filter((d) => d.type === 'blocked_by' && rowIndex.has(d.task_id) && rowIndex.has(d.depends_on_task_id))
    .map((d) => {
      const a = dated[rowIndex.get(d.depends_on_task_id)!];
      const b = dated[rowIndex.get(d.task_id)!];
      const ax = x0(a.end) + dayW;
      const ay = rowIndex.get(d.depends_on_task_id)! * ROW + ROW / 2;
      const bx = x0(b.start);
      const by = rowIndex.get(d.task_id)! * ROW + ROW / 2;
      const late = b.start <= a.end;
      return { id: d.id, path: `M${ax},${ay} C${ax + 16},${ay} ${bx - 16},${by} ${bx - 2},${by}`, late };
    });

  const months: { label: string; x: number }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const k = addDaysKey(from, i);
    if (i === 0 || k.endsWith('-01')) months.push({ label: `${k.slice(5, 7)}/${k.slice(0, 4)}`, x: i * dayW });
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Segmented size="sm" value={zoom} onChange={setZoom} options={[{ value: 'day', label: 'Ngày' }, { value: 'week', label: 'Tuần' }]} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface scrollbar-thin">
        <div className="flex" style={{ width: LABEL_W + width }}>
          {/* Cột tên task */}
          <div className="sticky left-0 z-10 shrink-0 border-r border-border bg-surface" style={{ width: LABEL_W }}>
            <div className="h-12 border-b border-border px-3 py-2 text-xs font-medium text-muted">Task</div>
            {dated.map(({ t }) => (
              <button key={t.id} type="button" onClick={() => openTask(t.id)} style={{ height: ROW }}
                className="flex w-full items-center gap-2 truncate border-b border-border px-3 text-left text-sm hover:bg-surface-2">
                <span className="size-2 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[t.priority] }} />
                <span className={cx('truncate', t.status === 'done' && 'text-muted line-through')}>{t.title}</span>
              </button>
            ))}
          </div>
          {/* Lưới thời gian */}
          <div className="relative" style={{ width }}>
            <div className="relative h-12 border-b border-border">
              {months.map((m) => <span key={m.x} className="absolute top-1 text-xs font-medium text-muted" style={{ left: m.x + 4 }}>{m.label}</span>)}
              {Array.from({ length: totalDays }, (_, i) => {
                const k = addDaysKey(from, i);
                const show = zoom === 'day' || new Date(k + 'T00:00:00').getDay() === 1;
                return show ? (
                  <span key={k} className={cx('absolute bottom-1 text-center text-[10px]', k === ws.today ? 'font-bold text-accent' : 'text-muted')}
                    style={{ left: i * dayW, width: zoom === 'day' ? dayW : dayW * 7 }}>{k.slice(8)}</span>
                ) : null;
              })}
            </div>
            <div className="relative" style={{ height: dated.length * ROW }}>
              {Array.from({ length: totalDays }, (_, i) => {
                const k = addDaysKey(from, i);
                const wd = new Date(k + 'T00:00:00').getDay();
                return (wd === 0 || wd === 6) && zoom === 'day'
                  ? <div key={k} className="absolute inset-y-0 bg-surface-2" style={{ left: i * dayW, width: dayW }} />
                  : null;
              })}
              {dated.map((_, i) => <div key={i} className="absolute inset-x-0 border-b border-border" style={{ top: (i + 1) * ROW - 1 }} />)}
              <div className="absolute inset-y-0 w-0.5 bg-accent/60" style={{ left: todayX }} title="Hôm nay" />
              <svg className="pointer-events-none absolute inset-0" width={width} height={dated.length * ROW} aria-hidden>
                <defs>
                  <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="var(--muted)" /></marker>
                  <marker id="arrow-late" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="var(--danger)" /></marker>
                </defs>
                {arrows.map((a) => (
                  <path key={a.id} d={a.path} fill="none" stroke={a.late ? 'var(--danger)' : 'var(--muted)'} strokeWidth={1.5} markerEnd={`url(#${a.late ? 'arrow-late' : 'arrow'})`} />
                ))}
              </svg>
              {dated.map(({ t, start, end }, i) => {
                const left = x0(start);
                const w = Math.max((daysBetween(start, end) + 1) * dayW - 4, 8);
                const prog = ws.taskProgressOf(t);
                const overdue = t.status !== 'done' && end < ws.today;
                return (
                  <button key={t.id} type="button" onClick={() => openTask(t.id)}
                    title={`${t.title}\n${start} → ${end} · ${daysBetween(start, end) + 1} ngày · ${prog}%`}
                    className={cx('absolute overflow-hidden rounded-md border text-left text-[11px] text-white', overdue ? 'border-danger' : 'border-transparent')}
                    style={{ left: left + 2, top: i * ROW + 7, width: w, height: ROW - 14, background: t.status === 'done' ? '#16a34a99' : `${PRIORITY_COLOR[t.priority]}66` }}>
                    <span className="absolute inset-y-0 left-0" style={{ width: `${prog}%`, background: t.status === 'done' ? '#16a34a' : PRIORITY_COLOR[t.priority] }} />
                    {zoom === 'day' && w > 60 && <span className="relative px-1.5 leading-[22px] font-medium">{prog}%</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {undated.length > 0 && <p className="mt-2 text-xs text-muted">{undated.length} task chưa có ngày không hiển thị trên timeline.</p>}
    </div>
  );
}
