import type { ParkMetrics } from "../park";

/**
 * The rating's blend: what the park offers (appeal and variety, from the world's totals), how the
 * crowd feels, how many came today and how clean it is. Pure math over world facts.
 */
export function ratingTarget(
  metrics: Pick<ParkMetrics, "totalAppeal" | "variety">,
  mood: number,
  guestsToday: number,
  litter: number,
): number {
  const appealScore = metrics.totalAppeal * 3.4;
  const varietyBonus = metrics.variety * 9;
  const happyScore = (mood - 40) * 1.6;
  const throughput = Math.min(guestsToday, 400) * 0.28;
  const litterPenalty = litter * 1.4;
  return Math.max(0, appealScore + varietyBonus + happyScore + throughput - litterPenalty);
}

export function demand(totalAppeal: number, ticketPrice: number, rating: number, open: boolean): number {
  if (!open) return 0;
  const draw = 0.35 + totalAppeal * 0.085 + rating * 0.004;
  const priceResistance = Math.max(0, 1 - Math.max(0, ticketPrice - 6) * 0.026);
  return Math.max(0, draw * priceResistance);
}
