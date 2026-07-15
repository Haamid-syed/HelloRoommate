import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import {
  createListingSchema,
  listingsFilterSchema,
  paginationSchema,
  type ListingsFilterInput,
  type PaginationInput,
  updateListingSchema,
} from 'shared';
import { prisma } from '../../lib/prisma.js';
import { uploadToCloudinary } from '../../lib/cloudinary.js';
import { authenticate, optionalAuthenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { getOrGenerateExplanation } from '../../services/explanation.service.js';
import * as listingService from '../../services/listing.service.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only images are allowed'), { statusCode: 400 }) as any);
    }
  },
});

type RequestWithValidatedQuery<T> = Request & { validatedQuery: T };

router.post(
  '/upload',
  authenticate,
  requireRole('OWNER'),
  upload.single('photo'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: { message: 'Photo file is required' } });
        return;
      }
      const secureUrl = await uploadToCloudinary(req.file.buffer);
      res.json({ success: true, data: { url: secureUrl } });
    } catch (err) {
      next(err);
    }
  }
);

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

// List view: returns score + source label only (no explanation — Change 2)
router.get(
  '/',
  optionalAuthenticate,
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

// Detail view: fast read path (Change 2)
router.get('/:id', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const listingId = listingIdFrom(req);
    const tenantProfileId = await getTenantProfileId(req);
    const listing = await listingService.getListingById(listingId, tenantProfileId);
    res.json({ success: true, data: { listing } });
  } catch (err) {
    next(err);
  }
});

// Explanation endpoint: lazy, on-demand generation (Change 2)
router.get('/:id/explanation', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const listingId = listingIdFrom(req);
    const tenantProfileId = await getTenantProfileId(req);

    if (!tenantProfileId) {
      res.status(400).json({ success: false, error: { message: 'Only tenants can view compatibility explanations' } });
      return;
    }

    const listing = await listingService.getListingById(listingId, tenantProfileId);
    if (!listing.score) {
      res.status(404).json({ success: false, error: { message: 'No compatibility score exists for this listing' } });
      return;
    }

    // Fetch the full profile and listing data needed for explanation generation
    const [profile, fullListing] = await Promise.all([
      prisma.tenantProfile.findUnique({
        where: { id: tenantProfileId },
        select: {
          id: true,
          preferredCity: true,
          preferredAreas: true,
          budgetMin: true,
          budgetMax: true,
          moveInDate: true,
        },
      }),
      prisma.listing.findUnique({
        where: { id: listingId },
        select: { id: true, city: true, area: true, rent: true, availableFrom: true, roomType: true, furnishing: true },
      }),
    ]);

    if (!profile || !fullListing) {
      res.status(404).json({ success: false, error: { message: 'Tenant profile or listing not found' } });
      return;
    }

    const explanationData = await getOrGenerateExplanation(
      tenantProfileId,
      listingId,
      { ...profile, moveInDate: profile.moveInDate },
      fullListing
    );

    res.json({
      success: true,
      data: {
        score: listing.score.score,
        ...explanationData,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
