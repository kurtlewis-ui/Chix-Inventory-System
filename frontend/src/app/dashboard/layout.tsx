'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { useThemeStore } from '@/lib/theme';
import {
  LayoutDashboard,
  Store,
  Package,
  Tag,
  PhilippinePeso,
  Users,
  ClipboardList,
  Archive,
  ChevronDown,
  LogOut,
  Menu,
  X,
  Settings,
  Moon,
  Sun,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  dropdown?: { label: string; href: string }[];
}

const ownerNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'Shops', href: '/dashboard/shops', icon: <Store size={18} /> },
  { label: 'Brands', href: '/dashboard/brands', icon: <Tag size={18} /> },
  { label: 'Products', href: '/dashboard/products', icon: <Package size={18} /> },
  {
    label: 'Sales',
    href: '/dashboard/sales',
    icon: <PhilippinePeso size={18} />,
    dropdown: [
      { label: 'Records', href: '/dashboard/sales/records' },
      { label: 'Pending', href: '/dashboard/sales/pending' },
      { label: 'Disposals', href: '/dashboard/sales/disposals' },
    ],
  },
  { label: 'Users', href: '/dashboard/users', icon: <Users size={18} /> },
  { label: 'Activity Logs', href: '/dashboard/activity-logs', icon: <ClipboardList size={18} /> },
  {
    label: 'Archive',
    href: '/dashboard/archive',
    icon: <Archive size={18} />,
    dropdown: [
      { label: 'Users Archive', href: '/dashboard/archive/users' },
      { label: 'Shops Archive', href: '/dashboard/archive/shops' },
      { label: 'Products Archive', href: '/dashboard/archive/products' },
      { label: 'Brands Archive', href: '/dashboard/archive/brands' },
    ],
  },
];

