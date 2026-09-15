import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

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
      // One Lua invocation makes cleanup/add/count/expiry atomic. A UUID member avoids
      // same-millisecond collisions that previously undercounted concurrent requests.
      const count = Number(await redis.eval(
        `redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
         redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
         local count = redis.call('ZCARD', KEYS[1])
         redis.call('PEXPIRE', KEYS[1], ARGV[4])
         return count`,
        1,
        key,
        windowStart,
        now,
        `${now}:${crypto.randomUUID()}`,
        windowMs
      ));

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
  max: env.AUTH_RATE_LIMIT_MAX,
  routeGroup: 'auth',
});

export const apiLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: env.API_RATE_LIMIT_MAX,
  routeGroup: 'api',
});
