'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Store, Package, PhilippinePeso, Users, BarChart3, ChevronDown, ChevronUp, Recycle, Download } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useDashboardStats, useSalesOverview, useTopProducts, useBranches, useDisposals } from '@/lib/hooks';
import { useThemeStore } from '@/lib/theme';
import { useAuthStore } from '@/lib/store';
import { OwnerProfitSection } from '@/components/OwnerProfitSection';
import { AdminSummarySection } from '@/components/AdminSummarySection';
import { useToast } from '@/components/Toast';
import { Select } from '@/components/Select';

// Charts are code-split (recharts is heavy) so they don't bloat the dashboard's
// initial JS. They render client-side only; a simple placeholder shows while the
// chart chunk loads.
const chartLoading = () => (
  <div className="h-72 flex items-center justify-center rounded-xl border border-dashed border-card-border text-sm text-text-muted">Loading chart…</div>
);
const SalesOverviewChart = dynamic(() => import('@/components/DashboardCharts').then((m) => m.SalesOverviewChart), { ssr: false, loading: chartLoading });
const TopProductsDonut = dynamic(() => import('@/components/DashboardCharts').then((m) => m.TopProductsDonut), { ssr: false });
const DisposedBarChart = dynamic(() => import('@/components/DashboardCharts').then((m) => m.DisposedBarChart), { ssr: false, loading: chartLoading });

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// Chart palettes — colorful in BOTH themes now (dark used to be grayscale).
// Dark uses slightly brighter/saturated tones so they pop on the near-black
// canvas; light uses the softer originals. Same hue order so a series keeps a
// consistent color between themes.
// Chart palettes — amber-led and intentionally GREEN-FREE (green now reads as
// a "positive/sales" semantic elsewhere, so charts use a distinct set). Same
// hue order in both themes; dark uses slightly brighter tones for the black bg.
const DONUT_COLORS_DARK = ['#fbbf24', '#60a5fa', '#a78bfa', '#22d3ee', '#f472b6', '#f87171', '#e879f9', '#fb923c'];
const DONUT_COLORS_LIGHT = ['#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4', '#ec4899', '#ef4444', '#d946ef', '#f97316'];

export default function DashboardPage() {
  const currentRole = useAuthStore((s) => s.user?.role?.name);
  // Owner and Admin both see the dashboard. Admin sees the same overview but
  // WITHOUT the Profit & Loss section (which is derived from confidential cost
  // prices). The flag is passed down so the cost-bearing section is omitted.
  const isOwner = currentRole === 'Owner';

  return <OwnerDashboard isOwner={isOwner} />;
}

