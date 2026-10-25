import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PointerHit } from "@jgengine/core/input/pointer";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { BUILDABLES } from "../objects/catalog";
import { session } from "../session";
import { placementAt } from "./placement";
import { archiveSave, savePark } from "../persistence";
import { tracePark } from "../evidence";
import { syncAmbience } from "../audio";
import { openParkDay } from "../daySession";
import { coasterCircuit } from "../rides";
import { park } from "../park";
import { beginScenario, endScenario, replayScenario } from "../parkReset";

export type PointerInput = Pick<PointerHit, "point" | "entity" | "object">;

let revision = 0;

export function bump(ctx: GameContext): void {
  revision += 1;
  ctx.game.store.set("__rev", revision);
  tracePark(ctx, "command");
}

const over = (ctx: GameContext): boolean => park.of(ctx).fact("park.game_over") === true;
const ribbonUp = (ctx: GameContext): boolean => {
  const w = park.of(ctx);
  return w.fact("park.won") === true && w.fact("park.win_dismissed") !== true;
};

/** A blueprint the palette offers: the world refuses a locked one; cost and room are checked at the spot. */
export function canBuild(ctx: GameContext, id: string): boolean {
  return Object.hasOwn(BUILDABLES, id) && park.of(ctx).canPlace(id)?.reason !== "locked";
}

function selectTool(ctx: GameContext, id: string): void {
  if (!session.started || over(ctx) || !canBuild(ctx, id)) return;
  clearSelection(ctx);
  session.selectedTool = session.selectedTool === id ? null : id;
  bump(ctx);
}

/** Read the circuit back to the player whenever its shape changes: the same numbers the ride runs on. */
function announceCircuit(ctx: GameContext): void {
  const circuit = coasterCircuit(ctx);
  ctx.game.notices.push(circuit.closed
    ? { text: `Circuit closed · ${Math.round(circuit.length)} m · ${circuit.lapSeconds.toFixed(1)} s lap · excitement ${circuit.excitement.toFixed(1)}`, tone: "success" }
    : { text: `Coaster track at ${Math.round(circuit.length)} m — the loop is still open`, tone: "info" });
}

/** Build at the pointer: the park's track rule, then the world's own `brightway.place`. */
function tryBuild(ctx: GameContext, input: PointerInput): void {
  const kind = session.selectedTool;
  if (kind === null || !canBuild(ctx, kind)) return;
  if (!Array.isArray(input.point) || input.point.length !== 3 || !input.point.every(Number.isFinite)) return;
  const [x, , z] = input.point;
  const w = park.of(ctx);
  const check = placementAt(w, kind, x, z);
  if (!check.ok) {
    // The deny notice plays the park's own "denied" cue (audio.uiCues.deny).
    ctx.game.notices.push({ text: check.reason, tone: "deny" });
    return;
  }
  const before = new Set(w.instances().map((instance) => instance.id));
  if (ctx.game.commands.run("brightway.place", { kind, cell: check.cell }).status !== "applied") return;
  const placed = w.instances().find((instance) => !before.has(instance.id));
  const def = BUILDABLES[kind]!;
  ctx.game.notices.push({ text: `${def.label} built · -$${def.cost}`, tone: "success" });
  if (kind === "track_piece" || kind === "ride_coaster") announceCircuit(ctx);
  const at = placed?.position;
  ctx.game.audio.play("place", at === null || at === undefined ? undefined : [at[0], 0, at[1]]);
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
  session.selectedObject = guest === null && input.object !== null && park.of(ctx).instance(input.object) !== null ? input.object : null;
  ctx.scene.entity.selection.clear();
  if (guest !== null) ctx.scene.entity.selection.replace([guest]);
}

function pointerAction(ctx: GameContext, input: PointerInput): void {
  tracePark(ctx, "pointer", input);
  if (!session.started || over(ctx)) return;
  if (session.selectedTool !== null) {
    tryBuild(ctx, input);
    return;
  }
  selectGuestOrObject(ctx, input);
}

export function registerBuildCommands(ctx: GameContext): void {
  ctx.game.commands.define<{ reduced: boolean }>("park.motion", { apply(state, input) { state.game.store.set("park.reduced-motion", input.reduced); } });
  ctx.game.commands.define("park.start", { apply(state) {
    session.started = true;
    openParkDay(state);
    if (over(state)) { setGamePhase(state, "ended"); state.time.pause(); }
    else if (ribbonUp(state)) { setGamePhase(state, "paused"); state.time.pause(); }
    else { setGamePhase(state, "playing"); state.time.play(); }
    syncAmbience(state);
    savePark(state); bump(state);
  } });
  ctx.game.commands.define("park.save", { apply(state) { savePark(state); bump(state); } });
  ctx.game.commands.define("park.new", { apply(state) {
    try {
      // Stop pagehide from saving the old live park over the fresh slot.
      archiveSave(); session.started = false;
      if (typeof window !== "undefined") window.location.reload();
    } catch { session.saveStatus = "Could not archive the old save. Free browser storage before starting a new park."; bump(state); }
  } });
  ctx.game.commands.define("park.continue", { apply(state) {
    if (!session.started || over(state)) return;
    park.of(state).set("park.win_dismissed", true); state.time.play(); setGamePhase(state, "playing"); savePark(state); bump(state);
  } });
  ctx.game.commands.define<{ speed: number }>("park.speed", { apply(state, input) {
    if (!session.started || over(state) || ribbonUp(state) || ![1, 2, 4].includes(input.speed)) return;
    state.time.setSpeed(input.speed); setGamePhase(state, "playing"); bump(state);
  } });
  ctx.game.commands.define<PointerInput>("park.pointer", {
    apply(state, input) {
      pointerAction(state, input);
      bump(state);
    },
  });

  ctx.game.commands.define<{ id: string }>("build.select", {
    apply(state, input) {
      selectTool(state, input.id);
    },
  });

  ctx.game.commands.define("build.clear", {
    apply(state) {
      session.selectedTool = null;
      clearSelection(state);
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
      if (!session.started || over(state) || ribbonUp(state)) return;
      state.time.toggle();
      setGamePhase(state, state.time.isPaused() ? "paused" : "playing");
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
        selectTool(state, buildId);
      },
    });
  }
}
