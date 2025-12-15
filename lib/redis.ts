/**
 * Redis client for caching
 */
import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let connectionPromise: Promise<RedisClientType> | null = null;

/**
 * Get or create Redis client
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.warn('REDIS_URL not configured, caching disabled');
    return null;
  }

  if (client?.isOpen) {
    return client;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      client = createClient({ url: redisUrl });

      client.on('error', (err) => {
        console.error('Redis client error:', err);
      });

      await client.connect();
      console.log('Redis connected');
      return client;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      client = null;
      connectionPromise = null;
      throw error;
    }
  })();

  return connectionPromise;
}

/**
 * Cache wrapper with automatic serialization
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;

    const value = await redis.get(key);
    if (!value) return null;

    return JSON.parse(value) as T;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

/**
 * Cache set with automatic serialization
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = 60
): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;

    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

/**
 * Cache delete
 */
export async function cacheDel(key: string): Promise<void> {
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
