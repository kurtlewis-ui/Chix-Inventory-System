'use client';

import { useState } from 'react';
import { useSalesSummary, useBranches } from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { useStoredBranch } from '@/lib/useStoredBranch';
import { Store, CalendarDays, RotateCcw } from 'lucide-react';
import { Select } from '@/components/Select';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The shop operates on a Philippine business day (UTC+8, starts 2 AM). These
// helpers mirror OwnerProfitSection so the Admin quick-pick ranges line up with
// the rest of the app.
const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const BUSINESS_START_HOUR = 2;

function phBusinessNow(): Date {
  return new Date(Date.now() + PH_OFFSET_MS - BUSINESS_START_HOUR * 60 * 60 * 1000);
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

type QuickRange = 'today' | 'week' | 'month' | 'year' | 'all';

function quickRangeDates(range: QuickRange): { start: string; end: string } {
  if (range === 'all') return { start: '', end: '' };
  const now = phBusinessNow();
  const todayStr = ymd(now);
  if (range === 'today') return { start: todayStr, end: todayStr };
  if (range === 'week') {
    const day = now.getUTCDay(); // 0=Sun..6=Sat
    const daysSinceMonday = (day + 6) % 7;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
    return { start: ymd(monday), end: todayStr };
  }
  if (range === 'year') {
    const jan1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return { start: ymd(jan1), end: todayStr };
  }
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: ymd(first), end: todayStr };
}

/**
 * Admin-only sales summary section on the dashboard. It mirrors the Owner's
 * Profit & Loss layout but shows ONLY the cost-free figures an Admin may see:
 * Total Sales, Total Discount, Total Expenses, Disposal Losses and Net Total.
 *
 * It uses the /stats/sales-summary endpoint (Owner+Admin), which computes NO
 * cost-derived values (no Capital/COGS, Gross Profit, Net Profit or Margin), so
 * confidential cost is never exposed. Only renders for the Admin role.
 */
export function AdminSummarySection() {
  const role = useAuthStore((s) => s.user?.role?.name);
  if (role !== 'Admin') return null;

  return <SummaryContent />;
}

function SummaryContent() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeRange, setActiveRange] = useState<QuickRange | 'custom'>('all');

  function applyQuickRange(range: QuickRange) {
    const { start, end } = quickRangeDates(range);
    setStartDate(start);
    setEndDate(end);
    setActiveRange(range);
  }

  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];
  // Shared+persisted branch filter ('' = All Shops), remembered across the site.
  const [branchId, setBranchId] = useStoredBranch(branches);

  const { data: summary } = useSalesSummary({
    branchId: branchId || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const metrics = {
    totalSales: summary?.totalSales ?? 0,
    totalDiscount: summary?.totalDiscount ?? 0,
    totalExpenses: summary?.totalExpenses ?? 0,
    disposalLosses: summary?.disposalLosses ?? 0,
    net: summary?.net ?? 0,
  };

  return (
    <div className="bg-card-bg border border-accent-primary/30 rounded-xl p-5 shadow-sm shadow-accent-primary/10">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-text-primary mb-3">Sales Summary</h2>

        {/* Filter bar: Period · From → To · Reset · Shop. Mirrors the Owner P&L. */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-card-border bg-white/[0.02] p-3">
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              <CalendarDays size={12} /> Period
            </label>
            <Select
              value={activeRange === 'custom' ? 'custom' : activeRange}
              onChange={(v) => { if (v === 'custom') { setActiveRange('custom'); return; } applyQuickRange(v as QuickRange); }}
              ariaLabel="Period"
              className="w-[150px]"
              options={[
                { value: 'today', label: 'Today' },
                { value: 'week', label: 'This Week' },
                { value: 'month', label: 'This Month' },
                { value: 'year', label: 'This Year' },
                { value: 'all', label: 'All Time' },
                ...(activeRange === 'custom' ? [{ value: 'custom', label: 'Custom Range' }] : []),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setActiveRange('custom'); }}
              className="rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-input-focus"
            />
          </div>

          <span className="pb-2.5 text-text-muted">→</span>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setActiveRange('custom'); }}
              className="rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-input-focus"
            />
          </div>

          {(startDate || endDate) && (
            <button
              onClick={() => applyQuickRange('all')}
              title="Reset the date range to All Time"
              className="flex items-center gap-2 rounded-lg border border-accent-red/40 bg-accent-red/10 px-4 py-2 text-sm font-semibold text-accent-red hover:bg-accent-red/20 transition"
            >
              <RotateCcw size={16} /> Reset
            </button>
          )}

          <div className="flex flex-col gap-1 sm:ml-auto">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              <Store size={12} /> Shop
            </label>
            <Select
              value={branchId}
              onChange={setBranchId}
              ariaLabel="Shop"
              className="w-full sm:w-[180px]"
              options={[{ value: '', label: 'All Shops' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
            />
          </div>
        </div>
      </div>

      {/* 5 cost-free metrics: 2-up on phones, single row from lg up. */}
      <div className="border-t border-card-border pt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-5 gap-y-4 text-center">
        <div className="px-1 min-w-0">
          <p className="text-xs text-text-muted uppercase">Total Sales</p>
          <p className="text-base sm:text-xl font-bold tabular-nums leading-tight break-words" style={{ color: '#10b981' }}>{peso(metrics.totalSales)}</p>
        </div>
        <div className="px-1 min-w-0">
          <p className="text-xs text-text-muted uppercase">Total Discount</p>
          <p className="text-base sm:text-xl font-bold tabular-nums leading-tight break-words" style={{ color: '#ec4899' }}>{peso(metrics.totalDiscount)}</p>
        </div>
        <div className="px-1 min-w-0">
          <p className="text-xs text-text-muted uppercase">Expenses</p>
          <p className="text-base sm:text-xl font-bold tabular-nums leading-tight break-words" style={{ color: '#ef4444' }}>{peso(metrics.totalExpenses)}</p>
        </div>
        <div className="px-1 min-w-0">
          <p className="text-xs text-text-muted uppercase">Disposal Losses</p>
          <p className="text-base sm:text-xl font-bold tabular-nums leading-tight break-words" style={{ color: '#f59e0b' }}>{peso(metrics.disposalLosses)}</p>
        </div>
        <div className="px-1 min-w-0">
          <p className="text-xs text-text-muted uppercase">Net Total</p>
          <p className="text-base sm:text-xl font-bold tabular-nums leading-tight break-words" style={{ color: metrics.net >= 0 ? '#a78bfa' : '#ef4444' }}>{peso(metrics.net)}</p>
        </div>
      </div>
    </div>
  );
}
