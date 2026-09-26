'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Loader2, Save, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useMe, useUpdateProfile, useChangeOwnPassword } from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { getApiErrorMessage } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { ImageCropModal } from '@/components/ImageCropModal';

/**
 * Account settings (profile + change password). Shared by the admin dashboard
 * and the staff portal so both have the exact same account experience.
 */
export default function AccountSettings() {
  const router = useRouter();
  const { data: me, isLoading } = useMe();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangeOwnPassword();
  const toast = useToast();
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);

  // Profile form
  const [firstName, setFirstName] = useState('');
  const [middleInitial, setMiddleInitial] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileOk, setProfileOk] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Holds the post-password-change redirect timer so we can cancel it if the
  // component unmounts before it fires (avoids logout()/navigation on an
  // unmounted component).
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (redirectTimer.current) clearTimeout(redirectTimer.current); }, []);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState<string | null>(null);

  useEffect(() => {
    if (me) {
      setFirstName(me.firstName ?? '');
      setMiddleInitial(me.middleInitial ?? '');
      setLastName(me.lastName ?? '');
      setEmail(me.email ?? '');
      setAvatarUrl(me.avatarUrl ?? null);
    }
  }, [me]);

  function onPickPhoto(file?: File) {
    if (!file) return;
    setProfileError(null);
    // Open the cropper; the cropped square is applied in onCropped.
    setCropFile(file);
  }

  async function saveProfile() {
    setProfileError(null);
    setProfileOk(null);
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setProfileError('First name, last name and email are required.');
      return;
    }
    try {
      const updated = await updateProfile.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        middleInitial: middleInitial.trim(),
        email: email.trim(),
        avatarUrl: avatarUrl ?? '',
      });
      updateUser({
        firstName: updated.firstName,
        lastName: updated.lastName,
        middleInitial: updated.middleInitial,
        email: updated.email,
        avatarUrl: updated.avatarUrl,
      });
      setProfileOk('Profile updated.');
      toast.success('Profile updated.');
    } catch (e) {
      const msg = getApiErrorMessage(e);
      setProfileError(msg);
      toast.error(msg, "Couldn't update profile");
    }
  }

  async function savePassword() {
    setPwError(null);
    setPwOk(null);
    if (!currentPassword || !newPassword) {
      setPwError('Fill in your current and new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    try {
      // Trim so a stray space appended by the browser/password-manager autofill
      // can't cause a false "current password is incorrect".
      await changePassword.mutateAsync({
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
        confirmPassword: confirmPassword.trim(),
      });
      setPwOk('Password changed. Please log in again with your new password.');
      toast.success('Password changed. Please log in again.', 'Password updated');
      // The server invalidates all sessions on password change, so send the
      // user back to login after a short moment. Stored in a ref so it's
      // cancelled if the component unmounts first.
      redirectTimer.current = setTimeout(() => {
        logout();
        router.replace('/login');
      }, 1500);
    } catch (e) {
      const msg = getApiErrorMessage(e);
      setPwError(msg);
      toast.error(msg, "Couldn't change password");
    }
  }

  const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-text-primary">Settings</h1>

      {isLoading ? (
        <div className="text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading…</div>
      ) : (
        <>
          {/* Profile */}
          <div className="bg-card-bg border border-card-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-text-primary">Profile</h2>

            <div className="flex items-center gap-4">
              <div className="relative">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="avatar" className="w-16 h-16 rounded-full object-cover border border-card-border" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white text-xl font-bold border border-card-border">{initials}</div>
                )}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -right-1 bg-btn-primary text-btn-primary-text rounded-full p-1.5 shadow hover:opacity-90"
                  title="Change photo"
                >
                  <Camera size={14} />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onPickPhoto(e.target.files?.[0]); e.currentTarget.value = ''; }} />
              </div>
              <div className="text-sm text-text-secondary">
                <p className="font-medium text-text-primary">{me?.role?.name}</p>
                <p>Click the camera to change your photo.</p>
                {avatarUrl && (
                  <button onClick={() => setAvatarUrl(null)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent-red/10 border border-accent-red/30 text-xs font-medium text-accent-red hover:bg-accent-red/20 transition-colors mt-1">Remove photo</button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-sm font-medium text-text-primary mb-1">First Name</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">M.I.</label>
                <input value={middleInitial} maxLength={2} onChange={(e) => setMiddleInitial(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Last Name</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
            </div>

            {profileError && <p className="text-sm text-accent-red">{profileError}</p>}
            {profileOk && <p className="text-sm text-accent-green">{profileOk}</p>}

            <div className="flex justify-end">
              <button onClick={saveProfile} disabled={updateProfile.isPending} className="flex items-center gap-2 btn-grad px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
                <Save size={15} /> {updateProfile.isPending ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </div>

          {/* Password */}
          <div className="bg-card-bg border border-card-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><KeyRound size={18} /> Change Password</h2>

            {/* Hidden username field: giving the password manager the account
                it belongs to (and the autoComplete hints below) is what stops
                it from dumping a *saved* credential into "Current Password".
                Without this, Chrome/Google Password Manager would autofill the
                current-password box with a stale saved value, causing a false
                "current password is incorrect". */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={email}
              readOnly
              hidden
              aria-hidden="true"
            />
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Current Password</label>
              <input type={showPw ? 'text' : 'password'} name="current-password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">New Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} name="new-password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus pr-10" />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Confirm New Password</label>
                <input type={showPw ? 'text' : 'password'} name="confirm-new-password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
              </div>
            </div>

            {pwError && <p className="text-sm text-accent-red">{pwError}</p>}
            {pwOk && <p className="text-sm text-accent-green">{pwOk}</p>}

            <div className="flex justify-end">
              <button onClick={savePassword} disabled={changePassword.isPending} className="flex items-center gap-2 bg-btn-primary text-btn-primary-text px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60">
                <KeyRound size={15} /> {changePassword.isPending ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </div>
        </>
      )}

      {cropFile && (
        <ImageCropModal
          file={cropFile}
          title="Crop profile photo"
          shape="circle"
          onCancel={() => setCropFile(null)}
          onCropped={(dataUrl) => { setAvatarUrl(dataUrl); setCropFile(null); }}
        />
      )}
    </div>
  );
}
