import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { RideTickSink } from "@jgengine/core/sim/rides";

import { guestCap } from "../catalog";
import type { BuildableDef } from "../objects/catalog";
import { GUEST_WALK_SPEED, guestKindFor } from "../entities/guests/catalog";
import { nextGuestId, session, type GuestState } from "../session";
import { park, parkObject, ridePrice, stockOf, type ParkObject } from "../park";
import {
  agentOf,
  clearAgents,
  createGuestAgent,
  forgetAgent,
  guestTargets,
  guestTaste,
  midwayPoint,
  parkMood,
  rideFun,
  syncAgentStates,
} from "../agents";
import { demand } from "./rating";
import { joinRide, leaveRide, queuePosition, rideView, tickRides } from "../rides";

/**
 * The walking crowd. Guests are agents with bodies (game code), but everything they do to the park
 * goes through the world: a guest through the gate is the `admit` ripple, any money handed over is
 * `pay`, a stall's sale is that stall's `sold` fact, leaving is `leave`, and a ride breaking is the
 * `breakdown` ripple. They read the world back the same way: the ticket, whether the park is open,
 * its litter and what the crowd is saying (`park.buzz`).
 */

const ARRIVE_DISTANCE = 2.2;
const MAX_VISITS = 6;
const MIN_SPEND = 6;
const STALL_SERVICE = 2.2;
const BROWSE_SECONDS = 3;
const TARGET_PATIENCE = 25;
const LEAVE_PATIENCE = 30;
const QUEUE_CHECK_SECONDS = 8;
/** How much of the crowd's buzz each guest feels: a breakdown's -15 is about -9 mood each. */
const BUZZ_WEIGHT = 0.6;

/** How close a guest must get to a structure: a ride's own footprint keeps it out of the middle. */
function arriveRadius(def: BuildableDef): number {
  return Math.max(ARRIVE_DISTANCE, def.footprint / 2 + 1.4);
}

function distance2(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function makeGuest(ctx: GameContext, id: string, start: readonly [number, number, number]): GuestState {
  const kind = guestKindFor(id);
  const agent = createGuestAgent(id, kind, ctx.rng);
  const guest: GuestState = {
    id,
    kind,
    money: 30 + ctx.rng() * 50,
    visits: 0,
    phase: "seeking",
    targetId: null,
    target: null,
    targetUntil: 0,
    busy: 0,
    agent: agent.snapshot(),
  };
  session.guests.set(id, guest);
  ctx.scene.entity.spawn(kind, { id, position: start, role: "npc" });
  return guest;
}

function spawnGuest(ctx: GameContext): void {
  const id = nextGuestId();
  const jitter = (ctx.rng() - 0.5) * 10;
  makeGuest(ctx, id, [jitter, 0, 56]);
  // Through the turnstile, then the entry ticket: both are ripples the world declares.
  park.emit(ctx, { kind: "admit" });
  park.emit(ctx, { kind: "pay", scale: park.of(ctx).num("park.ticket") });
}

export function seedGuests(ctx: GameContext, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const id = nextGuestId();
    makeGuest(ctx, id, [(ctx.rng() - 0.5) * 80, 0, (ctx.rng() - 0.5) * 80]);
  }
  // A seeded crowd is already inside: it counts on site, not through today's gate.
  park.of(ctx).change({ "park.guests": count });
}

export function spawnGuests(ctx: GameContext, dt: number, totalAppeal: number): void {
  const w = park.of(ctx);
  const rating = w.num("park.rating");
  const cap = guestCap(rating);
  if (session.guests.size >= cap) return;
  const rate = demand(totalAppeal, w.num("park.ticket"), rating, w.fact("park.open") === true) * 2.4;
  session.spawnAcc += rate * dt;
  let budget = 4;
  while (session.spawnAcc >= 1 && session.guests.size < cap && budget > 0) {
    session.spawnAcc -= 1;
    budget -= 1;
    spawnGuest(ctx);
  }
}

function dropTarget(guest: GuestState): void {
  guest.targetId = null;
  guest.target = null;
  guest.busy = 0;
  guest.phase = "seeking";
}

/** A guest finishing at a stall: pay, take the stock, fill the need. Rides settle through the sim. */
function finishInteraction(ctx: GameContext, guest: GuestState): void {
  const obj = parkObject(ctx, guest.targetId);
  const agent = agentOf(guest, ctx.rng);
  if (obj !== undefined) {
    const stall = obj.def.stall;
    const w = park.of(ctx);
    if (stall !== undefined && stockOf(w, obj) > 0 && guest.money >= stall.price) {
      guest.money -= stall.price;
      w.change({ [`${obj.id}.sold`]: 1, [`${obj.id}.sold_total`]: 1 });
      park.emit(ctx, { kind: "pay", scale: stall.price });
      const fill = stall.need === "hunger" ? 70 : stall.need === "thirst" ? 75 : 100;
      agent.needs.refill(stall.need, fill);
    }
    guest.visits += 1;
  }
  dropTarget(guest);
}

