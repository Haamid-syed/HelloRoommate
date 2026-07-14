import type { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  routeGroup: string;
}

export function rateLimiter({ windowMs, max, routeGroup }: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
    const key = `ratelimit:${ip}:${routeGroup}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (redis.status !== 'ready') {
      logger.warn({ ip, routeGroup, redisStatus: redis.status }, '⚠️ Redis is not ready. Rate limiter failing open.');
      next();
      return;
    }

    try {
      const multi = redis.multi();
      // Remove logs older than the current window duration
      multi.zremrangebyscore(key, 0, windowStart);
      // Log this request timestamp
      multi.zadd(key, now, String(now));
      // Retrieve count of logs remaining in this window
      multi.zcard(key);
      // Set key TTL so Redis auto-reclaims space
      multi.expire(key, Math.ceil(windowMs / 1000));

      const results = await multi.exec();
      if (!results) {
        next();
        return;
      }

      // In ioredis, multi.exec() returns [err, result][]
      // The result of zcard is at index 2 (third command in transaction)
      const zcardResultTuple = results[2];
      if (!zcardResultTuple) {
        next();
        return;
      }
      
      const [err, requestCount] = zcardResultTuple;
      if (err) {
        throw err;
      }

      const count = requestCount as number;

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));

      if (count > max) {
        logger.warn({ ip, routeGroup, count }, '⚠️ Rate limit exceeded');
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error({ error, ip, routeGroup }, 'Error inside rate limiting middleware');
      // Fail-open: if Redis connection is down, log error and allow request to proceed
      next();
    }
  };
}

// ── Rate Limiter Configurations ──────────────────
// Limiters must be instantiated once and reused
export const authLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 5,              // Max 5 attempts
  routeGroup: 'auth',
});

export const apiLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100,            // Max 100 queries
  routeGroup: 'api',
});
