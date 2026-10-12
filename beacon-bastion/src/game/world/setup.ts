import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { registerBuildCommands } from "../build/commands";
import { BASE_CATALOG_ID, BASE_ENTITY_ID, GOLD_CURRENCY, STARTING_GOLD } from "../entities/base/catalog";
import { creepDef, CREEP_CATALOG } from "../entities/enemies/catalog";
import { resetSession, session } from "../session";
import { resetProjectiles } from "../combat/pendingProjectiles";
import { KEEP_POINT } from "./path";
import { registerWaveCommands } from "../waves/director";

function handleEntityDied(ctx: GameContext, event: EntityDiedEvent): void {
  if (event.catalogId === BASE_CATALOG_ID) {
    session.gameOver = true;
    setGamePhase(ctx, "ended");
    return;
  }
  if (event.catalogId in CREEP_CATALOG) {
    session.creeps.delete(event.instanceId);
    const beneficiary = event.reason.kind === "player_kill" ? event.reason.killerUserId : ctx.player.userId;
    ctx.game.economy.grant(beneficiary, GOLD_CURRENCY, creepDef(event.catalogId).bounty);
  }
}

/** Retry the run, preserving settings and avoiding duplicate death subscriptions. */
export function restartDefense(ctx: GameContext): void {
  for (const id of [...session.creeps.keys(), ...session.towers.keys(), BASE_ENTITY_ID]) {
    ctx.scene.entity.despawn(id);
  }
  resetSession();
  resetProjectiles();
  const gold = ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY);
  if (gold > 0) ctx.game.economy.charge(ctx.player.userId, GOLD_CURRENCY, gold);
  ctx.game.economy.grant(ctx.player.userId, GOLD_CURRENCY, STARTING_GOLD);
  ctx.scene.entity.spawn(BASE_CATALOG_ID, { id: BASE_ENTITY_ID, position: KEEP_POINT, role: "prop" });
  ctx.time.play();
  setGamePhase(ctx, "playing");
}

export function setupWorld(ctx: GameContext): void {
  restartDefense(ctx);
  registerBuildCommands(ctx);
  registerWaveCommands(ctx);
  ctx.game.commands.define("defense.restart", {
    validate: () => session.gameOver || session.victory ? null : { reason: "run-not-ended" },
    apply: state => { restartDefense(state); return state; },
  });
  ctx.game.events.on("entity.died", (event) => handleEntityDied(ctx, event));
}

export function heartbeat(ctx: GameContext): void {
  const base = ctx.scene.entity.get(BASE_ENTITY_ID);
  if (base !== null) ctx.scene.entity.setPose(BASE_ENTITY_ID, { position: base.position });
}