function shouldLeave(ctx: GameContext, guest: GuestState): boolean {
  const agent = agentOf(guest, ctx.rng);
  return park.of(ctx).fact("park.open") !== true || guest.money < MIN_SPEND || agent.mood().score < 18 || guest.visits >= MAX_VISITS;
}

function moveGuest(ctx: GameContext, guest: GuestState, target: readonly [number, number, number], dt: number, radius = ARRIVE_DISTANCE): boolean {
  const next = ctx.scene.entity.moveToward(guest.id, target, { speed: GUEST_WALK_SPEED, dt, stopDistance: 0 });
  if (next === null) return false;
  ctx.scene.entity.setPose(guest.id, { position: next });
  return distance2(next[0], next[2], target[0], target[2]) <= radius;
}

function despawnGuest(ctx: GameContext, guest: GuestState): void {
  if (guest.targetId !== null) leaveRide(guest.targetId, guest.id);
  guest.agent = agentOf(guest, ctx.rng).snapshot();
  forgetAgent(guest.id);
  if (ctx.scene.entity.selection.has(guest.id)) ctx.scene.entity.selection.remove(guest.id);
  session.guests.delete(guest.id);
  ctx.scene.entity.despawn(guest.id);
  park.emit(ctx, { kind: "leave" });
}

/** Where the next guest in line stands: a line that runs out from the ride's own footprint. */
function queueSpot(obj: ParkObject, index: number): [number, number, number] {
  return [obj.x, 0, obj.z - arriveRadius(obj.def) - Math.max(0, index) * 1.15];
}

/** The line a guest is standing in: its own measured wait, or a sold-out stall's crowd. */
function queuePenalty(ctx: GameContext, guest: GuestState): number {
  const obj = parkObject(ctx, guest.targetId);
  if (obj === undefined) return 0;
  if (obj.def.ride !== undefined) {
    // Standing in line is what wears a guest down; walking towards a ride is not a wait yet.
    if (guest.phase !== "queued") return 0;
    const view = rideView(obj.id);
    if (view === null) return 0;
    const seconds = view.queue.wait.seconds + (view.phase === "broken" ? 45 : 0);
    return -Math.min(14, seconds * 0.18);
  }
  return obj.def.stall !== undefined && stockOf(park.of(ctx), obj) <= 0 ? -12 : 0;
}

/**
 * The ride sim's own events: a boarding pays the ride's ticket into the world, an alighting fills the
 * guest's fun from the ride's ratings, and a breakdown is the world's `breakdown` ripple - the crowd
 * groans and the crew is sent. The repair itself is the world's crew order, not the sim's.
 */
function makeRideSink(ctx: GameContext): RideTickSink {
  return {
    onBoard(rideId, guestId) {
      const guest = session.guests.get(guestId);
      const obj = parkObject(ctx, rideId);
      if (guest === undefined || obj === undefined) return;
      const price = ridePrice(park.of(ctx), obj.kind);
      if (price > 0 && guest.money >= price) {
        guest.money -= price;
        park.emit(ctx, { kind: "pay", scale: price });
      }
      guest.phase = "riding";
      guest.busy = 0;
      guest.targetId = rideId;
      ctx.scene.entity.setPose(guestId, { position: [obj.x, 0, obj.z] });
    },
    onAlight(rideId, guestId) {
      const guest = session.guests.get(guestId);
      const obj = parkObject(ctx, rideId);
      if (guest === undefined || obj === undefined) return;
      agentOf(guest, ctx.rng).needs.refill("fun", rideFun(guest.kind, obj));
      guest.visits += 1;
      guest.phase = "seeking";
      guest.targetId = null;
      guest.target = null;
      ctx.scene.entity.setPose(guestId, { position: [obj.x + 2.6, 0, obj.z + 2.6] });
    },
    onBreak(rideId) {
      park.emit(ctx, { kind: "breakdown", by: rideId });
    },
  };
}

const sinks = new WeakMap<GameContext, RideTickSink>();

/** Advance the park's rides one tick; their events land on the guests and the world. */
export function tickRidePark(ctx: GameContext, dt: number): void {
  let sink = sinks.get(ctx);
  if (sink === undefined) {
    sink = makeRideSink(ctx);
    sinks.set(ctx, sink);
  }
  tickRides(ctx, dt, sink);
}

