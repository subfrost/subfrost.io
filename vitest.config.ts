import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  optimizeDeps: {
    exclude: ['@alkanes/ts-sdk'],
  },
  test: {
    environment: 'happy-dom',
    server: {
      deps: {
        inline: ['@alkanes/ts-sdk'],
      },
    },
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/reference/**',
      '**/.next/**',
    ],
    // Use forks pool to properly share WASM state across tests
    pool: 'forks',
    // Extended timeouts for RPC calls - increased for full pagination
    testTimeout: 300000,
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html'],
      reportsDirectory: './coverage',
      include: [
        'app/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.d.ts',
        '**/node_modules/**',
        '**/reference/**',
        '**/tests/**',
        '**/__mocks__/**',
        'lib/prisma.ts',
        'app/layout.tsx',
        'app/page.tsx',
      ],
    },
    mockReset: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      // Explicit WASM alias for proper loading
      '@alkanes/ts-sdk/wasm': path.resolve(__dirname, './reference/alkanes-rs/ts-sdk/build/wasm/index.js'),
      '@alkanes/ts-sdk': path.resolve(__dirname, './reference/alkanes-rs/ts-sdk/dist/index.mjs'),
    },
  },
});
