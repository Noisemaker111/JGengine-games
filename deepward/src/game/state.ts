import { PRINT_SPAWN, type Point } from "../world";
import { settleEconomy } from "./counter";
import { bankHaul, canCache, loseHaul } from "./haul";
import { ITEMS, kindOf, rollItem, weaponStats, type Item, type ItemKind } from "./items";
import { createItemLedger, type ItemLedgerState } from "@jgengine/core/loot/salvage";
import type { CareerBankState } from "@jgengine/core/progression/careerBank";
import type { StandingState } from "@jgengine/core/progression/standing";

export { ITEMS, type Item, type ItemKind } from "./items";

export interface PackedItem extends Item { x: number; y: number; rotated: boolean }
export const CACHE = { w: 4, h: 3 };
export const TANK_SECONDS = 110;
export const SIDEARM = { damage: 20, range: 24, interval: 0.32, label: "Kessler / issue sidearm" };
/** The pose model's baseline cycle; a rolled rifle's own rate drives the shot, not this. */
export const RIFLE_BASELINE = { damage: 30, range: 30, interval: 0.5 };
export interface Weapon { damage: number; range: number; interval: number; label: string }
export interface Result { kind: "extracted" | "lost"; dive: number; count: number | null; reason: string; scrip?: number }
export interface Home {
  version: 4; refits: ("tank" | "reserve")[]; reprintPending: boolean; revision: number; nextDive: number; life: number;
  activeDive: number | null; stash: Item[]; extractions: number; deaths: number; last: Result | null;
  /** Career scrip: what the counter keeps, and what a Life's haul becomes. */
  bank: CareerBankState;
  /** Marrow's standing, moved by returning and by dying. */
  standing: StandingState;
  /** Instances that left play; a broken-down item can never be equipped or paid again. */
  ledger: ItemLedgerState;
}
export interface Dive {
  id: number; elapsed: number; tankSeconds: number; oxygen: number; health: number; cache: PackedItem[];
  collected: string[]; hand: "sidearm" | "service-rifle"; magazine: number; reserve: number;
  reload: number; shotCooldown: number; flash: number; hurt: number;
  print: { at: Point; health: number; mode: "route" | "calling" | "winding"; attack: number; cooldown: number; drop: Point | null };
  channel: { id: string; remaining: number; anchor: Point } | null;
}
export function newHome(): Home {
  return {
    version: 4, refits: [], reprintPending: false, revision: 0, nextDive: 1, life: 1, activeDive: null, stash: [], extractions: 0, deaths: 0, last: null,
    bank: { banked: 0, haul: 0, deposited: 0, lost: 0, bestHaul: 0, runs: 0 },
    standing: { records: {} }, ledger: {},
  };
}
export function ledgerOf(home: Home) { return createItemLedger(home.ledger); }
export function depart(home: Home, rifleUid: string | null = null): Home {
  if (home.reprintPending) throw new Error("Acknowledge the reprint before departing");
  if (home.activeDive !== null) throw new Error("A dive is already outstanding");
  if (rifleUid !== null) {
    if (!ledgerOf(home).canUse(rifleUid)) throw new Error("That rifle was broken down at the counter");
    if (!home.stash.some(item => item.id === rifleUid && kindOf(item) === "service-rifle")) throw new Error("That service rifle is no longer banked");
  }
  return { ...home, stash: rifleUid === null ? home.stash : home.stash.filter(item => item.id !== rifleUid), revision: home.revision + 1, activeDive: home.nextDive, nextDive: home.nextDive + 1 };
}
export function newDive(id: number, home: Pick<Home, "refits"> = { refits: [] }, rifle: Item | null = null): Dive {
  if (rifle !== null && kindOf(rifle) !== "service-rifle") throw new Error("Only a service rifle can be prepared for departure");
  const tankSeconds = home.refits.includes("tank") ? 145 : TANK_SECONDS;
  return { id, elapsed: 0, tankSeconds, oxygen: tankSeconds, health: 100, cache: rifle === null ? [] : [pack([], rifle)!], collected: [], hand: rifle === null ? "sidearm" : "service-rifle", magazine: 6, reserve: home.refits.includes("reserve") ? 30 : 18, reload: 0, shotCooldown: 0, flash: 0, hurt: 0,
    print: { at: PRINT_SPAWN, health: 80, mode: "route", attack: 0, cooldown: 0, drop: null }, channel: null };
}
export function footprint(item: Pick<PackedItem, "baseId" | "rotated">): { w: number; h: number } {
  const { w, h } = ITEMS[kindOf(item)];
  return item.rotated ? { w: h, h: w } : { w, h };
}
export function fits(cache: readonly PackedItem[], item: PackedItem): boolean {
  const a = footprint(item);
  return item.x >= 0 && item.y >= 0 && item.x + a.w <= CACHE.w && item.y + a.h <= CACHE.h && cache.every(other => {
    if (other.id === item.id) return true;
    const b = footprint(other);
    return item.x + a.w <= other.x || other.x + b.w <= item.x || item.y + a.h <= other.y || other.y + b.h <= item.y;
  });
}
export function pack(cache: readonly PackedItem[], item: Item): PackedItem | null {
  for (const rotated of [false, true]) for (let y = 0; y < CACHE.h; y++) for (let x = 0; x < CACHE.w; x++) {
    const candidate = { ...item, x, y, rotated };
    if (fits(cache, candidate)) return candidate;
  }
  return null;
}
/** What an empty square, the weight gate or an already-searched source refused, in the player's words. */
export type LootRefusal = "taken" | "over-capacity" | "grid-full";
export type Looted = { ok: true; dive: Dive } | { ok: false; reason: LootRefusal; message: string };
/** The instance a source would yield in this Life; extraction and the pre-search check roll the same one. */
export function peekLoot(dive: Dive, source: string, kind: ItemKind, depth = 1): Item {
  return rollItem(kind, depth, `deepward:${dive.id}:${source}`, `${dive.id}:${source}`);
}
/** Item level is the room's depth, so the same source in the same Life always rolls the same instance. */
export function takeLoot(dive: Dive, source: string, kind: ItemKind, depth = 1): Looted {
  if (dive.collected.includes(source)) return { ok: false, reason: "taken", message: "That source is already empty." };
  if (dive.health <= 0) return { ok: false, reason: "taken", message: "This Life is over." };
  const item = peekLoot(dive, source, kind, depth);
  const weight = canCache(dive.cache, item);
  if (!weight.ok) return { ok: false, reason: weight.reason === "over-capacity" ? "over-capacity" : "grid-full", message: weight.message };
  const packed = pack(dive.cache, item);
  if (packed === null) return { ok: false, reason: "grid-full", message: `The cache grid has no room for ${ITEMS[kind].name}. Tab to repack or leave something behind.` };
  return { ok: true, dive: { ...dive, cache: [...dive.cache, packed], collected: [...dive.collected, source], channel: null } };
}
/** The rolled rifle actually in hand, so a good affix changes damage and cycle time rather than a label. */
export function weaponOf(dive: Dive | null): Weapon {
  if (dive === null || dive.hand !== "service-rifle") return SIDEARM;
  const rifle = dive.cache.find(item => kindOf(item) === "service-rifle");
  return rifle === undefined ? SIDEARM : weaponStats(rifle);
}
/** Resolve once against the durable departure id. Cache coordinates never enter home storage. */
export function settle(home: Home, dive: Pick<Dive, "id" | "cache">, kind: Result["kind"], reason: string): Home {
  if (home.activeDive !== dive.id) throw new Error("Dive already settled or superseded");
  const carried: Item[] = dive.cache.map(({ x: _x, y: _y, rotated: _rotated, ...item }) => item);
  const moved = kind === "extracted" ? bankHaul(carried, home.stash) : { banked: [], refused: loseHaul(carried) };
  const economy = settleEconomy(home, carried, kind);
  return { ...home, revision: home.revision + 1, activeDive: null, reprintPending: kind === "lost",
    stash: [...home.stash, ...moved.banked], extractions: home.extractions + (kind === "extracted" ? 1 : 0),
    deaths: home.deaths + (kind === "lost" ? 1 : 0), life: home.life + (kind === "lost" ? 1 : 0),
    bank: economy.bank, standing: economy.standing,
    last: { kind, dive: dive.id, count: dive.cache.length, reason, scrip: economy.scrip } };
}
export function recoverInterrupted(home: Home): Home {
  if (home.activeDive === null) return home;
  const lost = settle(home, { id: home.activeDive, cache: [] }, "lost", "Radio lost during a dive. The Life ended; its carried haul stayed in Bellwether.");
  return { ...lost, last: { ...lost.last!, count: null } }; // Carried instances were never persisted mid-dive.
}
export function reloadWeapon(dive: Dive): Dive {
  return dive.magazine === 6 || dive.reserve === 0 || dive.reload > 0 ? dive : { ...dive, reload: 1.3, channel: null };
}
export function ageDive(dive: Dive, dt: number, steam: boolean): Dive {
  if (!(dt > 0) || !Number.isFinite(dt)) return dive;
  const oxygen = Math.max(0, dive.oxygen - dt);
  const suffocation = Math.max(0, dt - dive.oxygen) * 12;
  const health = Math.max(0, dive.health - suffocation - (steam ? 18 * dt : 0));
  const reloading = dive.reload > 0 && dive.reload <= dt;
  const rounds = reloading ? Math.min(6 - dive.magazine, dive.reserve) : 0;
  return { ...dive, elapsed: dive.elapsed + dt, oxygen, health,
    magazine: dive.magazine + rounds, reserve: dive.reserve - rounds, reload: Math.max(0, dive.reload - dt),
    shotCooldown: Math.max(0, dive.shotCooldown - dt), flash: Math.max(0, dive.flash - dt),
    hurt: health < dive.health ? 0.35 : Math.max(0, dive.hurt - dt) };
}

export function acknowledgeReprint(home: Home): Home {
  if (!home.reprintPending || home.activeDive !== null) throw new Error("No reprint awaiting acknowledgement");
  return { ...home, revision: home.revision + 1, reprintPending: false };
}