function OwnerDashboard({ isOwner }: { isOwner: boolean }) {
  const { contentTheme } = useThemeStore();
  const isDark = contentTheme === 'dark';
  const toast = useToast();
  const { data: stats, isLoading, isError: statsError } = useDashboardStats();
  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];

  const [period, setPeriod] = useState('daily');
  const [overviewShop, setOverviewShop] = useState('');
  const [topShop, setTopShop] = useState('');
  const [disposalShop, setDisposalShop] = useState('');
  const [showAllSelling, setShowAllSelling] = useState(false);
  const [showAllDisposed, setShowAllDisposed] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState('');

  const { data: overview = [], isLoading: ovLoading, isError: ovError } = useSalesOverview(period, overviewShop || undefined);
  const { data: topProducts = [], isLoading: tpLoading, isError: tpError } = useTopProducts(topShop || undefined);

  // Disposals data for "Most Disposed Products" chart
  const { data: disposalsData, isError: dpError } = useDisposals({ branchId: disposalShop || undefined });
  const anyLoadError = statsError || ovError || tpError || dpError;
  const disposals = (Array.isArray(disposalsData?.data) ? disposalsData.data : []).filter((d) => d.status === 'APPROVED');

  // Compute top disposed products (group by product name, sum quantity)
  const disposedProducts = useMemo(() => {
    const map = new Map<string, { name: string; brandName: string; quantity: number; value: number }>();
    for (const d of disposals) {
      const existing = map.get(d.name) ?? { name: d.name, brandName: d.brandName, quantity: 0, value: 0 };
      existing.quantity += d.quantity;
      existing.value += d.value;
      map.set(d.name, existing);
    }
    return [...map.values()].sort((a, b) => b.quantity - a.quantity);
  }, [disposals]);

  const v = (n?: number) => (isLoading || n === undefined ? '—' : n.toLocaleString());

  const overviewData = (Array.isArray(overview) ? overview : []).map((p) => ({
    label: formatBucket(p.date, period),
    total: p.total,
  }));

  const topData = (Array.isArray(topProducts) ? topProducts : []).map((p) => ({ name: p.name, brand: p.brand, quantity: p.quantity, revenue: p.revenue }));
  const topDataPreview = topData.slice(0, 10);
  const disposedPreview = disposedProducts.slice(0, 10);
  const disposedChartData = disposedPreview.map((p) => ({ name: p.name, quantity: p.quantity }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Overview</p>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        </div>
        <button
          onClick={async () => {
            setExporting(true);
            setExportError(null);
            setExportStatus('Starting...');
            try {
              const { exportAllData } = await import('@/lib/export-all');
              await exportAllData((status) => setExportStatus(status));
              setExportStatus('');
              toast.success('All data exported.', 'Export complete');
            } catch (e: any) {
              const msg = e?.message ?? 'Export failed';
              setExportError(msg);
              setExportStatus('');
              toast.error(msg, 'Export failed');
            } finally {
              setExporting(false);
            }
          }}
          disabled={exporting}
          className="flex items-center gap-2 bg-btn-primary text-btn-primary-text px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-60"
        >
          <Download size={16} /> {exporting ? exportStatus || 'Exporting...' : 'Export All Data'}
        </button>
      </div>
      {exportError && (
        <div className="rounded-lg bg-accent-red/10 border border-accent-red/30 px-4 py-2 text-sm text-accent-red">{exportError}</div>
      )}
      {anyLoadError && (
        <div className="rounded-lg bg-accent-red/10 border border-accent-red/30 px-4 py-3 text-sm text-accent-red">
          Some dashboard data couldn&apos;t be loaded. Please check your connection and refresh — any empty charts below may be due to this, not missing data.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard href="/dashboard/shops" icon={<Store size={24} />} value={v(stats?.shops)} label="Shops" accentColor="#f59e0b" />
        <StatsCard href="/dashboard/products" icon={<Package size={24} />} value={v(stats?.products)} label="Products" subtitle={`${v(stats?.brands)} brands`} accentColor="#10b981" />
        <StatsCard href="/dashboard/sales/pending" icon={<PhilippinePeso size={24} />} value={v(stats?.pendingSales)} label="Pending Sales" subtitle={`${v(stats?.approvedSales)} Approved`} accentColor="#8b5cf6" />
        <StatsCard href="/dashboard/users" icon={<Users size={24} />} value={v(stats?.staff)} label="Staff" subtitle={`${v(stats?.admins)} Admins`} accentColor="#06b6d4" />
      </div>

      {/* Owner-only Profit & Loss section — uses confidential cost prices, so
          it is never rendered for Admin (the /stats/profit-summary endpoint is
          Owner-only on the backend too). */}
      {isOwner && <OwnerProfitSection />}

      {/* Admin's cost-free Sales Summary (Total Sales, Discount, Expenses,
          Disposal Losses, Net). Self-gates to the Admin role and is backed by
          the /stats/sales-summary endpoint, which computes no cost figures. */}
      {!isOwner && <AdminSummarySection />}

      {/* NOTE: The old "Revenue" summary box was removed here. It only ever
          showed to the Owner (the Profit & Loss section is Owner-only),
          and it was fully redundant with the Owner-only "Profit & Loss" box
          above — which shows the same Sales/Expenses/Disposal Losses PLUS
          Capital (cost of goods), Net Profit, and Margin. One box, no
          duplication. */}

      {/* Sales Overview */}
      <div className="bg-card-bg border border-card-border rounded-xl p-6 shadow-sm shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-lg font-bold text-text-primary">Sales Overview</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onChange={setPeriod} ariaLabel="Period" className="w-auto min-w-[120px]" options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: 'Yearly' },
              { value: 'all', label: 'All Time' },
            ]} />
            <Select value={overviewShop} onChange={setOverviewShop} ariaLabel="Shop" className="w-auto min-w-[140px]" options={[{ value: '', label: 'All Shops' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
          </div>
        </div>
        {ovLoading ? (
          <ChartPlaceholder message="Loading..." />
        ) : overviewData.length === 0 ? (
          <ChartPlaceholder message="No approved sales in this period yet" />
        ) : (
          <SalesOverviewChart data={overviewData} isDark={isDark} />
        )}
      </div>

      {/* Top Selling Products */}
      <div className="bg-card-bg border border-card-border rounded-xl p-6 shadow-sm shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-lg font-bold text-text-primary">Top Selling Products</h2>
          <Select value={topShop} onChange={setTopShop} ariaLabel="Shop" className="w-auto min-w-[140px]" options={[{ value: '', label: 'All Shops' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
        </div>
        {tpLoading ? (
          <ChartPlaceholder message="Loading..." />
        ) : topData.length === 0 ? (
          <ChartPlaceholder message="No approved sales yet" />
        ) : (
          <>
            {/* Ring/Donut chart — top 8 products by revenue */}
            <div className="flex flex-col lg:flex-row items-center gap-6">
              <div className="relative">
                <TopProductsDonut data={topDataPreview.slice(0, 8)} colors={isDark ? DONUT_COLORS_DARK : DONUT_COLORS_LIGHT} isDark={isDark} />
                {/* Center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-xs text-text-muted">Total</p>
                  <p className="text-lg font-bold text-text-primary">{peso(topData.reduce((s, p) => s + p.revenue, 0))}</p>
                </div>
              </div>
              {/* Legend */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {topDataPreview.slice(0, 8).map((p, i) => (
                  <div key={p.name} className="flex items-center gap-2.5">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ background: (isDark ? DONUT_COLORS_DARK : DONUT_COLORS_LIGHT)[i % 8] }} />
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary truncate">{p.name}</p>
                      <p className="text-xs text-text-muted">{peso(p.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* View All / Show Less toggle */}
            {topData.length > 8 && (
              <button onClick={() => setShowAllSelling(!showAllSelling)} className="mt-4 flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary">
                {showAllSelling ? <><ChevronUp size={14} /> Show Less</> : <><ChevronDown size={14} /> View All ({topData.length} products)</>}
              </button>
            )}

            {/* Expanded table */}
            {showAllSelling && (
              <div className="mt-4 max-h-[400px] overflow-y-auto overflow-x-auto rounded-lg border border-card-border">
                <table className="w-full">
                  <thead className="sticky top-0 bg-table-header">
                    <tr className="text-table-header-text">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">#</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Product</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Brand</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Qty Sold</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topData.map((p, i) => (
                      <tr key={`${p.name}-${i}`} className="border-t border-card-border">
                        <td className="px-3 py-2 text-sm text-text-muted">{i + 1}</td>
                        <td className="px-3 py-2 text-sm font-medium text-text-primary">{p.name}</td>
                        <td className="px-3 py-2 text-sm text-text-secondary">{p.brand}</td>
                        <td className="px-3 py-2 text-sm text-text-primary">{p.quantity}</td>
                        <td className="px-3 py-2 text-sm font-medium text-accent-green">{peso(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Most Disposed Products */}
      <div className="bg-card-bg border border-card-border rounded-xl p-6 shadow-sm shadow-black/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><Recycle size={20} /> Most Disposed Products</h2>
          <Select value={disposalShop} onChange={setDisposalShop} ariaLabel="Shop" className="w-auto min-w-[140px]" options={[{ value: '', label: 'All Shops' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
        </div>
        {disposedProducts.length === 0 ? (
          <ChartPlaceholder message="No approved disposals yet" />
        ) : (
          <>
            {/* Horizontal bar chart — disposed products */}
            <DisposedBarChart data={disposedChartData} height={Math.max(288, disposedPreview.length * 40)} colors={isDark ? DONUT_COLORS_DARK : DONUT_COLORS_LIGHT} isDark={isDark} />


            {/* View All / Show Less toggle */}
            {disposedProducts.length > 10 && (
              <button onClick={() => setShowAllDisposed(!showAllDisposed)} className="mt-4 flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary">
                {showAllDisposed ? <><ChevronUp size={14} /> Show Less</> : <><ChevronDown size={14} /> View All ({disposedProducts.length} products)</>}
              </button>
            )}

            {/* Expanded table */}
            {showAllDisposed && (
              <div className="mt-4 max-h-[400px] overflow-y-auto overflow-x-auto rounded-lg border border-card-border">
                <table className="w-full">
                  <thead className="sticky top-0 bg-table-header">
                    <tr className="text-table-header-text">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">#</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Product</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Brand</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Qty Disposed</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Value Lost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disposedProducts.map((p, i) => (
                      <tr key={`${p.name}-${i}`} className="border-t border-card-border">
                        <td className="px-3 py-2 text-sm text-text-muted">{i + 1}</td>
                        <td className="px-3 py-2 text-sm font-medium text-text-primary">{p.name}</td>
                        <td className="px-3 py-2 text-sm text-text-secondary">{p.brandName}</td>
                        <td className="px-3 py-2 text-sm text-text-primary">{p.quantity}</td>
                        <td className="px-3 py-2 text-sm font-medium text-accent-red">{peso(p.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function formatBucket(iso: string, period: string) {
  const d = new Date(iso);
  if (period === 'yearly') return d.toLocaleDateString(undefined, { year: 'numeric' });
  // 'all' is bucketed by month on the backend — label with month + year.
  if (period === 'monthly' || period === 'all') return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  if (period === 'weekly') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function StatsCard({ href, icon, value, label, subtitle, accentColor }: { href: string; icon: React.ReactNode; value: string; label: string; subtitle?: string; accentColor?: string }) {
  return (
    <Link href={href} className="group card-hover bg-card-bg border border-card-border rounded-xl p-4 flex items-center gap-4 relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r" style={{ background: accentColor || '#10b981' }} />
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5"><span style={{ color: accentColor || '#10b981' }}>{icon}</span></div>
      <div>
        <p className="text-2xl font-bold text-text-primary leading-tight">{value}</p>
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>
    </Link>
  );
}

function ChartPlaceholder({ message }: { message: string }) {
  return (
    <div className="h-72 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-card-border text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(245, 158, 11, 0.10)' }}><BarChart3 size={28} style={{ color: '#f59e0b' }} /></div>
      <p className="text-sm font-medium text-text-secondary">{message}</p>
    </div>
  );
}
