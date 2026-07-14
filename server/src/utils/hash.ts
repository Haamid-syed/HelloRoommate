import crypto from 'crypto';

/**
 * Compute a stable input hash for a (tenant profile, listing) pair.
 * Used to detect when scores need recomputation — only recompute
 * when the actual input data has changed, not on a timer.
 */
export function computeInputHash(
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
): string {
  // Normalize and sort for stability
  const input = JSON.stringify({
    p: {
      city: profile.preferredCity.toLowerCase().trim(),
      areas: [...profile.preferredAreas].sort().map((a) => a.toLowerCase().trim()),
      min: profile.budgetMin,
      max: profile.budgetMax,
      move: new Date(profile.moveInDate).toISOString().split('T')[0],
    },
    l: {
      city: listing.city.toLowerCase().trim(),
      area: listing.area.toLowerCase().trim(),
      rent: listing.rent,
      from: new Date(listing.availableFrom).toISOString().split('T')[0],
      type: listing.roomType,
      furn: listing.furnishing,
    },
  });

  return crypto.createHash('sha256').update(input).digest('hex');
}
