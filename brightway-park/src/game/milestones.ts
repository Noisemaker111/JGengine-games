import { BUILDABLES, BUILD_IDS } from "./objects/catalog";

/**
 * The park's milestones: each one names the unlock it grants and the rating that opens it. In the
 * world a locked structure is a kind whose `when` reads `park.peak`, the best rating the park has
 * reached, so the build palette's refusal and the milestone are one number that never closes again.
 */

export interface MilestoneDef {
  id: string;
  /** Park rating that opens it. */
  rating: number;
  /** Unlock id a buildable requires; a milestone that opens nothing fails at load. */
  unlock: string;
  label: string;
  blurb: string;
}

/** Six milestones, each opening content that exists in the build palette. */
export const MILESTONES: readonly MilestoneDef[] = [
  { id: "gardens_edge", rating: 60, unlock: "tier_flowers", label: "Flower beds & lamps", blurb: "Petals and lamplight for the paths." },
  { id: "fountain_court", rating: 120, unlock: "tier_fountain", label: "Fountain & drinks kiosk", blurb: "A centrepiece, and somewhere to cool off." },
  { id: "big_wheel", rating: 220, unlock: "tier_ferris", label: "Ferris wheel & souvenir shop", blurb: "The skyline ride, and the shop beside it." },
  { id: "workshop", rating: 360, unlock: "tier_mechanic", label: "Mechanic bay", blurb: "Rides come back from a breakdown sooner." },
  { id: "drop_tower", rating: 540, unlock: "tier_dropzone", label: "Drop tower", blurb: "Pure thrill, steep upkeep." },
  { id: "grand_gardens", rating: 760, unlock: "tier_gardens", label: "Grand gardens", blurb: "Sculpted hedges for a headline garden." },
];

/** The buildables a milestone opens, for a HUD that names what appeared. */
export function milestoneContents(unlockId: string): readonly string[] {
  return BUILD_IDS.filter((id) => BUILDABLES[id]!.requires === unlockId).map((id) => BUILDABLES[id]!.label);
}

for (const milestone of MILESTONES) {
  if (milestoneContents(milestone.unlock).length === 0) throw new Error(`brightway-park: milestone "${milestone.id}" opens nothing`);
}

/** The first milestone the rating has not reached, or null when all are open. */
export function nextMilestone(rating: number): MilestoneDef | null {
  return MILESTONES.find((m) => rating < m.rating) ?? null;
}

/** Milestones crossed when the park's best rating moves from `before` to `after`. */
export function milestonesCrossed(before: number, after: number): readonly MilestoneDef[] {
  return MILESTONES.filter((m) => before < m.rating && after >= m.rating);
}
