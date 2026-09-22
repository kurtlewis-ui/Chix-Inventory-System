'use client';

import { useState } from 'react';
import { useProfitSummary, useBranches } from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { useStoredBranch } from '@/lib/useStoredBranch';
import { Download, Store, CalendarDays, RotateCcw } from 'lucide-react';
import { Select } from '@/components/Select';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The shop operates on a Philippine business day (UTC+8, starts 2 AM). These
// helpers give the correct YYYY-MM-DD calendar strings for the quick-pick
// ranges so they line up with the rest of the app.
const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const BUSINESS_START_HOUR = 2;

/** The current PH business date as a Date on a "business clock" (2 AM = start of day). */
function phBusinessNow(): Date {
  return new Date(Date.now() + PH_OFFSET_MS - BUSINESS_START_HOUR * 60 * 60 * 1000);
}

/** Format a business-clock Date as YYYY-MM-DD (its UTC parts are the PH business date). */
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

type QuickRange = 'today' | 'week' | 'month' | 'year' | 'all';

/** Returns { start, end } YYYY-MM-DD for a quick range, in PH business time. */
function quickRangeDates(range: QuickRange): { start: string; end: string } {
  if (range === 'all') return { start: '', end: '' };
  const now = phBusinessNow();
  const todayStr = ymd(now);
  if (range === 'today') return { start: todayStr, end: todayStr };
  if (range === 'week') {
    // Week starts Monday.
    const day = now.getUTCDay(); // 0=Sun..6=Sat
    const daysSinceMonday = (day + 6) % 7;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
    return { start: ymd(monday), end: todayStr };
  }
  if (range === 'year') {
    // Calendar year to date: Jan 1 of the current PH business year -> today.
    const jan1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return { start: ymd(jan1), end: todayStr };
  }
  // month
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: ymd(first), end: todayStr };
}

/**
 * Owner-only Profit & Loss section on the dashboard.
 * Shows: Total Gross Sales, Discount, Capital (COGS), Expenses, Disposal
 * Losses, Net Profit, Margin. Net Profit & Margin are computed on NET revenue
 * (gross − discount) so the discount is only ever counted once.
 * Only renders if user.role.name === 'Owner'.
 */
export function OwnerProfitSection() {
  const role = useAuthStore((s) => s.user?.role?.name);
  if (role !== 'Owner') return null;

  return <ProfitContent />;
}

function ProfitContent() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeRange, setActiveRange] = useState<QuickRange | 'custom'>('all');
  const [exporting, setExporting] = useState(false);

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

  // Profit & Loss is computed on the SERVER so it can use each sale item's
  // confidential cost price (never exposed to the browser) and cover ALL
  // matching approved sales, not just one page. This is what fixes the old
  // "Capital ₱0.00 / Margin 100%" bug: the client used to read item.costPrice,
  // which the sale serializer intentionally omits, so cost always came out 0.
  const { data: summary } = useProfitSummary({
    branchId: branchId || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const metrics = {
    grossSales: summary?.grossSales ?? 0,
    revenue: summary?.revenue ?? 0,
    cogs: summary?.capital ?? 0,
    grossProfit: summary?.grossProfit ?? 0,
    totalDiscount: summary?.totalDiscount ?? 0,
    expensesTotal: summary?.expenses ?? 0,
    disposalLosses: summary?.disposalLosses ?? 0,
    netProfit: summary?.netProfit ?? 0,
    margin: summary?.margin ?? 0,
  };

  async function handleExportProfit() {
    setExporting(true);
    try {
      const { exportAllData } = await import('@/lib/export-all');
      await exportAllData();
    } catch {
      // silently fail
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="bg-card-bg border border-accent-primary/30 rounded-xl p-5 shadow-sm shadow-accent-primary/10">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-text-primary mb-3">Profit & Loss</h2>

        {/* Single-row filter bar: Period · From → To · Reset · Shop.
            Wraps to multiple lines on smaller screens. */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-card-border bg-white/[0.02] p-3">
          {/* Period */}
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

          {/* From */}
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

          {/* To */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setActiveRange('custom'); }}
              className="rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-input-focus"
            />
          </div>

          {/* Reset (only when a custom range is set) */}
          {(startDate || endDate) && (
            <button
              onClick={() => applyQuickRange('all')}
              title="Reset the date range to All Time"
              className="flex items-center gap-2 rounded-lg border border-accent-red/40 bg-accent-red/10 px-4 py-2 text-sm font-semibold text-accent-red hover:bg-accent-red/20 transition"
            >
              <RotateCcw size={16} /> Reset
            </button>
          )}

          {/* Shop — pushed to the far right on wide screens, wraps below on small */}
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

      {/* Divider separates the filters from the results.
          7 metrics, laid out 2-up on phones and in a single row from lg up.
          Number font is a notch smaller than before (base/xl instead of
          lg/2xl) with a bit more column gap and per-cell padding, so large
          values (e.g. billions) don't overlap or crowd their neighbours. */}
      <div className="border-t border-card-border pt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-x-5 gap-y-4 text-center">
        <div className="px-1 min-w-0">
          <p className="text-xs text-text-muted uppercase">Total Gross Sales</p>
          <p className="text-base sm:text-xl font-bold tabular-nums leading-tight break-words" style={{ color: '#10b981' }}>{peso(metrics.grossSales)}</p>
        </div>
        <div className="px-1 min-w-0">
          <p className="text-xs text-text-muted uppercase">Capital</p>
          <p className="text-base sm:text-xl font-bold tabular-nums leading-tight break-words" style={{ color: '#06b6d4' }}>{peso(metrics.cogs)}</p>
        </div>
        <div className="px-1 min-w-0">
          <p className="text-xs text-text-muted uppercase">Expenses</p>
          <p className="text-base sm:text-xl font-bold tabular-nums leading-tight break-words" style={{ color: '#ef4444' }}>{peso(metrics.expensesTotal)}</p>
        </div>
        <div className="px-1 min-w-0">
          <p className="text-xs text-text-muted uppercase">Disposal Losses</p>
          <p className="text-base sm:text-xl font-bold tabular-nums leading-tight break-words" style={{ color: '#f59e0b' }}>{peso(metrics.disposalLosses)}</p>
        </div>
        <div className="px-1 min-w-0">
          <p className="text-xs text-text-muted uppercase">Total Discount</p>
          <p className="text-base sm:text-xl font-bold tabular-nums leading-tight break-words" style={{ color: '#ec4899' }}>{peso(metrics.totalDiscount)}</p>
        </div>
        <div className="px-1 min-w-0">
          <p className="text-xs text-text-muted uppercase">Net Profit</p>
          <p className="text-base sm:text-xl font-bold tabular-nums leading-tight break-words" style={{ color: metrics.netProfit >= 0 ? '#a78bfa' : '#ef4444' }}>{peso(metrics.netProfit)}</p>
        </div>
        <div className="px-1 min-w-0">
          <p className="text-xs text-text-muted uppercase">Margin</p>
          <p className="text-base sm:text-xl font-bold tabular-nums leading-tight break-words" style={{ color: metrics.margin >= 0 ? '#3b82f6' : '#ef4444' }}>{metrics.margin.toFixed(1)}%</p>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={handleExportProfit}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-btn-primary text-btn-primary-text rounded-lg text-xs font-medium hover:opacity-90 transition disabled:opacity-60"
        >
          <Download size={13} /> {exporting ? 'Exporting...' : 'Export Profit Report'}
        </button>
      </div>
    </div>
  );
}
