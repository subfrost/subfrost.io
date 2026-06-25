import { vi, beforeAll, afterAll, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Polyfill crypto for Node.js (needed for cryptographic operations)
if (typeof globalThis.crypto === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  globalThis.crypto = require('crypto').webcrypto;
}

// Polyfill TextEncoder/TextDecoder for older Node.js versions
if (typeof globalThis.TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextEncoder, TextDecoder } = require('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.ALKANES_RPC_URL = 'https://mainnet.subfrost.io/v4/subfrost';

// Mock Next.js modules
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: () => new Headers(),
}));

// Global test lifecycle
beforeAll(() => {
  // Setup before all tests
});

afterEach(() => {
  // Cleanup after each test
  vi.clearAllMocks();
});

afterAll(() => {
  // Cleanup after all tests
});

// Export mock creation helpers
export const createMockPrismaClient = () => ({
  btcLockedSnapshot: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  frbtcSupplySnapshot: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  wrapTransaction: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  unwrapTransaction: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  syncState: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  dailyMetrics: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  },
  apiCache: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn((fn: any) => {
    if (typeof fn === 'function') {
      return fn(createMockPrismaClient());
    }
    return Promise.all(fn);
  }),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $connect: vi.fn(),
  $disconnect: vi.fn(),
});
