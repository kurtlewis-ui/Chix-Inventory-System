'use client';

import { useState } from 'react';
import { Search, Plus, Pencil, Archive, X, Eye, EyeOff, RefreshCw, Loader2, Store, Trash2 } from 'lucide-react';
import {
  useUsers,
  useRoles,
  useBranches,
  useCreateUser,
  useUpdateUser,
  useResetUserPassword,
  useArchiveUser,
} from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';
import { ImageCropModal } from '@/components/ImageCropModal';
import { useAuthStore } from '@/lib/store';
import { Select } from '@/components/Select';
import { useUnsavedGuard, withScrollPreserved } from '@/lib/useUnsavedGuard';
import type { FullUser } from '@/lib/types';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass relative rounded-lg shadow-xl w-full max-w-md mx-4 p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text-primary">{title}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// A role badge with a distinct color per role so Owner / Admin / Staff are
// instantly distinguishable. Uses a tinted background + colored text + hairline
// border (works in both light and dark themes). Unknown roles fall back to a
// neutral badge.
function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    Owner: 'bg-accent-purple/15 text-accent-purple border-accent-purple/30',
    Admin: 'bg-accent-blue/15 text-accent-blue border-accent-blue/30',
    Staff: 'bg-accent-green/15 text-accent-green border-accent-green/30',
  };
  const cls = map[role] ?? 'bg-surface-muted text-text-secondary border-card-border';
  return (
    <span className={`badge border ${cls}`}>
      <span className="badge-dot bg-current opacity-80" />
      {role}
    </span>
  );
}

