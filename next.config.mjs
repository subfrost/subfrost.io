/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployment
  output: 'standalone',

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },

  // Turbopack configuration (Next.js 16+)
  turbopack: {},

  // Mark packages with native/WASM dependencies as external
  // This prevents the bundler from transforming __dirname and breaking WASM loading
  serverExternalPackages: ['@alkanes/ts-sdk'],

  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK || 'mainnet',
  },

  // Proxy HLS segments from GCS through the main domain (same-origin, no CORS)
  async rewrites() {
    return [
      {
        source: '/stream/:path*',
        destination: `https://storage.googleapis.com/${process.env.GCS_BUCKET || 'subfrost-live-streams'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
