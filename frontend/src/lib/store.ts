import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from './types';

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  setAuth: (accessToken: string, user: AuthUser) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  logout: () => void;
}

/**
 * Global auth store. Persists the access token + user to localStorage so a
 * page refresh keeps you logged in. (For production you'd keep the access
 * token in memory only and rely on the refresh-token cookie, but localStorage
 * keeps this starter simple to follow.)
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setAuth: (accessToken, user) => set({ accessToken, user }),
      updateUser: (patch) =>
        set((state) => ({ user: state.user ? { ...state.user, ...patch } : state.user })),
      logout: () => set({ accessToken: null, user: null }),
    }),
    {
      name: 'vape-shop-auth',
    },
  ),
);

interface SelectedBranchState {
  // The owner/admin's currently-selected branch filter, shared across the
  // pages that have a branch/shop filter (Pending Sales, Sales Records,
  // Disposals, Products, dashboard Profit & Loss). '' means "All Shops" on the
  // pages that offer it. Persisted so a refresh or navigation keeps the branch
  // you were working on instead of snapping back to the first/all shops.
  branchId: string;
  setBranchId: (branchId: string) => void;
}

export const useSelectedBranchStore = create<SelectedBranchState>()(
  persist(
    (set) => ({
      branchId: '',
      setBranchId: (branchId) => set({ branchId }),
    }),
    {
      name: 'vape-shop-selected-branch',
    },
  ),
);
