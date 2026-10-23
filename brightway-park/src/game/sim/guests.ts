import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { RideTickSink } from "@jgengine/core/sim/rides";

import { guestCap } from "../catalog";
import { buildableDef, type BuildableDef } from "../objects/catalog";
import { GUEST_WALK_SPEED, guestKindFor } from "../entities/guests/catalog";
import { nextGuestId, session, type GuestState, type PlacedObject } from "../session";
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
import { joinRide, leaveRide, queuePosition, ridePrice, rideView, tickRides, trackPieces } from "./rides";

const ARRIVE_DISTANCE = 2.2;
const MAX_VISITS = 6;
const MIN_SPEND = 6;
const STALL_SERVICE = 2.2;
const BROWSE_SECONDS = 3;
const TARGET_PATIENCE = 25;
const LEAVE_PATIENCE = 30;
const QUEUE_CHECK_SECONDS = 8;

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
    litterTimer: 3 + ctx.rng() * 6,
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
  session.cash += session.ticketPrice;
  session.revenueToday += session.ticketPrice;
  session.guestsToday += 1;
  session.scenarioVisitors += 1;
  session.scenarioRevenue += session.ticketPrice;
}

export function seedGuests(ctx: GameContext, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const id = nextGuestId();
    makeGuest(ctx, id, [(ctx.rng() - 0.5) * 80, 0, (ctx.rng() - 0.5) * 80]);
  }
}

export function spawnGuests(ctx: GameContext, dt: number, totalAppeal: number): void {
  const cap = guestCap(session.rating);
  if (session.guests.size >= cap) return;
  const rate = demand(totalAppeal, session.ticketPrice, session.rating, session.open) * 2.4;
  session.spawnAcc += rate * dt;
  let budget = 4;
  while (session.spawnAcc >= 1 && session.guests.size < cap && budget > 0) {
    session.spawnAcc -= 1;
    budget -= 1;
    spawnGuest(ctx);
  }
}

/** Undo the park-wide effects of sending one guest home, and drop its agent. */
function releaseOccupant(guest: GuestState): void {
  if (guest.targetId === null) return;
  const obj = session.placed.get(guest.targetId);
  if (obj !== undefined && obj.occupants > 0) obj.occupants -= 1;
}

/** A guest finishing at a stall: pay, take the stock, fill the need. Rides settle through the sim. */
function finishInteraction(ctx: GameContext, guest: GuestState): void {
  const obj = guest.targetId === null ? undefined : session.placed.get(guest.targetId);
  const agent = agentOf(guest, ctx.rng);
  if (obj !== undefined) {
    const def = buildableDef(obj.catalogId);
    if (def.stall !== undefined && obj.stock > 0 && guest.money >= def.stall.price) {
      guest.money -= def.stall.price;
      obj.stock -= 1;
      obj.soldTotal += 1;
      session.cash += def.stall.price;
      session.revenueToday += def.stall.price;
      session.scenarioRevenue += def.stall.price;
      const fill = def.stall.need === "hunger" ? 70 : def.stall.need === "thirst" ? 75 : 100;
      agent.needs.refill(def.stall.need, fill);
    }
    guest.visits += 1;
  }
  releaseOccupant(guest);
  guest.targetId = null;
  guest.target = null;
  guest.busy = 0;
  guest.phase = "seeking";
}

function shouldLeave(ctx: GameContext, guest: GuestState): boolean {
  const agent = agentOf(guest, ctx.rng);
  return !session.open || guest.money < MIN_SPEND || agent.mood().score < 18 || guest.visits >= MAX_VISITS;
}

function moveGuest(ctx: GameContext, guest: GuestState, target: readonly [number, number, number], dt: number): boolean {
  const next = ctx.scene.entity.moveToward(guest.id, target, {
    speed: GUEST_WALK_SPEED,
    dt,
    stopDistance: 0,
  });
  if (next === null) return false;
  ctx.scene.entity.setPose(guest.id, { position: next });
  return distance2(next[0], next[2], target[0], target[2]) <= ARRIVE_DISTANCE;
}

/** Walk to a structure and say when the guest is close enough to use it. */
function moveToStructure(
  ctx: GameContext,
  guest: GuestState,
  target: readonly [number, number, number],
  def: BuildableDef,
  dt: number,
): boolean {
  const next = ctx.scene.entity.moveToward(guest.id, target, {
    speed: GUEST_WALK_SPEED,
    dt,
    stopDistance: 0,
  });
  if (next === null) return false;
  ctx.scene.entity.setPose(guest.id, { position: next });
  return distance2(next[0], next[2], target[0], target[2]) <= arriveRadius(def);
}

