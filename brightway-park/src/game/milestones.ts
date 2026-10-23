import { createGateSet, gateFacts, type GateDef, type GateSet, type GateStatus } from "@jgengine/core/progression/gates";
import { createStanding, type Standing, type StandingState } from "@jgengine/core/progression/standing";

import { BUILDABLES, BUILD_IDS } from "./objects/catalog";

/**
 * The park's milestones are authored unlock gates (`@jgengine/core/progression/gates`): each one
 * names the unlock it grants and the standing it needs, and the gate set refuses to load while any
 * unlock id resolves to nothing. Standing is the park's own rating track, so a star crossing and a
 * tier crossing are the same number.
 */

/** The one standing track a park has today: its star rating. */
export const PARK_TRACK = "park";

/** Who owns the rating: a park is its own actor, not the player's user id. */
export const PARK_ACTOR = "brightway";

export interface MilestoneDef {
  /** Stable id used by the gate table and the save. */
  id: string;
  /** Park rating that opens it. */
  rating: number;
  /** Unlock id granted; a buildable must require it, or the gate set refuses to load. */
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

/**
 * A milestone unlock resolves when a buildable in the palette requires it. This is the catalog the
 * gate set validates against, so an authored reward that unlocks nothing fails at module load.
 */
export function unlockResolves(unlockId: string): boolean {
  for (const id of BUILD_IDS) if (BUILDABLES[id]!.requires === unlockId) return true;
  return false;
}

/** The buildable a milestone id opens, for a HUD that names what appeared. */
export function milestoneContents(unlockId: string): readonly string[] {
  const labels: string[] = [];
  for (const id of BUILD_IDS) if (BUILDABLES[id]!.requires === unlockId) labels.push(BUILDABLES[id]!.label);
  return labels;
}

export const MILESTONE_GATES: readonly GateDef[] = MILESTONES.map((milestone) => ({
  id: milestone.id,
  unlock: milestone.unlock,
  label: milestone.label,
  category: "milestone",
  requires: { standing: { trackId: PARK_TRACK, min: milestone.rating } },
}));

/** The park's rating, as standing on one authored track. */
export const parkStanding: Standing = createStanding({
  tracks: [{ id: PARK_TRACK, label: "Park rating", initial: 0, min: 0 }],
});

export const parkGates: GateSet = createGateSet({
  gates: MILESTONE_GATES,
  catalog: { has: unlockResolves },
  standing: parkStanding,
});

/** A fresh park starts at zero stars and nothing unlocked. */
export function resetProgression(): void {
  parkStanding.restore({ records: {} });
}

/** Move standing to the live rating. The park rating only climbs, so a gate never closes behind you. */
export function syncStanding(rating: number): void {
  const current = parkStanding.standing(PARK_ACTOR, PARK_TRACK);
  if (rating > current) parkStanding.adjust(PARK_ACTOR, PARK_TRACK, rating - current);
}

/** Every milestone against the park's live facts. */
export function milestoneStatuses(cash: number): readonly GateStatus[] {
  return parkGates.status(gateFacts(parkStanding, PARK_ACTOR, { cash }));
}

/** Milestones met now whose unlock has not been granted yet - the grants for this pass. */
export function claimMilestones(cash: number, granted: readonly string[]): readonly GateDef[] {
  return parkGates.claim(gateFacts(parkStanding, PARK_ACTOR, { cash }), granted);
}

/** The first milestone the rating has not reached, or null when all are open. */
export function nextMilestone(rating: number): MilestoneDef | null {
  return MILESTONES.find((m) => rating < m.rating) ?? null;
}

export type { StandingState };
