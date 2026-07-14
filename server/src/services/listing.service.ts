import type { Prisma } from '@prisma/client';
import type {
  CreateListingInput,
  ListingsFilterInput,
  PaginationInput,
  UpdateListingInput,
} from 'shared';
import { prisma } from '../lib/prisma.js';
import { enqueueScoresForListing } from './scoring.service.js';

const listingInclude = {
  photos: { orderBy: { position: 'asc' as const } },
} as const;

async function getOwnedListing(listingId: string, ownerId: string) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });

  if (!listing) {
    throw Object.assign(new Error('Listing not found'), { statusCode: 404 });
  }

  if (listing.ownerId !== ownerId) {
    throw Object.assign(new Error('Not your listing'), { statusCode: 403 });
  }

  return listing;
}

/** Create a listing and its optional placeholder photo records. */
export async function createListing(ownerId: string, input: CreateListingInput) {
  const listing = await prisma.$transaction(async (tx) => {
    const createdListing = await tx.listing.create({
      data: {
        ownerId,
        title: input.title,
        city: input.city,
        area: input.area,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        rent: input.rent,
        availableFrom: new Date(input.availableFrom),
        roomType: input.roomType,
        furnishing: input.furnishing,
        description: input.description ?? '',
        photos: {
          create: (input.photoUrls ?? []).map((url, position) => ({ url, position })),
        },
      },
      include: listingInclude,
    });

    await tx.auditLog.create({
      data: {
        actorId: ownerId,
        action: 'LISTING_CREATED',
        entityType: 'LISTING',
        entityId: createdListing.id,
      },
    });

    return createdListing;
  });

  enqueueScoresForListing(listing.id).catch((err) => {
    console.error('Failed to enqueue scoring for new listing:', err);
  });

  return listing;
}

/** Update only supplied listing fields and replace photos when explicitly requested. */
export async function updateListing(listingId: string, ownerId: string, input: UpdateListingInput) {
  await getOwnedListing(listingId, ownerId);

  const data: Prisma.ListingUpdateInput = {};

  if (input.title !== undefined) data.title = input.title;
  if (input.city !== undefined) data.city = input.city;
  if (input.area !== undefined) data.area = input.area;
  if (input.lat !== undefined) data.lat = input.lat;
  if (input.lng !== undefined) data.lng = input.lng;
  if (input.rent !== undefined) data.rent = input.rent;
  if (input.availableFrom !== undefined) data.availableFrom = new Date(input.availableFrom);
  if (input.roomType !== undefined) data.roomType = input.roomType;
  if (input.furnishing !== undefined) data.furnishing = input.furnishing;
  if (input.description !== undefined) data.description = input.description;

  const updated = await prisma.$transaction(async (tx) => {
    if (input.photoUrls !== undefined) {
      await tx.listingPhoto.deleteMany({ where: { listingId } });

      if (input.photoUrls.length > 0) {
        await tx.listingPhoto.createMany({
          data: input.photoUrls.map((url, position) => ({ listingId, url, position })),
        });
      }
    }

    const updatedListing = await tx.listing.update({
      where: { id: listingId },
      data,
      include: listingInclude,
    });

    await tx.auditLog.create({
      data: {
        actorId: ownerId,
        action: 'LISTING_UPDATED',
        entityType: 'LISTING',
        entityId: listingId,
      },
    });

    return updatedListing;
  });

  enqueueScoresForListing(updated.id).catch((err) => {
    console.error('Failed to enqueue scoring for updated listing:', err);
  });

  return updated;
}

/** Mark an active listing as filled so it no longer appears in tenant searches. */
export async function fillListing(listingId: string, ownerId: string) {
  const listing = await getOwnedListing(listingId, ownerId);

  if (listing.status !== 'ACTIVE') {
    throw Object.assign(new Error('Only active listings can be marked as filled'), { statusCode: 400 });
  }

  return prisma.$transaction(async (tx) => {
    const updatedListing = await tx.listing.update({
      where: { id: listingId },
      data: { status: 'FILLED' },
      include: listingInclude,
    });

    await tx.auditLog.create({
      data: {
        actorId: ownerId,
        action: 'LISTING_FILLED',
        entityType: 'LISTING',
        entityId: listingId,
      },
    });

    return updatedListing;
  });
}

/** Return an owner's listings using keyset pagination. */
export async function getOwnerListings(ownerId: string, params: PaginationInput) {
  const limit = params.limit ?? 20;
  const listings = await prisma.listing.findMany({
    where: { ownerId },
    include: listingInclude,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });

  const hasMore = listings.length > limit;
  if (hasMore) listings.pop();

  return {
    listings,
    meta: {
      cursor: listings.length > 0 ? listings[listings.length - 1]!.id : null,
      hasMore,
    },
  };
}

