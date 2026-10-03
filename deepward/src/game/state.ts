import { PRINT_SPAWN, type Point } from "../world";

export type ItemKind = "wire" | "polymer" | "cells" | "ink" | "service-rifle";
export const ITEMS: Record<ItemKind, { name: string; maker: string; rarity: string; found: string; w: number; h: number; color: string; detail: string }> = {
  wire: { name: "Copper spool", maker: "Bellwether", rarity: "Common", found: "Stocked", w: 1, h: 1, color: "#dfaa70", detail: "Wire · feeds Marrow's Case Bench" },
  polymer: { name: "Suit seals", maker: "Vigil", rarity: "Common", found: "Issue", w: 2, h: 1, color: "#c8d3b5", detail: "Polymer · armor and tank seals" },
  cells: { name: "Power cells", maker: "Meridian", rarity: "Uncommon", found: "Stocked", w: 1, h: 2, color: "#8bd7bf", detail: "Cells · the Garage and station power" },
  ink: { name: "Printer ink", maker: "Bellwether", rarity: "Rare", found: "Restricted", w: 2, h: 2, color: "#be9adc", detail: "Ink · only found beside a working printer" },
  "service-rifle": { name: "Service rifle", maker: "Kessler", rarity: "Uncommon", found: "Issue", w: 3, h: 1, color: "#83bbda", detail: "One hand · 30 damage · six-round magazine" },
};
export interface Item { uid: string; kind: ItemKind; level: 1 }
export interface PackedItem extends Item { x: number; y: number; rotated: boolean }
export const CACHE = { w: 4, h: 3 };
export const TANK_SECONDS = 110;
export const SIDEARM = { damage: 20, range: 24, interval: 0.32, label: "Kessler / issue sidearm" };
export const RIFLE = { damage: 30, range: 30, interval: 0.5, label: "Kessler / service rifle" };
export interface Result { kind: "extracted" | "lost"; dive: number; count: number | null; reason: string }
export interface Home {
  version: 2; refits: ("tank" | "reserve")[]; reprintPending: boolean; revision: number; nextDive: number; life: number;
  activeDive: number | null; stash: Item[]; extractions: number; deaths: number; last: Result | null;
}
export interface Dive {
  id: number; elapsed: number; tankSeconds: number; oxygen: number; health: number; cache: PackedItem[];
  collected: string[]; hand: "sidearm" | "service-rifle"; magazine: number; reserve: number;
  reload: number; shotCooldown: number; flash: number; hurt: number;
  print: { at: Point; health: number; mode: "route" | "calling" | "winding"; attack: number; cooldown: number; drop: Point | null };
  channel: { id: string; remaining: number; anchor: Point } | null;
}
export function newHome(): Home { return { version: 2, refits: [], reprintPending: false, revision: 0, nextDive: 1, life: 1, activeDive: null, stash: [], extractions: 0, deaths: 0, last: null }; }
export function depart(home: Home): Home {
  if (home.reprintPending) throw new Error("Acknowledge the reprint before departing");
  if (home.activeDive !== null) throw new Error("A dive is already outstanding");
  return { ...home, revision: home.revision + 1, activeDive: home.nextDive, nextDive: home.nextDive + 1 };
}
export function newDive(id: number, home: Pick<Home, "refits"> = { refits: [] }): Dive {
  const tankSeconds = home.refits.includes("tank") ? 145 : TANK_SECONDS;
  return { id, elapsed: 0, tankSeconds, oxygen: tankSeconds, health: 100, cache: [], collected: [], hand: "sidearm", magazine: 6, reserve: home.refits.includes("reserve") ? 30 : 18, reload: 0, shotCooldown: 0, flash: 0, hurt: 0,
    print: { at: PRINT_SPAWN, health: 80, mode: "route", attack: 0, cooldown: 0, drop: null }, channel: null };
}
export function footprint(item: Pick<PackedItem, "kind" | "rotated">): { w: number; h: number } {
  const { w, h } = ITEMS[item.kind];
  return item.rotated ? { w: h, h: w } : { w, h };
}
export function fits(cache: readonly PackedItem[], item: PackedItem): boolean {
  const a = footprint(item);
  return item.x >= 0 && item.y >= 0 && item.x + a.w <= CACHE.w && item.y + a.h <= CACHE.h && cache.every(other => {
    if (other.uid === item.uid) return true;
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
export function takeLoot(dive: Dive, source: string, kind: ItemKind): Dive | null {
  if (dive.collected.includes(source) || dive.health <= 0) return null;
  const item = pack(dive.cache, { uid: `${dive.id}:${source}`, kind, level: 1 });
  if (item === null) return null;
  return { ...dive, cache: [...dive.cache, item], collected: [...dive.collected, source], channel: null };
}
/** Resolve once against the durable departure id. Cache coordinates never enter home storage. */
export function settle(home: Home, dive: Pick<Dive, "id" | "cache">, kind: Result["kind"], reason: string): Home {
  if (home.activeDive !== dive.id) throw new Error("Dive already settled or superseded");
  const hauled: Item[] = kind === "extracted" ? dive.cache.map(({ uid, kind, level }) => ({ uid, kind, level })) : [];
  return { ...home, revision: home.revision + 1, activeDive: null, reprintPending: kind === "lost",
    stash: [...home.stash, ...hauled], extractions: home.extractions + (kind === "extracted" ? 1 : 0),
    deaths: home.deaths + (kind === "lost" ? 1 : 0), life: home.life + (kind === "lost" ? 1 : 0),
    last: { kind, dive: dive.id, count: dive.cache.length, reason } };
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
