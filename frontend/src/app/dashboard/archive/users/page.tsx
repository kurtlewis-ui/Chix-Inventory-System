'use client';

import { useState } from 'react';
import { Search, Undo2, Loader2 } from 'lucide-react';
import { useArchivedUsers, useRestoreUser } from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { usePagination, Pagination } from '@/components/Pagination';

export default function UsersArchivePage() {
  const { data, isLoading, isError, error } = useArchivedUsers();
  const restore = useRestoreUser();
  const allUsers = data?.data ?? [];
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const currentRole = useAuthStore((s) => s.user?.role?.name);
  const isOwner = currentRole === 'Owner';

  // Admin cannot see Owner accounts in the archive
  const users = isOwner ? allUsers : allUsers.filter((u) => u.role.name !== 'Owner');

  const filtered = users.filter(
    (u) =>
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );
  const { pageItems: paged, resetPage, controlProps } = usePagination(filtered, 10);

  const handleRestore = async (id: string) => {
    setActionError(null);
    try { await restore.mutateAsync(id); } catch (e) { setActionError(getApiErrorMessage(e)); }
  };

  return (
    <div className="p-6 bg-page-bg min-h-screen">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Users Archive</h1>
      {actionError && <div className="mb-4 rounded-lg bg-accent-red/10 border border-accent-red/30 px-4 py-2 text-sm text-accent-red">{actionError}</div>}

      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="p-4 border-b border-card-border">
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" placeholder="Search archived users..." value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} className="w-full pl-9 pr-4 py-2 border border-input-border rounded-lg bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="hidden w-full md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Shop</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading...</td></tr>
              ) : isError ? (
                <tr><td colSpan={6} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12"><div className="border-l-4 border-accent-orange pl-4"><p className="text-accent-orange font-medium">No archived users found.</p></div></td></tr>
              ) : paged.map((user, idx) => (
                <tr key={user.id} className="border-b border-card-border transition">
                  <td className="px-4 py-3 text-sm text-text-primary">{controlProps.startIdx + idx + 1}</td>
                  <td className="px-4 py-3 text-sm text-text-primary font-medium">{user.firstName} {user.lastName}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{user.email}</td>
                  <td className="px-4 py-3"><span className="badge badge-neutral">{user.role.name}</span></td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{user.branch?.name ?? 'N/A'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleRestore(user.id)} disabled={restore.isPending} className="inline-flex items-center gap-1 rounded-lg bg-accent-green/10 px-2.5 py-1 text-sm font-medium text-accent-green hover:bg-accent-green/20 transition-colors disabled:opacity-50" title="Restore">
                      <Undo2 size={14} /> Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: archived-user cards (hidden on desktop). */}
          <div className="md:hidden">
            {isLoading ? (
              <div className="py-8 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading...</div>
            ) : isError ? (
              <div className="py-8 text-center text-accent-red">{getApiErrorMessage(error)}</div>
            ) : filtered.length === 0 ? (
              <div className="p-4"><div className="border-l-4 border-accent-orange pl-4"><p className="text-accent-orange font-medium">No archived users found.</p></div></div>
            ) : (
              <ul className="divide-y divide-card-border">
                {paged.map((user, idx) => (
                  <li key={user.id} className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary break-words"><span className="text-text-muted mr-1.5">{controlProps.startIdx + idx + 1}.</span>{user.firstName} {user.lastName}</p>
                      <p className="text-xs text-text-secondary break-words">{user.email}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="badge badge-neutral">{user.role.name}</span>
                        <span className="text-xs text-text-muted">{user.branch?.name ?? 'N/A'}</span>
                      </div>
                    </div>
                    <button onClick={() => handleRestore(user.id)} disabled={restore.isPending} className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-accent-green/10 px-2.5 py-1.5 text-sm font-medium text-accent-green hover:bg-accent-green/20 transition-colors disabled:opacity-50" title="Restore">
                      <Undo2 size={14} /> Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {!isLoading && !isError && filtered.length > 0 && (
          <Pagination {...controlProps} noun="users" />
        )}
      </div>
    </div>
  );
}