/** Walk where the agent chose; a guest gives up on a line it has no hope of reaching the front of. */
function holdPlaceInLine(ctx: GameContext, guest: GuestState, obj: ParkObject, dt: number): void {
  const view = rideView(obj.id);
  if (view === null) {
    dropTarget(guest);
    return;
  }
  const index = queuePosition(obj.id, guest.id);
  moveGuest(ctx, guest, queueSpot(obj, index), dt);
  if (ctx.time.now() < guest.targetUntil) return;
  guest.targetUntil = ctx.time.now() + QUEUE_CHECK_SECONDS;
  // How long this guest actually faces from where it stands, at the line's own measured pace.
  const waitFromHere = (index + 1) * view.queue.wait.perGuestSeconds;
  const tolerance = guestTaste(guest.kind).queueTolerance;
  const hopeless = view.phase === "broken" ? waitFromHere > tolerance * 0.5 : waitFromHere > tolerance;
  if (!hopeless) return;
  leaveRide(obj.id, guest.id);
  dropTarget(guest);
  agentOf(guest, ctx.rng).moodSources.setSource("queue", -14);
}

function arriveAtRide(ctx: GameContext, guest: GuestState, obj: ParkObject): void {
  if (!joinRide(obj.id, guest.id)) {
    dropTarget(guest);
    return;
  }
  guest.phase = "queued";
  guest.busy = 0;
  guest.targetUntil = ctx.time.now() + QUEUE_CHECK_SECONDS;
}

/** Who is heading for or standing at each structure this tick: the crowd the next guest prices in. */
function countOccupants(): void {
  session.occupants.clear();
  for (const guest of session.guests.values()) {
    if (guest.targetId === null || guest.phase === "leaving") continue;
    session.occupants.set(guest.targetId, (session.occupants.get(guest.targetId) ?? 0) + 1);
  }
}

export function tickGuests(ctx: GameContext, dt: number, tracks: number): void {
  const now = ctx.time.now();
  const w = park.of(ctx);
  const litter = w.num("park.litter");
  const buzz = w.num("park.buzz") * BUZZ_WEIGHT;
  countOccupants();
  for (const guest of session.guests.values()) {
    const agent = agentOf(guest, ctx.rng);
    agent.moodSources.setSource("litter", -litter * 0.02);
    agent.moodSources.setSource("buzz", buzz);
    agent.moodSources.setSource("queue", queuePenalty(ctx, guest));

    if (guest.phase === "busy") {
      guest.busy -= dt;
      if (guest.busy <= 0) finishInteraction(ctx, guest);
      agent.update({ dt, now, targets: guestTargets(ctx, guest, tracks, guest.target ?? midwayPoint()) });
      continue;
    }

    if (guest.phase === "queued" || guest.phase === "riding") {
      const obj = parkObject(ctx, guest.targetId);
      if (obj === undefined) {
        if (guest.targetId !== null) leaveRide(guest.targetId, guest.id);
        dropTarget(guest);
      } else if (guest.phase === "queued") {
        holdPlaceInLine(ctx, guest, obj, dt);
      }
      agent.update({ dt, now });
      continue;
    }

    if (guest.phase === "leaving") {
      agent.update({ dt, now });
      const arrived = moveGuest(ctx, guest, [0, 0, 58], dt);
      if (arrived || now > guest.targetUntil) despawnGuest(ctx, guest);
      continue;
    }

    if (guest.targetId !== null && parkObject(ctx, guest.targetId) === undefined) {
      guest.targetId = null;
      guest.target = null;
    }

    const position = ctx.scene.entity.get(guest.id)?.position ?? [0, 0, 56];
    const frame = agent.update({ dt, now, targets: guestTargets(ctx, guest, tracks, position) });

    if (guest.targetId === null) {
      if (shouldLeave(ctx, guest)) {
        guest.phase = "leaving";
        guest.target = null;
        guest.targetUntil = now + LEAVE_PATIENCE;
        continue;
      }
      const target = frame.action.target;
      const obj = target === null || target === "midway" ? undefined : parkObject(ctx, target);
      guest.targetUntil = now + TARGET_PATIENCE;
      if (obj === undefined) {
        guest.target = midwayPoint();
      } else {
        guest.targetId = obj.id;
        guest.target = [obj.x, 0, obj.z];
      }
    }

    if (guest.target !== null) {
      if (now > guest.targetUntil) {
        dropTarget(guest);
        continue;
      }
      const obj = parkObject(ctx, guest.targetId);
      const arrived = obj !== undefined ? moveGuest(ctx, guest, guest.target, dt, arriveRadius(obj.def)) : moveGuest(ctx, guest, guest.target, dt);
      if (arrived && obj !== undefined) {
        if (obj.def.ride !== undefined) {
          arriveAtRide(ctx, guest, obj);
        } else {
          guest.phase = "busy";
          guest.busy = STALL_SERVICE;
        }
      } else if (arrived) {
        guest.busy = BROWSE_SECONDS;
        guest.phase = "busy";
      }
    }
  }

  // The crowd's mood is a world fact: the rating, the HUD and the scenarios all read it there.
  if (session.guests.size > 0) w.set("park.mood", parkMood());
}

/** Refresh the plain guest state from the live agents before a save is written. */
export { syncAgentStates };

/** Drop every live agent - a new park or a restore replaces them from their own snapshots. */
export function resetGuestAgents(): void {
  clearAgents();
}
