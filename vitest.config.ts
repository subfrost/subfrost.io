import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/reference/**',
      '**/.next/**',
    ],
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
    },
  },
});
