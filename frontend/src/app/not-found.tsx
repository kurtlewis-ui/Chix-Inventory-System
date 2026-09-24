import Link from 'next/link';

/**
 * App-wide 404 page. Replaces Next's default unstyled 404 with a branded,
 * on-theme screen and a way back into the app.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-page-bg px-6 text-center">
      <img src="/logo.svg" alt="CHX Inventory System" className="mb-6 h-16 w-16 object-contain" />
      <p className="text-6xl font-black tracking-tight text-text-primary">404</p>
      <h1 className="mt-2 text-xl font-bold text-text-primary">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-text-secondary">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-btn-primary px-5 py-2.5 text-sm font-semibold text-btn-primary-text hover:opacity-90 transition"
        >
          Go to Home
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-input-border px-5 py-2.5 text-sm font-medium text-text-primary hover:bg-white/5 transition"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
