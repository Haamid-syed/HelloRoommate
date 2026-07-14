import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createInterestSchema, paginationSchema, type PaginationInput } from 'shared';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as interestService from '../../services/interest.service.js';

const router = Router();

type RequestWithValidatedQuery<T> = Request & { validatedQuery: T };

function validatedQuery<T>(req: Request): T {
  return (req as RequestWithValidatedQuery<T>).validatedQuery;
}

function interestIdFrom(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string') {
    throw Object.assign(new Error('Interest ID is required'), { statusCode: 400 });
  }
  return id;
}

router.post(
  '/',
  authenticate,
  requireRole('TENANT'),
  validate(createInterestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const interest = await interestService.createInterest(req.user!.userId, req.body.listingId as string);
      res.status(201).json({ success: true, data: { interest } });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/:id/accept',
  authenticate,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await interestService.acceptInterest(req.user!.userId, interestIdFrom(req));
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/:id/decline',
  authenticate,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const interest = await interestService.declineInterest(req.user!.userId, interestIdFrom(req));
      res.json({ success: true, data: { interest } });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/',
  authenticate,
  requireRole('TENANT', 'OWNER'),
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = req.user!.role as 'TENANT' | 'OWNER';
      const result = await interestService.getUserInterests(
        req.user!.userId,
        role,
        validatedQuery<PaginationInput>(req)
      );
      res.json({ success: true, data: { interests: result.interests }, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
