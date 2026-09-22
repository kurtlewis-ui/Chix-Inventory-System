/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Type errors still fail the build; we only skip lint-only failures here.
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Tree-shake icon/chart packages used app-wide so each page only bundles
    // the symbols it actually imports (smaller per-page JS).
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
};

export default nextConfig;
