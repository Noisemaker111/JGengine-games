import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";

export interface PendingArrow { userId: string; rawAmount: number; crit: boolean }
const pendingArrows = defineStore<Record<string, PendingArrow>>("lantern.arrowFlights", () => ({}));
const MAX_ARROWS = 32;

/** Mana and cooldowns remain ability rules; only these two Trailwarden abilities launch arrows. */
export const HUNTER_ARROWS = new Set(["rattling_shot", "long_draw"]);

export function launchHunterArrow(ctx: GameContext, userId: string, targetId: string, rawAmount: number, crit: boolean): boolean {
  const pending = pendingArrows.read(ctx);
  if (Object.keys(pending).length >= MAX_ARROWS) return false;
  const actor = ctx.scene.entity.get(userId), target = ctx.scene.entity.get(targetId);
  if (actor === null || target === null) return false;
  const origin: [number, number, number] = [actor.position[0], actor.position[1] + 1.1, actor.position[2]];
  const distance = Math.hypot(target.position[0] - origin[0], target.position[2] - origin[2]);
  const flightSeconds = distance / 32;
  const direction: [number, number, number] = [target.position[0] - origin[0], target.position[1] + 0.9 + 0.75 * flightSeconds * flightSeconds - origin[1], target.position[2] - origin[2]];
  const shotId = ctx.scene.entity.fireProjectile({
    from: userId, effect: "damage", via: { amount: 0 },
    aim: { origin, direction },
    travel: { speed: 32, lifetime: 1.5, radius: 0, gravity: [0, -1.5, 0], windResponse: 0.025, forceMask: 0, maxAcceleration: 0.35 },
  });
  pendingArrows.write(ctx, { ...pending, [shotId]: { userId, rawAmount, crit } });
  return true;
}

/** The serialized ledger survives runtime restore; remove before applying any game consequence. */
export function installArrowSettlement(ctx: GameContext, onContact: (arrow: PendingArrow, targetId: string) => void): () => void {
  const unsubscribe = ctx.game.events.on("projectile.settled", event => {
    const current = pendingArrows.read(ctx);
    const arrow = current[event.shotId];
    if (arrow === undefined) return;
    const next = { ...current };
    delete next[event.shotId];
    pendingArrows.write(ctx, next);
    const contact = event.hits[0];
    if (contact !== undefined) onContact(arrow, contact.instanceId);
  });
  return () => { unsubscribe(); pendingArrows.clear(ctx); };
}