// Admin is a viewer/approver: it sees most of what the Owner sees, but the
// pages themselves render read-only (no create/edit/restock/delete) and never
// expose cost. The only actions Admin performs are approving/declining pending
// sales, disposals and expenses, plus managing Staff accounts + branch
// assignments. Cost-derived pages (Profit & Loss) and Archive are omitted.
const adminNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'Shops', href: '/dashboard/shops', icon: <Store size={18} /> },
  { label: 'Brands', href: '/dashboard/brands', icon: <Tag size={18} /> },
  { label: 'Products', href: '/dashboard/products', icon: <Package size={18} /> },
  {
    label: 'Sales',
    href: '/dashboard/sales',
    icon: <PhilippinePeso size={18} />,
    dropdown: [
      { label: 'Records', href: '/dashboard/sales/records' },
      { label: 'Pending', href: '/dashboard/sales/pending' },
      { label: 'Disposals', href: '/dashboard/sales/disposals' },
    ],
  },
  { label: 'Staff', href: '/dashboard/users', icon: <Users size={18} /> },
  { label: 'Activity Logs', href: '/dashboard/activity-logs', icon: <ClipboardList size={18} /> },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, accessToken, logout } = useAuthStore();
  const { contentTheme, toggleContentTheme } = useThemeStore();
  const [mounted, setMounted] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [themeAnimKey, setThemeAnimKey] = useState(0);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openDropdown) return;
    const onPointerDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdown(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openDropdown]);

  useEffect(() => {
    setOpenDropdown(null);
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !accessToken) {
      router.replace('/login');
    } else if (mounted && user && user.role?.name === 'Staff') {
      router.replace('/staff');
    }
  }, [mounted, accessToken, user, router]);

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  function handleThemeToggle() {
    toggleContentTheme();
    setThemeAnimKey((k) => k + 1);
  }

  const isAdmin = user?.role?.name === 'Admin';
  const navItems = isAdmin ? adminNavItems : ownerNavItems;

  const isActive = (item: NavItem) => {
    if (item.href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(item.href);
  };

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center" style={{ background: '#0f0f0f' }}>
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm" style={{ color: '#a0a0a0' }}>Loading...</p>
        </div>
      </main>
    );
  }

  if (!accessToken || (user && user.role?.name === 'Staff')) {
    return null;
  }

  return (
    <div className="min-h-screen" style={{ background: '#0f0f0f' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — always fixed, always dark. Restrained glass: translucent
          nav tint + blur for depth, keeping the dark black-and-white identity. */}
      <aside
        ref={navRef}
        className={`fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col bg-nav-bg/80 backdrop-blur-xl border-r border-nav-border transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-4 px-5 py-5 border-b border-nav-border">
          <img src="/logo.svg" alt="CHX Inventory System" className="h-9 w-9 object-contain" />
          <p className="text-base font-bold text-white">CHX Inventory System</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = isActive(item);
            const hasDropdown = !!item.dropdown;
            const isOpen = openDropdown === item.label;

            return (
              <div key={item.label}>
                {hasDropdown ? (
                  <button
                    onClick={() => setOpenDropdown(isOpen ? null : item.label)}
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                      active
                        ? 'bg-white/10 text-white border-l-[3px] border-white'
                        : 'text-nav-text hover:text-white hover:bg-white/5 border-l-[3px] border-transparent'
                    }`}
                  >
                    <span className={active ? 'text-white' : 'text-nav-text'}>{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                      active
                        ? 'bg-white/10 text-white border-l-[3px] border-white'
                        : 'text-nav-text hover:text-white hover:bg-white/5 border-l-[3px] border-transparent'
                    }`}
                  >
                    <span className={active ? 'text-white' : 'text-nav-text'}>{item.icon}</span>
                    {item.label}
                  </Link>
                )}

                {/* Dropdown sub-items — subtle glass sub-panel so it reads as
                    a flyout within the already-glass sidebar. */}
                {hasDropdown && isOpen && (
                  <div className="ml-6 mt-1 space-y-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-1 backdrop-blur-sm">
                    {item.dropdown!.map((sub) => {
                      const subActive = pathname === sub.href;
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                            subActive
                              ? 'text-white bg-white/5'
                              : 'text-nav-text hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User section at bottom */}
        <div className="border-t border-nav-border px-4 py-4">
          <div className="flex items-center gap-3">
            {user?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/20" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white ring-1 ring-white/20">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-[11px] text-nav-text truncate">{user?.role?.name}</p>
            </div>
            {/* Theme toggle — in-flow so it never overlaps the name/role */}
            <button
              onClick={handleThemeToggle}
              className="shrink-0 p-1.5 rounded-lg text-[#999999] hover:text-white hover:bg-white/5 transition-colors"
              title={contentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              <span key={themeAnimKey} className="theme-icon-enter inline-block">
                {contentTheme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              </span>
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Link
              href="/dashboard/settings"
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[#999999] hover:text-white hover:bg-white/5 transition-colors"
              title="Settings"
            >
              <Settings size={14} />
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[#999999] hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area — offset by sidebar width, applies theme */}
      <div className={`lg:ml-[240px] flex-1 flex flex-col min-h-screen content-transition ${contentTheme === 'light' ? 'content-light' : ''}`}>
        {/* Top bar (mobile only) */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 bg-[#141414]/95 backdrop-blur-md border-b border-nav-border lg:hidden">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center rounded-lg p-2 text-[#999999] hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Toggle navigation"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-4">
            <img src="/logo.svg" alt="CHX Inventory System" className="h-9 w-9 object-contain" />
            <span className="text-base font-bold text-white">CHX Inventory System</span>
          </div>
          <div className="w-9" />
        </header>

        {/* Page Content — give desktop more room to breathe (the doc noted the
            desktop view felt cramped while mobile/tablet were fine). Wider max
            width and more horizontal padding step up at lg/xl; small screens
            are unchanged. */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] xl:max-w-[1440px] w-full mx-auto bg-page-bg">{children}</main>
      </div>
    </div>
  );
}
