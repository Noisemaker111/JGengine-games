import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { registerBuildCommands } from "../build/commands";
import {
  BASE_CATALOG_ID,
  BASE_ENTITY_ID,
  GOLD_CURRENCY,
  STARTING_GOLD,
} from "../entities/base/catalog";
import { creepDef, CREEP_CATALOG } from "../entities/enemies/catalog";
import {
  resetSession,
  session,
  snapshotSession,
  restoreSession,
} from "../session";
import { resetProjectiles } from "../combat/pendingProjectiles";
import { KEEP_POINT } from "./path";

function handleEntityDied(ctx: GameContext, event: EntityDiedEvent): void {
  if (event.catalogId === BASE_CATALOG_ID) {
    session.gameOver = true;
    setGamePhase(ctx, "ended");
    return;
  }
  if (event.catalogId in CREEP_CATALOG) {
    session.creeps.delete(event.instanceId);
    session.reserve = Math.min(100, session.reserve + 1);
    const beneficiary =
      event.reason.kind === "player_kill"
        ? event.reason.killerUserId
        : ctx.player.userId;
    ctx.game.economy.grant(
      beneficiary,
      GOLD_CURRENCY,
      creepDef(event.catalogId).bounty,
    );
  }
}

export function setupWorld(ctx: GameContext): void {
  resetSession();
  resetProjectiles();
  ctx.game.economy.grant(ctx.player.userId, GOLD_CURRENCY, STARTING_GOLD);
  ctx.scene.entity.spawn(BASE_CATALOG_ID, {
    id: BASE_ENTITY_ID,
    position: KEEP_POINT,
    role: "prop",
  });
  registerBuildCommands(ctx);
  ctx.game.registerSave?.({
    key: "bastionSession",
    snapshot: snapshotSession,
    hydrate(raw) {
      restoreSession(raw);
      // Published 0.18.1 hydration bypasses the spawn lifecycle that revives dead ids.
      for (const id of [BASE_ENTITY_ID, ...session.creeps.keys()]) {
        const entity = ctx.scene.entity.get(id);
        if (entity === null) continue;
        const statId = id === BASE_ENTITY_ID ? "lives" : "health";
        const savedPool = ctx.scene.entity.stats.get(id, statId);
        ctx.scene.entity.spawn(entity.name, {
          ...entity,
          onExisting: "replace",
        });
        if (savedPool !== null)
          ctx.scene.entity.stats.set(id, statId, savedPool);
      }
      resetProjectiles();
    },
  });
  ctx.game.events.on("entity.died", (event) => handleEntityDied(ctx, event));
}

export function heartbeat(ctx: GameContext): void {
  const base = ctx.scene.entity.get(BASE_ENTITY_ID);
  if (base !== null)
    ctx.scene.entity.setPose(BASE_ENTITY_ID, { position: base.position });
}