function despawnGuest(ctx: GameContext, guest: GuestState): void {
  releaseOccupant(guest);
  if (guest.targetId !== null) leaveRide(guest.targetId, guest.id);
  guest.agent = agentOf(guest, ctx.rng).snapshot();
  forgetAgent(guest.id);
  if (ctx.scene.entity.selection.has(guest.id)) ctx.scene.entity.selection.remove(guest.id);
  session.guests.delete(guest.id);
  ctx.scene.entity.despawn(guest.id);
}

/** Where the next guest in line stands: a line that runs out from the ride's own footprint. */
function queueSpot(obj: PlacedObject, index: number): [number, number, number] {
  const radius = arriveRadius(buildableDef(obj.catalogId));
  return [obj.x, 0, obj.z - radius - Math.max(0, index) * 1.15];
}

/** The line a guest is standing in: its own measured wait, or a sold-out stall's crowd. */
function queuePenalty(guest: GuestState): number {
  if (guest.targetId === null) return 0;
  const obj = session.placed.get(guest.targetId);
  if (obj === undefined) return 0;
  const def = buildableDef(obj.catalogId);
  if (def.ride !== undefined) {
    // Standing in line is what wears a guest down; walking towards a ride is not a wait yet.
    if (guest.phase !== "queued") return 0;
    const view = rideView(obj.id);
    if (view === null) return 0;
    const seconds = view.queue.wait.seconds + (view.phase === "broken" ? 45 : 0);
    return -Math.min(14, seconds * 0.18);
  }
  return def.stall !== undefined && obj.stock <= 0 ? -12 : 0;
}

/**
 * The ride sim's own events: a boarding charges the ride's ticket, an alighting fills the guest's fun
 * from the ride's ratings, a breakdown is the park's news, and a repair is money out of the till.
 */
function makeRideSink(ctx: GameContext): RideTickSink {
  return {
    onBoard(rideId, guestId) {
      const guest = session.guests.get(guestId);
      const obj = session.placed.get(rideId);
      if (guest === undefined || obj === undefined) return;
      const price = ridePrice(obj.catalogId);
      if (guest.money >= price) {
        guest.money -= price;
        session.cash += price;
        session.revenueToday += price;
        session.scenarioRevenue += price;
      }
      guest.phase = "riding";
      guest.busy = 0;
      guest.targetId = rideId;
      ctx.scene.entity.setPose(guestId, { position: [obj.x, 0, obj.z] });
    },
    onAlight(rideId, guestId) {
      const guest = session.guests.get(guestId);
      const obj = session.placed.get(rideId);
      if (guest === undefined || obj === undefined) return;
      agentOf(guest, ctx.rng).needs.refill("fun", rideFun(guest.kind, obj, trackPieces()));
      guest.visits += 1;
      guest.phase = "seeking";
      guest.targetId = null;
      guest.target = null;
      ctx.scene.entity.setPose(guestId, { position: [obj.x + 2.6, 0, obj.z + 2.6] });
    },
    onBreak(rideId) {
      const obj = session.placed.get(rideId);
      if (obj === undefined) return;
      const name = buildableDef(obj.catalogId).label;
      ctx.game.notices.push({ text: `${name} has broken down — maintenance on the way`, tone: "warn" });
      ctx.game.audio.play("denied");
    },
    onRepaired(rideId, cost) {
      const obj = session.placed.get(rideId);
      if (obj === undefined) return;
      const name = buildableDef(obj.catalogId).label;
      session.cash -= cost;
      ctx.game.notices.push({ text: `${name} repaired · -$${cost}`, tone: "info" });
    },
  };
}

const sinks = new WeakMap<GameContext, RideTickSink>();

/** Advance the park's rides one tick; their events land on the guest and the till. */
export function tickRidePark(ctx: GameContext, dt: number): void {
  let sink = sinks.get(ctx);
  if (sink === undefined) {
    sink = makeRideSink(ctx);
    sinks.set(ctx, sink);
  }
  tickRides(ctx, dt, sink);
}

