import { MILESTONES, type Milestone } from "../catalog";

/** The first milestone the park's rating has not yet reached, or null when all are unlocked. */
export function nextMilestone(rating: number): Milestone | null {
  return MILESTONES.find((m) => rating < m.rating) ?? null;
}

/**
 * Plain-language next step for the objective card, derived from MILESTONES.
 * Names the action (raise rating) and the reward (the unlock) so a new player knows what to do.
 */
export function nextStepText(rating: number): string | null {
  const next = nextMilestone(rating);
  if (next === null) return null;
  return `Raise rating to ${next.rating} ★ — add scenery and keep guests happy to unlock ${next.label}`;
}
