import { useSyncExternalStore } from "react";

/**
 * Why the hovered blueprint spot cannot be built, or null when it can (or nothing is hovered).
 * The world overlay writes it on hover so the build bar can explain a red footprint before the
 * player clicks, instead of only after a refused click.
 */
let hint: string | null = null;
const listeners = new Set<() => void>();

export function setPlacementHint(next: string | null): void {
  if (next === hint) return;
  hint = next;
  for (const listener of listeners) listener();
}

export function placementHint(): string | null {
  return hint;
}

export function usePlacementHint(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    placementHint,
    placementHint,
  );
}

/** The reason a hovered spot is refused: placement rules first, then the budget. */
export function hoverRefusal(check: { ok: boolean; reason?: string }, cash: number, cost: number): string | null {
  if (!check.ok) return check.reason ?? "Can't build here";
  if (cash < cost) return `Needs $${cost - cash} more`;
  return null;
}
