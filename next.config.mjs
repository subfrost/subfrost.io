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

  // Webpack configuration for WASM support
  webpack: (config, { isServer }) => {
    // WASM support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // WASM loader
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    // Fix for node: protocol imports in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }

    return config;
  },

  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK || 'mainnet',
  },
};

export default nextConfig;
