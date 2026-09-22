'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiErrorMessage } from '@/lib/api';
import type { ApiEnvelope, Branch } from '@/lib/types';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { Modal } from './Modal';

interface BranchModalProps {
  open: boolean;
  onClose: () => void;
  /** Branch to edit. If null, the modal is in "create" mode. */
  branch?: Branch | null;
}

const inputClass =
  'w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-text-primary placeholder-text-muted outline-none transition-colors focus:border-input-focus focus:ring-2 focus:ring-input-focus/30';

export function BranchModal({ open, onClose, branch }: BranchModalProps) {
  const queryClient = useQueryClient();
  const isEdit = !!branch;

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const guardedClose = useUnsavedGuard(dirty, onClose);

  // Sync the form whenever the modal opens with a (potentially different) branch.
  useEffect(() => {
    if (open) {
      setName(branch?.name ?? '');
      setAddress(branch?.address ?? '');
      setIsActive(branch?.isActive ?? true);
      setFormError(null);
      setDirty(false);
    }
  }, [open, branch]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        address: address.trim() || undefined,
        isActive,
      };
      if (isEdit && branch) {
        const response = await api.patch<ApiEnvelope<Branch>>(
          `/branches/${branch.id}`,
          payload,
        );
        return response.data;
      }
      const response = await api.post<ApiEnvelope<Branch>>('/branches', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      onClose();
    },
    onError: (err) => {
      setFormError(getApiErrorMessage(err, 'Could not save the branch.'));
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError('Branch name is required.');
      return;
    }
    mutation.mutate();
  }

  return (
    <Modal open={open} onClose={guardedClose} title={isEdit ? 'Edit branch' : 'Add new branch'}>
      <form onSubmit={handleSubmit} className="space-y-3" onInput={() => setDirty(true)}>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Branch name</label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. SM Branch"
            required
            maxLength={100}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">
            Address <span className="text-text-muted">(optional)</span>
          </label>
          <textarea
            className={inputClass}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            placeholder="Street, city, province"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-input-border bg-input-bg text-accent-primary focus:ring-accent-primary"
          />
          Active
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
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create branch'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
