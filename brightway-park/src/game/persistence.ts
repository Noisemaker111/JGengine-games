import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { ClockSnapshot } from "@jgengine/core/time/simClock";
import { rngStateOf, restoreRng } from "@jgengine/core/random/rng";
import { BUILDABLES, buildableDef } from "./objects/catalog";
import { GUEST_KINDS } from "./entities/guests/catalog";
import { blockCenter, footprintCells } from "./build/placement";
import { withinPark, MILESTONES } from "./catalog";
import { createParkLedger, session, type GuestState, type PlacedObject } from "./session";

export const SAVE_KEY = "brightway-park.save.v1";
const numbers = ["cash", "rating", "happinessAvg", "litter", "ticketPrice", "day", "guestsToday", "revenueToday", "revenueYesterday", "upkeepYesterday", "spawnAcc", "guestSeq", "objectSeq", "bankruptDays"] as const;
type Stats = Record<typeof numbers[number], number>;
export interface ParkSave {
  version: 1; stats: Stats; placed: PlacedObject[];
  guests: { state: GuestState; position: [number, number, number] }[];
  clock: ClockSnapshot; unlocks: string[];
  gameOver: boolean; won: boolean; winDismissed: boolean;
  rng?: number | null;
}
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Validate before touching the live scene. Unreadable saves stay intact. */
export function decodeSave(raw: string): ParkSave | null {
  try {
    const s = JSON.parse(raw) as ParkSave;
    if (s.version !== 1 || !s.stats || !numbers.every(k => finite(s.stats[k]))) return null;
    if (!Number.isInteger(s.stats.day) || s.stats.day < 1 || s.stats.ticketPrice < 4 || s.stats.ticketPrice > 60) return null;
    if (!s.clock || !finite(s.clock.now) || s.clock.now < 0 || typeof s.clock.paused !== "boolean" || ![1,2,4].includes(s.clock.playSpeed) || s.clock.timescale !== 1) return null;
    if (!Array.isArray(s.unlocks) || !s.unlocks.every(id => MILESTONES.some(m => m.unlock === id))) return null;
    if (![s.gameOver, s.won, s.winDismissed].every(v => typeof v === "boolean")) return null;
    if (s.rng !== undefined && s.rng !== null && (!Number.isInteger(s.rng) || s.rng < -0x80000000 || s.rng > 0x7fffffff)) return null;
    if (!Array.isArray(s.placed) || !Array.isArray(s.guests)) return null;
    const cells = new Set<string>(), ids = new Set<string>();
    for (const p of s.placed) {
      if (!p || typeof p.id !== "string" || ids.has(p.id) || !Object.hasOwn(BUILDABLES,p.catalogId)) return null;
      if (![p.x,p.z,p.stock,p.soldTotal,p.occupants].every(finite) || p.stock < 0 || p.occupants < 0) return null;
      const def = buildableDef(p.catalogId), [dx,dz] = blockCenter(def,0,0);
      const gx = p.x-dx, gz = p.z-dz;
      if (gx % 4 !== 0 || gz % 4 !== 0) return null;
      for (const key of footprintCells(def,gx,gz)) {
        const [x,z] = key.split(",").map(Number);
        if (!withinPark(x!,z!) || cells.has(key)) return null;
        cells.add(key);
      }
      ids.add(p.id);
    }
    const guestIds = new Set<string>();
    for (const {state:g,position} of s.guests) {
      if (!g || typeof g.id !== "string" || guestIds.has(g.id) || !GUEST_KINDS.includes(g.kind)) return null;
      if (![g.happy,g.money,g.hunger,g.thirst,g.souvenir,g.visits,g.busy,g.litterTimer].every(finite)) return null;
      if (!["seeking","busy","leaving"].includes(g.phase) || (g.targetId !== null && !ids.has(g.targetId))) return null;
      if (!Array.isArray(position) || position.length !== 3 || !position.every(finite)) return null;
      if (g.target !== null && (!Array.isArray(g.target) || g.target.length !== 3 || !g.target.every(finite))) return null;
      guestIds.add(g.id);
    }
    return s;
  } catch { return null; }
}

export function snapshotPark(ctx: GameContext): ParkSave {
  return {
    version: 1, stats: Object.fromEntries(numbers.map(k => [k,session[k]])) as Stats,
    placed: [...session.placed.values()].map(p => ({...p})),
    guests: [...session.guests.values()].map(g => ({state:{...g},position:[...(ctx.scene.entity.get(g.id)?.position ?? [0,0,58])] as [number,number,number]})),
    clock: ctx.time.snapshot(), unlocks: [...(ctx.game.unlocks?.list(ctx.player.userId) ?? [])],
    gameOver: session.gameOver, won: session.won, winDismissed: session.winDismissed,
    rng: rngStateOf(ctx.rng),
  };
}

export function savePark(ctx: GameContext): void {
  if (!session.started || typeof localStorage === "undefined") return;
  try {
    const previous = localStorage.getItem(SAVE_KEY);
    if (previous && !decodeSave(previous)) archiveSave();
    localStorage.setItem(SAVE_KEY,JSON.stringify(snapshotPark(ctx)));
    session.hasSave = true;
    session.saveStatus = `Saved · day ${session.day}, $${Math.round(session.cash).toLocaleString()}`;
  } catch { session.saveStatus = "Save unavailable — browser storage is full or disabled"; }
}

export function restorePark(ctx: GameContext): boolean {
  if (typeof localStorage === "undefined") return false;
  let raw: string | null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return false; }
  if (!raw) return false;
  const s = decodeSave(raw);
  if (!s) { session.saveStatus = "Existing save could not be read; it has been preserved"; return false; }
  Object.assign(session,s.stats,{gameOver:s.gameOver,won:s.won,winDismissed:s.winDismissed,hasSave:true});
  session.ledger = createParkLedger(s.stats.day, s.stats.cash);
  for (const p of s.placed) {
    session.placed.set(p.id,p);
    const def=buildableDef(p.catalogId), [dx,dz]=blockCenter(def,0,0);
    for(const key of footprintCells(def,p.x-dx,p.z-dz)) session.occupied.set(key,p.id);
    ctx.scene.object.place(p.catalogId,p.x,0,p.z,{instanceId:p.id});
  }
  for (const {state,position} of s.guests) {
    session.guests.set(state.id,state);
    ctx.scene.entity.spawn(state.kind,{id:state.id,position,role:"npc"});
  }
  for(const unlock of s.unlocks) ctx.game.unlocks?.grant(ctx.player.userId,unlock);
  ctx.time.hydrate({...s.clock,paused:true});
  if (s.rng !== undefined && s.rng !== null) restoreRng(ctx.rng,s.rng);
  session.saveStatus = `Saved park · day ${session.day}, $${Math.round(session.cash).toLocaleString()}`;
  return true;
}

/** Explicit fresh-park action archives the previous save before replacing it. */
export function archiveSave(): void {
  if (typeof localStorage === "undefined") return;
  const previous=localStorage.getItem(SAVE_KEY);
  if(previous) localStorage.setItem(`${SAVE_KEY}.backup.${Date.now()}`,previous);
  localStorage.removeItem(SAVE_KEY);
}
