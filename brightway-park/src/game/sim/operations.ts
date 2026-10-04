import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { applyWear, repairQuote } from "@jgengine/core/item/durability";
import { ENTRANCE, GRID } from "../catalog";
import { buildableDef } from "../objects/catalog";
import { pushToast, session, type PlacedObject } from "../session";

const WEATHER = [
  { id: "fair", label: "Sea breeze", demand: 1, wear: 1, thirst: 1 },
  { id: "heat", label: "Heatwave · shade & drinks", demand: 1.15, wear: 1.1, thirst: 1.65 },
  { id: "rain", label: "Rain · quieter, harder on rides", demand: .68, wear: 1.4, thirst: .8 },
  { id: "fair", label: "Sunny weekend · busy midway", demand: 1.25, wear: 1.15, thirst: 1.1 },
] as const;

export function weatherForDay(day: number) {
  return WEATHER[(Math.max(1, Math.floor(day)) - 1) % WEATHER.length]!;
}

export function operational(obj: PlacedObject): boolean {
  return !obj.closed && (buildableDef(obj.catalogId).ride === undefined || (obj.wear ?? 0) < 100);
}

export function objectCapacity(obj: PlacedObject): number {
  const def = buildableDef(obj.catalogId);
  const base = def.ride?.capacity ?? (def.stall ? 3 : 0);
  const multiplier = obj.upgrade === "premium" ? (def.ride ? 1.5 : .8) : obj.upgrade === "efficient" ? 1.25 : 1;
  return Math.max(1, Math.floor(base * multiplier));
}

export function objectServiceSeconds(obj: PlacedObject): number {
  const base = buildableDef(obj.catalogId).ride?.rideSeconds ?? 2.2;
  return base * (obj.upgrade === "efficient" ? .8 : obj.upgrade === "premium" ? 1.15 : 1);
}

export function objectPrice(obj: PlacedObject): number {
  return Math.round((buildableDef(obj.catalogId).stall?.price ?? 0) * (obj.upgrade === "premium" ? 1.25 : 1));
}

export function objectUpkeep(obj: PlacedObject): number {
  return Math.ceil(buildableDef(obj.catalogId).upkeep * (obj.closed ? .25 : 1) *
    (obj.upgrade === "efficient" ? .8 : obj.upgrade === "premium" ? 1.5 : 1));
}

export function upgradeCost(obj: PlacedObject): number {
  return Math.ceil(buildableDef(obj.catalogId).cost * .45);
}

export function repairCost(obj: PlacedObject): number {
  const quote = repairQuote({ max: 100, repair: { materials: [{ item: "cash", perPoint: buildableDef(obj.catalogId).cost * .0025 }] } },
    { current: 100 - (obj.wear ?? 0), max: 100 });
  return quote?.materials[0]?.count ?? 0;
}

export function stockTarget(obj: PlacedObject): number {
  const stock = buildableDef(obj.catalogId).stall?.stock ?? 0;
  return Math.floor(stock * (session.supply === "buffered" ? 1.5 : .6) * (obj.upgrade === "premium" ? 1.35 : 1));
}

export function restockQuote(obj: PlacedObject): number {
  return Math.ceil(Math.max(0, stockTarget(obj) - obj.stock) * (buildableDef(obj.catalogId).stall?.restock ?? 0) * 1.25);
}

export function policyCost(): number {
  return session.marketing === "festival" ? 180 + session.day * 20 : 0;
}

let cachedMap: Map<string, PlacedObject> | null = null;
let cachedRevision = -1;
const access = new Map<string, boolean>();
const comfort = new Map<string, number>();
const tracks = new Map<string, number>();
const neighbors = (x: number, z: number) => [[x + GRID, z], [x - GRID, z], [x, z + GRID], [x, z - GRID]];

function refreshLayout(): void {
  if (cachedMap === session.placed && cachedRevision === session.layoutRevision) return;
  cachedMap = session.placed;
  cachedRevision = session.layoutRevision;
  access.clear(); comfort.clear(); tracks.clear();
  const paths = new Map<string, PlacedObject>();
  const scenery: PlacedObject[] = [];
  for (const obj of session.placed.values()) {
    const def = buildableDef(obj.catalogId);
    if (def.category === "path") paths.set(`${obj.x},${obj.z}`, obj);
    if (def.category === "scenery") scenery.push(obj);
  }
  const reachable = new Set<string>();
  const queue: PlacedObject[] = [];
  for (const [key, obj] of paths) {
    if (Math.hypot(obj.x - ENTRANCE[0], obj.z - ENTRANCE[2]) <= 7) {
      reachable.add(key); queue.push(obj);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const obj = queue[i]!;
    for (const [x, z] of neighbors(obj.x, obj.z)) {
      const key = `${x},${z}`, next = paths.get(key);
      if (next && !reachable.has(key)) { reachable.add(key); queue.push(next); }
    }
  }
  for (const obj of session.placed.values()) {
    const def = buildableDef(obj.catalogId);
    access.set(obj.id, queue.some(p => Math.abs(p.x - obj.x) <= def.footprint / 2 + 3 && Math.abs(p.z - obj.z) <= def.footprint / 2 + 3));
    let shade = 0;
    for (const deco of scenery) {
      const distance = Math.hypot(deco.x - obj.x, deco.z - obj.z);
      if (distance < 14) shade += (1 - distance / 14) * (deco.catalogId === "deco_fountain" ? .7 : .4);
    }
    comfort.set(obj.id, Math.min(1, shade));
    if (obj.catalogId !== "ride_coaster") continue;
    const trackIds = new Set<string>();
    const frontier = [obj.id];
    for (let i = 0; i < frontier.length; i++) {
      const id = frontier[i]!;
      for (const [key, owner] of session.occupied) {
        if (owner !== id) continue;
        const [x, z] = key.split(",").map(Number);
        for (const [nx, nz] of neighbors(x!, z!)) {
          const nextId = session.occupied.get(`${nx},${nz}`);
          if (!nextId || trackIds.has(nextId) || session.placed.get(nextId)?.catalogId !== "track_piece") continue;
          trackIds.add(nextId); frontier.push(nextId);
        }
      }
    }
    tracks.set(obj.id, trackIds.size);
  }
}

export function hasPathAccess(obj: PlacedObject): boolean { refreshLayout(); return access.get(obj.id) ?? false; }
export function localComfort(obj: PlacedObject): number { refreshLayout(); return comfort.get(obj.id) ?? 0; }
export function connectedTracks(obj: PlacedObject): number { refreshLayout(); return tracks.get(obj.id) ?? 0; }

export function tickOperations(ctx: GameContext, dt: number): void {
  const weather = weatherForDay(session.day);
  const season = Math.min(1.4, 1 + (session.day - 1) * .025);
  for (const obj of session.placed.values()) {
    if (!buildableDef(obj.catalogId).ride) continue;
    const before = obj.wear ?? 0;
    if (obj.closed) obj.wear = Math.max(0, before - .16 * dt);
    else if (session.open) {
      const use = (.025 + obj.occupants * .055) * weather.wear * season * dt *
        (obj.upgrade === "efficient" ? .65 : obj.upgrade === "premium" ? 1.45 : 1);
      obj.wear = 100 - applyWear({ current: 100 - before, max: 100 }, use).current;
    }
    if (before < 100 && (obj.wear ?? 0) >= 100) pushToast(`${buildableDef(obj.catalogId).label} needs repair — close to refurbish or pay a mechanic`, "bad", ctx.time.now());
  }
}
