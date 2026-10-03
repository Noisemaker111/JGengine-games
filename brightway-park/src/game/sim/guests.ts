import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { ENTRANCE, guestCap } from "../catalog";
import { buildableDef } from "../objects/catalog";
import { GUEST_WALK_SPEED, guestKindFor } from "../entities/guests/catalog";
import { nextGuestId, session, type GuestState, type PlacedObject } from "../session";
import { coasterThrill, demand } from "./rating";
import { connectedTracks, hasPathAccess, localComfort, objectCapacity, objectPrice, objectServiceSeconds, operational, weatherForDay } from "./operations";

const HUNGER_RATE = 1.2;
const THIRST_RATE = 1.5;
const HAPPY_DRIFT = 0.18;
const ARRIVE_DISTANCE = 2.2;
const MAX_VISITS = 6;
const MIN_SPEND = 6;
const MAX_WAIT = 12;

export function guestPreference(guest: GuestState): "family" | "thrill" {
  return guest.kind === "guest_a" || guest.kind === "guest_b" ? "family" : "thrill";
}

function repeatFactor(guest: GuestState, obj: PlacedObject): number {
  return Math.pow(0.4, (guest.visited ?? []).filter((id) => id === obj.catalogId).length);
}

function rideFit(guest: GuestState, thrill: number): number {
  return guestPreference(guest) === "family" ? Math.max(0.2, 1.5 - thrill * 0.09) : 0.65 + thrill * 0.08;
}

export function needPressure(value: number): number {
  return Math.max(0, (value - 45) / 55);
}

export function targetScore(
  guest: GuestState,
  obj: PlacedObject,
  _tracks: number,
  distance: number,
): number {
  const def = buildableDef(obj.catalogId);
  if (!operational(obj) || obj.occupants >= objectCapacity(obj)) return -1;
  const proximity = 1 / (1 + distance * 0.05);
  const access = hasPathAccess(obj) ? 1 : 0.35;
  if (def.stall !== undefined) {
    if (obj.stock <= 0 || guest.money < objectPrice(obj)) return -1;
    const pressure =
      def.stall.need === "hunger"
        ? needPressure(guest.hunger)
        : def.stall.need === "thirst"
          ? needPressure(guest.thirst)
          : guest.souvenir;
    if (pressure <= 0.02) return -1;
    return (2 + pressure * 8 + def.appeal) * proximity * access;
  }
  if (def.ride !== undefined) {
    const thrill = def.ride.thrill + (def.id === "ride_coaster" ? coasterThrill(connectedTracks(obj)) : 0);
    const upgrade = obj.upgrade === "premium" ? 1.25 : obj.upgrade === "efficient" ? 0.85 : 1;
    return (1.5 + def.appeal * 0.9) * rideFit(guest, thrill) * repeatFactor(guest, obj) * proximity * access * upgrade;
  }
  return -1;
}

function distance2(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function chooseTarget(guest: GuestState, pos: readonly [number, number, number], tracks: number): PlacedObject | null {
  let best: PlacedObject | null = null;
  let bestScore = 0.01;
  for (const obj of session.placed.values()) {
    const dist = distance2(pos[0], pos[2], obj.x, obj.z);
    const score = targetScore(guest, obj, tracks, dist);
    if (score > bestScore) {
      bestScore = score;
      best = obj;
    }
  }
  return best;
}

function spawnGuest(ctx: GameContext): void {
  const id = nextGuestId();
  const kind = guestKindFor(id);
  const jitter = (ctx.rng() - 0.5) * 10;
  const start: [number, number, number] = [jitter, 0, ENTRANCE[2]];
  const guest: GuestState = {
    id,
    kind,
    happy: 62 - Math.max(0, session.ticketPrice - 16) * 1.1,
    money: 34 + ctx.rng() * 46,
    hunger: 12 + ctx.rng() * 22,
    thirst: 16 + ctx.rng() * 24,
    souvenir: ctx.rng() * 0.6,
    visits: 0,
    visited: [],
    phase: "seeking",
    targetId: null,
    target: null,
    busy: 0,
    litterTimer: 4 + ctx.rng() * 6,
  };
  session.guests.set(id, guest);
  ctx.scene.entity.spawn(kind, { id, position: start, role: "npc" });
  session.cash += session.ticketPrice;
  session.revenueToday += session.ticketPrice;
  session.guestsToday += 1;
}

export function seedGuests(ctx: GameContext, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const id = nextGuestId();
    const kind = guestKindFor(id);
    const x = (ctx.rng() - 0.5) * 80;
    const z = (ctx.rng() - 0.5) * 80;
    const guest: GuestState = {
      id,
      kind,
      happy: 60 + ctx.rng() * 15,
      money: 30 + ctx.rng() * 50,
      hunger: 20 + ctx.rng() * 40,
      thirst: 20 + ctx.rng() * 40,
      souvenir: ctx.rng() * 0.5,
      visits: 0,
      visited: [],
      phase: "seeking",
      targetId: null,
      target: null,
      busy: 0,
      litterTimer: 3 + ctx.rng() * 6,
    };
    session.guests.set(id, guest);
    ctx.scene.entity.spawn(kind, { id, position: [x, 0, z], role: "npc" });
  }
}

