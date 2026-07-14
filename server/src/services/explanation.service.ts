import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { fallbackScorer } from '../providers/fallback-scorer.js';
import { openRouterScorer } from '../providers/openrouter-scorer.js';
import { CURRENT_EXPLANATION_VERSION } from './scoring.service.js';

type ExplainProfile = {
  id: string;
  preferredCity: string;
  preferredAreas: string[];
  budgetMin: number;
  budgetMax: number;
  moveInDate: Date | string;
};

type ExplainListing = {
  id: string;
  city: string;
  area: string;
  rent: number;
  availableFrom: Date | string;
  roomType: string;
  furnishing: string;
};

export type ExplanationResult = {
  explanation: string;
  explanationSource: 'LLM' | 'TEMPLATED';
  explanationVersion: string;
};

/**
 * Build a templated explanation from the FallbackScorer's sub-scores.
 * Used as a fallback when the LLM is unavailable or returns malformed output.
 */
async function buildTemplatedExplanation(
  profile: ExplainProfile,
  listing: ExplainListing
): Promise<string> {
  const result = await fallbackScorer.score(
    {
      preferredCity: profile.preferredCity,
      preferredAreas: profile.preferredAreas,
      budgetMin: profile.budgetMin,
      budgetMax: profile.budgetMax,
      moveInDate: profile.moveInDate,
    },
    {
      city: listing.city,
      area: listing.area,
      rent: listing.rent,
      availableFrom: listing.availableFrom,
      roomType: listing.roomType,
      furnishing: listing.furnishing,
    }
  );
  return result.explanation;
}

/**
 * Get a cached explanation or generate one on-demand (lazy).
 *
 * Triggered by:
 *   - GET /listings/:id  (detail view)
 *   - POST /interests    (so explanation is ready when chat starts)
 *
 * Caches by (tenantProfileId, listingId, explanationVersion).
 * If LLM fails, falls back to a templated explanation — user never sees blank.
 */
export async function getOrGenerateExplanation(
  tenantProfileId: string,
  listingId: string,
  profile: ExplainProfile,
  listing: ExplainListing
): Promise<ExplanationResult> {
  // 1. Check cache: return if explanation exists for current prompt version
  const existing = await prisma.compatibilityScore.findUnique({
    where: { tenantProfileId_listingId: { tenantProfileId, listingId } },
    select: { explanation: true, explanationSource: true, explanationVersion: true },
  });

  if (
    existing?.explanation &&
    existing.explanation.length > 0 &&
    existing.explanationVersion === CURRENT_EXPLANATION_VERSION
  ) {
    return {
      explanation: existing.explanation,
      explanationSource: existing.explanationSource as 'LLM' | 'TEMPLATED',
      explanationVersion: existing.explanationVersion,
    };
  }

  // 2. Generate via LLM (single-item batch)
  let explanation: string;
  let source: 'LLM' | 'TEMPLATED';

  try {
    const results = await openRouterScorer.explainBatch([{ listingId, profile, listing }]);
    const item = results[0];
    if (item && item.explanation) {
      explanation = item.explanation;
      source = 'LLM';
    } else {
      throw new Error('Empty explanation from LLM batch');
    }
  } catch (err) {
    logger.warn({ err, tenantProfileId, listingId }, 'LLM explanation failed — using templated fallback');
    explanation = await buildTemplatedExplanation(profile, listing);
    source = 'TEMPLATED';
  }

  // 3. Persist (upsert — score row must exist from enqueueScores; create if somehow missing)
  await prisma.compatibilityScore.upsert({
    where: { tenantProfileId_listingId: { tenantProfileId, listingId } },
    create: {
      tenantProfileId,
      listingId,
      score: 0,                          // Will be overwritten by next scoring cycle
      source: 'RULE_BASED',
      inputHash: '',
      explanation,
      explanationSource: source,
      explanationVersion: CURRENT_EXPLANATION_VERSION,
      explanationAt: new Date(),
    },
    update: {
      explanation,
      explanationSource: source,
      explanationVersion: CURRENT_EXPLANATION_VERSION,
      explanationAt: new Date(),
    },
  });

  logger.info({ tenantProfileId, listingId, source }, 'Explanation generated and cached');
  return {
    explanation,
    explanationSource: source,
    explanationVersion: CURRENT_EXPLANATION_VERSION,
  };
}

/**
 * Generate explanations for multiple (tenant, listing) pairs in batches.
 * Used for bulk backfill. Skips pairs that already have a current-version explanation.
 */
export async function getOrGenerateManyExplanations(
  items: Array<{
    tenantProfileId: string;
    listingId: string;
    profile: ExplainProfile;
    listing: ExplainListing;
  }>
): Promise<void> {
  const BATCH_SIZE = 8;

  // Filter out items with a current explanation already cached
  const existing = await prisma.compatibilityScore.findMany({
    where: {
      OR: items.map((i) => ({ tenantProfileId: i.tenantProfileId, listingId: i.listingId })),
      explanationVersion: CURRENT_EXPLANATION_VERSION,
      explanation: { not: null },
    },
    select: { tenantProfileId: true, listingId: true },
  });

  const cachedKeys = new Set(existing.map((e) => `${e.tenantProfileId}:${e.listingId}`));
  const pending = items.filter((i) => !cachedKeys.has(`${i.tenantProfileId}:${i.listingId}`));

  if (pending.length === 0) return;

  // Process in batches
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);

    let llmResults: Array<{ listingId: string; explanation: string | null }>;
    try {
      llmResults = await openRouterScorer.explainBatch(
        batch.map((item) => ({
          listingId: item.listingId,
          profile: item.profile,
          listing: item.listing,
        }))
      );
    } catch (err) {
      logger.warn({ err }, 'Batch explanation failed entirely — falling back all items to templated');
      llmResults = [];
    }

    const llmMap = new Map(llmResults.map((r) => [r.listingId, r.explanation]));

    await Promise.all(
      batch.map(async (item) => {
        const llmExplanation = llmMap.get(item.listingId);
        const explanation =
          llmExplanation ?? (await buildTemplatedExplanation(item.profile, item.listing));
        const source: 'LLM' | 'TEMPLATED' = llmExplanation ? 'LLM' : 'TEMPLATED';

        await prisma.compatibilityScore.upsert({
          where: {
            tenantProfileId_listingId: {
              tenantProfileId: item.tenantProfileId,
              listingId: item.listingId,
            },
          },
          create: {
            tenantProfileId: item.tenantProfileId,
            listingId: item.listingId,
            score: 0,
            source: 'RULE_BASED',
            inputHash: '',
            explanation,
            explanationSource: source,
            explanationVersion: CURRENT_EXPLANATION_VERSION,
            explanationAt: new Date(),
          },
          update: {
            explanation,
            explanationSource: source,
            explanationVersion: CURRENT_EXPLANATION_VERSION,
            explanationAt: new Date(),
          },
        });
      })
    );

    logger.info(
      { batchIndex: i / BATCH_SIZE, batchSize: batch.length },
      'Explanation batch processed'
    );
  }
}
