import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Primary backgrounds — deep blacks inspired by the logo's dark faceted background
        'page-bg': 'var(--content-page-bg, #0f0f0f)',
        'card-bg': 'var(--content-card-bg, #1a1a1a)',
        'card-border': 'var(--content-card-border, #2a2a2a)',
        // Subtle table header
        'table-header': 'var(--content-table-header, #1e1e1e)',
        'table-header-text': 'var(--content-table-header-text, #c0c0c0)',
        // Nav — dark charcoal sidebar (never changes)
        'nav-bg': '#141414',
        'nav-border': '#2a2a2a',
        'nav-text': '#999999',
        'nav-active': '#ffffff',
        // Text colors — adapt to content theme
        'text-primary': 'var(--content-text-primary, #f0f0f0)',
        'text-secondary': 'var(--content-text-secondary, #b0b0b0)',
        // Lifted from #666666 so muted subtitles / SKU metadata clear WCAG
        // contrast on dark surfaces (~4.5:1 on #1a1a1a) — less eye strain.
        'text-muted': 'var(--content-text-muted, #8a8a8a)',
        'text-link': 'var(--content-text-link, #d0d0d0)',
        // Accent colors — kept for charts/status in light mode & sales buttons
        'accent-primary': '#ffffff',
        'accent-teal': '#10b981',
        'accent-teal-light': '#34d399',
        'accent-teal-dark': '#059669',
        'accent-purple': '#a78bfa',
        'accent-purple-light': '#e0e0e0',
        'accent-pink': '#999999',
        'accent-cyan': '#a0a0a0',
        'accent-green': '#10b981',
        'accent-orange': '#f59e0b',
        'accent-blue': '#60a5fa',
        'accent-red': '#ef4444',
        'accent-coral': '#f87171',
        // Warm red-orange reserved for Archive (destructive) actions so they
        // read consistently across the app, distinct from plain red errors.
        'accent-archive': '#f2542d',
        // Neutral surface for badges/hover
        'surface-muted': 'var(--content-surface-muted, #222222)',
        // Buttons — theme-aware (white in dark, black in light)
        'btn-primary': 'var(--content-btn-primary, #ffffff)',
        'btn-primary-text': 'var(--content-btn-primary-text, #000000)',
        'btn-danger': '#ef4444',
        'btn-success': '#10b981',
        // Input/form colors — adapt to content theme
        'input-bg': 'var(--content-input-bg, #1a1a1a)',
        'input-border': 'var(--content-input-border, #333333)',
        'input-focus': 'var(--content-input-focus, #ffffff)',
      },
      fontFamily: {
        // Geist Sans for UI text, Geist Mono for numeric/tabular data. The
        // CSS variables are defined in the root layout via next/font. System
        // fonts are kept as fallbacks so text still renders before the font
        // loads (and if it ever fails).
        sans: [
          'var(--font-geist-sans)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'var(--font-geist-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 0.8s ease-in-out',
      },
    },
  },
  plugins: [],
};

export default config;
