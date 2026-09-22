'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

// Landing route: send the visitor to the dashboard if logged in, else to login.
export default function Home() {
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!accessToken) {
      router.replace('/login');
      return;
    }
    router.replace(user?.role?.name === 'Staff' ? '/staff' : '/dashboard');
  }, [accessToken, user, router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-slate-500">Loading…</p>
    </main>
  );
}
