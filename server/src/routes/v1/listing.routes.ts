import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  createListingSchema,
  listingsFilterSchema,
  paginationSchema,
  type ListingsFilterInput,
  type PaginationInput,
  updateListingSchema,
} from 'shared';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as listingService from '../../services/listing.service.js';

const router = Router();

type RequestWithValidatedQuery<T> = Request & { validatedQuery: T };

function validatedQuery<T>(req: Request): T {
  return (req as RequestWithValidatedQuery<T>).validatedQuery;
}

function listingIdFrom(req: Request): string {
  const id = req.params.id;

  if (typeof id !== 'string') {
    throw Object.assign(new Error('Listing ID is required'), { statusCode: 400 });
  }

  return id;
}

async function getTenantProfileId(req: Request): Promise<string | undefined> {
  if (req.user?.role !== 'TENANT') return undefined;

  const profile = await prisma.tenantProfile.findUnique({
    where: { userId: req.user.userId },
    select: { id: true },
  });

  return profile?.id;
}

router.post(
  '/',
  authenticate,
  requireRole('OWNER'),
  validate(createListingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const listing = await listingService.createListing(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: { listing } });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id',
  authenticate,
  requireRole('OWNER'),
  validate(updateListingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const listing = await listingService.updateListing(listingIdFrom(req), req.user!.userId, req.body);
      res.json({ success: true, data: { listing } });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/fill',
  authenticate,
  requireRole('OWNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const listing = await listingService.fillListing(listingIdFrom(req), req.user!.userId);
      res.json({ success: true, data: { listing } });
    } catch (err) {
      next(err);
    }
  }
);

// This static route must be declared before /:id.
router.get(
  '/mine',
  authenticate,
  requireRole('OWNER'),
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await listingService.getOwnerListings(
        req.user!.userId,
        validatedQuery<PaginationInput>(req)
      );
      res.json({ success: true, data: { listings: result.listings }, meta: result.meta });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/',
  authenticate,
  validate(listingsFilterSchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await listingService.searchListings(
        validatedQuery<ListingsFilterInput>(req),
        await getTenantProfileId(req)
      );
      res.json({ success: true, data: { listings: result.listings }, meta: result.meta });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const listing = await listingService.getListingById(listingIdFrom(req), await getTenantProfileId(req));
    res.json({ success: true, data: { listing } });
  } catch (err) {
    next(err);
  }
});

export default router;
