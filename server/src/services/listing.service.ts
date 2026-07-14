import type { Prisma } from '@prisma/client';
import type {
  CreateListingInput,
  ListingsFilterInput,
  PaginationInput,
  UpdateListingInput,
} from 'shared';
import { prisma } from '../lib/prisma.js';

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
  return prisma.listing.create({
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

  return prisma.$transaction(async (tx) => {
    if (input.photoUrls !== undefined) {
      await tx.listingPhoto.deleteMany({ where: { listingId } });

      if (input.photoUrls.length > 0) {
        await tx.listingPhoto.createMany({
          data: input.photoUrls.map((url, position) => ({ listingId, url, position })),
        });
      }
    }

    return tx.listing.update({
      where: { id: listingId },
      data,
      include: listingInclude,
    });
  });
}

/** Mark an active listing as filled so it no longer appears in tenant searches. */
export async function fillListing(listingId: string, ownerId: string) {
  const listing = await getOwnedListing(listingId, ownerId);

  if (listing.status !== 'ACTIVE') {
    throw Object.assign(new Error('Only active listings can be marked as filled'), { statusCode: 400 });
  }

  return prisma.listing.update({
    where: { id: listingId },
    data: { status: 'FILLED' },
    include: listingInclude,
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
  const listings = await prisma.listing.findMany({
    where,
    include: {
      photos: { orderBy: { position: 'asc' } },
      owner: { select: { id: true, name: true, email: true } },
      compatibilityScores: {
        where: { tenantProfileId: tenantProfileId ?? '' },
        take: 1,
      },
    },
    orderBy:
      filters.sort === 'rent'
        ? { rent: 'asc' }
        : { createdAt: 'desc' },
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = listings.length > limit;
  if (hasMore) listings.pop();

  return {
    listings: listings.map(({ compatibilityScores, ...listing }) => ({
      ...listing,
      score: tenantProfileId ? compatibilityScores[0] ?? null : null,
    })),
    meta: {
      cursor: listings.length > 0 ? listings[listings.length - 1]!.id : null,
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
      compatibilityScores: {
        where: { tenantProfileId: tenantProfileId ?? '' },
        take: 1,
      },
    },
  });

  if (!listing) {
    throw Object.assign(new Error('Listing not found'), { statusCode: 404 });
  }

  const { compatibilityScores, ...listingData } = listing;
  return {
    ...listingData,
    score: tenantProfileId ? compatibilityScores[0] ?? null : null,
  };
}
