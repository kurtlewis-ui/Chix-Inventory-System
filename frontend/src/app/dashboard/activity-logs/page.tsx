'use client';

import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useActivityLogs } from '@/lib/hooks';
import { Select } from '@/components/Select';
import { getApiErrorMessage } from '@/lib/api';

const categories = ['All', 'Authentications', 'Accounts', 'Shops', 'Products', 'Brands', 'Reports', 'Users'];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ActivityLogsPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [entriesPerPage, setEntriesPerPage] = useState<number | 'All'>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data, isLoading, isError, error } = useActivityLogs({ search, category: activeCategory, startDate: startDate || undefined, endDate: endDate || undefined });
  const logs = data?.data ?? [];

  // Real pagination: slice by the current page (not just the first N).
  const perPage = entriesPerPage === 'All' ? logs.length || 1 : entriesPerPage;
  const totalPages = Math.max(1, Math.ceil(logs.length / perPage));
  const page = Math.min(currentPage, totalPages);
  const startIdx = entriesPerPage === 'All' ? 0 : (page - 1) * perPage;
  const displayedLogs = entriesPerPage === 'All' ? logs : logs.slice(startIdx, startIdx + perPage);

  // Reset to page 1 whenever the filters or page size change.
  function resetToFirstPage() { setCurrentPage(1); }

  return (
    <div className="p-6 bg-page-bg min-h-screen">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Activity Logs</h1>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => { setActiveCategory(cat); resetToFirstPage(); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              activeCategory === cat ? 'bg-btn-primary text-btn-primary-text' : 'bg-white/5 text-text-secondary hover:text-text-primary hover:bg-white/10'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Date Filter */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); resetToFirstPage(); }} className="px-3 py-2 border border-input-border rounded-lg text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus" />
        <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); resetToFirstPage(); }} className="px-3 py-2 border border-input-border rounded-lg text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus" />
        {(startDate || endDate) && (
          <button onClick={() => { setStartDate(''); setEndDate(''); resetToFirstPage(); }} className="px-3 py-2 text-sm text-text-secondary border border-input-border rounded-lg hover:opacity-80 transition">Clear dates</button>
        )}
      </div>

      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-card-border">
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">Show</label>
            <Select value={String(entriesPerPage)} onChange={(v) => { setEntriesPerPage(v === 'All' ? 'All' : Number(v)); resetToFirstPage(); }} ariaLabel="Entries per page" className="w-auto min-w-[80px]" options={[...[5, 10, 25, 50, 100].map((n) => ({ value: String(n), label: String(n) })), { value: 'All', label: 'All' }]} />
            <span className="text-sm text-text-secondary">entries</span>
          </div>
          <div className="relative w-full sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" placeholder="Search activity logs..." value={search} onChange={(e) => { setSearch(e.target.value); resetToFirstPage(); }} className="w-full pl-9 pr-4 py-2 border border-input-border rounded-lg bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="hidden w-full md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Module</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Description</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Device</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">IP Address</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading logs...</td></tr>
              ) : isError ? (
                <tr><td colSpan={8} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : displayedLogs.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center"><p className="text-accent-primary font-medium">No activity logs found</p></td></tr>
              ) : displayedLogs.map((log, idx) => (
                <tr key={log.id} className="border-b border-card-border transition">
                  <td className="px-4 py-3 text-sm text-text-primary">{startIdx + idx + 1}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{log.userName}</p>
                      <p className="text-xs text-text-muted">{log.userEmail}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary">{log.action}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{log.module}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary max-w-[220px] truncate">{log.description}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{log.device}</td>
                  <td className="px-4 py-3 text-sm text-text-muted font-mono text-xs">{log.ipAddress}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(log.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: activity-log cards (hidden on desktop). */}
          <div className="md:hidden">
            {isLoading ? (
              <div className="py-8 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading logs...</div>
            ) : isError ? (
              <div className="py-8 text-center text-accent-red">{getApiErrorMessage(error)}</div>
            ) : displayedLogs.length === 0 ? (
              <div className="py-12 text-center"><p className="text-accent-primary font-medium">No activity logs found</p></div>
            ) : (
              <ul className="divide-y divide-card-border">
                {displayedLogs.map((log, idx) => (
                  <li key={log.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary break-words">
                          <span className="text-text-muted mr-1.5">{startIdx + idx + 1}.</span>{log.userName}
                        </p>
                        <p className="text-xs text-text-muted break-words">{log.userEmail}</p>
                      </div>
                      <span className="shrink-0 badge badge-neutral">{log.action}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-muted">
                      <span>{log.module}</span>
                      <span className="font-mono">{log.ipAddress}</span>
                      <span>{log.device}</span>
                    </div>
                    {log.description && <p className="mt-1 text-xs text-text-secondary break-words">{log.description}</p>}
                    <p className="mt-0.5 text-[11px] text-text-muted">{formatDate(log.date)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-text-secondary">
          <span>
            {logs.length === 0
              ? 'No logs'
              : `Showing ${startIdx + 1}–${startIdx + displayedLogs.length} of ${logs.length} logs`}
          </span>
          {entriesPerPage !== 'All' && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-input-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-white/5 transition"
              >
                Previous
              </button>
              <span className="px-2 text-text-primary">Page {page} of {totalPages}</span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-input-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-white/5 transition"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
