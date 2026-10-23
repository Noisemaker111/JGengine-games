import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { DEFAULT_QUEUE_SEED_SERVICE_SECONDS, DEFAULT_QUEUE_WINDOW } from "@jgengine/core/sim/queue";
import {
  createRideSystem,
  type RideDefinition,
  type RideRatings,
  type RideServiceResult,
  type RideStats,
  type RideSystem,
  type RideSystemSnapshot,
  type RideView,
} from "@jgengine/core/sim/rides";

import { buildableDef } from "./objects/catalog";
import { session, type PlacedObject } from "./session";
import { coasterThrill } from "./sim/rating";

/**
 * The park's rides run on the shared ride sim (`@jgengine/core/sim/rides`): each ride owns its own
 * load → ride → unload cycle, its own line, its own wear and its own breakdown curve. This module
 * only supplies the park's content (ratings, capacity, price, wear curve) and answers questions the
 * HUD and the guests ask. The wallet and the bodies stay with the caller.
 */

const park: { system: RideSystem | null; key: string } = { system: null, key: "" };

/** How many mechanic bays shorten a repair: a quarter off per bay, never below 35% of the time. */
export function repairScale(mechanics: number): number {
  return Math.max(0.35, 1 - 0.25 * mechanics);
}

export function mechanicBays(): number {
  let count = 0;
  for (const obj of session.placed.values()) {
    if (buildableDef(obj.catalogId).staff?.repair !== undefined) count += 1;
  }
  return count;
}

export function trackPieces(): number {
  let count = 0;
  for (const obj of session.placed.values()) if (obj.catalogId === "track_piece") count += 1;
  return count;
}

/** A ride's three ratings: excitement is its appeal (coaster track adds more), force is its thrill. */
export function rideRatings(obj: PlacedObject, tracks = trackPieces()): RideRatings {
  const def = buildableDef(obj.catalogId);
  if (def.ride === undefined) return { excitement: 0, intensity: 0, nausea: 0 };
  const excitement = obj.catalogId === "ride_coaster" ? def.appeal + coasterThrill(tracks) : def.appeal;
  return { excitement, intensity: def.ride.thrill, nausea: 2 };
}

/** What the park sets for a ride's ticket: the saved price, or the catalog default. */
export function ridePrice(catalogId: string): number {
  const def = buildableDef(catalogId);
  return session.ridePrices[catalogId] ?? def.ride?.price ?? 0;
}

export function setRidePrice(catalogId: string, price: number): void {
  const def = buildableDef(catalogId);
  if (def.ride === undefined) return;
  session.ridePrices[catalogId] = Math.max(0, Math.min(20, Math.round(price)));
}

/** One placed ride as the shared sim's data, including the park's current repair speed. */
export function rideDefinition(obj: PlacedObject, tracks: number, mechanics: number): RideDefinition {
  const def = buildableDef(obj.catalogId);
  const ride = def.ride;
  if (ride === undefined) throw new Error(`brightway-park: "${obj.catalogId}" is not a ride`);
  return {
    id: obj.id,
    ratings: rideRatings(obj, tracks),
    capacity: ride.capacity,
    loadSeconds: ride.loadSeconds,
    rideSeconds: ride.rideSeconds,
    unloadSeconds: ride.unloadSeconds,
    breakdown: {
      ...ride.breakdown,
      repairSeconds: Math.round(ride.breakdown.repairSeconds * repairScale(mechanics) * 10) / 10,
    },
  };
}

function desiredDefinitions(): RideDefinition[] {
  const tracks = trackPieces();
  const mechanics = mechanicBays();
  const definitions: RideDefinition[] = [];
  for (const obj of session.placed.values()) {
    if (buildableDef(obj.catalogId).ride === undefined) continue;
    definitions.push(rideDefinition(obj, tracks, mechanics));
  }
  return definitions;
}

function definitionKey(definitions: readonly RideDefinition[]): string {
  return definitions
    .map((d) => [d.id, d.capacity, d.loadSeconds, d.rideSeconds, d.unloadSeconds, d.ratings.excitement, d.ratings.intensity, d.breakdown?.repairSeconds ?? 0].join(":"))
    .join("|");
}

const EMPTY_QUEUE = {
  entries: [],
  boards: [],
  seedServiceSeconds: DEFAULT_QUEUE_SEED_SERVICE_SECONDS,
  window: DEFAULT_QUEUE_WINDOW,
} as const;