// ===========================================================================
// ADMIN VIEW — Can only assign staff to branches
// ===========================================================================
function AdminStaffView() {
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, error } = useUsers(search);
  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];
  const updateUser = useUpdateUser();

  const users = data?.data ?? [];
  // Admin can only see Staff role users
  const visibleUsers = users.filter((u) => u.role.name === 'Staff');

  const [selectedUser, setSelectedUser] = useState<FullUser | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [entriesPerPage, setEntriesPerPage] = useState<number | 'All'>(10);
  const [currentPage, setCurrentPage] = useState(1);

  const closeBranchModal = useUnsavedGuard(formDirty, () => { setShowBranchModal(false); setSelectedUser(null); });

  const totalPages = entriesPerPage === 'All' ? 1 : Math.max(1, Math.ceil(visibleUsers.length / entriesPerPage));
  const pageStart = entriesPerPage === 'All' ? 0 : (currentPage - 1) * entriesPerPage;
  const displayedUsers = entriesPerPage === 'All' ? visibleUsers : visibleUsers.slice(pageStart, pageStart + entriesPerPage);

  const handleChangeBranch = (user: FullUser) => {
    setSelectedUser(user);
    setSelectedBranchId(user.branchId ?? '');
    setFormError(null);
    setFormDirty(false);
    setShowBranchModal(true);
  };

  const handleSaveBranch = async () => {
    if (!selectedUser) return;
    if (!selectedBranchId) {
      setFormError('Please select a branch.');
      return;
    }
    setFormError(null);
    try {
      await withScrollPreserved(() => updateUser.mutateAsync({
        id: selectedUser.id,
        branchId: selectedBranchId,
      }));
      setFormDirty(false);
      setShowBranchModal(false);
      setSelectedUser(null);
    } catch (e) {
      setFormError(getApiErrorMessage(e));
    }
  };

  return (
    <div className="p-6 bg-page-bg min-h-screen">
      <div className="mb-6">
        <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Manage</p>
        <h1 className="text-2xl font-bold text-text-primary">Staff</h1>
      </div>

      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-card-border">
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">Show</label>
            <Select value={String(entriesPerPage)} onChange={(v) => { setEntriesPerPage(v === 'All' ? 'All' : Number(v)); setCurrentPage(1); }} ariaLabel="Entries per page" className="w-auto min-w-[80px]" options={[...[5, 10, 25, 50, 100].map((n) => ({ value: String(n), label: String(n) })), { value: 'All', label: 'All' }]} />
            <span className="text-sm text-text-secondary">entries</span>
          </div>
          <div className="relative w-full sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" placeholder="Search staff..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="w-full pl-9 pr-4 py-2 border border-input-border rounded-lg bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" />
          </div>
        </div>

        <div>
          <table className="hidden w-full table-fixed md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase w-[44px]">#</th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase w-[64px]">Image</th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase w-[18%]">Name</th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase w-[22%]">Email</th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase w-[12%]">Role</th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase w-[16%]">Branch</th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase w-[12%]">Status</th>
                <th className="px-3 py-3.5 text-right text-xs font-semibold uppercase w-[64px]"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading staff...</td></tr>
              ) : isError ? (
                <tr><td colSpan={8} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : displayedUsers.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-text-muted">No staff found.</td></tr>
              ) : displayedUsers.map((user, idx) => (
                <tr key={user.id} className="border-b border-card-border align-middle transition hover:bg-white/[0.02]">
                  <td className="px-3 py-4 text-sm text-text-primary align-middle">{pageStart + idx + 1}</td>
                  <td className="px-3 py-4 align-middle">
                    {user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatarUrl} alt="" loading="lazy" width={36} height={36} className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-xs text-text-muted">
                        {user.firstName?.[0] ?? ''}{user.lastName?.[0] ?? ''}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-4 text-sm text-text-primary font-medium align-middle truncate" title={`${user.firstName} ${user.lastName}`}>
                    {user.firstName} {user.middleInitial ? `${user.middleInitial}. ` : ''}{user.lastName}
                  </td>
                  <td className="px-3 py-4 text-sm text-text-secondary align-middle truncate" title={user.email}>{user.email}</td>
                  <td className="px-3 py-4 align-middle"><RoleBadge role={user.role.name} /></td>
                  <td className="px-3 py-4 text-sm text-text-secondary align-middle truncate" title={user.branch?.name ?? 'Unassigned'}>{user.branch?.name ?? <span className="text-accent-orange">Unassigned</span>}</td>
                  <td className="px-3 py-4 align-middle">
                    <span className="badge badge-neutral">
                      <span className={`badge-dot ${user.isActive ? 'bg-accent-green' : 'bg-accent-red'}`} />
                      {user.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleChangeBranch(user)}
                        title="Assign Branch"
                        aria-label="Assign Branch"
                        className="p-1.5 text-accent-blue hover:bg-accent-blue/10 rounded-lg transition"
                      >
                        <Store size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: staff cards (hidden on desktop). */}
          <div className="md:hidden">
            {isLoading ? (
              <div className="py-8 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading staff...</div>
            ) : isError ? (
              <div className="py-8 text-center text-accent-red">{getApiErrorMessage(error)}</div>
            ) : displayedUsers.length === 0 ? (
              <div className="py-8 text-center text-text-muted">No staff found.</div>
            ) : (
              <ul className="divide-y divide-card-border">
                {displayedUsers.map((user, idx) => (
                  <li key={user.id} className="p-4">
                    <div className="flex items-start gap-3">
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.avatarUrl} alt="" loading="lazy" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs text-text-muted">
                          {user.firstName?.[0] ?? ''}{user.lastName?.[0] ?? ''}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary break-words">
                          <span className="text-text-muted mr-1.5">{pageStart + idx + 1}.</span>
                          {user.firstName} {user.middleInitial ? `${user.middleInitial}. ` : ''}{user.lastName}
                        </p>
                        <p className="text-xs text-text-secondary break-words">{user.email}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <RoleBadge role={user.role.name} />
                          <span className="badge badge-neutral"><span className={`badge-dot ${user.isActive ? 'bg-accent-green' : 'bg-accent-red'}`} />{user.isActive ? 'Active' : 'Disabled'}</span>
                          <span className="text-xs text-text-muted">{user.branch?.name ?? <span className="text-accent-orange">Unassigned</span>}</span>
                        </div>
                        <button
                          onClick={() => handleChangeBranch(user)}
                          className="group mt-2 inline-flex items-center gap-2 rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-3 py-1.5 text-sm font-semibold text-accent-blue transition-all hover:bg-accent-blue hover:text-white active:translate-y-0"
                        >
                          <Store size={14} /> Assign Branch
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-text-secondary">
          <span>Showing {visibleUsers.length === 0 ? 0 : pageStart + 1} to {pageStart + displayedUsers.length} of {visibleUsers.length} entries</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2.5 py-1 rounded-lg border border-card-border disabled:opacity-50 hover:opacity-80 transition-colors">Previous</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => setCurrentPage(p)} className={`px-2.5 py-1 rounded-lg transition-colors ${p === currentPage ? 'bg-btn-primary text-btn-primary-text' : 'border border-card-border hover:opacity-80'}`}>{p}</button>
              ))}
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2.5 py-1 rounded-lg border border-card-border disabled:opacity-50 hover:opacity-80 transition-colors">Next</button>
            </div>
          )}
        </div>
      </div>

      {/* Assign Branch Modal */}
      {showBranchModal && selectedUser && (
        <Modal title="Assign Branch" onClose={closeBranchModal}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-card-border">
              {selectedUser.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedUser.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold text-text-primary">
                  {selectedUser.firstName?.[0] ?? ''}{selectedUser.lastName?.[0] ?? ''}
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-text-primary">{selectedUser.firstName} {selectedUser.lastName}</p>
                <p className="text-xs text-text-muted">{selectedUser.email}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Current Branch</label>
              <p className="text-sm text-text-secondary px-3 py-2 rounded-lg bg-white/5 border border-card-border">
                {selectedUser.branch?.name ?? <span className="text-accent-orange">Unassigned</span>}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">New Branch</label>
              <Select value={selectedBranchId} onChange={(v) => { setSelectedBranchId(v); setFormDirty(true); }} ariaLabel="New branch" placeholder="Select a branch" className="w-full" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
            </div>

            {formError && (
              <div className="rounded-lg bg-accent-red/10 border border-accent-red/30 px-3 py-2 text-sm text-accent-red">{formError}</div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button onClick={closeBranchModal} className="px-4 py-2 border border-input-border rounded-lg text-sm text-text-primary hover:opacity-80 transition">Cancel</button>
              <button onClick={handleSaveBranch} disabled={updateUser.isPending} className="px-4 py-2 btn-grad rounded-lg text-sm font-medium disabled:opacity-60">
                {updateUser.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ===========================================================================
// OWNER VIEW — Full user management (add, edit, archive)
// ===========================================================================
interface FormData {
  firstName: string;
  middleInitial: string;
  lastName: string;
  email: string;
  roleId: string;
  branchId: string;
  isActive: boolean;
  password: string;
  confirmPassword: string;
  avatarUrl: string;
}

function OwnerUsersView() {
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, error } = useUsers(search);
  const { data: roles = [] } = useRoles();
  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetUserPassword();
  const archiveUser = useArchiveUser();

  const allUsers = data?.data ?? [];

  const [entriesPerPage, setEntriesPerPage] = useState<number | 'All'>(10);
  const [roleFilter, setRoleFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedUser, setSelectedUser] = useState<FullUser | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  // Filter by role (All / Owner / Admin / Staff).
  const users = roleFilter ? allUsers.filter((u) => u.role.name === roleFilter) : allUsers;

  const closeAdd = useUnsavedGuard(formDirty, () => setShowAddModal(false));
  const closeEdit = useUnsavedGuard(formDirty, () => { setShowEditModal(false); setSelectedUser(null); });
  const closeBranchModal = useUnsavedGuard(formDirty, () => { setShowBranchModal(false); setSelectedUser(null); });

  const [formData, setFormData] = useState<FormData>({
    firstName: '', middleInitial: '', lastName: '', email: '',
    roleId: '', branchId: '', isActive: true, password: '', confirmPassword: '', avatarUrl: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const selectedRoleName = roles.find((r) => r.id === formData.roleId)?.name;
  const isStaffRole = selectedRoleName === 'Staff';

  const totalPages = entriesPerPage === 'All' ? 1 : Math.max(1, Math.ceil(users.length / entriesPerPage));
  const pageStart = entriesPerPage === 'All' ? 0 : (currentPage - 1) * entriesPerPage;
  const displayedUsers = entriesPerPage === 'All' ? users : users.slice(pageStart, pageStart + entriesPerPage);

  const resetForm = () => {
    setFormData({
      firstName: '', middleInitial: '', lastName: '', email: '',
      roleId: roles.find((r) => r.name === 'Staff')?.id ?? roles[0]?.id ?? '',
      branchId: branches[0]?.id ?? '', isActive: true, password: '', confirmPassword: '', avatarUrl: '',
    });
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFormError(null);
  };

  const handleAdd = () => { resetForm(); setFormDirty(false); setShowAddModal(true); };

  const handleEdit = (user: FullUser) => {
    setSelectedUser(user);
    setFormError(null);
    setFormDirty(false);
    setFormData({
      firstName: user.firstName,
      middleInitial: user.middleInitial ?? '',
      lastName: user.lastName,
      email: user.email,
      roleId: user.role.id,
      branchId: user.branchId ?? branches[0]?.id ?? '',
      isActive: user.isActive,
      password: '',
      confirmPassword: '',
      avatarUrl: user.avatarUrl ?? '',
    });
    setShowEditModal(true);
  };

  const handleArchive = (user: FullUser) => { setSelectedUser(user); setFormError(null); setShowArchiveModal(true); };

  const handleAssignBranch = (user: FullUser) => {
    setSelectedUser(user);
    setSelectedBranchId(user.branchId ?? '');
    setFormError(null);
    setFormDirty(false);
    setShowBranchModal(true);
  };

  const handleSaveBranch = async () => {
    if (!selectedUser) return;
    if (!selectedBranchId) { setFormError('Please select a branch.'); return; }
    setFormError(null);
    try {
      await withScrollPreserved(() => updateUser.mutateAsync({ id: selectedUser.id, branchId: selectedBranchId }));
      setFormDirty(false);
      setShowBranchModal(false);
      setSelectedUser(null);
    } catch (e) { setFormError(getApiErrorMessage(e)); }
  };

  const confirmArchive = async () => {
    if (!selectedUser) return;
    try {
      await archiveUser.mutateAsync(selectedUser.id);
      setShowArchiveModal(false);
      setSelectedUser(null);
    } catch (e) { setFormError(getApiErrorMessage(e)); }
  };

  const validate = (requirePassword: boolean) => {
    if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.email.trim()) {
      setFormError('First name, last name and email are required.');
      return false;
    }
    if (!formData.roleId) { setFormError('Please select a role.'); return false; }
    if (isStaffRole && !formData.branchId) { setFormError('Staff must be assigned to a shop.'); return false; }
    if ((requirePassword || formData.password || formData.confirmPassword) && formData.password !== formData.confirmPassword) {
      setFormError('Passwords do not match.');
      return false;
    }
    if (requirePassword && !formData.password) { setFormError('Password is required.'); return false; }
    setFormError(null);
    return true;
  };

  const handleSaveUser = async () => {
    if (!validate(true)) return;
    try {
      await createUser.mutateAsync({
        email: formData.email.trim(),
        password: formData.password,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        middleInitial: formData.middleInitial.trim() || undefined,
        roleId: formData.roleId,
        branchId: isStaffRole ? formData.branchId : undefined,
        avatarUrl: formData.avatarUrl || undefined,
      });
      setFormDirty(false);
      setShowAddModal(false);
    } catch (e) { setFormError(getApiErrorMessage(e)); }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser || !validate(false)) return;
    try {
      await withScrollPreserved(() => updateUser.mutateAsync({
        id: selectedUser.id,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        middleInitial: formData.middleInitial.trim() || undefined,
        email: formData.email.trim(),
        roleId: formData.roleId,
        branchId: isStaffRole ? formData.branchId : null,
        isActive: formData.isActive,
        avatarUrl: formData.avatarUrl,
      }));
      if (formData.password) {
        await resetPassword.mutateAsync({
          id: selectedUser.id,
          newPassword: formData.password,
          confirmPassword: formData.confirmPassword,
        });
      }
      setFormDirty(false);
      setShowEditModal(false);
      setSelectedUser(null);
    } catch (e) { setFormError(getApiErrorMessage(e)); }
  };

  const generatePassword = () => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const nums = '23456789';
    const special = '!@#$%*?';
    const all = upper + lower + nums + special;
    let pwd = upper[Math.floor(Math.random() * upper.length)]
      + lower[Math.floor(Math.random() * lower.length)]
      + nums[Math.floor(Math.random() * nums.length)]
      + special[Math.floor(Math.random() * special.length)];
    for (let i = 0; i < 8; i++) pwd += all[Math.floor(Math.random() * all.length)];
    const shuffled = pwd.split('').sort(() => Math.random() - 0.5).join('');
    setFormData((f) => ({ ...f, password: shuffled, confirmPassword: shuffled }));
    setShowPassword(true);
    setShowConfirmPassword(true);
    setFormDirty(true);
  };

  const isSaving = createUser.isPending || updateUser.isPending || resetPassword.isPending;

  const renderUserForm = (isEdit: boolean) => (
    <div className="space-y-4" onInput={() => setFormDirty(true)}>
      <div className="flex items-center gap-4">
        {formData.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={formData.avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover border border-card-border" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white text-xl font-bold border border-card-border">
            {(formData.firstName[0] ?? '').toUpperCase()}{(formData.lastName[0] ?? '').toUpperCase()}
          </div>
        )}
        <div className="flex-1 space-y-2">
          <div className="border border-input-border rounded-lg px-3 py-2 flex items-center gap-2 bg-input-bg">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { setFormError(null); setCropFile(file); }
                e.currentTarget.value = '';
              }}
              className="w-full text-xs text-text-secondary file:mr-2 file:py-1.5 file:px-3 file:rounded file:border file:border-input-border file:bg-btn-primary file:text-btn-primary-text file:text-xs file:cursor-pointer"
            />
          </div>
          {formData.avatarUrl && (
            <button type="button" onClick={() => { setFormData((f) => ({ ...f, avatarUrl: '' })); setFormDirty(true); }} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent-red/10 border border-accent-red/30 text-xs font-medium text-accent-red hover:bg-accent-red/20 transition-colors">
              <Trash2 size={12} /> Remove
            </button>
          )}
        </div>
      </div>

      {/* 12-col grid: First(5) / M.I.(2) / Last(5) keeps the name fields
          readable even on a ~375px phone, with M.I. staying compact. */}
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-5">
          <label className="block text-sm font-medium text-text-primary mb-1">First Name <span className="text-accent-red">*</span></label>
          <input type="text" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} className="glass-select w-full px-3 py-2 rounded-lg focus:outline-none text-sm" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-text-primary mb-1">M.I.</label>
          <input type="text" value={formData.middleInitial} onChange={(e) => setFormData({ ...formData, middleInitial: e.target.value })} className="glass-select w-full px-3 py-2 rounded-lg focus:outline-none text-sm" maxLength={2} />
        </div>
        <div className="col-span-5">
          <label className="block text-sm font-medium text-text-primary mb-1">Last Name <span className="text-accent-red">*</span></label>
          <input type="text" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} className="glass-select w-full px-3 py-2 rounded-lg focus:outline-none text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Status</label>
          <Select value={formData.isActive ? 'Active' : 'Disabled'} onChange={(v) => { setFormData({ ...formData, isActive: v === 'Active' }); setFormDirty(true); }} ariaLabel="Status" className="w-full" options={[{ value: 'Active', label: 'Active' }, { value: 'Disabled', label: 'Disabled' }]} />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Role <span className="text-accent-red">*</span></label>
          <Select value={formData.roleId} onChange={(v) => { setFormData({ ...formData, roleId: v }); setFormDirty(true); }} ariaLabel="Role" placeholder="Select role" className="w-full" options={roles.map((r) => ({ value: r.id, label: r.name }))} />
        </div>
      </div>

      {isStaffRole && (
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Shop</label>
          <Select value={formData.branchId} onChange={(v) => { setFormData({ ...formData, branchId: v }); setFormDirty(true); }} ariaLabel="Shop" placeholder="Select shop" className="w-full" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Email <span className="text-accent-red">*</span></label>
        <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="glass-select w-full px-3 py-2 rounded-lg focus:outline-none text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">
          Password {isEdit && <span className="text-text-muted font-normal">(Leave blank to keep current password)</span>}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus text-sm pr-10" placeholder={isEdit ? 'Leave blank to keep current' : ''} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button type="button" onClick={generatePassword} className="px-3 py-2 bg-accent-blue text-white rounded-lg text-sm flex items-center gap-1 hover:opacity-90">
            <RefreshCw size={14} /> Generate
          </button>
        </div>
        <p className="text-xs text-text-muted mt-1">Minimum 4 characters.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Confirm Password</label>
        <div className="relative">
          <input type={showConfirmPassword ? 'text' : 'password'} value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus text-sm pr-10" />
          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {formError && (
        <div className="rounded-lg bg-accent-red/10 border border-accent-red/30 px-3 py-2 text-sm text-accent-red">{formError}</div>
      )}

      <button onClick={isEdit ? handleUpdateUser : handleSaveUser} disabled={isSaving} className="w-full btn-grad py-2.5 rounded-lg font-medium disabled:opacity-60">
        {isSaving ? 'Saving...' : isEdit ? 'Update User' : 'Save User'}
      </button>
    </div>
  );

  return (
    <div className="p-6 bg-page-bg min-h-screen">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Users</h1>
        <button onClick={handleAdd} className="flex items-center gap-2 btn-grad px-4 py-2 rounded-lg font-medium">
          <Plus size={18} /> Add New User
        </button>
      </div>

      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-card-border">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2.5">
              <label className="text-sm text-text-secondary">Show</label>
              <Select value={String(entriesPerPage)} onChange={(v) => { setEntriesPerPage(v === 'All' ? 'All' : Number(v)); setCurrentPage(1); }} ariaLabel="Entries per page" className="w-auto min-w-[80px]" options={[...[5, 10, 25, 50, 100].map((n) => ({ value: String(n), label: String(n) })), { value: 'All', label: 'All' }]} />
              <span className="text-sm text-text-secondary">entries</span>
            </div>
            <div className="flex items-center gap-2.5">
              <label className="text-sm text-text-secondary">Role</label>
              <Select value={roleFilter} onChange={(v) => { setRoleFilter(v); setCurrentPage(1); }} ariaLabel="Filter by role" className="w-auto min-w-[130px]" options={[{ value: '', label: 'All Roles' }, { value: 'Owner', label: 'Owner' }, { value: 'Admin', label: 'Admin' }, { value: 'Staff', label: 'Staff' }]} />
            </div>
          </div>
          <div className="relative w-full sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" placeholder="Search users..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="w-full pl-9 pr-4 py-2 border border-input-border rounded-lg bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" />
          </div>
        </div>

        <div>
          <table className="hidden w-full table-fixed md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase w-[44px]">#</th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase w-[64px]">Image</th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase w-[15%]">Name</th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase w-[19%]">Email</th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase w-[11%]">Role</th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase w-[14%]">Shop</th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase w-[10%]">Status</th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase w-[13%]">Last Login</th>
                <th className="px-3 py-3.5 text-right text-xs font-semibold uppercase w-[110px]"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading users...</td></tr>
              ) : isError ? (
                <tr><td colSpan={9} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : displayedUsers.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-text-muted">No users found.</td></tr>
              ) : displayedUsers.map((user, idx) => (
                <tr key={user.id} className="border-b border-card-border align-middle transition hover:bg-white/[0.02]">
                  <td className="px-3 py-4 text-sm text-text-primary align-middle">{pageStart + idx + 1}</td>
                  <td className="px-3 py-4 align-middle">
                    {user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatarUrl} alt="" loading="lazy" width={36} height={36} className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-xs text-text-muted">
                        {user.firstName?.[0] ?? ''}{user.lastName?.[0] ?? ''}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-4 text-sm text-text-primary font-medium align-middle truncate" title={`${user.firstName} ${user.lastName}`}>
                    {user.firstName} {user.middleInitial ? `${user.middleInitial}. ` : ''}{user.lastName}
                  </td>
                  <td className="px-3 py-4 text-sm text-text-secondary align-middle truncate" title={user.email}>{user.email}</td>
                  <td className="px-3 py-4 align-middle"><RoleBadge role={user.role.name} /></td>
                  <td className="px-3 py-4 text-sm text-text-secondary align-middle truncate" title={user.branch?.name ?? 'N/A'}>{user.branch?.name ?? 'N/A'}</td>
                  <td className="px-3 py-4 align-middle">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="badge badge-neutral">
                        <span className={`badge-dot ${user.isActive ? 'bg-accent-green' : 'bg-accent-red'}`} />
                        {user.isActive ? 'Active' : 'Disabled'}
                      </span>
                      {user.isLocked && (
                        <span className="rounded-full bg-accent-red/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-accent-red">Locked</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-4 text-xs text-text-muted align-middle truncate" title={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}>
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <div className="flex items-center justify-end gap-0.5">
                      {user.role.name === 'Staff' && (
                        <button
                          onClick={() => handleAssignBranch(user)}
                          title="Assign Branch"
                          aria-label="Assign Branch"
                          className="p-1.5 text-accent-blue hover:bg-accent-blue/10 rounded-lg transition"
                        >
                          <Store size={15} />
                        </button>
                      )}
                      <button onClick={() => handleEdit(user)} className="p-1.5 text-accent-blue hover:bg-accent-blue/10 rounded-lg transition" title="Edit">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleArchive(user)} className="p-1.5 text-accent-archive hover:bg-accent-archive/10 rounded-lg transition" title="Archive">
                        <Archive size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: user cards (hidden on desktop). */}
          <div className="md:hidden">
            {isLoading ? (
              <div className="py-8 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading users...</div>
            ) : isError ? (
              <div className="py-8 text-center text-accent-red">{getApiErrorMessage(error)}</div>
            ) : displayedUsers.length === 0 ? (
              <div className="py-8 text-center text-text-muted">No users found.</div>
            ) : (
              <ul className="divide-y divide-card-border">
                {displayedUsers.map((user, idx) => (
                  <li key={user.id} className="p-4">
                    <div className="flex items-start gap-3">
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.avatarUrl} alt="" loading="lazy" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs text-text-muted">
                          {user.firstName?.[0] ?? ''}{user.lastName?.[0] ?? ''}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary break-words">
                          <span className="text-text-muted mr-1.5">{pageStart + idx + 1}.</span>
                          {user.firstName} {user.middleInitial ? `${user.middleInitial}. ` : ''}{user.lastName}
                        </p>
                        <p className="text-xs text-text-secondary break-words">{user.email}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <RoleBadge role={user.role.name} />
                          <span className="badge badge-neutral"><span className={`badge-dot ${user.isActive ? 'bg-accent-green' : 'bg-accent-red'}`} />{user.isActive ? 'Active' : 'Disabled'}</span>
                          {user.isLocked && <span className="rounded-full bg-accent-red/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-accent-red">Locked</span>}
                          <span className="text-xs text-text-muted">{user.branch?.name ?? 'N/A'}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-text-muted">Last login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}</p>
                        {user.role.name === 'Staff' && (
                          <button
                            onClick={() => handleAssignBranch(user)}
                            className="group mt-2 inline-flex items-center gap-2 rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-3 py-1.5 text-sm font-semibold text-accent-blue transition-all hover:bg-accent-blue hover:text-white active:translate-y-0"
                          >
                            <Store size={14} /> Assign Branch
                          </button>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => handleEdit(user)} className="flex h-10 w-10 items-center justify-center rounded-lg text-accent-blue hover:bg-accent-blue/10 transition" title="Edit"><Pencil size={16} /></button>
                        <button onClick={() => handleArchive(user)} className="flex h-10 w-10 items-center justify-center rounded-lg text-accent-archive hover:bg-accent-archive/10 transition" title="Archive"><Archive size={16} /></button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-text-secondary">
          <span>Showing {users.length === 0 ? 0 : pageStart + 1} to {pageStart + displayedUsers.length} of {users.length} entries</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2.5 py-1 rounded-lg border border-card-border disabled:opacity-50 hover:opacity-80 transition-colors">Previous</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => setCurrentPage(p)} className={`px-2.5 py-1 rounded-lg transition-colors ${p === currentPage ? 'bg-btn-primary text-btn-primary-text' : 'border border-card-border hover:opacity-80'}`}>{p}</button>
              ))}
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2.5 py-1 rounded-lg border border-card-border disabled:opacity-50 hover:opacity-80 transition-colors">Next</button>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <Modal title="Add New User" onClose={closeAdd}>{renderUserForm(false)}</Modal>
      )}
      {showEditModal && (
        <Modal title="Edit User" onClose={closeEdit}>{renderUserForm(true)}</Modal>
      )}
      {showArchiveModal && selectedUser && (
        <Modal title="Archive User" onClose={() => setShowArchiveModal(false)}>
          <p className="text-sm text-text-secondary mb-4">
            Are you sure you want to archive <strong>{selectedUser.firstName} {selectedUser.lastName}</strong>? This user will be moved to the archive.
          </p>
          {formError && <div className="rounded-lg bg-accent-red/10 border border-accent-red/30 px-3 py-2 text-sm text-accent-red mb-3">{formError}</div>}
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowArchiveModal(false)} className="px-4 py-2 border border-input-border rounded-lg text-sm text-text-primary hover:opacity-80 transition">Cancel</button>
            <button onClick={confirmArchive} disabled={archiveUser.isPending} className="px-4 py-2 bg-accent-archive text-white rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-60">
              {archiveUser.isPending ? 'Archiving...' : 'Yes, Archive'}
            </button>
          </div>
        </Modal>
      )}

      {showBranchModal && selectedUser && (
        <Modal title="Assign Branch" onClose={closeBranchModal}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-card-border">
              {selectedUser.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedUser.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold text-text-primary">
                  {selectedUser.firstName?.[0] ?? ''}{selectedUser.lastName?.[0] ?? ''}
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-text-primary">{selectedUser.firstName} {selectedUser.lastName}</p>
                <p className="text-xs text-text-muted">{selectedUser.email}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Current Branch</label>
              <p className="text-sm text-text-secondary px-3 py-2 rounded-lg bg-white/5 border border-card-border">
                {selectedUser.branch?.name ?? <span className="text-accent-orange">Unassigned</span>}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">New Branch</label>
              <Select value={selectedBranchId} onChange={(v) => { setSelectedBranchId(v); setFormDirty(true); }} ariaLabel="New branch" placeholder="Select a branch" className="w-full" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
            </div>

            {formError && (
              <div className="rounded-lg bg-accent-red/10 border border-accent-red/30 px-3 py-2 text-sm text-accent-red">{formError}</div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button onClick={closeBranchModal} className="px-4 py-2 border border-input-border rounded-lg text-sm text-text-primary hover:opacity-80 transition">Cancel</button>
              <button onClick={handleSaveBranch} disabled={updateUser.isPending} className="px-4 py-2 btn-grad rounded-lg text-sm font-medium disabled:opacity-60">
                {updateUser.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {cropFile && (
        <ImageCropModal
          file={cropFile}
          title="Crop profile photo"
          shape="circle"
          onCancel={() => setCropFile(null)}
          onCropped={(dataUrl) => { setFormData((f) => ({ ...f, avatarUrl: dataUrl })); setCropFile(null); setFormDirty(true); }}
        />
      )}
    </div>
  );
}

// ===========================================================================
// PAGE — Routes to the correct view based on role
// ===========================================================================
export default function UsersPage() {
  const currentRole = useAuthStore((s) => s.user?.role?.name);
  const isOwner = currentRole === 'Owner';

  if (!isOwner) {
    return <AdminStaffView />;
  }

  return <OwnerUsersView />;
}
