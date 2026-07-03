import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

  devIndicators: false,

  // Turbopack configuration (Next.js 16+)
  // Pin root so Next doesn't infer from parent lockfiles and accidentally
  // resolve dependencies from outside this repo.
  turbopack: {
    root: __dirname,
  },

  // Mark packages with native/WASM dependencies as external
  // This prevents the bundler from transforming __dirname and breaking WASM loading
  serverExternalPackages: ['@alkanes/ts-sdk', 'sharp'],

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

  // Vanity link: /download -> the SUBFROST Chrome Web Store listing.
  // Temporary (307) so it isn't browser-cached forever — keeps the option to
  // later make /download a landing page (e.g. Chrome + Firefox builds).
  async redirects() {
    return [
      {
        source: '/download',
        destination:
          'https://chromewebstore.google.com/detail/subfrost/pcmlnnfmcdmaifmleedbhomhaeldkeen',
        permanent: false,
      },
    ];
  },

};

export default nextConfig;
