'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, getApiErrorMessage, warmUpBackend } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import type { ApiEnvelope, AuthUser } from '@/lib/types';
import { Eye, EyeOff, Lock, Mail, AlertCircle } from 'lucide-react';

type LoginData = {
  accessToken: string;
  user: AuthUser;
};

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    warmUpBackend();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const slowTimer = setTimeout(() => setSlow(true), 4000);

    try {
      const response = await api.post<ApiEnvelope<LoginData>>('/auth/login', {
        email,
        password,
      });

      const { accessToken, user } = response.data.data;
      setAuth(accessToken, user);
      router.replace(user.role?.name === 'Staff' ? '/staff' : '/dashboard');
    } catch (err) {
      // Show a single, generic, professional message for any bad-credentials
      // response (wrong email OR wrong password — the backend deliberately
      // returns the same thing). A disabled account still gets its own message;
      // a genuine network/server issue falls through to a neutral notice.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        setError('Invalid email or password.');
      } else if (status === 403) {
        setError(getApiErrorMessage(err, 'Your account is disabled. Please contact an administrator.'));
      } else {
        setError(getApiErrorMessage(err, 'Something went wrong. Please try again.'));
      }
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10" style={{ background: '#0a1122' }}>
      {/* Subtle navy radial glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-[#3b5b9a]/10 blur-3xl" />

      <div className="relative flex w-full max-w-[420px] flex-col items-center">
        {/* Box/package logo in a flat white circle badge (navy box on white,
            no ring). Sized large on the login screen. */}
        <div className="mb-10">
          <img
            src="/logo.svg"
            alt="CHX Inventory System"
            className="h-[128px] w-[128px] sm:h-[152px] sm:w-[152px] object-contain"
          />
        </div>

        {/* Card */}
        <div className="w-full rounded-2xl bg-[#0f1b34]/95 border border-[#243b63] p-8 shadow-xl shadow-black/40">
          <div className="text-center mb-6">
            <h1 className="text-lg font-bold text-white">Welcome Back</h1>
            <p className="text-sm text-[#94a3c4] mt-1">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-[#b8c4de]">
                Email Address
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Mail size={18} className="text-[#7f8db0]" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-[#243b63] bg-[#0c1526] pl-11 pr-4 py-3 text-white placeholder-[#5b6b8c] outline-none transition-all focus:border-white/40 focus:ring-2 focus:ring-white/10"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-[#b8c4de]">
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Lock size={18} className="text-[#7f8db0]" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#243b63] bg-[#0c1526] pl-11 pr-12 py-3 text-white placeholder-[#5b6b8c] outline-none transition-all focus:border-white/40 focus:ring-2 focus:ring-white/10"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#7f8db0] hover:text-[#b8c4de] transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/20 px-4 py-3 text-sm text-[#ef4444]"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-white px-4 py-3.5 font-semibold text-black shadow-lg shadow-white/10 transition-all hover:bg-gray-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-5 w-5 animate-spin text-black" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {slow ? 'Waking the server…' : 'Logging in...'}
                </span>
              ) : (
                'LOG IN'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-[11px] text-[#7f8db0] tracking-wider uppercase">
          Inventory System
        </p>
      </div>
    </main>
  );
}
