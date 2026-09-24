'use client';

/**
 * Recharts-backed chart bodies for the owner dashboard, split into their own
 * module so `recharts` (a heavy dependency) is code-split out of the dashboard
 * page's initial bundle and only loaded when the charts actually render. The
 * dashboard imports these via `next/dynamic({ ssr: false })`.
 *
 * These are pure presentational components — all data + theme come in as props,
 * so behavior is identical to the previous inline charts.
 */
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const tooltipStyle = (isDark: boolean, border?: string) => ({
  background: isDark ? 'rgba(20,20,20,0.95)' : 'rgba(255,255,255,0.95)',
  backdropFilter: 'blur(8px)',
  border: border ?? (isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)'),
  borderRadius: 10,
  color: isDark ? '#f0f0f0' : '#1a1a1a',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
});

export function SalesOverviewChart({ data, isDark }: { data: { label: string; total: number }[]; isDark: boolean }) {
  // Amber in both themes (brighter tone in dark so it pops on black).
  const lineColor = isDark ? '#fbbf24' : '#f59e0b';
  return (
    <ResponsiveContainer width="100%" height={288}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        {/* Amber line + gradient fill in both themes. Softer gridlines keep the
            focus on the trend. */}
        <defs>
          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={lineColor} stopOpacity={0.35} />
            <stop offset="55%" stopColor={lineColor} stopOpacity={0.1} />
            <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: isDark ? '#8b8b8b' : '#888888' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: isDark ? '#8b8b8b' : '#888888' }} tickFormatter={(n: any) => peso(Number(n))} width={70} axisLine={false} tickLine={false} />
        <Tooltip formatter={(val: any) => peso(Number(val))} contentStyle={tooltipStyle(isDark)} cursor={{ stroke: lineColor, strokeWidth: 1, strokeDasharray: '4 4' }} />
        <Area type="monotone" dataKey="total" stroke={lineColor} fill="url(#salesGrad)" strokeWidth={2.5} name="Sales" dot={false} activeDot={{ r: 5, fill: lineColor, stroke: isDark ? '#0f0f0f' : '#ffffff', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TopProductsDonut({ data, colors, isDark }: { data: { name: string; revenue: number }[]; colors: string[]; isDark: boolean }) {
  return (
    <ResponsiveContainer width={260} height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={70}
          outerRadius={110}
          dataKey="revenue"
          nameKey="name"
          strokeWidth={2}
          stroke={isDark ? '#0f0f0f' : '#ffffff'}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(val: any) => peso(Number(val))} contentStyle={tooltipStyle(isDark)} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function DisposedBarChart({ data, height, colors, isDark }: { data: { name: string; quantity: number }[]; height: number; colors?: string[]; isDark: boolean }) {
  // Each bar gets its own color from the palette (was a single flat color), so
  // products are easy to tell apart. Falls back to a sensible default palette.
  const palette = colors && colors.length
    ? colors
    : isDark
      ? ['#fbbf24', '#60a5fa', '#a78bfa', '#22d3ee', '#f472b6', '#f87171', '#e879f9', '#fb923c']
      : ['#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4', '#ec4899', '#ef4444', '#d946ef', '#f97316'];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: isDark ? '#8b8b8b' : '#888888' }} allowDecimals={false} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: isDark ? '#b5b5b5' : '#555555' }} width={140} axisLine={false} tickLine={false} />
        <Tooltip formatter={(val: any) => [`${val} units`, 'Disposed']} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} contentStyle={tooltipStyle(isDark)} />
        <Bar dataKey="quantity" radius={[0, 4, 4, 0]} name="Disposed">
          {data.map((_, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
