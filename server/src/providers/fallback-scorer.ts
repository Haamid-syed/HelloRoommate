import type { ScoringProvider, ScoringResult } from './scoring.provider.js';

export class FallbackScorer implements ScoringProvider {
  async score(
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
  ): Promise<ScoringResult> {
    let budgetScore = 0;
    if (listing.rent >= profile.budgetMin && listing.rent <= profile.budgetMax) {
      budgetScore = 50;
    } else if (listing.rent > profile.budgetMax) {
      const overshoot = listing.rent - profile.budgetMax;
      const decay = overshoot / (0.3 * profile.budgetMax);
      budgetScore = Math.round(50 * Math.max(0, 1 - decay));
    } else {
      budgetScore = 50;
    }

    let locationScore = 0;
    const listingArea = listing.area.toLowerCase().trim();
    const listingCity = listing.city.toLowerCase().trim();
    const profileCity = profile.preferredCity.toLowerCase().trim();
    const profileAreas = profile.preferredAreas.map((area) => area.toLowerCase().trim());

    if (profileAreas.includes(listingArea)) {
      locationScore = 35;
    } else if (listingCity === profileCity) {
      locationScore = 20;
    }

    let dateScore = 0;
    const moveIn = new Date(profile.moveInDate);
    const availableFrom = new Date(listing.availableFrom);

    if (availableFrom <= moveIn) {
      dateScore = 15;
    } else {
      const daysLate = Math.ceil(
        (availableFrom.getTime() - moveIn.getTime()) / (1000 * 60 * 60 * 24)
      );
      dateScore = Math.max(0, 15 - daysLate);
    }

    const totalScore = budgetScore + locationScore + dateScore;
    const parts = [
      `Budget: ${budgetScore}/50`,
      `Location: ${locationScore}/35`,
      `Timing: ${dateScore}/15`,
    ];

    let summary = '';
    if (locationScore === 35) {
      summary = `Area match in ${listing.area}.`;
    } else if (locationScore === 20) {
      summary = `Same city (${listing.city}).`;
    } else {
      summary = 'Different city.';
    }

    if (budgetScore === 50) {
      summary += ' Rent fits your budget.';
    } else if (budgetScore > 0) {
      summary += ' Rent slightly above budget.';
    } else {
      summary += ' Rent well above budget.';
    }

    if (dateScore === 15) {
      summary += ' Available on time.';
    } else if (dateScore > 0) {
      summary += ` Available ${15 - dateScore} days late.`;
    } else {
      summary += ' Available much later than needed.';
    }

    return { score: totalScore, explanation: `${summary} (${parts.join(', ')})` };
  }
}

export const fallbackScorer = new FallbackScorer();
