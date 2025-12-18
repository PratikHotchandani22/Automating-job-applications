/**
 * Upstash Redis Client
 * 
 * Lightweight Redis client using Upstash REST API.
 * Falls back to in-memory cache if Redis is not configured.
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const isRedisConfigured = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

// In-memory fallback cache
const memoryCache = new Map();
const MEMORY_CACHE_MAX_SIZE = 1000;
const MEMORY_CACHE_DEFAULT_TTL = 3600; // 1 hour

/**
 * Execute a Redis command via Upstash REST API
 */
async function redisCommand(command, ...args) {
  if (!isRedisConfigured) {
    return null;
  }

  try {
    const response = await fetch(`${UPSTASH_URL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([command, ...args])
    });

    if (!response.ok) {
      console.error(`Redis error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error('Redis command failed:', error);
    return null;
  }
}

/**
 * Check if Redis is available
 */
export function isConfigured() {
  return isRedisConfigured;
}

/**
 * Get a value from cache
 */
export async function get(key) {
  // Try Redis first
  if (isRedisConfigured) {
    const value = await redisCommand('GET', key);
    if (value !== null) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return null;
  }

  // Fallback to memory cache
  const cached = memoryCache.get(key);
  if (cached) {
    if (cached.expiresAt && Date.now() > cached.expiresAt) {
      memoryCache.delete(key);
      return null;
    }
    return cached.value;
  }
  return null;
}

/**
 * Set a value in cache
 * @param {string} key - Cache key
 * @param {any} value - Value to cache (will be JSON stringified)
 * @param {number} ttlSeconds - Time to live in seconds (default: 1 hour)
 */
export async function set(key, value, ttlSeconds = MEMORY_CACHE_DEFAULT_TTL) {
  const serialized = JSON.stringify(value);

  // Try Redis first
  if (isRedisConfigured) {
    if (ttlSeconds > 0) {
      return await redisCommand('SETEX', key, ttlSeconds, serialized);
    }
    return await redisCommand('SET', key, serialized);
  }

  // Fallback to memory cache
  // Evict oldest entries if cache is full
  if (memoryCache.size >= MEMORY_CACHE_MAX_SIZE) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }

  memoryCache.set(key, {
    value,
    expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null
  });
  return 'OK';
}

/**
 * Delete a key from cache
 */
export async function del(key) {
  if (isRedisConfigured) {
    return await redisCommand('DEL', key);
  }
  return memoryCache.delete(key) ? 1 : 0;
}

/**
 * Check if key exists
 */
export async function exists(key) {
  if (isRedisConfigured) {
    return await redisCommand('EXISTS', key);
  }
  
  const cached = memoryCache.get(key);
  if (cached) {
    if (cached.expiresAt && Date.now() > cached.expiresAt) {
      memoryCache.delete(key);
      return 0;
    }
    return 1;
  }
  return 0;
}

/**
 * Get remaining TTL for a key
 */
export async function ttl(key) {
  if (isRedisConfigured) {
    return await redisCommand('TTL', key);
  }

  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt) {
    const remaining = Math.ceil((cached.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }
  return cached ? -1 : -2;
}

/**
 * Increment a counter
 */
export async function incr(key) {
  if (isRedisConfigured) {
    return await redisCommand('INCR', key);
  }

  const cached = memoryCache.get(key);
  const newValue = (cached?.value || 0) + 1;
  memoryCache.set(key, { value: newValue, expiresAt: cached?.expiresAt });
  return newValue;
}

/**
 * Set expiry on existing key
 */
export async function expire(key, seconds) {
  if (isRedisConfigured) {
    return await redisCommand('EXPIRE', key, seconds);
  }

  const cached = memoryCache.get(key);
  if (cached) {
    cached.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }
  return 0;
}

// =============================================================================
// High-level caching utilities
// =============================================================================

/**
 * Cache key generators
 */
export const cacheKeys = {
  evidenceScores: (resumeHash, rulesHash) => `evidence:${resumeHash}:${rulesHash}`,
  embeddings: (resumeHash, embedKeyHash) => `embed:${resumeHash}:${embedKeyHash}`,
  runStatus: (runId) => `run:${runId}:status`,
  userProfile: (userId) => `user:${userId}:profile`,
  userRunCount: (userId, month) => `user:${userId}:runs:${month}`,
  rateLimit: (userId, action) => `rate:${userId}:${action}`
};

/**
 * Cache TTLs in seconds
 */
export const cacheTTL = {
  evidenceScores: 86400 * 30, // 30 days (evidence scores don't change often)
  embeddings: 86400 * 30, // 30 days
  runStatus: 60, // 1 minute (status changes frequently)
  userProfile: 300, // 5 minutes
  userRunCount: 86400, // 1 day
  rateLimit: 60 // 1 minute
};

/**
 * Get or compute cached value
 * @param {string} key - Cache key
 * @param {Function} computeFn - Async function to compute value if not cached
 * @param {number} ttlSeconds - TTL for cached value
 */
export async function getOrCompute(key, computeFn, ttlSeconds = MEMORY_CACHE_DEFAULT_TTL) {
  // Check cache first
  const cached = await get(key);
  if (cached !== null) {
    return { value: cached, cached: true };
  }

  // Compute and cache
  const value = await computeFn();
  if (value !== null && value !== undefined) {
    await set(key, value, ttlSeconds);
  }

  return { value, cached: false };
}

/**
 * Rate limiting helper
 * Returns true if request should be allowed
 */
export async function checkRateLimit(userId, action, maxRequests = 10, windowSeconds = 60) {
  const key = cacheKeys.rateLimit(userId, action);
  
  if (isRedisConfigured) {
    const current = await redisCommand('INCR', key);
    if (current === 1) {
      await redisCommand('EXPIRE', key, windowSeconds);
    }
    return current <= maxRequests;
  }

  // Memory fallback
  const count = await incr(key);
  if (count === 1) {
    await expire(key, windowSeconds);
  }
  return count <= maxRequests;
}

/**
 * Clear all cache (use sparingly!)
 */
export async function flushAll() {
  if (isRedisConfigured) {
    console.warn('Flushing Redis cache...');
    return await redisCommand('FLUSHALL');
  }

  console.warn('Clearing memory cache...');
  memoryCache.clear();
  return 'OK';
}

/**
 * Get cache stats
 */
export async function getStats() {
  if (isRedisConfigured) {
    const info = await redisCommand('INFO', 'memory');
    const dbsize = await redisCommand('DBSIZE');
    return {
      type: 'redis',
      keys: dbsize,
      info: info
    };
  }

  return {
    type: 'memory',
    keys: memoryCache.size,
    maxSize: MEMORY_CACHE_MAX_SIZE
  };
}

export default {
  isConfigured,
  get,
  set,
  del,
  exists,
  ttl,
  incr,
  expire,
  cacheKeys,
  cacheTTL,
  getOrCompute,
  checkRateLimit,
  flushAll,
  getStats
};
