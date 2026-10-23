import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PointerHit } from "@jgengine/core/input/pointer";

import { buildableDef } from "../objects/catalog";
import { session } from "../session";
import { canPlace, placeObject, removeObject } from "./placement";
import { BUILDABLES } from "../objects/catalog";
import { archiveSave, savePark } from "../persistence";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { tracePark } from "../evidence";
import { syncAmbience } from "../audio";
import { payOffLoan, takeLoan } from "../sim/economy";
import { ridePrice, serviceRide, setRidePrice } from "../rides";
import { beginScenario, endScenario, replayScenario } from "../scenarios";

export type PointerInput = Pick<PointerHit, "point" | "entity" | "object">;

let revision = 0;

export function bump(ctx: GameContext): void {
  revision += 1;
  ctx.game.store.set("__rev", revision);
  tracePark(ctx,"command");
}

export function canBuild(ctx: GameContext, id: string): boolean {
  const def = BUILDABLES[id];
  return Object.hasOwn(BUILDABLES,id) && def !== undefined && (def.requires === undefined || ctx.game.unlocks?.has(ctx.player.userId,def.requires) === true);
}

function selectTool(ctx: GameContext, id: string): void {
  if (!session.started || session.gameOver || !canBuild(ctx,id)) return;
  clearSelection(ctx);
  session.selectedTool = session.selectedTool === id ? null : id;
  bump(ctx);
}

function affordable(catalogId: string): boolean {
  return session.cash >= buildableDef(catalogId).cost;
}

function tryBuild(ctx: GameContext, input: PointerInput): void {
  const toolId = session.selectedTool;
  if (toolId === null) return;
  if (!canBuild(ctx,toolId)) return;
  const def = buildableDef(toolId);
  if (!affordable(toolId)) {
    // The deny notice plays the park's own "denied" cue (audio.uiCues.deny).
    ctx.game.notices.push({ text: `Not enough cash for ${def.label}`, tone: "deny" });
    return;
  }
  if (!Array.isArray(input.point) || input.point.length !== 3 || !input.point.every(Number.isFinite)) return;
  const [x,,z] = input.point;
  const check = canPlace(toolId, x, z);
  if (!check.ok) {
    ctx.game.notices.push({ text: check.reason ?? "Can't build here", tone: "deny" });
    return;
  }
  const placed = placeObject(ctx, toolId, x, z);
  if (placed === null) return;
  session.cash -= def.cost;
  ctx.game.notices.push({ text: `${def.label} built · -$${def.cost}`, tone: "success" });
  ctx.game.audio.play("place", [placed.x, 0, placed.z]);
  savePark(ctx);
}

/** Drop both kinds of click selection: the park's inspected object and the engine's selected guest. */
function clearSelection(ctx: GameContext): void {
  session.selectedObject = null;
  ctx.scene.entity.selection.clear();
}

/**
 * Click selection. Guests are scene entities and structures are placed objects; the engine's pointer
 * hit reports each separately. A guest goes into the engine's shared entity selection
 * (`ctx.scene.entity.selection`, the set the shell draws its selection ring from) and an object into
 * the park's own `selectedObject` for its inspector. Picking one clears the other, so clicking a guest
 * can never leave the path beneath it selected.
 */
function selectGuestOrObject(ctx: GameContext, input: PointerInput): void {
  const guest = input.entity !== null && session.guests.has(input.entity) ? input.entity : null;
  session.selectedObject = guest === null ? input.object : null;
  ctx.scene.entity.selection.clear();
  if (guest !== null) ctx.scene.entity.selection.replace([guest]);
}

function pointerAction(ctx: GameContext, input: PointerInput): void {
  tracePark(ctx,"pointer",input);
  if (!session.started || session.gameOver) return;
  if (session.selectedTool !== null) {
    tryBuild(ctx, input);
    return;
  }
  selectGuestOrObject(ctx, input);
}