export function spawnGuests(ctx: GameContext, dt: number, totalAppeal: number): void {
  if (!(dt > 0)) return;
  const cap = guestCap(session.rating);
  if (session.guests.size >= cap) return;
  const rate = demand(totalAppeal, session.ticketPrice, session.rating, session.open) * 0.5 * weatherForDay(session.day).demand * (session.marketing === "festival" ? 1.3 : 1);
  session.spawnAcc += rate * dt;
  let budget = 4;
  while (session.spawnAcc >= 1 && session.guests.size < cap && budget > 0) {
    session.spawnAcc -= 1;
    budget -= 1;
    spawnGuest(ctx);
  }
}

function releaseOccupant(guest: GuestState): void {
  if (guest.targetId === null) return;
  const obj = session.placed.get(guest.targetId);
  if (obj !== undefined && obj.occupants > 0) obj.occupants -= 1;
}

function finishInteraction(guest: GuestState): void {
  const obj = guest.targetId === null ? undefined : session.placed.get(guest.targetId);
  if (obj !== undefined) {
    const def = buildableDef(obj.catalogId);
    const price = objectPrice(obj);
    if (operational(obj) && def.stall !== undefined && obj.stock > 0 && guest.money >= price) {
      guest.money -= price;
      obj.stock -= 1;
      obj.soldTotal += 1;
      session.cash += price;
      session.revenueToday += price;
      if (def.stall.need === "hunger") guest.hunger = Math.max(0, guest.hunger - 70);
      else if (def.stall.need === "thirst") guest.thirst = Math.max(0, guest.thirst - 75);
      else guest.souvenir = 0;
      guest.happy = Math.min(100, guest.happy + 5);
    } else if (operational(obj) && def.ride !== undefined) {
      const thrill = def.ride.thrill + (def.id === "ride_coaster" ? coasterThrill(connectedTracks(obj)) : 0);
      guest.happy = Math.min(100, guest.happy + (6 + def.appeal * 0.8) * rideFit(guest, thrill) * repeatFactor(guest, obj));
      guest.visited = [...(guest.visited ?? []), obj.catalogId].slice(-MAX_VISITS);
    } else if (def.stall !== undefined) {
      guest.happy = Math.max(0, guest.happy - 6);
    }
    guest.visits += 1;
  }
  releaseOccupant(guest);
  guest.targetId = null;
  guest.target = null;
  guest.phase = "seeking";
  guest.busy = 0;
}

function shouldLeave(guest: GuestState): boolean {
  return (
    !session.open ||
    guest.money < MIN_SPEND ||
    guest.happy < 18 ||
    guest.visits >= MAX_VISITS
  );
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
  const weight = 0.06;
  session.happinessAvg = session.happinessAvg * (1 - weight) + guest.happy * weight;
  session.guests.delete(guest.id);
  ctx.scene.entity.despawn(guest.id);
}

export function tickGuests(ctx: GameContext, dt: number, tracks: number): void {
  if (!(dt > 0)) return;
  const weather = weatherForDay(session.day);
  for (const guest of session.guests.values()) {
    const ent = ctx.scene.entity.get(guest.id);
    const pos: readonly [number, number, number] = ent?.position ?? ENTRANCE;
    const activity = guest.targetId === null ? undefined : session.placed.get(guest.targetId);
    const comfort = activity !== undefined && distance2(pos[0], pos[2], activity.x, activity.z) <= 10 ? localComfort(activity) : 0;
    guest.hunger = Math.min(100, guest.hunger + HUNGER_RATE * dt);
    guest.thirst = Math.min(100, guest.thirst + THIRST_RATE * (weather.thirst - Math.max(0, weather.thirst - 1) * comfort * 0.65) * dt);
    guest.souvenir = Math.min(1, guest.souvenir + 0.02 * dt);
    guest.happy = Math.max(
      0,
      guest.happy - HAPPY_DRIFT * (1 - comfort * 0.65) * dt - session.litter * 0.002 * dt - needPressure(guest.hunger) * dt * 0.5 - needPressure(guest.thirst) * dt * 0.3,
    );
    guest.litterTimer -= dt;
    if (guest.litterTimer <= 0) {
      guest.litterTimer = 5 + ctx.rng() * 6;
      session.litter = Math.min(100, session.litter + 0.12);
    }

    if (guest.targetId !== null && (activity === undefined || !operational(activity))) {
      releaseOccupant(guest);
      guest.targetId = null;
      guest.target = null;
      guest.phase = "seeking";
      guest.busy = 0;
      guest.happy = Math.max(0, guest.happy - 4);
    }

    if (guest.phase === "busy") {
      guest.busy -= dt;
      if (guest.busy <= 0) finishInteraction(guest);
      continue;
    }

    if (guest.phase === "leaving") {
      if (moveGuest(ctx, guest, ENTRANCE, dt)) despawnGuest(ctx, guest);
      continue;
    }

    if (guest.targetId === null) {
      if (shouldLeave(guest)) {
        guest.phase = "leaving";
        continue;
      }
      const target = chooseTarget(guest, pos, tracks);
      if (target === null) {
        guest.busy += dt;
        guest.happy = Math.max(0, guest.happy - dt * 0.35);
        if (guest.busy >= MAX_WAIT) guest.phase = "leaving";
        continue;
      }
      guest.targetId = target.id;
      guest.target = [target.x, 0, target.z];
      target.occupants += 1;
      guest.busy = 0;
    }

    if (guest.target !== null) {
      const arrived = moveGuest(ctx, guest, guest.target, dt);
      if (arrived) {
        const obj = guest.targetId === null ? undefined : session.placed.get(guest.targetId);
        guest.phase = "busy";
        guest.busy = obj === undefined ? 0 : objectServiceSeconds(obj) * (hasPathAccess(obj) ? 1 : 1.5);
      }
    }
  }
}
