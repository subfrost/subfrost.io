/**
 * Redis client for caching with in-memory fallback
 */
import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let connectionPromise: Promise<RedisClientType | null> | null = null;

// ============================================================================
// In-Memory Fallback Cache (persists across Next.js hot reloads)
// ============================================================================

interface MemoryCacheEntry<T> {
  value: T;
  expiresAt: number;
}

// Use globalThis to persist cache across Next.js hot reloads in development
const globalForCache = globalThis as unknown as {
  memoryCache: Map<string, MemoryCacheEntry<unknown>> | undefined;
  memoryCacheCleanupInterval: ReturnType<typeof setInterval> | undefined;
};

const memoryCache = globalForCache.memoryCache ?? new Map<string, MemoryCacheEntry<unknown>>();
globalForCache.memoryCache = memoryCache;

/**
 * Clean expired entries from memory cache
 */
function cleanExpiredEntries(): void {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt <= now) {
      memoryCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[MemoryCache] Cleaned ${cleaned} expired entries, ${memoryCache.size} remaining`);
  }
}

// Clean expired entries every 60 seconds (only set up once)
if (!globalForCache.memoryCacheCleanupInterval) {
  globalForCache.memoryCacheCleanupInterval = setInterval(cleanExpiredEntries, 60000);
}

/**
 * Get value from memory cache
 */
function memoryGet<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) {
    console.log(`[MemoryCache] MISS: ${key} (not found, cache size: ${memoryCache.size})`);
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    console.log(`[MemoryCache] MISS: ${key} (expired)`);
    return null;
  }

  console.log(`[MemoryCache] HIT: ${key}`);
  return entry.value as T;
}

/**
 * Set value in memory cache
 */
function memorySet<T>(key: string, value: T, ttlSeconds: number): void {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  console.log(`[MemoryCache] SET: ${key} (TTL: ${ttlSeconds}s, cache size: ${memoryCache.size})`);
}

/**
 * Delete value from memory cache
 */
function memoryDel(key: string): void {
  memoryCache.delete(key);
}

// Track if Redis connection has failed to avoid repeated attempts
let redisConnectionFailed = false;

/**
 * Get or create Redis client
 * Returns null immediately if Redis is unavailable (uses memory cache fallback)
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return null;  // No URL configured, silently use memory cache
  }

  // If we already know Redis is unavailable, don't try again
  if (redisConnectionFailed) {
    return null;
  }

  if (client?.isOpen) {
    return client;
  }

  if (connectionPromise) {
    try {
      return await connectionPromise;
    } catch {
      return null;
    }
  }

  connectionPromise = (async () => {
    try {
      client = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 3000,  // 3 second timeout
          reconnectStrategy: false,  // Don't auto-reconnect, use memory cache instead
        },
      });

      // Suppress repeated error logs
      let errorLogged = false;
      client.on('error', (err) => {
        if (!errorLogged) {
          console.warn('Redis unavailable, using memory cache fallback');
          errorLogged = true;
        }
        redisConnectionFailed = true;
      });

      await client.connect();
      console.log('Redis connected');
      return client;
    } catch (error) {
      console.warn('Redis connection failed, using memory cache fallback');
      redisConnectionFailed = true;
      client = null;
      connectionPromise = null;
      return null;
    }
  })();

  return connectionPromise;
}

/**
 * Cache wrapper with automatic serialization
 * Falls back to in-memory cache when Redis is unavailable
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      // Fallback to memory cache
      return memoryGet<T>(key);
    }

    const value = await redis.get(key);
    if (!value) return null;

    return JSON.parse(value) as T;
  } catch (error) {
    console.error('Cache get error:', error);
    // Fallback to memory cache on error
    return memoryGet<T>(key);
  }
}

/**
 * Cache set with automatic serialization
 * Falls back to in-memory cache when Redis is unavailable
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = 60
): Promise<void> {
  // Always set in memory cache as fallback
  memorySet(key, value, ttlSeconds);

  try {
    const redis = await getRedisClient();
    if (!redis) return;

    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    console.error('Cache set error:', error);
    // Memory cache already set above, so we're covered
  }
}

/**
 * Cache delete
 * Removes from both Redis and in-memory cache
 */
export async function cacheDel(key: string): Promise<void> {
  // Always delete from memory cache
  memoryDel(key);

  try {
    const redis = await getRedisClient();
    if (!redis) return;

    await redis.del(key);
  } catch (error) {
    console.error('Cache delete error:', error);
  }
}

/**
 * Cache get or compute - returns cached value or computes and caches
 */
export async function cacheGetOrCompute<T>(
  key: string,
  computeFn: () => Promise<T>,
  ttlSeconds: number = 60
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }

  const value = await computeFn();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

/**
 * Acquire a distributed lock with retry logic
 * @param lockKey - Redis key for the lock
 * @param ttlSeconds - Time to live for the lock
 * @param maxWaitSeconds - Maximum time to wait for lock acquisition
 * @returns Lock token if acquired, null if failed to acquire
 */
export async function acquireLock(
  lockKey: string,
  ttlSeconds: number = 300,
  maxWaitSeconds: number = 600
): Promise<string | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      console.warn('Redis not available, skipping lock');
      return null;
    }

    const lockToken = `${Date.now()}-${Math.random()}`;
    const endTime = Date.now() + maxWaitSeconds * 1000;

    while (Date.now() < endTime) {
      // Try to set the lock with NX (only if not exists)
      const acquired = await redis.set(lockKey, lockToken, {
        NX: true,
        EX: ttlSeconds,
      });

      if (acquired) {
        console.log(`[Lock] Acquired lock: ${lockKey}`);
        return lockToken;
      }

      // Lock exists, wait and retry
      console.log(`[Lock] Waiting for lock: ${lockKey}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[Lock] Failed to acquire lock after ${maxWaitSeconds}s: ${lockKey}`);
    return null;
  } catch (error) {
    console.error('Lock acquisition error:', error);
    return null;
  }
}

/**
 * Release a distributed lock
 * @param lockKey - Redis key for the lock
 * @param lockToken - Token received when lock was acquired
 */
export async function releaseLock(lockKey: string, lockToken: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;

    // Only delete if the token matches (atomic operation using Lua script)
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    await redis.eval(script, {
      keys: [lockKey],
      arguments: [lockToken],
    });

    console.log(`[Lock] Released lock: ${lockKey}`);
  } catch (error) {
    console.error('Lock release error:', error);
  }
}

/**
 * Check if a lock exists
 */
export async function isLocked(lockKey: string): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis) return false;

    const exists = await redis.exists(lockKey);
    return exists === 1;
  } catch (error) {
    console.error('Lock check error:', error);
    return false;
  }
}
