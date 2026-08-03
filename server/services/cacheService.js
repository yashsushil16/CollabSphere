import redisClient from '../config/redis.js';

// Fallback in-memory L1 cache store
const memoryCache = new Map();

export async function getCachedQuery(roomId, queryText) {
  const cacheKey = `cache:${roomId}:${normalizeQuery(queryText)}`;

  if (redisClient) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        console.log(`[Cache L1 Hit - Redis] Key: ${cacheKey}`);
        return typeof cached === 'string' ? JSON.parse(cached) : cached;
      }
    } catch (err) {
      console.warn('[Redis Cache Get Error]:', err.message);
    }
  }

  // Memory fallback
  if (memoryCache.has(cacheKey)) {
    console.log(`[Cache L1 Hit - In-Memory] Key: ${cacheKey}`);
    return memoryCache.get(cacheKey);
  }

  return null;
}

export async function setCachedQuery(roomId, queryText, responseData, ttlSeconds = 300) {
  const cacheKey = `cache:${roomId}:${normalizeQuery(queryText)}`;

  if (redisClient) {
    try {
      await redisClient.set(cacheKey, JSON.stringify(responseData), { ex: ttlSeconds });
    } catch (err) {
      console.warn('[Redis Cache Set Error]:', err.message);
    }
  }

  // Always store in memory cache too
  memoryCache.set(cacheKey, responseData);
  
  // Clean memory cache if it exceeds 500 items
  if (memoryCache.size > 500) {
    const firstKey = memoryCache.keys().next().value;
    memoryCache.delete(firstKey);
  }
}

function normalizeQuery(q) {
  return String(q).toLowerCase().trim().replace(/[^\w\s]/gi, '');
}
