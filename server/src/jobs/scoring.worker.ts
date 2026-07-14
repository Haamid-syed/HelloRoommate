import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { SCORING_JOB_NAME, type ScoringJobData } from '../lib/queue.js';
import { redis } from '../lib/redis.js';
import { fallbackScorer } from '../providers/fallback-scorer.js';
import { computeInputHash } from '../utils/hash.js';

/**
 * Scoring worker — post-Change-2 role.
 *
 * Architecture change: numeric scores always come from the deterministic FallbackScorer.
 * LLM is now ONLY called for human-readable explanations, lazily, via ExplanationService.
 *
 * This worker's job is now:
 *   1. Re-verify the score is up-to-date (inputHash matches current data).
 *   2. If the hash changed (profile or listing was edited), recompute and persist
 *      the fallback score, and clear any stale cached explanation so it gets
 *      regenerated on next detail-view.
 *   3. If hash matches an existing row, skip (idempotent).
 *
 * The BullMQ jobId deduplication (`score:${tenantProfileId}:${listingId}`) and
 * input_hash caching are preserved — this worker composes with them, not replaces them.
 */
async function processScoringJob(
  job: Job<ScoringJobData, void, typeof SCORING_JOB_NAME>
): Promise<void> {
  const { tenantProfileId, listingId } = job.data;

  const [profile, listing] = await Promise.all([
    prisma.tenantProfile.findUnique({ where: { id: tenantProfileId } }),
    prisma.listing.findUnique({ where: { id: listingId } }),
  ]);

  if (!profile || !listing) {
    logger.warn({ tenantProfileId, listingId }, 'Scoring job skipped — profile or listing not found');
    return;
  }

  if (listing.status !== 'ACTIVE') {
    logger.debug({ listingId }, 'Scoring job skipped — listing not active');
    return;
  }

  const profileInput = {
    preferredCity: profile.preferredCity,
    preferredAreas: profile.preferredAreas,
    budgetMin: profile.budgetMin,
    budgetMax: profile.budgetMax,
    moveInDate: profile.moveInDate,
  };
  const listingInput = {
    city: listing.city,
    area: listing.area,
    rent: listing.rent,
    availableFrom: listing.availableFrom,
    roomType: listing.roomType,
    furnishing: listing.furnishing,
  };
  const inputHash = computeInputHash(profileInput, listingInput);

  // Check if we already have an up-to-date score row
  const existingScore = await prisma.compatibilityScore.findUnique({
    where: { tenantProfileId_listingId: { tenantProfileId, listingId } },
  });

  if (existingScore && existingScore.inputHash === inputHash) {
    logger.debug(
      { tenantProfileId, listingId },
      'Scoring job skipped — score hash matches, no recomputation needed'
    );
    return;
  }

  // Recompute fallback score (data changed — inputHash mismatch)
  const fallbackResult = await fallbackScorer.score(profileInput, listingInput);

  // If the input data changed, invalidate any cached explanation so it regenerates
  // on next detail-view with fresh data.
  const shouldClearExplanation =
    existingScore && existingScore.inputHash !== inputHash && existingScore.explanation != null;

  await prisma.compatibilityScore.upsert({
    where: { tenantProfileId_listingId: { tenantProfileId, listingId } },
    create: {
      tenantProfileId,
      listingId,
      score: fallbackResult.score,
      source: 'RULE_BASED',
      inputHash,
      model: null,
      computedAt: new Date(),
      // explanation left null — generated lazily by ExplanationService
    },
    update: {
      score: fallbackResult.score,
      source: 'RULE_BASED',
      inputHash,
      model: null,
      computedAt: new Date(),
      // Clear stale explanation if the underlying data changed
      ...(shouldClearExplanation
        ? { explanation: null, explanationSource: null, explanationVersion: null, explanationAt: null }
        : {}),
    },
  });

  logger.info(
    { tenantProfileId, listingId, score: fallbackResult.score },
    'Scoring job completed — fallback score updated'
  );
}

export function startScoringWorker(): Worker<ScoringJobData, void, typeof SCORING_JOB_NAME> {
  const worker = new Worker<ScoringJobData, void, typeof SCORING_JOB_NAME>(
    'scoring-queue',
    processScoringJob,
    {
      connection: redis as unknown as ConnectionOptions,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 60_000,
      },
    }
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job?.id }, 'Scoring job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Scoring job failed after all retries');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Scoring worker error');
  });

  logger.info('🧠 Scoring worker started');

  return worker;
}
