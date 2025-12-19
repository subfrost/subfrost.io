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
};

export default nextConfig;
