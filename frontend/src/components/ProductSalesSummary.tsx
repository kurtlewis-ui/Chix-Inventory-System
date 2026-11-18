'use client';

import { useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { api, getApiErrorMessage } from '@/lib/api';
import { useBranches } from '@/lib/hooks';
import { useThemeStore } from '@/lib/theme';
import { msUntilNextBusinessDay, phQuickRangeDates, type QuickRange } from '@/lib/business-day';
import { Select } from './Select';

const Donut = dynamic(() => import('./DashboardCharts').then(m => m.TopProductsDonut), { ssr: false });
const Bars = dynamic(() => import('./DashboardCharts').then(m => m.DisposedBarChart), { ssr: false });
const colors = ['#f87171', '#fb923c', '#fbbf24', '#4ade80', '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#e879f9', '#2dd4bf'];
type Row = { key: string; name: string; brand: string; quantity: number; revenue: number; capital: number };
type Report = { rows: Row[]; top: Row[]; totals: { products: number; quantity: number; revenue: number; capital: number };
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } };
const money = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Owner-only report: the API aggregates all matching records before pagination. */
export function ProductSalesSummary({ kind }: { kind: 'sales' | 'disposals' }) {
  const sales = kind === 'sales';
  const title = sales ? 'Product Sales Summary' : 'Most Disposed Products';
  const isDark = useThemeStore(s => s.contentTheme === 'dark');
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState('');
  const [period, setPeriod] = useState<QuickRange | 'custom'>('all');
  const [dates, setDates] = useState({ start: '', end: '' });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<{ key: string; name: string } | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(sales ? 10 : 20);
  const [expanded, setExpanded] = useState(!sales);
  const tableId = useId();
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (period === 'custom' || period === 'all') return;
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      clearTimeout(timer);
      setDates(phQuickRangeDates(period));
      setPage(1);
      timer = setTimeout(sync, msUntilNextBusinessDay());
    };
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    sync();
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [period]);
  const invalidDates = period === 'custom' && (!dates.start || !dates.end)
    ? 'Choose both From and To dates.'
    : dates.start && dates.end && dates.start > dates.end ? 'From date must be on or before To date.' : '';
  const params = { branchId: branchId || undefined, startDate: dates.start || undefined,
    endDate: dates.end || undefined, search: debouncedSearch || undefined, productKey: selected?.key, page, limit };
  const report = useQuery({ queryKey: ['stats', `product-${kind}`, params],
    queryFn: async () => (await api.get<{ data: Report }>(`/stats/product-${kind}`, { params })).data.data,
    enabled: !invalidDates, placeholderData: previous => previous, staleTime: 30_000 });
  const data = report.data;
  const chooseProduct = (row: Row) => { setSelected({ key: row.key, name: row.name }); setPage(1); };
  function choosePeriod(value: string) {
    const next = value as QuickRange | 'custom';
    setPeriod(next); setPage(1);
    setDates(next === 'custom' ? { start: '', end: '' } : phQuickRangeDates(next));
  }

  return <section aria-label={title} className="min-w-0 rounded-xl border border-card-border bg-card-bg p-4 shadow-sm sm:p-6">
    <h2 className="mb-2 text-lg font-bold text-text-primary">{title}</h2>
    <p className="mb-4 text-xs text-text-secondary">Approved {sales ? 'sales' : 'disposals'} only · Philippine business dates · Each section has its own filters.</p>
    <div className="mb-4 grid items-end grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Select ariaLabel={`${title} period`} value={period} onChange={choosePeriod} options={[
        { value: 'today', label: 'Daily — Today' }, { value: 'week', label: 'Weekly — This Week' },
        { value: 'month', label: 'Monthly — This Month' }, { value: 'year', label: 'Yearly — This Year' },
        { value: 'all', label: 'All Time' }, { value: 'custom', label: 'Custom Range' },
      ]} />
      <Select ariaLabel={`${title} shop`} value={branchId} onChange={v => { setBranchId(v); setPage(1); }} options={[
        { value: '', label: 'All Shops' }, ...(branches?.data ?? []).map(b => ({ value: b.id, label: b.name })),
      ]} />
      <label className="min-w-0 text-xs text-text-secondary">From
        <input aria-label={`${title} from`} type="date" value={dates.start} onChange={e => { setPeriod('custom'); setDates(d => ({ ...d, start: e.target.value })); setPage(1); }} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-input-border bg-input-bg px-3 text-sm text-text-primary" />
      </label>
      <label className="min-w-0 text-xs text-text-secondary">To
        <input aria-label={`${title} to`} type="date" value={dates.end} onChange={e => { setPeriod('custom'); setDates(d => ({ ...d, end: e.target.value })); setPage(1); }} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-input-border bg-input-bg px-3 text-sm text-text-primary" />
      </label>
    </div>
    {invalidDates ? <p role="status" className="py-6 text-sm text-accent-orange">{invalidDates}</p>
      : report.isError ? <div role="alert" className="py-4 text-sm text-accent-red">{getApiErrorMessage(report.error)} <button className="underline" onClick={() => report.refetch()}>Retry</button></div>
      : report.isLoading || !data ? <p role="status" className="py-6 text-sm text-text-muted">Loading report…</p>
      : <>
        {data.top.length > 0 ? <>
          <h3 className="mb-3 text-sm font-semibold text-text-primary">{sales ? 'Top 10 by Quantity Sold' : 'Top 10 by Quantity Disposed'}</h3>
          {sales ? <div className="mb-6 flex min-w-0 flex-col items-center gap-4 lg:flex-row">
            <div className="w-full max-w-[260px] shrink-0"><Donut data={data.top} colors={colors} isDark={isDark} valueKey="quantity" /></div>
            <ul className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">{data.top.map((r, i) => <li key={r.key} className="flex min-w-0 items-start gap-2"><span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: colors[i] }} /><div className="min-w-0"><button className="break-words text-left text-sm font-medium text-text-primary hover:underline" onClick={() => chooseProduct(r)} aria-label={`Show only ${r.name}`}>{r.name}</button><p className="text-xs text-text-secondary">{r.quantity.toLocaleString()} units · {money(r.revenue)}</p></div></li>)}</ul>
          </div> : <div className="mb-5 overflow-hidden"><Bars data={data.top} height={Math.max(240, data.top.length * 40)} colors={colors} isDark={isDark} /></div>}
        </> : <p className="py-6 text-sm text-text-muted">No approved {sales ? 'sales' : 'disposals'} match these filters.</p>}
        <div className="mb-4 flex flex-wrap items-center gap-3">
      <input type="search" aria-label={`${title} search`} placeholder="Search products or brands…" value={search} onChange={e => { setSearch(e.target.value); setSelected(null); setPage(1); }} className="min-h-11 w-full rounded-lg border border-input-border bg-input-bg px-3 text-sm text-text-primary sm:max-w-sm" />
      {selected && <button onClick={() => { setSelected(null); setPage(1); }} className="btn-secondary max-w-full break-words text-xs" aria-label={`Clear product filter for ${selected.name}`}>{selected.name} · Clear filter</button>}
    </div>
        <div className={`mb-5 grid grid-cols-2 gap-3 ${sales ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`} aria-label={`${title} totals`}>
          {[
            ['Matching Products', data.totals.products.toLocaleString()],
            [sales ? 'Total Quantity Sold' : 'Total Quantity Disposed', data.totals.quantity.toLocaleString()],
            ...(sales ? [['Sales Revenue', money(data.totals.revenue)]] : []),
            [sales ? 'Total Capital' : 'Total Value Lost', money(data.totals.capital)],
          ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-surface-muted p-3"><p className="text-xs text-text-secondary">{label}</p><p className="mt-1 break-words text-lg font-bold tabular-nums text-text-primary">{value}</p></div>)}
        </div>
        <p className="mb-4 text-xs text-text-muted">Totals cover every matching product and page. {sales && 'Revenue is after discounts. Capital uses each sale’s saved unit cost × quantity.'}</p>
        {data.top.length > 0 && <>
          {sales && <button type="button" aria-expanded={expanded} aria-controls={tableId} onClick={() => setExpanded(v => !v)} className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-card-border bg-surface-muted px-3 py-2 text-left text-sm font-semibold text-text-primary hover:opacity-80">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {expanded ? 'Show Less' : 'Show All Products (' + data.totals.products.toLocaleString() + ')'}
          </button>}
          {expanded && <div id={tableId} className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">All Matching Products</h3>
          <p className="mb-3 text-xs text-text-muted">Click a product name to show only that product. Products without approved {sales ? 'sales' : 'disposals'} in this period are excluded.</p>
          <div className="mb-3 flex items-center gap-2 text-xs text-text-secondary"><span>Rows</span><div className="w-24 shrink-0"><Select ariaLabel={title + ' rows per page'} value={String(limit)} onChange={v => { setLimit(Number(v)); setPage(1); }} className="w-24" options={(sales ? [10, 50, 100, 0] : [20, 50, 100]).map(n => ({ value: String(n), label: n === 0 ? 'All' : String(n) }))} /></div></div>
          <p className="mb-2 text-xs text-text-muted sm:hidden">Swipe the table to see all columns.</p>
          <div className="overflow-x-auto rounded-lg border border-card-border">
            <table className="w-full min-w-[660px] text-left text-sm" aria-label={`${title} table`}>
              <thead className="bg-table-header text-xs uppercase text-table-header-text"><tr>{['#', 'Product', 'Brand', sales ? 'Qty Sold' : 'Qty Disposed', ...(sales ? ['Sales Revenue'] : []), sales ? 'Total Capital' : 'Value Lost'].map(h => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
              <tbody>{data.rows.map((r, i) => <tr key={r.key} className="border-t border-card-border"><td className="px-3 py-3 text-text-muted">{(page - 1) * limit + i + 1}</td><td className="px-3 py-3"><button className="text-left font-medium text-text-primary hover:underline" onClick={() => chooseProduct(r)}>{r.name}</button></td><td className="px-3 py-3 text-text-secondary">{r.brand}</td><td className="px-3 py-3 tabular-nums text-text-primary">{r.quantity.toLocaleString()}</td>{sales && <td className="px-3 py-3 tabular-nums text-accent-green">{money(r.revenue)}</td>}<td className="px-3 py-3 tabular-nums text-text-primary">{money(r.capital)}</td></tr>)}</tbody>
            </table>
          </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-text-secondary">
          <p>Page {page} of {data.pagination.totalPages} · {data.pagination.total} products</p>
          <div className="flex gap-2"><button className="btn-secondary disabled:opacity-40" disabled={!data.pagination.hasPrev || report.isFetching} onClick={() => setPage(p => p - 1)}>Previous</button><button className="btn-secondary disabled:opacity-40" disabled={!data.pagination.hasNext || report.isFetching} onClick={() => setPage(p => p + 1)}>Next</button></div>
        </div>
          </div>}
        </>}
      </>}
  </section>;
}