/** Search active listings with optional tenant compatibility-score data. */
export async function searchListings(filters: ListingsFilterInput, tenantProfileId?: string) {
  const where: Prisma.ListingWhereInput = { status: 'ACTIVE' };

  if (filters.city) {
    where.city = { equals: filters.city, mode: 'insensitive' };
  }

  if (filters.minRent !== undefined || filters.maxRent !== undefined) {
    where.rent = {
      ...(filters.minRent !== undefined ? { gte: filters.minRent } : {}),
      ...(filters.maxRent !== undefined ? { lte: filters.maxRent } : {}),
    };
  }

  if (filters.roomType) where.roomType = filters.roomType;
  if (filters.furnishing) where.furnishing = filters.furnishing;
  if (filters.availableFrom) where.availableFrom = { gte: new Date(filters.availableFrom) };

  const limit = filters.limit ?? 20;
  const fetchLimit =
    filters.sort === 'score' && tenantProfileId ? Math.min(limit * 3, 100) : limit + 1;

  const listings = await prisma.listing.findMany({
    where,
    include: {
      photos: { orderBy: { position: 'asc' } },
      owner: { select: { id: true, name: true, email: true } },
      compatibilityScores: tenantProfileId
        ? { where: { tenantProfileId }, take: 1 }
        : undefined,
      interests: tenantProfileId
        ? { where: { tenantProfileId }, select: { id: true, status: true } }
        : undefined,
    },
    orderBy:
      filters.sort === 'rent'
        ? { rent: 'asc' }
        : { createdAt: 'desc' },
    take: fetchLimit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  let tenantProfile: {
    id: string;
    preferredCity: string;
    preferredAreas: string[];
    budgetMin: number;
    budgetMax: number;
    moveInDate: Date;
  } | null = null;

  if (tenantProfileId) {
    tenantProfile = await prisma.tenantProfile.findUnique({
      where: { id: tenantProfileId },
      select: {
        id: true,
        preferredCity: true,
        preferredAreas: true,
        budgetMin: true,
        budgetMax: true,
        moveInDate: true,
      },
    });
  }

  const { computeInlineFallbackScore } = await import('./scoring.service.js');
  const mappedListings = await Promise.all(
    listings.map(async ({ compatibilityScores, interests, ...listing }) => {
      const activeInterest = tenantProfileId ? interests?.[0] ?? null : null;

      if (!tenantProfileId || !tenantProfile) {
        return { ...listing, score: null, interest: null };
      }

      const storedScore = compatibilityScores?.[0] ?? null;
      if (storedScore) {
        return { ...listing, score: storedScore, interest: activeInterest };
      }

      const inlineScore = await computeInlineFallbackScore(tenantProfile, listing);
      const { scoringQueue } = await import('../lib/queue.js');
      scoringQueue
        .add('score-pair', { tenantProfileId, listingId: listing.id }, {
          jobId: `score:${tenantProfileId}:${listing.id}`,
        })
        .catch(() => {
          // Queue availability must not affect browse responses.
        });

      return { ...listing, score: inlineScore, interest: activeInterest };
    })
  );

  if (filters.sort === 'score' && tenantProfileId) {
    mappedListings.sort((a, b) => {
      const scoreA = a.score?.score ?? -1;
      const scoreB = b.score?.score ?? -1;
      return scoreB - scoreA;
    });

    const paginated = mappedListings.slice(0, limit + 1);
    const hasMore = paginated.length > limit;
    if (hasMore) paginated.pop();

    return {
      listings: paginated,
      meta: {
        cursor: paginated.length > 0 ? paginated[paginated.length - 1]!.id : null,
        hasMore,
      },
    };
  }

  const hasMore = mappedListings.length > limit;
  if (hasMore) mappedListings.pop();

  return {
    listings: mappedListings,
    meta: {
      cursor: mappedListings.length > 0 ? mappedListings[mappedListings.length - 1]!.id : null,
      hasMore,
    },
  };
}

/** Fetch one listing with owner, photos, and a tenant-specific score when available. */
export async function getListingById(listingId: string, tenantProfileId?: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      photos: { orderBy: { position: 'asc' } },
      owner: { select: { id: true, name: true, email: true } },
      compatibilityScores: tenantProfileId
        ? { where: { tenantProfileId }, take: 1 }
        : undefined,
    },
  });

  if (!listing) {
    throw Object.assign(new Error('Listing not found'), { statusCode: 404 });
  }

  const { compatibilityScores, ...listingData } = listing;

  if (!tenantProfileId) {
    return { ...listingData, score: null };
  }

  const storedScore = compatibilityScores?.[0] ?? null;
  if (storedScore) {
    return { ...listingData, score: storedScore };
  }

  const profile = await prisma.tenantProfile.findUnique({
    where: { id: tenantProfileId },
    select: {
      id: true,
      preferredCity: true,
      preferredAreas: true,
      budgetMin: true,
      budgetMax: true,
      moveInDate: true,
    },
  });

  if (!profile) {
    return { ...listingData, score: null };
  }

  const { computeInlineFallbackScore } = await import('./scoring.service.js');
  const inlineScore = await computeInlineFallbackScore(profile, listingData);
  const { scoringQueue } = await import('../lib/queue.js');
  scoringQueue
    .add('score-pair', { tenantProfileId, listingId }, {
      jobId: `score:${tenantProfileId}:${listingId}`,
    })
    .catch(() => {
      // Queue availability must not affect listing reads.
    });

  return { ...listingData, score: inlineScore };
}
