import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { guestCap } from "../catalog";
import { buildableDef } from "../objects/catalog";
import { GUEST_WALK_SPEED, guestKindFor } from "../entities/guests/catalog";
import { nextGuestId, session, type GuestState } from "../session";
import {
  agentOf,
  clearAgents,
  createGuestAgent,
  forgetAgent,
  guestTargets,
  midwayPoint,
  parkMood,
  rideFun,
  syncAgentStates,
} from "../agents";
import { demand } from "./rating";

const ARRIVE_DISTANCE = 2.2;
const MAX_VISITS = 6;
const MIN_SPEND = 6;
const STALL_SERVICE = 2.2;
const BROWSE_SECONDS = 3;
const TARGET_PATIENCE = 25;
const LEAVE_PATIENCE = 30;

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

function finishInteraction(ctx: GameContext, guest: GuestState, tracks: number): void {
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
      const fill = def.stall.need === "hunger" ? 70 : def.stall.need === "thirst" ? 75 : 100;
      agent.needs.refill(def.stall.need, fill);
    } else if (def.ride !== undefined) {
      agent.needs.refill("fun", rideFun(guest.kind, obj, tracks));
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

function despawnGuest(ctx: GameContext, guest: GuestState): void {
  releaseOccupant(guest);
  guest.agent = agentOf(guest, ctx.rng).snapshot();
  forgetAgent(guest.id);
  if (ctx.scene.entity.selection.has(guest.id)) ctx.scene.entity.selection.remove(guest.id);
  session.guests.delete(guest.id);
  ctx.scene.entity.despawn(guest.id);
}

/** The queue a guest is standing in: the ride it is heading for, or the stall crowd it waits behind. */
function queuePenalty(guest: GuestState): number {
  if (guest.targetId === null) return 0;
  const obj = session.placed.get(guest.targetId);
  if (obj === undefined) return 0;
  const def = buildableDef(obj.catalogId);
  if (def.ride !== undefined) return -((obj.occupants / Math.max(1, def.ride.capacity)) * 14);
  return def.stall !== undefined && obj.stock <= 0 ? -12 : 0;
}

/** Walk where the agent chose; a guest gives up on a target it has not reached in time. */
function followAction(ctx: GameContext, guest: GuestState, dt: number, tracks: number): void {
  if (guest.target === null) return;
  if (dt > 0 && ctx.time.now() > guest.targetUntil) {
    releaseOccupant(guest);
    guest.targetId = null;
    guest.target = null;
    guest.phase = "seeking";
    return;
  }
  const arrived = moveGuest(ctx, guest, guest.target, dt);
  if (!arrived) return;
  if (guest.targetId === null) {
    guest.busy = BROWSE_SECONDS;
    guest.phase = "busy";
    return;
  }
  const obj = session.placed.get(guest.targetId);
  const def = obj === undefined ? undefined : buildableDef(obj.catalogId);
  guest.phase = "busy";
  guest.busy = def?.ride?.rideSeconds ?? STALL_SERVICE;
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
      if (guest.busy <= 0) finishInteraction(ctx, guest, tracks);
      agent.update({ dt, now, targets: guestTargets(guest, tracks, guest.target ?? midwayPoint()) });
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
          obj.occupants += 1;
        }
      }
    }

    followAction(ctx, guest, dt, tracks);
  }

  session.happinessAvg = parkMood();
}

/** Refresh the plain guest state from the live agents before a save is written. */
export { syncAgentStates };

/** Drop every live agent - a new park or a restore replaces them from their own snapshots. */
export function resetGuestAgents(): void {
  clearAgents();
}


