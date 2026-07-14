import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { env } from '../config/env.js';
import { scoringCircuitBreaker } from '../lib/circuit-breaker.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { SCORING_JOB_NAME, type ScoringJobData } from '../lib/queue.js';
import { redis } from '../lib/redis.js';
import { fallbackScorer } from '../providers/fallback-scorer.js';
import { openRouterScorer } from '../providers/openrouter-scorer.js';
import { computeInputHash } from '../utils/hash.js';

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

  const existingScore = await prisma.compatibilityScore.findUnique({
    where: {
      tenantProfileId_listingId: { tenantProfileId, listingId },
    },
  });

  if (existingScore && existingScore.inputHash === inputHash && existingScore.source === 'LLM') {
    logger.debug(
      { tenantProfileId, listingId },
      'Scoring job skipped — LLM score with matching hash exists'
    );
    return;
  }

  if (scoringCircuitBreaker.isAllowed()) {
    try {
      const result = await openRouterScorer.score(profileInput, listingInput);
      scoringCircuitBreaker.onSuccess();

      await prisma.compatibilityScore.upsert({
        where: {
          tenantProfileId_listingId: { tenantProfileId, listingId },
        },
        create: {
          tenantProfileId,
          listingId,
          score: result.score,
          explanation: result.explanation,
          source: 'LLM',
          inputHash,
          model: env.OPENROUTER_MODEL,
          computedAt: new Date(),
        },
        update: {
          score: result.score,
          explanation: result.explanation,
          source: 'LLM',
          inputHash,
          model: env.OPENROUTER_MODEL,
          computedAt: new Date(),
        },
      });

      logger.info(
        { tenantProfileId, listingId, score: result.score, source: 'LLM' },
        'Scoring job completed with LLM'
      );
      return;
    } catch (err) {
      scoringCircuitBreaker.onFailure();
      logger.warn(
        { err, tenantProfileId, listingId, breakerState: scoringCircuitBreaker.getState() },
        'LLM scoring failed — falling back to rule-based scorer'
      );
    }
  } else {
    logger.debug(
      { breakerState: scoringCircuitBreaker.getState() },
      'Circuit breaker OPEN — using fallback scorer directly'
    );
  }

  const fallbackResult = await fallbackScorer.score(profileInput, listingInput);

  await prisma.compatibilityScore.upsert({
    where: {
      tenantProfileId_listingId: { tenantProfileId, listingId },
    },
    create: {
      tenantProfileId,
      listingId,
      score: fallbackResult.score,
      explanation: fallbackResult.explanation,
      source: 'FALLBACK',
      inputHash,
      model: null,
      computedAt: new Date(),
    },
    update: {
      score: fallbackResult.score,
      explanation: fallbackResult.explanation,
      source: 'FALLBACK',
      inputHash,
      model: null,
      computedAt: new Date(),
    },
  });

  logger.info(
    { tenantProfileId, listingId, score: fallbackResult.score, source: 'FALLBACK' },
    'Scoring job completed with fallback scorer'
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
