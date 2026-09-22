import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  /** 'dark' or 'light' — applies to the content area only */
  contentTheme: 'dark' | 'light';
  toggleContentTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      contentTheme: 'dark',
      toggleContentTheme: () =>
        set((state) => ({
          contentTheme: state.contentTheme === 'dark' ? 'light' : 'dark',
        })),
    }),
    { name: 'vape-shop-content-theme' },
  ),
);
