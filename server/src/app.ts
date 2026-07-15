import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import v1Router from './routes/v1/index.js';
import { authLimiter, apiLimiter } from './middleware/rate-limiter.js';
import { logger } from './lib/logger.js';

export function createApp() {
  const app = express();

  // ── Security ────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim().replace(/\/$/, '')),
      credentials: true,
      optionsSuccessStatus: 200,
    })
  );

  // ── Parsing ─────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // ── Observability ───────────────────────────────
  app.use(requestId);

  // ── Health checks ───────────────────────────────
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/readyz', async (_req, res) => {
    let dbOk = false;
    let redisOk = false;
    const errors: Record<string, string> = {};

    try {
      const { prisma } = await import('./lib/prisma.js');
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (err) {
      logger.error({ err }, 'readyz database check failed');
      errors['postgres'] = err instanceof Error ? err.message : 'Unknown database error';
    }

    try {
      const { redis } = await import('./lib/redis.js');
      if (redis.status !== 'ready') {
        throw new Error(`Redis client is not ready (status: ${redis.status})`);
      }
      const ping = await redis.ping();
      if (ping === 'PONG') {
        redisOk = true;
      } else {
        errors['redis'] = `Unexpected ping response: ${ping}`;
      }
    } catch (err) {
      logger.error({ err }, 'readyz Redis check failed');
      errors['redis'] = err instanceof Error ? err.message : 'Unknown Redis error';
    }

    if (dbOk && redisOk) {
      res.json({
        success: true,
        data: {
          status: 'ready',
          services: { postgres: 'ok', redis: 'ok' },
        },
      });
    } else {
      res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'One or more backing services are unavailable.',
          details: {
            status: 'error',
            services: {
              postgres: dbOk ? 'ok' : 'down',
              redis: redisOk ? 'ok' : 'down',
            },
            errors,
          },
        },
      });
    }
  });

  // ── API Routes & Rate Limiting ──────────────────
  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/register', authLimiter);
  app.use('/api/v1/auth/refresh', authLimiter);

  // General rate limits applied to all v1 endpoints
  app.use('/api/v1', apiLimiter, v1Router);

  // ── Error handler (must be last) ────────────────
  app.use(errorHandler);

  return app;
}
