import { defineStore } from "@jgengine/core/store/defineStore";

/**
 * Why the hovered blueprint spot cannot be built, or null when it can (or nothing is hovered).
 * The world overlay writes it on hover so the build bar can explain a red footprint before the
 * player clicks, instead of only after a refused click. Per-context store slot, not module state.
 */
export const placementHintStore = defineStore<string | null>("brightway.placementHint", null);

/** The reason a hovered spot is refused: placement rules first, then the budget. */
export function hoverRefusal(check: { ok: boolean; reason?: string }, cash: number, cost: number): string | null {
  if (!check.ok) return check.reason ?? "Can't build here";
  if (cash < cost) return `Needs $${cost - cash} more`;
  return null;
}
