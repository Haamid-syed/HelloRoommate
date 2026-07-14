/**
 * ScoringProvider — interface for deterministic rule-based scoring.
 *
 * NOTE: The LLM (OpenRouter) is no longer a ScoringProvider.
 * Numeric scores always come from the FallbackScorer (deterministic).
 * LLM-generated content is handled by the ExplanationService (lazy, cached).
 */
export interface ScoringResult {
  score: number;
  explanation: string; // Sub-score breakdown string from the rule-based scorer
}

export interface ScoringProvider {
  score(
    profile: {
      preferredCity: string;
      preferredAreas: string[];
      budgetMin: number;
      budgetMax: number;
      moveInDate: Date | string;
    },
    listing: {
      city: string;
      area: string;
      rent: number;
      availableFrom: Date | string;
      roomType: string;
      furnishing: string;
    }
  ): Promise<ScoringResult>;
}
