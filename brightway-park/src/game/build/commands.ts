import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PointerHit } from "@jgengine/core/input/pointer";

import { buildableDef } from "../objects/catalog";
import { pushToast, session } from "../session";
import { canPlace, placeObject, removeObject } from "./placement";
import { BUILDABLES } from "../objects/catalog";
import { archiveSave, savePark } from "../persistence";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { tracePark } from "../evidence";
import { repairCost, restockQuote, stockTarget, upgradeCost } from "../sim/operations";

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
  session.selectedObject = null;
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
    pushToast(`Not enough cash for ${def.label}`, "bad", ctx.time.now());
    return;
  }
  if (!Array.isArray(input.point) || input.point.length !== 3 || !input.point.every(Number.isFinite)) return;
  const [x,,z] = input.point;
  const check = canPlace(toolId, x, z);
  if (!check.ok) {
    pushToast(check.reason ?? "Can't build here", "bad", ctx.time.now());
    return;
  }
  const placed = placeObject(ctx, toolId, x, z);
  if (placed === null) return;
  session.cash -= def.cost;
  savePark(ctx);
}

function pointerAction(ctx: GameContext, input: PointerInput): void {
  tracePark(ctx,"pointer",input);
  if (!session.started || session.gameOver) return;
  if (session.selectedTool !== null) {
    tryBuild(ctx, input);
    return;
  }
  session.selectedObject = input.object;
}

export function registerBuildCommands(ctx: GameContext): void {
  ctx.game.commands.define<{id: string}>("build.inspect", { apply(state, input) {
    if (!session.started || session.gameOver || !session.placed.has(input.id)) return;
    session.selectedTool = null; session.selectedObject = input.id; bump(state);
  }});
  const transact = (state: GameContext, cost: number, action: () => void): void => {
    if (!session.started || session.gameOver) return;
    if (!Number.isFinite(cost) || cost < 0 || session.cash < cost) {
      pushToast("Not enough cash — close a ride for free refurbishment or sell a building", "bad", state.time.now());
      bump(state); return;
    }
    session.cash -= cost; action(); savePark(state); bump(state);
  };
  ctx.game.commands.define<{key: "marketing" | "supply"; value: string}>("park.policy", { apply(state, input) {
    if (!session.started || session.gameOver) return;
    if (input.key === "marketing" && (input.value === "local" || input.value === "festival")) session.marketing = input.value;
    else if (input.key === "supply" && (input.value === "lean" || input.value === "buffered")) session.supply = input.value;
    else return;
    savePark(state); bump(state);
  }});
  ctx.game.commands.define<{id: string; upgrade: "efficient" | "premium"}>("build.upgrade", { apply(state, input) {
    const obj = session.placed.get(input.id);
    if (!obj || obj.upgrade || !["efficient", "premium"].includes(input.upgrade)) return;
    const def = buildableDef(obj.catalogId);
    if (!def.ride && !def.stall) return;
    transact(state, upgradeCost(obj), () => {
      obj.upgrade = input.upgrade;
      pushToast(`${def.label}: ${input.upgrade === "efficient" ? "efficient service" : "premium experience"}`, "good", state.time.now());
    });
  }});
  ctx.game.commands.define<{id: string}>("build.repair", { apply(state, input) {
    const obj = session.placed.get(input.id);
    if (!obj || !buildableDef(obj.catalogId).ride || (obj.wear ?? 0) <= 0) return;
    transact(state, repairCost(obj), () => { obj.wear = 0; pushToast("Mechanic finished repairs", "good", state.time.now()); });
  }});
  ctx.game.commands.define<{id: string}>("build.restock", { apply(state, input) {
    const obj = session.placed.get(input.id);
    if (!obj || !buildableDef(obj.catalogId).stall || obj.stock >= stockTarget(obj)) return;
    transact(state, restockQuote(obj), () => { obj.stock = stockTarget(obj); pushToast("Rush delivery arrived · 25% surcharge", "info", state.time.now()); });
  }});
  ctx.game.commands.define<{id: string}>("build.toggle", { apply(state, input) {
    if (!session.started || session.gameOver) return;
    const obj = session.placed.get(input.id);
    if (!obj || (!buildableDef(obj.catalogId).ride && !buildableDef(obj.catalogId).stall)) return;
    obj.closed = !obj.closed;
    if (obj.closed) {
      for (const guest of session.guests.values()) if (guest.targetId === obj.id) {
        guest.targetId = null; guest.target = null; guest.phase = "seeking"; guest.busy = 0;
        guest.happy = Math.max(0, guest.happy - 4);
      }
      obj.occupants = 0;
    }
    pushToast(obj.closed ? "Closed · quarter upkeep, ride refurbishment underway" : "Reopened for visitors", "info", state.time.now());
    savePark(state); bump(state);
  }});
  ctx.game.commands.define<{reduced:boolean}>("park.motion", {apply(state,input){state.game.store.set("park.reduced-motion",input.reduced);}});
  ctx.game.commands.define("park.start", { apply(state) {
    session.started = true;
    if (session.gameOver) { setGamePhase(state,"ended"); state.time.pause(); }
    else if (session.won && !session.winDismissed) { setGamePhase(state,"paused"); state.time.pause(); }
    else { setGamePhase(state,"playing"); state.time.play(); }
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
      session.selectedObject = null;
      bump(state);
    },
  });

  ctx.game.commands.define<{ id: string }>("build.demolish", {
    apply(state, input) {
      if (!session.started || session.gameOver) return;
      const placed = session.placed.get(input.id);
      if (placed === undefined) return;
      const refund = Math.round((buildableDef(placed.catalogId).cost + (placed.upgrade ? upgradeCost(placed) : 0)) * 0.5);
      if (removeObject(state, input.id)) {
        session.cash += refund;
        if (session.selectedObject === input.id) session.selectedObject = null;
        pushToast(`Demolished — refunded ${refund}`, "info", state.time.now());
        savePark(state);
        bump(state);
      }
    },
  });

  ctx.game.commands.define<{ delta: number }>("park.ticket", {
    apply(state, input) {
      if (!session.started || session.gameOver || !Number.isFinite(input.delta)) return;
      session.ticketPrice = Math.max(4, Math.min(60, session.ticketPrice + input.delta));
      savePark(state);
      bump(state);
    },
  });

  ctx.game.commands.define("pauseToggle", {
    apply(state) {
      if (!session.started || session.gameOver || (session.won && !session.winDismissed)) return;
      state.time.toggle();
      setGamePhase(state,state.time.isPaused() ? "paused" : "playing");
      savePark(state); bump(state);
    },
  });

  ctx.game.commands.define("clearTool", {
    apply(state) {
      session.selectedTool = null;
      session.selectedObject = null;
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
