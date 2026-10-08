import type { ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card } from './ui';

const axis = { fill: 'var(--muted)', fontSize: 12 };
const tooltipStyle = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--fg)' },
  labelStyle: { color: 'var(--fg)' },
  cursor: { fill: 'var(--surface-2)' },
};

export function ChartCard({ title, children, right, className }: { title: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {right}
      </div>
      <div className="p-2 pt-3">{children}</div>
    </Card>
  );
}

export function SimpleBars({ data, height = 220, horizontal = false, unit }: {
  data: { name: string; value: number; color?: string }[]; height?: number; horizontal?: boolean; unit?: string;
}) {
  if (!data.some((d) => d.value > 0)) return <Empty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ left: horizontal ? 8 : -16, right: 12, top: 4, bottom: 4 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={axis} allowDecimals={false} unit={unit} />
            <YAxis type="category" dataKey="name" tick={axis} width={110} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={axis} interval={0} />
            <YAxis tick={axis} allowDecimals={false} unit={unit} />
          </>
        )}
        <Tooltip {...tooltipStyle} formatter={(v) => [`${v}${unit ?? ''}`, '']} />
        <Bar dataKey="value" radius={4} maxBarSize={36}>
          {data.map((d) => <Cell key={d.name} fill={d.color ?? 'var(--accent)'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StackedBars({ data, keys, height = 240 }: {
  data: Record<string, string | number>[]; keys: { key: string; label: string; color: string }[]; height?: number;
}) {
  if (!data.length) return <Empty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={axis} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={axis} width={110} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {keys.map((k) => <Bar key={k.key} dataKey={k.key} name={k.label} stackId="a" fill={k.color} maxBarSize={28} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLine({ data, height = 220, lines }: {
  data: Record<string, string | number>[]; height?: number; lines: { key: string; label: string; color: string }[];
}) {
  if (!data.length) return <Empty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -16, right: 12, top: 4, bottom: 4 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={axis} minTickGap={16} />
        <YAxis tick={axis} allowDecimals={false} />
        <Tooltip {...tooltipStyle} />
        {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {lines.map((l) => <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={2} dot={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

function Empty({ height }: { height: number }) {
  return <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>Chưa có dữ liệu</div>;
}
