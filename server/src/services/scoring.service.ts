import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { SCORING_JOB_NAME, scoringQueue, type ScoringJobData } from '../lib/queue.js';
import { fallbackScorer } from '../providers/fallback-scorer.js';
import { computeInputHash } from '../utils/hash.js';

// Current prompt version — bump this string whenever the LLM explanation prompt changes
// so cached explanations are invalidated and regenerated.
export const CURRENT_EXPLANATION_VERSION = 'v1';

type ProfileInput = {
  id: string;
  preferredCity: string;
  preferredAreas: string[];
  budgetMin: number;
  budgetMax: number;
  moveInDate: Date;
};

type ListingInput = {
  id: string;
  city: string;
  area: string;
  rent: number;
  availableFrom: Date;
  roomType: string;
  furnishing: string;
};

/**
 * Compute and persist rule-based scores for a list of (profile, listing) pairs.
 * Skips pairs where the inputHash matches the existing row (data unchanged — no recomputation needed).
 */
async function persistFallbackScores(
  profile: ProfileInput,
  listings: ListingInput[]
): Promise<void> {
  if (listings.length === 0) return;

  const profileInput = {
    preferredCity: profile.preferredCity,
    preferredAreas: profile.preferredAreas,
    budgetMin: profile.budgetMin,
    budgetMax: profile.budgetMax,
    moveInDate: profile.moveInDate,
  };

  // Fetch existing scores to skip pairs where input data hasn't changed
  const existingScores = await prisma.compatibilityScore.findMany({
    where: {
      tenantProfileId: profile.id,
      listingId: { in: listings.map((l) => l.id) },
    },
    select: { listingId: true, inputHash: true },
  });

  const existingMap = new Map(existingScores.map((s) => [s.listingId, s.inputHash]));

  const upserts: Array<Promise<unknown>> = [];

  for (const listing of listings) {
    const listingInput = {
      city: listing.city,
      area: listing.area,
      rent: listing.rent,
      availableFrom: listing.availableFrom,
      roomType: listing.roomType,
      furnishing: listing.furnishing,
    };

    const inputHash = computeInputHash(profileInput, listingInput);
    const existingHash = existingMap.get(listing.id);

    // Skip if data hasn't changed — score is still valid
    if (existingHash === inputHash) continue;

    // Compute rule-based score (deterministic, <1ms)
    const result = await fallbackScorer.score(profileInput, listingInput);

    upserts.push(
      prisma.compatibilityScore.upsert({
        where: { tenantProfileId_listingId: { tenantProfileId: profile.id, listingId: listing.id } },
        create: {
          tenantProfileId: profile.id,
          listingId: listing.id,
          score: result.score,
          source: 'RULE_BASED',
          inputHash,
          model: null,
          computedAt: new Date(),
          // explanation left null — generated lazily on first detail-view
        },
        update: {
          score: result.score,
          source: 'RULE_BASED',
          inputHash,
          model: null,
          computedAt: new Date(),
          // Do not overwrite an existing explanation — preserve any cached templated/LLM string
        },
      })
    );
  }

  await Promise.all(upserts);
  logger.debug({ tenantProfileId: profile.id, count: upserts.length }, 'Persisted rule-based scores');
}

/** Enqueue scoring jobs for a tenant profile against active candidate listings. */
export async function enqueueScoresForProfile(tenantProfileId: string): Promise<void> {
  const profile = await prisma.tenantProfile.findUnique({
    where: { id: tenantProfileId },
  });

  if (!profile) return;

  // Delete ALL existing scores for this profile so stale rows from previous
  // preferences (different city / budget range) don't surface after a profile update.
  await prisma.compatibilityScore.deleteMany({ where: { tenantProfileId } });

  const budgetFloor = Math.floor(profile.budgetMin * 0.7);
  const budgetCeiling = Math.ceil(profile.budgetMax * 1.3);
  const candidateListings = await prisma.listing.findMany({
    where: {
      status: 'ACTIVE',
      city: { equals: profile.preferredCity, mode: 'insensitive' },
      rent: { gte: budgetFloor, lte: budgetCeiling },
    },
    take: 100,
    orderBy: { createdAt: 'desc' },
  });

  if (candidateListings.length === 0) {
    logger.debug({ tenantProfileId }, 'No candidate listings found for scoring');
    return;
  }

  // Persist rule-based scores synchronously BEFORE enqueueing jobs.
  // This ensures GET /listings always finds stored scores — no inline computation on read.
  await persistFallbackScores(profile as ProfileInput, candidateListings as ListingInput[]);

  const jobs = candidateListings.map((listing) => ({
    name: SCORING_JOB_NAME as typeof SCORING_JOB_NAME,
    data: { tenantProfileId, listingId: listing.id } satisfies ScoringJobData,
    opts: {
      jobId: `score:${tenantProfileId}:${listing.id}`,
    },
  }));

  await scoringQueue.addBulk(jobs);
  logger.info({ tenantProfileId, count: jobs.length }, 'Enqueued scoring jobs for tenant profile');
}

/** Enqueue scoring jobs for an active listing against matching tenant profiles. */
export async function enqueueScoresForListing(listingId: string): Promise<void> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });

  if (!listing || listing.status !== 'ACTIVE') return;

  const rentFloor = Math.floor(listing.rent * 0.7);
  const rentCeiling = Math.ceil(listing.rent * 1.3);
  const candidateProfiles = await prisma.tenantProfile.findMany({
    where: {
      preferredCity: { equals: listing.city, mode: 'insensitive' },
      budgetMax: { gte: rentFloor },
      budgetMin: { lte: rentCeiling },
    },
    take: 100,
  });

  if (candidateProfiles.length === 0) {
    logger.debug({ listingId }, 'No candidate profiles found for scoring');
    return;
  }

  // Change 1: Persist fallback scores for each candidate profile synchronously (in parallel).
  await Promise.all(
    candidateProfiles.map((profile) =>
      persistFallbackScores(profile as ProfileInput, [listing as ListingInput])
    )
  );

  const jobs = candidateProfiles.map((profile) => ({
    name: SCORING_JOB_NAME as typeof SCORING_JOB_NAME,
    data: { tenantProfileId: profile.id, listingId } satisfies ScoringJobData,
    opts: {
      jobId: `score:${profile.id}:${listingId}`,
    },
  }));

  await scoringQueue.addBulk(jobs);
  logger.info({ listingId, count: jobs.length }, 'Enqueued scoring jobs for listing');
}
