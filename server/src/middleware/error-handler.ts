import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

/**
 * Global error handler middleware.
 * Catches all unhandled errors and returns a consistent error envelope.
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.headers['x-request-id'] ?? 'unknown';

  logger.error(
    {
      err,
      requestId,
      method: req.method,
      url: req.originalUrl,
      userId: req.user?.userId,
    },
    'Unhandled error'
  );

  // Prisma known errors
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as { code: string; meta?: Record<string, unknown> };

    if (prismaErr.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'A record with this data already exists',
          details: prismaErr.meta,
        },
      });
      return;
    }

    if (prismaErr.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Record not found' },
      });
      return;
    }
  }

  const statusCode = 'statusCode' in err ? (err as { statusCode: number }).statusCode : 500;

  res.status(statusCode).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env['NODE_ENV'] === 'production'
          ? 'An unexpected error occurred'
          : err.message,
    },
  });
}
