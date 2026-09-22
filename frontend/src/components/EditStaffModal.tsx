'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiErrorMessage } from '@/lib/api';
import { Select } from '@/components/Select';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import type { ApiEnvelope, Branch, RoleOption, UserListItem } from '@/lib/types';
import { Modal } from './Modal';

interface EditStaffModalProps {
  user: UserListItem | null;
  onClose: () => void;
  roles: RoleOption[];
  branches: Branch[];
}

const inputClass =
  'w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-text-primary placeholder-text-muted outline-none transition-colors focus:border-input-focus focus:ring-2 focus:ring-input-focus/30';

export function EditStaffModal({ user, onClose, roles, branches }: EditStaffModalProps) {
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [branchId, setBranchId] = useState<string>('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const guardedClose = useUnsavedGuard(dirty, onClose);

  // Reset the form whenever a different user is opened.
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
      setEmail(user.email);
      setRoleId(user.role.id);
      setBranchId(user.branchId ?? '');
      setIsActive(user.isActive);
      setFormError(null);
      setDirty(false);
    }
  }, [user]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const payload: Record<string, unknown> = {
        firstName,
        lastName,
        email,
        roleId,
        isActive,
        // Send null to explicitly unassign the branch.
        branchId: branchId === '' ? null : branchId,
      };
      const response = await api.patch<ApiEnvelope<unknown>>(`/users/${user.id}`, payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err) => {
      setFormError(getApiErrorMessage(err, 'Could not update the staff member.'));
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setFormError('First name, last name and email are required.');
      return;
    }
    mutation.mutate();
  }

  const title = user ? `Edit staff — ${user.firstName} ${user.lastName}` : 'Edit staff';
  const activeBranches = branches.filter((b) => b.isActive);

  return (
    <Modal open={!!user} onClose={guardedClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-3" onInput={() => setDirty(true)}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">First name</label>
            <input
              className={inputClass}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Last name</label>
            <input
              className={inputClass}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Email</label>
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Role</label>
          <Select
            value={roleId}
            onChange={(v) => { setRoleId(v); setDirty(true); }}
            ariaLabel="Role"
            placeholder="Select role"
            className="w-full"
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Branch</label>
          <Select
            value={branchId}
            onChange={(v) => { setBranchId(v); setDirty(true); }}
            ariaLabel="Branch"
            className="w-full"
            options={[
              { value: '', label: '— No branch (Admin) —' },
              ...activeBranches.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          <p className="mt-1 text-xs text-text-muted">
            Staff are restricted to selling from their assigned branch. Admins can be left
            unassigned.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-input-border bg-input-bg text-accent-primary focus:ring-accent-primary"
          />
          Active (can log in)
        </label>

        {formError && (
          <div className="rounded-lg bg-accent-red/10 border border-accent-red/30 px-3 py-2 text-sm text-accent-red">{formError}</div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={guardedClose}
            className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-text-secondary hover:opacity-80 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn-grad rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {mutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
