'use client';

import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, getApiErrorMessage } from '@/lib/api';
import type { ApiEnvelope, UserListItem } from '@/lib/types';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { Modal } from './Modal';

interface ChangePasswordModalProps {
  user: UserListItem | null;
  onClose: () => void;
}

const inputClass =
  'w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-text-primary placeholder-text-muted outline-none transition-colors focus:border-input-focus focus:ring-2 focus:ring-input-focus/30';

export function ChangePasswordModal({ user, onClose }: ChangePasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) return undefined;
      const response = await api.patch<ApiEnvelope<{ message: string }>>(
        `/users/${user.id}/password`,
        { newPassword, confirmPassword },
      );
      return response.data;
    },
    onSuccess: () => {
      setSuccess(true);
    },
    onError: (err) => {
      setFormError(getApiErrorMessage(err, 'Could not update the password.'));
    },
  });

  function handleClose() {
    setNewPassword('');
    setConfirmPassword('');
    setFormError(null);
    setSuccess(false);
    onClose();
  }

  // Prompt only when there's an unsaved password typed and it wasn't saved.
  const dirty = !success && (newPassword.length > 0 || confirmPassword.length > 0);
  const guardedClose = useUnsavedGuard(dirty, handleClose);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    mutation.mutate();
  }

  const title = user
    ? `Change password — ${user.firstName} ${user.lastName}`
    : 'Change password';

  return (
    <Modal open={!!user} onClose={guardedClose} title={title}>
      {success ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-accent-green/10 border border-accent-green/30 px-3 py-2 text-sm text-accent-green">
            Password updated. The user will need to log in again with the new password.
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="btn-grad rounded-lg px-4 py-2 text-sm font-medium"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">New password</label>
            <input
              type="password"
              className={inputClass}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Confirm new password
            </label>
            <input
              type="password"
              className={inputClass}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <p className="text-xs text-text-muted">
            Min 8 characters, with an uppercase, lowercase, a number and a special character (@$!%*?&).
          </p>

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
              {mutation.isPending ? 'Saving…' : 'Update password'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
