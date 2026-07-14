import { Prisma } from '@prisma/client';
import type { PaginationInput } from 'shared';
import { prisma } from '../lib/prisma.js';


type InterestRole = 'TENANT' | 'OWNER';

/** Create a pending interest and enqueue its high-match notification atomically. */
export async function createInterest(tenantUserId: string, listingId: string) {
  const tenantProfile = await prisma.tenantProfile.findUnique({
    where: { userId: tenantUserId },
    include: { user: { select: { name: true } } },
  });

  if (!tenantProfile) {
    throw Object.assign(new Error('Tenant profile setup required before expressing interest'), {
      statusCode: 403,
    });
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      owner: { select: { id: true } },
      compatibilityScores: {
        where: { tenantProfileId: tenantProfile.id },
        take: 1,
      },
    },
  });

  if (!listing) {
    throw Object.assign(new Error('Listing not found'), { statusCode: 404 });
  }

  if (listing.status !== 'ACTIVE') {
    throw Object.assign(new Error('Interests can only be expressed on active listings'), {
      statusCode: 400,
    });
  }

  // Use stored score; default to 0 if missing (enqueueScoresForProfile always writes fallback rows now)
  const storedScore = listing.compatibilityScores[0];
  const scoreValue = storedScore?.score ?? 0;
  const scoreExplanation = storedScore?.explanation ?? '';

  // Attempt the INSERT directly — no pre-check SELECT (TOCTOU eliminated).
  // The partial unique index (uniq_active_interest) enforces at-most-one
  // PENDING or ACCEPTED interest per (tenant, listing) pair.
  // On concurrent inserts, one wins; the P2002 catch below returns the winner.
  try {
    return await prisma.$transaction(async (tx) => {
      const interest = await tx.interest.create({
        data: {
          tenantProfileId: tenantProfile.id,
          listingId,
          status: 'PENDING',
          scoreAtInterest: scoreValue,
        },
      });

      if (scoreValue > 80) {
        await tx.notificationOutbox.create({
          data: {
            userId: listing.ownerId,
            type: 'HIGH_MATCH_INTEREST',
            dedupKey: `high:${interest.id}`,
            payload: {
              tenantName: tenantProfile.user.name,
              listingTitle: listing.title,
              score: scoreValue,
              explanation: scoreExplanation,
            },
          },
        });
      }

      return interest;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Concurrent insert hit the partial unique index — fetch and return the winner.
      const concurrentInterest = await prisma.interest.findFirst({
        where: {
          tenantProfileId: tenantProfile.id,
          listingId,
          status: { in: ['PENDING', 'ACCEPTED'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (concurrentInterest) return concurrentInterest;
    }

    throw error;
  }
}

/** Accept a pending interest, create its conversation, and enqueue the tenant email atomically. */
export async function acceptInterest(ownerUserId: string, interestId: string) {
  const interest = await prisma.interest.findUnique({
    where: { id: interestId },
    include: {
      listing: { select: { id: true, title: true, ownerId: true, status: true } },
      tenantProfile: { select: { userId: true } },
    },
  });

  if (!interest) {
    throw Object.assign(new Error('Interest record not found'), { statusCode: 404 });
  }

  if (interest.listing.ownerId !== ownerUserId) {
    throw Object.assign(new Error('Unauthorized — not your listing'), { statusCode: 403 });
  }

  if (interest.status !== 'PENDING') {
    throw Object.assign(new Error('Only pending interests can be accepted'), { statusCode: 400 });
  }

  return prisma.$transaction(async (tx) => {
    // Change 5: Re-verify listing status inside transaction to close the fill-vs-accept race.
    const listing = await tx.listing.findUnique({
      where: { id: interest.listing.id },
      select: { status: true },
    });
    if (listing?.status !== 'ACTIVE') {
      throw Object.assign(
        new Error('Listing is no longer active — it may have been filled while this request was in flight'),
        { statusCode: 409 }
      );
    }

    const transition = await tx.interest.updateMany({
      where: { id: interestId, status: 'PENDING' },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });

    if (transition.count !== 1) {
      throw Object.assign(new Error('Only pending interests can be accepted'), { statusCode: 400 });
    }

    const updatedInterest = await tx.interest.findUniqueOrThrow({ where: { id: interestId } });
    const conversation = await tx.conversation.create({ data: { interestId } });

    await tx.notificationOutbox.create({
      data: {
        userId: interest.tenantProfile.userId,
        type: 'INTEREST_ACCEPTED',
        dedupKey: `accepted:${interestId}`,
        payload: { listingTitle: interest.listing.title },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: ownerUserId,
        action: 'INTEREST_ACCEPTED',
        entityType: 'INTEREST',
        entityId: interestId,
      },
    });

    return { interest: updatedInterest, conversation };
  });
}

/** Decline a pending interest and enqueue the tenant email atomically. */
export async function declineInterest(ownerUserId: string, interestId: string) {
  const interest = await prisma.interest.findUnique({
    where: { id: interestId },
    include: {
      listing: { select: { title: true, ownerId: true } },
      tenantProfile: { select: { userId: true } },
    },
  });

  if (!interest) {
    throw Object.assign(new Error('Interest record not found'), { statusCode: 404 });
  }

  if (interest.listing.ownerId !== ownerUserId) {
    throw Object.assign(new Error('Unauthorized — not your listing'), { statusCode: 403 });
  }

  if (interest.status !== 'PENDING') {
    throw Object.assign(new Error('Only pending interests can be declined'), { statusCode: 400 });
  }

  return prisma.$transaction(async (tx) => {
    const transition = await tx.interest.updateMany({
      where: { id: interestId, status: 'PENDING' },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });

    if (transition.count !== 1) {
      throw Object.assign(new Error('Only pending interests can be declined'), { statusCode: 400 });
    }

    const updatedInterest = await tx.interest.findUniqueOrThrow({ where: { id: interestId } });
    await tx.notificationOutbox.create({
      data: {
        userId: interest.tenantProfile.userId,
        type: 'INTEREST_DECLINED',
        dedupKey: `declined:${interestId}`,
        payload: { listingTitle: interest.listing.title },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: ownerUserId,
        action: 'INTEREST_DECLINED',
        entityType: 'INTEREST',
        entityId: interestId,
      },
    });

    return updatedInterest;
  });
}

/** Fetch a tenant's sent interests or an owner's received interests using keyset pagination. */
export async function getUserInterests(userId: string, role: InterestRole, params: PaginationInput) {
  const limit = params.limit ?? 20;
  const where: Prisma.InterestWhereInput =
    role === 'TENANT' ? { tenantProfile: { userId } } : { listing: { ownerId: userId } };

  const interests = await prisma.interest.findMany({
    where,
    include: {
      listing: {
        include: { photos: { orderBy: { position: 'asc' }, take: 1 } },
      },
      tenantProfile: {
        include: { user: { select: { name: true, email: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });

  const hasMore = interests.length > limit;
  if (hasMore) interests.pop();

  return {
    interests,
    meta: {
      cursor: interests.length > 0 ? interests[interests.length - 1]!.id : null,
      hasMore,
    },
  };
}