/** Walk where the agent chose; a guest gives up on a target it has not reached in time. */
function holdPlaceInLine(ctx: GameContext, guest: GuestState, obj: PlacedObject, dt: number): void {
  const view = rideView(obj.id);
  if (view === null) {
    guest.phase = "seeking";
    guest.targetId = null;
    guest.target = null;
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
  guest.targetId = null;
  guest.target = null;
  guest.phase = "seeking";
  agentOf(guest, ctx.rng).moodSources.setSource("queue", -14);
}

function arriveAtRide(ctx: GameContext, guest: GuestState, obj: PlacedObject): void {
  if (!joinRide(obj.id, guest.id)) {
    guest.targetId = null;
    guest.target = null;
    guest.phase = "seeking";
    return;
  }
  guest.phase = "queued";
  guest.busy = 0;
  guest.targetUntil = ctx.time.now() + QUEUE_CHECK_SECONDS;
}

export function tickGuests(ctx: GameContext, dt: number, tracks: number): void {
  const now = ctx.time.now();
  for (const guest of session.guests.values()) {
    const agent = agentOf(guest, ctx.rng);
    agent.moodSources.setSource("litter", -session.litter * 0.02);
    agent.moodSources.setSource("queue", queuePenalty(guest));

    guest.litterTimer -= dt;
    if (guest.litterTimer <= 0) {
      guest.litterTimer = 5 + ctx.rng() * 6;
      session.litter = Math.min(100, session.litter + 0.08);
    }

    if (guest.phase === "busy") {
      guest.busy -= dt;
      if (guest.busy <= 0) finishInteraction(ctx, guest);
      agent.update({ dt, now, targets: guestTargets(guest, tracks, guest.target ?? midwayPoint()) });
      continue;
    }

    if (guest.phase === "queued" || guest.phase === "riding") {
      const obj = guest.targetId === null ? undefined : session.placed.get(guest.targetId);
      if (obj === undefined) {
        if (guest.targetId !== null) leaveRide(guest.targetId, guest.id);
        guest.targetId = null;
        guest.target = null;
        guest.phase = "seeking";
      } else if (guest.phase === "queued") {
        holdPlaceInLine(ctx, guest, obj, dt);
      }
      agent.update({ dt, now });
      continue;
    }

    if (guest.phase === "leaving") {
      agent.update({ dt, now });
      const arrived = moveGuest(ctx, guest, [0, 0, 58], dt);
      if (arrived || now > guest.targetUntil) {
        despawnGuest(ctx, guest);
      }
      continue;
    }

    if (guest.targetId !== null && !session.placed.has(guest.targetId)) {
      guest.targetId = null;
      guest.target = null;
    }

    const position = ctx.scene.entity.get(guest.id)?.position ?? [0, 0, 56];
    const frame = agent.update({
      dt,
      now,
      targets: guestTargets(guest, tracks, position),
    });

    if (guest.targetId === null) {
      if (shouldLeave(ctx, guest)) {
        guest.phase = "leaving";
        guest.target = null;
        guest.targetUntil = now + LEAVE_PATIENCE;
        continue;
      }
      const target = frame.action.target;
      if (target === null || target === "midway") {
        guest.target = midwayPoint();
        guest.targetUntil = now + TARGET_PATIENCE;
      } else {
        const obj = session.placed.get(target);
        if (obj === undefined) {
          guest.target = midwayPoint();
          guest.targetUntil = now + TARGET_PATIENCE;
        } else {
          guest.targetId = obj.id;
          guest.target = [obj.x, 0, obj.z];
          guest.targetUntil = now + TARGET_PATIENCE;
          if (buildableDef(obj.catalogId).stall !== undefined) obj.occupants += 1;
        }
      }
    }

    if (guest.target !== null) {
      if (now > guest.targetUntil) {
        releaseOccupant(guest);
        guest.targetId = null;
        guest.target = null;
        guest.phase = "seeking";
      } else {
        const obj = guest.targetId === null ? undefined : session.placed.get(guest.targetId);
        const def = obj === undefined ? undefined : buildableDef(obj.catalogId);
        const arrived = obj !== undefined && def !== undefined
          ? moveToStructure(ctx, guest, guest.target, def, dt)
          : moveGuest(ctx, guest, guest.target, dt);
        if (arrived && guest.targetId !== null) {
          if (obj !== undefined && def?.ride !== undefined) {
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
  }

  session.happinessAvg = parkMood();
}

/** Refresh the plain guest state from the live agents before a save is written. */
export { syncAgentStates };

/** Drop every live agent - a new park or a restore replaces them from their own snapshots. */
export function resetGuestAgents(): void {
  clearAgents();
}
