import { createLevelSequence, type LevelSequence } from "@jgengine/core/game/levelSequence";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { ROOMS, type RoomDef } from "./rooms/catalog";
import { applyRoomVisuals, buildRoom, currentRoomState } from "./rooms/setup";
import { clearToast, duetStore, freshRoom } from "./stores";
import type { HeroId } from "./types";

export const levelSeq = perContext<LevelSequence<RoomDef>>(() =>
  createLevelSequence({
    levels: ROOMS.map((room) => ({ id: room.id, config: room })),
    storage: null,
  }),
);

interface Seats {
  lumen: string | null;
  anchor: string | null;
}
const seats = perContext<Seats>(() => ({ lumen: null, anchor: null }));

function heroesOwnedBy(ctx: GameContext, userId: string): HeroId[] {
  return ctx.player.possession
    .listOwned(userId)
    .filter((id): id is HeroId => id === "lumen" || id === "anchor");
}

/** Assign a joining player to a hero seat: first player drives both (swappable); a second takes Anchor. */
export function seatPlayer(ctx: GameContext, userId: string): boolean {
  if (userId.length === 0) return false;
  const s = seats(ctx);
  if (s.lumen === userId || s.anchor === userId) {
    const current = controlledHero(ctx, userId);
    const hero = current ?? (s.lumen === userId ? "lumen" : "anchor");
    ctx.player.possession.own(userId, hero);
    ctx.player.possession.possess(userId, hero);
    return true;
  }
  if (s.lumen === null) {
    s.lumen = userId;
    ctx.player.possession.own(userId, "lumen");
    ctx.player.possession.possess(userId, "lumen");
    if (s.anchor === null) {
      s.anchor = userId; // solo: own both, swap between them
      ctx.player.possession.own(userId, "anchor");
    }
    return true;
  }
  if (s.anchor !== null && s.anchor !== s.lumen) return false;
  // second distinct player claims Anchor, taking it from a solo player if needed
  if (s.anchor !== null && s.anchor === s.lumen) {
    ctx.player.possession.disown(s.anchor, "anchor");
    ctx.player.possession.possess(s.lumen, "lumen");
  }
  s.anchor = userId;
  ctx.player.possession.own(userId, "anchor");
  ctx.player.possession.possess(userId, "anchor");
  return true;
}

export function swapHero(ctx: GameContext, userId: string): boolean {
  const owned = heroesOwnedBy(ctx, userId);
  if (owned.length < 2) return false;
  const active = ctx.player.possession.active(userId);
  const next = owned.find((id) => id !== active) ?? owned[0];
  ctx.player.possession.possess(userId, next);
  duetStore.update(ctx, (state) => ({ ...state, active: next }));
  return true;
}

export function controlledHero(ctx: GameContext, userId: string): HeroId | null {
  const s = seats(ctx);
  if (s.lumen !== userId && s.anchor !== userId) return null;
  const active = ctx.player.possession.active(userId);
  if (active !== "lumen" && active !== "anchor") return null;
  return ctx.player.possession.owns(userId, active) ? active : null;
}

export function activeHero(ctx: GameContext, userId: string): HeroId {
  const active = ctx.player.possession.active(userId);
  return active === "anchor" ? "anchor" : "lumen";
}

export function loadCurrentRoom(ctx: GameContext): void {
  const current = levelSeq(ctx).current();
  if (current === null) return;
  const room = ROOMS[current.index];
  if (room === undefined || room.id !== current.id) return;
  const possession = [...new Set([seats(ctx).lumen, seats(ctx).anchor])]
    .filter((userId): userId is string => userId !== null)
    .map(userId => ({ userId, hero: controlledHero(ctx, userId) ?? (seats(ctx).lumen === userId ? "lumen" : "anchor") }));
  duetStore.update(ctx, (state) => ({ ...state, ...freshRoom(current.index), active: "lumen",
    pressedPlates: [], poweredReceivers: [], openGates: [], activeSpikes: [], exits: [] }));
  clearToast(ctx);
  buildRoom(ctx, room);
  const signals = currentRoomState(ctx, room);
  applyRoomVisuals(ctx, room, signals);
  duetStore.update(ctx, state => ({ ...state, pressedPlates: signals.pressedPlates,
    poweredReceivers: signals.poweredReceivers, openGates: signals.openGates, activeSpikes: signals.activeSpikes }));
  for (const { userId, hero } of possession) ctx.player.possession.possess(userId, hero);
  const localHero = controlledHero(ctx, ctx.player.userId);
  if (localHero !== null) duetStore.update(ctx, state => ({ ...state, active: localHero }));
}

export function startRun(ctx: GameContext, roomIndex = 0): void {
  const seq = levelSeq(ctx);
  seq.start();
  // A validated browser checkpoint restores the unlocked frontier in the memory-only sequence.
  const index = Number.isInteger(roomIndex) && ROOMS[roomIndex] !== undefined ? roomIndex : 0;
  for (let i = 0; i < index; i++) { seq.clear(); seq.advance(); }
  loadCurrentRoom(ctx);
  setGamePhase(ctx, "playing");
}

export function advanceRoom(ctx: GameContext): void {
  const seq = levelSeq(ctx);
  seq.clear();
  if (seq.advance() && seq.status() !== "complete") {
    loadCurrentRoom(ctx);
  } else {
    duetStore.update(ctx, (state) => ({ ...state, status: "complete", solveTimer: 0 }));
    setGamePhase(ctx, "ended");
  }
}

export function resetRoom(ctx: GameContext): void {
  loadCurrentRoom(ctx);
  setGamePhase(ctx, "playing");
}
