import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';
dotenv.config();

let redisClient = null;

const redisUrl = process.env.UPSTASH_REDIS_REST_URL ? process.env.UPSTASH_REDIS_REST_URL.trim() : '';
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ? process.env.UPSTASH_REDIS_REST_TOKEN.trim() : '';

if (redisUrl && redisUrl !== 'https://your-redis.upstash.io') {
  try {
    redisClient = new Redis({
      url: redisUrl,
      token: redisToken,
    });
    console.log('[Upstash Redis] Initialized successfully with REST URL.');
  } catch (err) {
    console.warn('[Upstash Redis] Initialization error:', err.message);
  }
} else {
  console.log('[Upstash Redis] Upstash URL not configured. Using in-memory L1 cache.');
}

export default redisClient;