export function registerBuildCommands(ctx: GameContext): void {
  ctx.game.commands.define<{reduced:boolean}>("park.motion", {apply(state,input){state.game.store.set("park.reduced-motion",input.reduced);}});
  ctx.game.commands.define("park.start", { apply(state) {
    session.started = true;
    if (session.gameOver) { setGamePhase(state,"ended"); state.time.pause(); }
    else if (session.won && !session.winDismissed) { setGamePhase(state,"paused"); state.time.pause(); }
    else { setGamePhase(state,"playing"); state.time.play(); }
    syncAmbience(state);
    savePark(state); bump(state);
  }});
  ctx.game.commands.define("park.save", { apply(state) { savePark(state); bump(state); }});
  ctx.game.commands.define("park.new", { apply(state) {
    try {
      // Stop pagehide from saving the old live park over the fresh slot.
      archiveSave(); session.started = false;
      if (typeof window !== "undefined") window.location.reload();
    } catch { session.saveStatus = "Could not archive the old save. Free browser storage before starting a new park."; bump(state); }
  }});
  ctx.game.commands.define("park.continue", { apply(state) {
    if (!session.started || session.gameOver) return;
    session.winDismissed = true; state.time.play(); setGamePhase(state,"playing"); savePark(state); bump(state);
  }});
  ctx.game.commands.define<{ speed: number }>("park.speed", { apply(state,input) {
    if (!session.started || session.gameOver || (session.won && !session.winDismissed) || ![1,2,4].includes(input.speed)) return;
    state.time.setSpeed(input.speed); setGamePhase(state,"playing"); bump(state);
  }});
  ctx.game.commands.define<PointerInput>("park.pointer", {
    apply(state, input) {
      pointerAction(state, input);
      bump(state);
    },
  });

  ctx.game.commands.define<{ id: string }>("build.select", {
    apply(state, input) {
      selectTool(state,input.id);
    },
  });

  ctx.game.commands.define("build.clear", {
    apply(state) {
      session.selectedTool = null;
      clearSelection(state);
      bump(state);
    },
  });

  ctx.game.commands.define<{ id: string }>("build.demolish", {
    apply(state, input) {
      if (!session.started || session.gameOver) return;
      const placed = session.placed.get(input.id);
      if (placed === undefined) return;
      const refund = Math.round(buildableDef(placed.catalogId).cost * 0.5);
      if (removeObject(state, input.id)) {
        session.cash += refund;
        if (session.selectedObject === input.id) session.selectedObject = null;
        state.game.notices.push({ text: `Demolished — refunded ${refund}`, tone: "info" });
        state.game.audio.play("sell", [placed.x, 0, placed.z]);
        savePark(state);
        bump(state);
      }
    },
  });

  ctx.game.commands.define<{ delta: number }>("park.ticket", {
    apply(state, input) {
      if (!session.started || session.gameOver || !Number.isFinite(input.delta)) return;
      const before = session.ticketPrice;
      session.ticketPrice = Math.max(4, Math.min(60, session.ticketPrice + input.delta));
      if (session.ticketPrice !== before) state.game.audio.play("ticket");
      savePark(state);
      bump(state);
    },
  });

  // A ride's own ticket: the guests weigh it against the walk and the line they can see.
  ctx.game.commands.define<{ id: string; delta: number }>("ride.price", {
    apply(state, input) {
      if (!session.started || session.gameOver || !Number.isFinite(input.delta)) return;
      const def = buildableDef(input.id);
      if (def.ride === undefined) return;
      const before = ridePrice(input.id);
      setRidePrice(input.id, before + input.delta);
      if (ridePrice(input.id) !== before) state.game.audio.play("ticket");
      savePark(state);
      bump(state);
    },
  });

  // Pay a ride's maintenance before it breaks: the shared sim clears the wear, the till pays.
  ctx.game.commands.define<{ id: string }>("ride.service", {
    apply(state, input) {
      if (!session.started || session.gameOver) return;
      const placed = session.placed.get(input.id);
      if (placed === undefined) return;
      const result = serviceRide(input.id);
      if (result === null) return;
      if (result.cost > 0) session.cash -= result.cost;
      state.game.notices.push({
        text: result.cost > 0
          ? `Serviced ${buildableDef(placed.catalogId).label} · -$${result.cost} · ${result.wear} cycles cleared`
          : `${buildableDef(placed.catalogId).label} has no wear to clear`,
        tone: result.cost > 0 ? "success" : "info",
      });
      if (result.cost > 0) state.game.audio.play("place", [placed.x, 0, placed.z]);
      savePark(state);
      bump(state);
    },
  });

  ctx.game.commands.define("park.loan", {
    apply(state) {
      if (!session.started || session.gameOver) return;
      const amount = takeLoan();
      if (amount <= 0) {
        state.game.notices.push({ text: "The park is already carrying a loan", tone: "deny" });
        return;
      }
      state.game.notices.push({ text: `Loan taken · +$${amount} · repaid nightly with 3% interest`, tone: "info" });
      state.game.audio.play("ticket");
      savePark(state);
      bump(state);
    },
  });

  ctx.game.commands.define("park.repay", {
    apply(state) {
      if (!session.started || session.gameOver || session.loan === null) return;
      const paid = payOffLoan();
      state.game.notices.push({ text: paid > 0 ? `Paid $${paid} off the loan` : "Not enough cash to pay the loan down", tone: paid > 0 ? "success" : "deny" });
      if (paid > 0) state.game.audio.play("sell");
      savePark(state);
      bump(state);
    },
  });

  ctx.game.commands.define<{ id: string }>("park.scenario", {
    apply(state, input) {
      if (!beginScenario(state, input.id)) return;
      bump(state);
    },
  });

  ctx.game.commands.define("park.replay", {
    apply(state) {
      if (!replayScenario(state)) return;
      bump(state);
    },
  });

  ctx.game.commands.define("park.freeplay", {
    apply(state) {
      endScenario(state);
      bump(state);
    },
  });

  ctx.game.commands.define("pauseToggle", {
    apply(state) {
      if (!session.started || session.gameOver || (session.won && !session.winDismissed)) return;
      state.time.toggle();
      setGamePhase(state,state.time.isPaused() ? "paused" : "playing");
      syncAmbience(state);
      savePark(state); bump(state);
    },
  });

  ctx.game.commands.define("clearTool", {
    apply(state) {
      session.selectedTool = null;
      clearSelection(state);
      bump(state);
    },
  });

  const quick: Record<string, string> = {
    pickCarousel: "ride_carousel",
    pickCoaster: "ride_coaster",
    pickTrack: "track_piece",
    pickFood: "stall_food",
    pickTree: "deco_tree",
    pickPath: "path_walk",
  };
  for (const [command, buildId] of Object.entries(quick)) {
    ctx.game.commands.define(command, {
      apply(state) {
        selectTool(state,buildId);
      },
    });
  }
}
