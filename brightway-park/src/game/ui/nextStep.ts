import { milestoneContents, nextMilestone } from "../progression";

/**
 * Plain-language next step for the objective card, derived from the milestone gates.
 * Names the action (raise rating) and the reward (the content that appears) so a new player knows
 * what to do and what changes when they do it.
 */
export function nextStepText(rating: number): string | null {
  const next = nextMilestone(rating);
  if (next === null) return null;
  const contents = milestoneContents(next.unlock);
  return `Raise rating to ${next.rating} ★ — add scenery and keep guests happy to unlock ${contents.length > 0 ? contents.join(" & ") : next.label}`;
}

export { nextMilestone };
