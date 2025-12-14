/**
 * Mock utilities for Redis caching
 *
 * Provides utilities for testing API routes that use Redis caching.
 */

import { vi } from 'vitest';

// In-memory cache for testing
const mockCache = new Map<string, { value: unknown; expires: number }>();

/**
 * Create a mock Redis client
 */
export function createMockRedisClient() {
  return {
    isOpen: true,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockImplementation(async (key: string) => {
      const entry = mockCache.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expires) {
        mockCache.delete(key);
        return null;
      }
      return JSON.stringify(entry.value);
    }),
    set: vi.fn().mockImplementation(async (key: string, value: string, options?: { EX?: number }) => {
      const ttl = options?.EX || 60;
      mockCache.set(key, {
        value: JSON.parse(value),
        expires: Date.now() + ttl * 1000,
      });
      return 'OK';
    }),
    del: vi.fn().mockImplementation(async (key: string) => {
      mockCache.delete(key);
      return 1;
    }),
    on: vi.fn(),
  };
}

/**
 * Clear the mock cache
 */
export function clearMockCache() {
  mockCache.clear();
}

/**
 * Setup the redis mock module - bypasses cache so compute functions run
 */
export function setupRedisMockBypassCache() {
  vi.mock('@/lib/redis', () => ({
    getRedisClient: vi.fn().mockResolvedValue(null),
    cacheGet: vi.fn().mockResolvedValue(null),
    cacheSet: vi.fn().mockResolvedValue(undefined),
    cacheDel: vi.fn().mockResolvedValue(undefined),
    cacheGetOrCompute: vi.fn().mockImplementation(async <T>(
      _key: string,
      computeFn: () => Promise<T>,
      _ttl?: number
    ): Promise<T> => {
      return computeFn();
    }),
  }));
}

/**
 * Setup the redis mock module - uses in-memory cache
 */
export function setupRedisMockWithCache() {
  const mockClient = createMockRedisClient();

  vi.mock('@/lib/redis', () => ({
    getRedisClient: vi.fn().mockResolvedValue(mockClient),
    cacheGet: vi.fn().mockImplementation(async <T>(key: string): Promise<T | null> => {
      const entry = mockCache.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expires) {
        mockCache.delete(key);
        return null;
      }
      return entry.value as T;
    }),
    cacheSet: vi.fn().mockImplementation(async <T>(
      key: string,
      value: T,
      ttlSeconds: number = 60
    ) => {
      mockCache.set(key, {
        value,
        expires: Date.now() + ttlSeconds * 1000,
      });
    }),
    cacheDel: vi.fn().mockImplementation(async (key: string) => {
      mockCache.delete(key);
    }),
    cacheGetOrCompute: vi.fn().mockImplementation(async <T>(
      key: string,
      computeFn: () => Promise<T>,
      ttlSeconds: number = 60
    ): Promise<T> => {
      const entry = mockCache.get(key);
      if (entry && Date.now() <= entry.expires) {
        return entry.value as T;
      }
      const value = await computeFn();
      mockCache.set(key, {
        value,
        expires: Date.now() + ttlSeconds * 1000,
      });
      return value;
    }),
  }));

  return { mockClient, clearCache: clearMockCache };
}
