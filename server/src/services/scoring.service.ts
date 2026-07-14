import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { SCORING_JOB_NAME, scoringQueue, type ScoringJobData } from '../lib/queue.js';
import { fallbackScorer } from '../providers/fallback-scorer.js';
import { computeInputHash } from '../utils/hash.js';

/** Enqueue scoring jobs for a tenant profile against active candidate listings. */
export async function enqueueScoresForProfile(tenantProfileId: string): Promise<void> {
  const profile = await prisma.tenantProfile.findUnique({
    where: { id: tenantProfileId },
  });

  if (!profile) return;

  const budgetFloor = Math.floor(profile.budgetMin * 0.7);
  const budgetCeiling = Math.ceil(profile.budgetMax * 1.3);
  const candidateListings = await prisma.listing.findMany({
    where: {
      status: 'ACTIVE',
      city: { equals: profile.preferredCity, mode: 'insensitive' },
      rent: { gte: budgetFloor, lte: budgetCeiling },
    },
    select: { id: true },
    take: 100,
    orderBy: { createdAt: 'desc' },
  });

  if (candidateListings.length === 0) {
    logger.debug({ tenantProfileId }, 'No candidate listings found for scoring');
    return;
  }

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
    select: { id: true },
    take: 100,
  });

  if (candidateProfiles.length === 0) {
    logger.debug({ listingId }, 'No candidate profiles found for scoring');
    return;
  }

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

/** Compute a fast, deterministic fallback score for an unscored read-path pair. */
export async function computeInlineFallbackScore(
  profile: {
    id: string;
    preferredCity: string;
    preferredAreas: string[];
    budgetMin: number;
    budgetMax: number;
    moveInDate: Date | string;
  },
  listing: {
    id: string;
    city: string;
    area: string;
    rent: number;
    availableFrom: Date | string;
    roomType: string;
    furnishing: string;
  }
): Promise<{
  tenantProfileId: string;
  listingId: string;
  score: number;
  explanation: string;
  source: 'FALLBACK';
  inputHash: string;
  model: null;
  computedAt: string;
}> {
  const result = await fallbackScorer.score(profile, listing);
  const inputHash = computeInputHash(profile, listing);

  return {
    tenantProfileId: profile.id,
    listingId: listing.id,
    score: result.score,
    explanation: result.explanation,
    source: 'FALLBACK',
    inputHash,
    model: null,
    computedAt: new Date().toISOString(),
  };
}
