import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";

import { registerBuildCommands } from "../build/commands";
import { BASE_CATALOG_ID, BASE_ENTITY_ID } from "../entities/base/catalog";
import { CREEP_CATALOG } from "../entities/enemies/catalog";
import { currentWaveNumber, resetSession, session } from "../session";
import { exposeKeepReadout, keep, resetKeep, runEnded } from "../keep";
import { resetProjectiles } from "../combat/pendingProjectiles";
import { KEEP_POINT } from "./path";
import { registerWaveCommands } from "../waves/director";
import { registerCaptureCommands } from "../capture";
import { killBounty } from "../waves/bounty";
import {
  legacy,
  chooseRelic,
  openingGold,
  openingLives,
  relicBountyScale,
  startDefense,
} from "../waves/legacy";
import { beginRun, pauseRun } from "../menu";

function handleEntityDied(ctx: GameContext, event: EntityDiedEvent): void {
  if (event.catalogId in CREEP_CATALOG) {
    session.creeps.delete(event.instanceId);
    if (session.boss?.instanceId === event.instanceId) session.boss = null;
    // The bounty is a world ripple into the keep's shared purse, scaled by what this kill pays.
    const paid = killBounty(event.catalogId, currentWaveNumber(), relicBountyScale(legacy.read(ctx)));
    keep.emit(ctx, { kind: "bounty", scale: paid });
    ctx.game.audio.play("kill", event.position);
  }
}

/** Retry the run, preserving settings and avoiding duplicate death subscriptions. */
export function restartDefense(ctx: GameContext): void {
  for (const id of [...session.creeps.keys(), BASE_ENTITY_ID]) ctx.scene.entity.despawn(id);
  resetSession();
  resetProjectiles();
  // The engine loop opens the defense and adopts the relic it carries.
  startDefense(ctx);
  const banked = legacy.read(ctx);
  resetKeep(ctx, { gold: openingGold(banked), lives: openingLives(banked) });
  ctx.scene.entity.spawn(BASE_CATALOG_ID, { id: BASE_ENTITY_ID, position: KEEP_POINT, role: "prop" });
  ctx.time.play();
  setGamePhase(ctx, "playing");
}

export function setupWorld(ctx: GameContext): void {
  restartDefense(ctx);
  registerBuildCommands(ctx);
  registerWaveCommands(ctx);
  registerCaptureCommands(ctx);
  // One command that opens a run from the title, so a capture or a host can start play without a menu click.
  ctx.game.commands.define("run.begin", { apply: (state) => {
    if (gamePhase(state) !== "playing") beginRun(state);
    return state;
  } });
  // The counterpart the pause screen's own Esc path takes, reachable from a capture state.
  ctx.game.commands.define("run.pause", { apply: (state) => {
    pauseRun(state);
    return state;
  } });
  ctx.game.commands.define("defense.restart", {
    validate: (state) => (runEnded(keep.of(state)) ? null : { reason: "run-not-ended" }),
    apply: state => { restartDefense(state); return state; },
  });
  // The result card's relic choice: bank the offered relic and march out with it.
  ctx.game.commands.define<{ boon?: string | null } | undefined>("legacy.choose", {
    validate: (state, input) => {
      if (!runEnded(keep.of(state))) return { reason: "run-not-ended" };
      const pick = input?.boon ?? null;
      if (pick !== null && !legacy.read(state).offer.includes(pick)) return { reason: "not-offered" };
      return null;
    },
    apply: (state, input) => {
      const pick = input?.boon ?? null;
      chooseRelic(state, pick);
      restartDefense(state);
      return state;
    },
  });
  ctx.game.events.on("entity.died", (event) => handleEntityDied(ctx, event));
  exposeKeepReadout(ctx, () => gamePhase(ctx));
}

export function heartbeat(ctx: GameContext): void {
  const base = ctx.scene.entity.get(BASE_ENTITY_ID);
  if (base !== null) ctx.scene.entity.setPose(BASE_ENTITY_ID, { position: base.position });
}
