import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import v1Router from './routes/v1/index.js';

export function createApp() {
  const app = express();

  // ── Security ────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(','),
      credentials: true,
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
    try {
      // Quick checks — will add Redis check when available
      const { prisma } = await import('./lib/prisma.js');
      await prisma.$queryRaw`SELECT 1`;

      res.json({ status: 'ready', services: { postgres: 'ok' } });
    } catch (err) {
      res.status(503).json({
        status: 'not ready',
        services: { postgres: 'error' },
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // ── API Routes ──────────────────────────────────
  app.use('/api/v1', v1Router);

  // ── Error handler (must be last) ────────────────
  app.use(errorHandler);

  return app;
}
