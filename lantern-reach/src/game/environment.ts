import { isPlaying } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { installEnvironmentMotion } from "@jgengine/core/world/environmentForces";

import { deadStore } from "./session/stores";

const MAX_TRAVELLERS = 32;
export const travellerSurfaceId = (userId: string): string => `lantern:traveller:${userId}`;

/** Frontier policy: living travellers feel a light breeze; combat and damage stay game-owned. */
export function setupEnvironment(ctx: GameContext): () => void {
  const watched = new Set<string>();
  const travellers = () => [...new Set([ctx.player.userId, ...(ctx.game.players?.ids() ?? [])])]
    .filter(id => ctx.scene.entity.get(id) !== null && !deadStore.read(ctx, id))
    .slice(0, MAX_TRAVELLERS);
  const stopMotion = installEnvironmentMotion(ctx, {
    maxTargets: MAX_TRAVELLERS,
    targets: () => isPlaying(ctx) ? travellers().map(entityId => ({
      entityId, motion: ctx.player.motionFor(entityId),
      windResponse: 0.16, maxAcceleration: 0.8, sheltered: true,
      // Only the authored marsh storm pocket opts travellers into spatial lift, still capped at 0.8 m/s².
      mask: 4,
    })) : [],
  });
  const stopSurfaces = ctx.sim.addStage({
    id: "lantern-traveller-exposure", phase: "afterMovement",
    run(_realDt, _tick, gameDt) {
      if (gameDt <= 0) return;
      const next = new Set<string>();
      for (const id of travellers()) {
        const actor = ctx.scene.entity.get(id)!;
        const surfaceId = travellerSurfaceId(id);
        next.add(surfaceId);
        const [x, y, z] = actor.position;
        ctx.environment.watch({ id: surfaceId, x, y, z });
      }
      for (const id of watched) if (!next.has(id)) ctx.environment.forget(id);
      watched.clear();
      for (const id of next) watched.add(id);
    },
  });
  return () => {
    stopSurfaces();
    stopMotion();
    for (const id of watched) ctx.environment.forget(id);
    watched.clear();
  };
}
