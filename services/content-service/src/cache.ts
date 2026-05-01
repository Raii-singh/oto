import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redisClient: Redis | null = null;
let redisAvailable = true;

export const getRedis = (): Redis | null => {
  if (!redisAvailable) return null;
  if (!redisClient) {
    try {
      redisClient = new Redis(REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        connectTimeout: 2000,
        enableOfflineQueue: false,
        retryStrategy: () => null, // don't retry — fail fast
      });
      redisClient.on('error', (err) => {
        if (redisAvailable) {
          console.warn('[Redis] Unavailable — cache disabled:', err.message);
          redisAvailable = false;
          redisClient = null;
        }
      });
      redisClient.on('connect', () => {
        redisAvailable = true;
        console.log('[Redis] Connected ✅');
      });
    } catch {
      redisAvailable = false;
      return null;
    }
  }
  return redisClient;
};

export const TTL = {
  TRENDING: parseInt(process.env.REDIS_TTL_TRENDING || '1800'),  // 30min
  SEARCH:   parseInt(process.env.REDIS_TTL_SEARCH   || '300'),   // 5min
  DETAIL:   parseInt(process.env.REDIS_TTL_DETAIL   || '86400'), // 24h
};

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

export async function cacheSet(key: string, value: unknown, ttl: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttl);
  } catch { /* cache failure is non-fatal */ }
}

export const cacheKey = {
  trending: () => 'oto:trending',
  search: (q: string) => `oto:search:${q.toLowerCase().trim()}`,
  detail: (id: string) => `oto:content:${id}`,
};
