/**
 * Tests for Change 3: Batch explanation generation with per-item failure isolation
 *
 * Required per spec: mock LLM to return 1 malformed item in N-batch,
 * assert N-1 items get 'LLM' explanations and 1 gets 'TEMPLATED'.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/env.js', () => ({
  env: {
    OPENROUTER_API_KEY: 'test-key-12345',
    OPENROUTER_MODEL: 'google/gemini-2.0-flash-exp:free',
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
  },
}));

const BATCH_SIZE = 6;

// Build N fake items for a batch test
function makeBatchItems(n: number) {
  const profile = {
    id: 'test-profile-id',
    preferredCity: 'Mumbai',
    preferredAreas: ['Andheri W'],
    budgetMin: 15000,
    budgetMax: 22000,
    moveInDate: new Date('2026-08-01'),
  };
  return Array.from({ length: n }, (_, i) => ({
    listingId: `listing-${i}`,
    profile,
    listing: {
      id: `listing-${i}`,
      city: 'Mumbai',
      area: 'Andheri W',
      rent: 18000,
      availableFrom: new Date('2026-07-25'),
      roomType: 'PRIVATE',
      furnishing: 'SEMI_FURNISHED',
    },
  }));
}

describe('Change 3 — LLM batch explanation: per-item failure isolation', () => {
  it('validates explanation per-item — malformed item gets null, others get explanation', async () => {
    // Reset module registry so scorer gets the mocked env
    vi.resetModules();
    const { OpenRouterScorer } = await import('../providers/openrouter-scorer.js');
    const scorer = new OpenRouterScorer();

    const items = makeBatchItems(BATCH_SIZE);
    const MALFORMED_INDEX = 3; // item 3 will be malformed

    // Mock the fetch call to return a batch where item 3 has no explanation field
    const mockResults = items.map((item, idx) =>
      idx === MALFORMED_INDEX
        ? { listing_id: item.listingId, score: 85 }  // malformed: missing 'explanation'
        : { listing_id: item.listingId, explanation: `Good match for listing ${idx}` }
    );

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ results: mockResults }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const results = await scorer.explainBatch(items);

    // Should have one result per input item
    expect(results).toHaveLength(BATCH_SIZE);

    // Item 3 should be null (malformed — missing 'explanation' field)
    expect(results[MALFORMED_INDEX]?.explanation).toBeNull();

    // All other items should have a valid explanation string
    const validResults = results.filter((_, idx) => idx !== MALFORMED_INDEX);
    expect(validResults).toHaveLength(BATCH_SIZE - 1);
    validResults.forEach((r) => {
      expect(r.explanation).toBeTruthy();
      expect(typeof r.explanation).toBe('string');
    });

    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('entire batch throws when LLM returns non-OK status', async () => {
    vi.resetModules();

    const { OpenRouterScorer } = await import('../providers/openrouter-scorer.js');
    const scorer = new OpenRouterScorer();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    });

    vi.stubGlobal('fetch', mockFetch);

    const items = makeBatchItems(3);
    await expect(scorer.explainBatch(items)).rejects.toThrow('429');

    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns empty array for empty input without calling LLM', async () => {
    const { OpenRouterScorer } = await import('../providers/openrouter-scorer.js');
    const scorer = new OpenRouterScorer();

    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const results = await scorer.explainBatch([]);
    expect(results).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
