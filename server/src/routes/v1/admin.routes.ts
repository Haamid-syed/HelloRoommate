import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  paginationSchema,
  updateUserStatusSchema,
  type PaginationInput,
  type UpdateUserStatusInput,
} from 'shared';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as adminService from '../../services/admin.service.js';

const router = Router();

type RequestWithValidatedQuery<T> = Request & { validatedQuery: T };

function validatedQuery<T>(req: Request): T {
  return (req as RequestWithValidatedQuery<T>).validatedQuery;
}

function paramId(req: Request, resourceName: string): string {
  const id = req.params.id;
  if (typeof id !== 'string') {
    throw Object.assign(new Error(`${resourceName} ID is required`), { statusCode: 400 });
  }
  return id;
}

router.get('/metrics', authenticate, requireRole('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const metrics = await adminService.getMetrics();
    res.json({ success: true, data: { metrics } });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/users',
  authenticate,
  requireRole('ADMIN'),
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await adminService.getUsers(validatedQuery<PaginationInput>(req));
      res.json({ success: true, data: { users: result.users }, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id/status',
  authenticate,
  requireRole('ADMIN'),
  validate(updateUserStatusSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { isActive } = req.body as UpdateUserStatusInput;
      const user = await adminService.updateUserStatus(req.user!.userId, paramId(req, 'User'), isActive);
      res.json({ success: true, data: { user } });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/listings',
  authenticate,
  requireRole('ADMIN'),
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await adminService.getListings(validatedQuery<PaginationInput>(req));
      res.json({ success: true, data: { listings: result.listings }, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/listings/:id',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const listing = await adminService.moderateListing(req.user!.userId, paramId(req, 'Listing'));
      res.json({ success: true, data: { listing } });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/activity',
  authenticate,
  requireRole('ADMIN'),
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await adminService.getActivityLogs(validatedQuery<PaginationInput>(req));
      res.json({ success: true, data: { logs: result.logs }, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/notifications',
  authenticate,
  requireRole('ADMIN'),
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await adminService.getNotifications(validatedQuery<PaginationInput>(req));
      res.json({ success: true, data: { notifications: result.notifications }, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/notifications/:id/retry',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notification = await adminService.retryNotification(
        req.user!.userId,
        paramId(req, 'Notification')
      );
      res.json({ success: true, data: { notification } });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
