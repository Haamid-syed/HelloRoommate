import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { upsertTenantProfileSchema } from 'shared';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as tenantService from '../../services/tenant.service.js';

const router = Router();

router.put(
  '/me/profile',
  authenticate,
  requireRole('TENANT'),
  validate(upsertTenantProfileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await tenantService.upsertTenantProfile(req.user!.userId, req.body);
      res.json({ success: true, data: { profile } });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/me/profile',
  authenticate,
  requireRole('TENANT'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await tenantService.getTenantProfile(req.user!.userId);
      res.json({ success: true, data: { profile } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
