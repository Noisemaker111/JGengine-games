import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { registerCommands } from "./game/abilities";
import { ROOMS } from "./game/rooms/catalog";
import { activeSpikeCells, isWalkable, type Latch, type RoomState } from "./game/rooms/engine";
import { applyRoomVisuals, currentRoomState } from "./game/rooms/setup";
import { advanceRoom, seatPlayer, startRun } from "./game/runtime";
import { duetStore, pruneToast, raiseToast } from "./game/stores";
import { cellKey, HERO_IDS, sameCell } from "./game/types";
import { heroCells } from "./game/rooms/setup";

const SOLVE_HOLD_SECONDS = 1.4;

/** Stable id + tint for Lumen's retained light beam (`combat.vfxInstance`). */
const BEAM_VFX_ID = "duet-prism-beam";
const BEAM_COLOR = 0x38f0ff;

const lastSignature = perContext(() => ({ value: "" }));
const beamTracker = perContext(() => ({ active: false, key: "" }));

/**
 * Drive Lumen's prism beam as a single retained VFX instance instead of a game-local mesh: create it when the
 * prism is latched and its beam reaches a cell, move it (partial update) as the traced path end shifts, and stop
 * it (with a short fade) when the prism is unlatched or blocked. Only emits on change, so a held, unchanging beam
 * costs no per-tick command traffic.
 */
function updateBeamVfx(ctx: GameContext, latch: Latch, state: RoomState): void {
  const tracker = beamTracker(ctx);
  const stopBeam = (): void => {
    if (!tracker.active) return;
    ctx.scene.entity.vfxInstance.stop(BEAM_VFX_ID, { fadeMs: 160 });
    tracker.active = false;
    tracker.key = "";
  };
  const prism = latch.prism;
  if (prism === null) {
    stopBeam();
    return;
  }
  const start = prism.cell;
  const end = state.beamPath.length > 0 ? state.beamPath[state.beamPath.length - 1]! : start;
  if (start.x === end.x && start.z === end.z) {
    stopBeam();
    return;
  }
  const key = `${start.x},${start.z}->${end.x},${end.z}`;
  const from: [number, number, number] = [start.x, 0.5, start.z];
  const to: [number, number, number] = [end.x, 0.5, end.z];
  if (!tracker.active) {
    ctx.scene.entity.vfxInstance.upsert({ id: BEAM_VFX_ID, kind: "beam", color: BEAM_COLOR, from, to, radius: 0.14 });
    tracker.active = true;
    tracker.key = key;
  } else if (key !== tracker.key) {
    ctx.scene.entity.vfxInstance.update(BEAM_VFX_ID, { from, to });
    tracker.key = key;
  }
}

function onInit(ctx: GameContext): void {
  registerCommands(ctx);
  startRun(ctx);
  duetStore.update(ctx, s => ({ ...s, status: "ready" }));
  setGamePhase(ctx, "menu");
}

function onNewPlayer(ctx: GameContext): void {
  if (!seatPlayer(ctx, ctx.player.userId)) raiseToast(ctx, "Both hero seats are occupied.");
  // Joining/reconnecting changes possession, never the puzzle already in progress.
}

function onTick(ctx: GameContext, dt: number): void {
  const store = duetStore.read(ctx);
  if (store.status === "ready" || store.status === "paused") return;
  if (store.status === "complete") {
    pruneToast(ctx);
    return;
  }
  const room = ROOMS[store.roomIndex];
  if (room === undefined) return;

  let state = currentRoomState(ctx, room);

  let spikes = activeSpikeCells(room, state);
  if (spikes.size > 0) {
    let zapped = 0;
    for (const heroId of HERO_IDS) {
      const entity = ctx.scene.entity.get(heroId);
      if (entity === null) continue;
      const cell = { x: Math.round(entity.position[0]), z: Math.round(entity.position[2]) };
      if (!spikes.has(cellKey(cell))) continue;
      const safe = duetStore.read(ctx).safeCells[heroId];
      const recovery = safe !== null && isWalkable(room, state, safe) && !spikes.has(cellKey(safe)) ? safe : room.spawn[heroId];
      ctx.scene.entity.setPose(heroId, { position: [recovery.x, 0, recovery.z], rotationY: 0, dt: 0 });
      zapped++;
    }
    if (zapped) {
      duetStore.update(ctx, s => ({ ...s, recoveries: s.recoveries + zapped }));
      raiseToast(ctx, "Spikes live! Returned to safe ground. Your relays and devices are preserved.");
      state = currentRoomState(ctx, room);
      spikes = activeSpikeCells(room, state);
    }
  }

  if (state.readyRelay !== null) {
    duetStore.update(ctx, s => ({ ...s, latch: { ...s.latch, completedRelays: state.completedRelays } }));
    const relay = room.relays?.find(relay => relay.id === state.readyRelay);
    const final = room.relays?.every(relay => state.completedRelays.includes(relay.id));
    raiseToast(ctx, `${relay?.label ?? state.readyRelay} secured. ${final ? "Keep the final light and weight held; guide both heroes to their exits." : "Move your devices to the next circuit."}`);
  }

  const heroes = heroCells(ctx);
  const safeCells = duetStore.read(ctx).safeCells;
  const nextSafe = { ...safeCells };
  for (const id of HERO_IDS) {
    if (!spikes.has(cellKey(heroes[id])) && isWalkable(room, state, heroes[id])) nextSafe[id] = heroes[id];
  }
  if (HERO_IDS.some(id => safeCells[id] === null || !sameCell(safeCells[id]!, nextSafe[id]!))) {
    duetStore.update(ctx, s => ({ ...s, safeCells: nextSafe }));
  }
  const exits = HERO_IDS.filter(id => sameCell(heroes[id], room.exit[id]));
  const signature = room.id + [state.openGates, state.pressedPlates, state.poweredReceivers, state.activeSpikes, state.completedRelays, exits]
    .map((list) => [...list].sort().join(","))
    .join("|");
  if (signature !== lastSignature(ctx).value) {
    applyRoomVisuals(ctx, room, state);
    duetStore.update(ctx, (s) => ({
      ...s,
      pressedPlates: state.pressedPlates,
      poweredReceivers: state.poweredReceivers,
      openGates: state.openGates,
      activeSpikes: state.activeSpikes,
      exits,
    }));
    lastSignature(ctx).value = signature;
  }

  updateBeamVfx(ctx, duetStore.read(ctx).latch, state);

  if (store.status === "playing") {
    if (state.solved) duetStore.update(ctx, (s) => ({ ...s, status: "solved", solveTimer: SOLVE_HOLD_SECONDS }));
  } else if (store.status === "solved") {
    const remaining = store.solveTimer - dt;
    if (remaining <= 0) advanceRoom(ctx);
    else duetStore.update(ctx, (s) => ({ ...s, solveTimer: remaining }));
  }

  pruneToast(ctx);
}

export const loop = { onInit, onNewPlayer, onTick };
