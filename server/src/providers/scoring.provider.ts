export interface ScoringResult {
  score: number;
  explanation: string;
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
