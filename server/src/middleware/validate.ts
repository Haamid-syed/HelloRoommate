import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodSchema } from 'zod';

/**
 * Zod validation middleware factory.
 * Validates request body, query, or params against a Zod schema.
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = schema.parse(req[source]);
      // Replace with parsed (and transformed) data
      if (source === 'body') req.body = data;
      else if (source === 'query') (req as unknown as Record<string, unknown>).validatedQuery = data;
      else (req as unknown as Record<string, unknown>).validatedParams = data;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: err.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
        });
        return;
      }
      next(err);
    }
  };
}
