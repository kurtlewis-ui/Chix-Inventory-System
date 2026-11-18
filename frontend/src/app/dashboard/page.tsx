'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Store, Package, PhilippinePeso, Users, BarChart3, Download } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useDashboardStats, useSalesOverview, useProfitOverview, useBranches } from '@/lib/hooks';
import { useThemeStore } from '@/lib/theme';
import { useAuthStore } from '@/lib/store';
import { ProductSalesSummary } from '@/components/ProductSalesSummary';
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

export default function DashboardPage() {
  const currentRole = useAuthStore((s) => s.user?.role?.name);
  const router = useRouter();
  // The Dashboard is Owner-only. Admin has no Dashboard page — if they reach
  // /dashboard directly (bookmark/old link), send them to their landing page.
  const isAdmin = currentRole === 'Admin';
  useEffect(() => {
    if (isAdmin) router.replace('/dashboard/sales/pending');
  }, [isAdmin, router]);
  if (isAdmin) return null;

  // Only the Owner renders the dashboard now.
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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState('');

  // Sales Overview chart source depends on role:
  //   Owner → NET PROFIT per period (same formula as the Profit & Loss board):
  //           revenue − capital − expenses − disposal losses. Uses the
  //           Owner-only /stats/profit-overview endpoint (reads cost price).
  //   Admin → NET SALES per period (cost-free /stats/sales-overview), unchanged.
  // Only the hook matching the current role is enabled, so Admin never calls
  // the Owner-only endpoint (which would 403).
  const salesOv = useSalesOverview(period, overviewShop || undefined, !isOwner);
  const profitOv = useProfitOverview(period, overviewShop || undefined, isOwner);
  const overview = (isOwner ? profitOv.data : salesOv.data) ?? [];
  const ovLoading = isOwner ? profitOv.isLoading : salesOv.isLoading;
  const ovError = isOwner ? profitOv.isError : salesOv.isError;
  const anyLoadError = statsError || ovError;

  const v = (n?: number) => (isLoading || n === undefined ? '—' : n.toLocaleString());

  const overviewData = (Array.isArray(overview) ? overview : []).map((p) => ({
    label: formatBucket(p.date, period),
    total: p.total,
  }));


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
          <h2 className="text-lg font-bold text-text-primary">{isOwner ? 'Net Profit Overview' : 'Sales Overview'}</h2>
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
          <SalesOverviewChart data={overviewData} isDark={isDark} seriesName={isOwner ? 'Net Profit' : 'Sales'} />
        )}
      </div>

      {isOwner && <>
        <ProductSalesSummary kind="sales" />
        <ProductSalesSummary kind="disposals" />
      </>}
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