/**
 * Keep the sim's ride set in step with the park. A ride built, sold, retracked or served by a new
 * mechanic bay changes its definition, so the system is rebuilt and the surviving rides are put back
 * from one snapshot - queues, wear, cycles and breakdowns all survive a rebuild.
 */
export function syncRidePark(rng: () => number): void {
  const definitions = desiredDefinitions();
  const key = definitionKey(definitions);
  if (key === park.key && park.system !== null) return;
  const previous = park.system;
  const saved = previous?.snapshot() ?? null;
  previous?.dispose();
  const next = createRideSystem({ rides: definitions, rng, devtoolsName: "park.rides", queueSeedServiceSeconds: 3 });
  if (saved !== null) {
    const byId = new Map(saved.rides.map((entry) => [entry.definition.id, entry]));
    next.restore({
      elapsed: saved.elapsed,
      rides: definitions.map((definition) => {
        const entry = byId.get(definition.id);
        if (entry === undefined) {
          return {
            definition,
            phase: "idle",
            timer: 0,
            riders: [],
            cycles: 0,
            wear: 0,
            breakdowns: 0,
            repairSpend: 0,
            serviceSpend: 0,
            boarded: 0,
            queue: { entries: [], boards: [], seedServiceSeconds: DEFAULT_QUEUE_SEED_SERVICE_SECONDS, window: DEFAULT_QUEUE_WINDOW },
          };
        }
        return { ...entry, definition };
      }),
    });
  }
  park.system = next;
  park.key = key;
}

/** The live sim, created empty when the park has no rides yet. */
export function rideSystem(): RideSystem {
  if (park.system === null) {
    park.system = createRideSystem({ rides: [], rng: () => 0.5, devtoolsName: "park.rides", queueSeedServiceSeconds: 3 });
    park.key = "";
  }
  return park.system;
}

export function resetRides(): void {
  park.system?.dispose();
  park.system = null;
  park.key = "";
}

export function rideView(rideId: string): RideView | null {
  return rideSystem().ride(rideId);
}

/** Seconds a guest joining this line now would wait, from the line's own throughput. */
export function rideWait(rideId: string): number {
  return rideSystem().waitSeconds(rideId);
}

export function joinRide(rideId: string, guestId: string): boolean {
  return rideSystem().join(rideId, guestId);
}

export function leaveRide(rideId: string, guestId: string): boolean {
  return rideSystem().leave(rideId, guestId);
}

/** Pay a ride's maintenance and clear its wear; the caller keeps the wallet. */
export function serviceRide(rideId: string): RideServiceResult | null {
  return rideSystem().service(rideId);
}

/** This guest's 0-based place in a ride's line, or 0 when it is not waiting. */
export function queuePosition(rideId: string, guestId: string): number {
  const queue = rideSystem().queue(rideId);
  const position = queue?.positionOf(guestId) ?? -1;
  return position < 0 ? 0 : position;
}

export function rideStats(): RideStats {
  return rideSystem().stats();
}

export function rideSnapshot(): RideSystemSnapshot {
  return rideSystem().snapshot();
}

export function restoreRides(snapshot: RideSystemSnapshot): void {
  resetRides();
  const definitions = desiredDefinitions();
  const system = createRideSystem({ rides: definitions, rng: () => 0.5, devtoolsName: "park.rides", queueSeedServiceSeconds: 3 });
  system.restore(snapshot);
  park.system = system;
  park.key = definitionKey(definitions);
}

export interface RideBoard {
  rides: number;
  online: number;
  broken: number;
  queued: number;
  riders: number;
  boarded: number;
}

/** What the park's dashboard says about its rides. */
export function rideBoard(): RideBoard {
  const stats = rideStats();
  return {
    rides: stats.rides,
    online: stats.rides - stats.broken,
    broken: stats.broken,
    queued: stats.queued,
    riders: stats.riders,
    boarded: stats.boarded,
  };
}

/** The rides a guest could board right now, with the line each one currently has. */
export function rideOptions(): { object: PlacedObject; view: RideView }[] {
  const options: { object: PlacedObject; view: RideView }[] = [];
  for (const object of session.placed.values()) {
    if (buildableDef(object.catalogId).ride === undefined) continue;
    const view = rideView(object.id);
    if (view !== null) options.push({ object, view });
  }
  return options;
}

/** Advance every ride's own cycle by `dt`; the sink hears every boarding, alighting and breakdown. */
export function tickRides(ctx: GameContext, dt: number, sink: Parameters<RideSystem["tick"]>[1]): void {
  syncRidePark(ctx.rng);
  rideSystem().tick(dt, sink);
}
