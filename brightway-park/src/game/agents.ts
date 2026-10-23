import {
  createAgent,
  type Agent,
  type AgentSnapshot,
  type AgentTarget,
} from "@jgengine/core/agents/agent";
import type { MoodTier } from "@jgengine/core/agents/mood";
import type { NeedDefinition } from "@jgengine/core/sim/needs";
import { rideAppeal, rideQueueCostWeight, type RideTaste } from "@jgengine/core/sim/rides";

import { CLOSE_FRACTION, DAY_LENGTH, ENTRANCE, OPEN_FRACTION } from "./catalog";
import { buildableDef } from "./objects/catalog";
import { guestRidePreference } from "./sim/rideExperience";
import { ridePrice, rideView } from "./sim/rides";
import { session, type GuestState, type PlacedObject, type StaffState } from "./session";

/**
 * The park's own content for the shared agent loop: what a visitor needs, what it can do, and the
 * words its mood reads as. The loop itself lives in `@jgengine/core/agents/agent`.
 */
export const GUEST_NEEDS: readonly NeedDefinition[] = [
  { id: "hunger", max: 100, min: 0, rate: 0.3, start: 85 },
  { id: "thirst", max: 100, min: 0, rate: 0.4, start: 82 },
  { id: "fun", max: 100, min: 0, rate: 0.25, start: 70 },
  { id: "souvenir", max: 100, min: 0, rate: 0.05, start: 90 },
  { id: "energy", max: 100, min: 0, rate: 0.08, start: 88 },
];

const needTerm = (need: string) => ({ need, curve: { kind: "linear" as const, from: 0.15, to: 0.95 } });

export const GUEST_OPTIONS = [
  { id: "hunger", terms: [needTerm("hunger")] },
  { id: "thirst", terms: [needTerm("thirst")] },
  { id: "souvenir", base: 0.05, terms: [needTerm("souvenir")] },
  { id: "ride", base: 0.3, terms: [needTerm("fun")] },
  { id: "energy", base: 0.05, terms: [needTerm("energy")] },
  { id: "wander", base: 0.15 },
];

/** A seaside park's tone: the shared 0-100 score in the words the HUD and a guest card use. */
export const GUEST_MOOD_TIERS: readonly MoodTier[] = [
  { at: 82, id: "delighted", label: "Delighted" },
  { at: 64, id: "content", label: "Content" },
  { at: 45, id: "fine", label: "Fine" },
  { at: 26, id: "restless", label: "Restless" },
  { at: 0, id: "miserable", label: "Miserable" },
];

/** A point of score is about 33 s of walking, 50 s of queueing, or one dud ride. */
const WALK_COST = 0.03;
const QUEUE_COST = 0.02;
const RIDE_GAP_COST = 0.5;
/** A dollar of ride ticket weighs about as much as 20 s of walking. */
const PRICE_COST = 0.05;

/** What a guest tolerates, in the shared ride-choice shape, from its own audience card. */
export function guestTaste(kind: string): RideTaste {
  const preference = guestRidePreference(kind);
  return { intensityComfort: preference.thrill, nauseaComfort: 6, queueTolerance: 45 };
}

const agents = new Map<string, Agent>();

export function clearAgents(): void {
  for (const agent of agents.values()) agent.dispose();
  agents.clear();
}

function trackAgent(agent: Agent): Agent {
  agents.set(agent.id, agent);
  return agent;
}

/** A new guest agent; its needs start inside a park-guest range from the world's seeded stream. */
export function createGuestAgent(
  id: string,
  kind: string,
  rng: () => number,
  randomized = true,
  track = true,
): Agent {
  const agent = createAgent({
      id,
      needs: GUEST_NEEDS.map((need) => ({
        ...need,
        start: randomized ? (need.start ?? 0) + (rng() - 0.5) * 20 : need.start,
      })),
      options: GUEST_OPTIONS,
      mood: {
        tiers: GUEST_MOOD_TIERS,
        weights: [
          { need: "hunger", weight: 2 },
          { need: "thirst", weight: 1.5 },
          { need: "fun", weight: 2.5 },
          { need: "souvenir", weight: 0.4 },
          { need: "energy", weight: 0.6 },
        ],
      },
      switchMargin: 0.08,
      minHoldSeconds: 1.5,
      jitter: 0.06,
      rng,
    });
  return track ? trackAgent(agent) : agent;
}

/** The live agent for a guest, created from its saved state the first time it is asked for. */
export function agentOf(guest: GuestState, rng: () => number): Agent {
  const existing = agents.get(guest.id);
  if (existing !== undefined) return existing;
  const agent = createGuestAgent(guest.id, guest.kind, rng, false);
  agent.restore(guest.agent);
  return agent;
}

export function forgetAgent(id: string): void {
  agents.get(id)?.dispose();
  agents.delete(id);
}

const MIDWAY: AgentTarget = { option: "wander", target: "midway" };

/**
 * The world as one guest sees it this tick: every stall whose need is still empty, every ride it can
 * afford, and the midway as an always-available fallback. Walk, the line the ride actually reports and
 * the ride's ticket become one cost, priced against this guest's own queue tolerance.
 */
export function guestTargets(
  guest: GuestState,
  tracks: number,
  at: readonly [number, number, number],
): AgentTarget[] {
  const targets: AgentTarget[] = [];
  const taste = guestTaste(guest.kind);
  const queueWeight = rideQueueCostWeight(taste);
  for (const obj of session.placed.values()) {
    const def = buildableDef(obj.catalogId);
    const distance = Math.hypot(obj.x - at[0], obj.z - at[2]);
    if (def.stall !== undefined) {
      if (obj.stock <= 0 || guest.money < def.stall.price) continue;
      targets.push({
        option: def.stall.need,
        target: obj.id,
        cost: distance * WALK_COST + obj.occupants * QUEUE_COST,
        fallback: MIDWAY,
      });
      continue;
    }
    if (def.ride === undefined) continue;
    const price = ridePrice(obj.catalogId);
    if (guest.money < price) continue;
    const view = rideView(obj.id);
    if (view === null) continue;
    const appeal = rideAppeal(view.ratings, taste);
    // The line's own measured wait, plus a penalty for standing in front of a ride that is down.
    const waitPenalty = view.queue.wait.seconds * queueWeight;
    const brokenPenalty = view.phase === "broken" ? 14 : 0;
    targets.push({
      option: "ride",
      target: obj.id,
      cost: distance * WALK_COST + waitPenalty + brokenPenalty + (1 - appeal) * RIDE_GAP_COST + price * PRICE_COST,
      fallback: MIDWAY,
    });
  }
  targets.push(MIDWAY);
  return targets;
}

/** What a ride gives a guest in fun, from its live ratings and that guest's taste. */
export function rideFun(kind: string, obj: PlacedObject, _tracks: number): number {
  const view = rideView(obj.id);
  if (view === null) return 0;
  return 12 * rideAppeal(view.ratings, guestTaste(kind)) - 4;
}

/** The live agent a HUD reads without creating one - `null` before the guest has been ticked. */
export function liveAgent(id: string): Agent | null {
  return agents.get(id) ?? null;
}

/** The park's mood aggregate: the mean of every guest's own mood, which is what the rating reads. */
export function parkMood(): number {
  if (session.guests.size === 0) return session.happinessAvg;
  let total = 0;
  for (const guest of session.guests.values()) {
    const agent = agents.get(guest.id);
    total += agent === undefined ? 55 : agent.mood().score;
  }
  return total / session.guests.size;
}

/** Where a browsing guest walks to when it is not heading for an attraction. */
export function midwayPoint(): [number, number, number] {
  return [0, 0, 18];
}

export function gatePoint(): readonly [number, number, number] {
  return ENTRANCE;
}

const STAFF_BEAT_RADIUS = 6;
const STAFF_BEAT_STEPS = 8;
const STAFF_POST_SECONDS = 6;

/** The ring a janitor walks around its post - authored by the post, not by a route file. */
export function staffBeat(post: PlacedObject): { place: string; x: number; z: number }[] {
  const points: { place: string; x: number; z: number }[] = [];
  for (let i = 0; i < STAFF_BEAT_STEPS; i += 1) {
    const angle = (i / STAFF_BEAT_STEPS) * Math.PI * 2;
    points.push({
      place: `${post.id}:${i}`,
      x: post.x + Math.cos(angle) * STAFF_BEAT_RADIUS,
      z: post.z + Math.sin(angle) * STAFF_BEAT_RADIUS,
    });
  }
  return points;
}

export function staffId(postId: string): string {
  return `staff:${postId}`;
}

/** One janitor per post: the same agent factory, with a work beat instead of a need to chase. */
export function createStaffAgent(post: PlacedObject, rng: () => number): Agent {
  const beat = staffBeat(post).map((point) => point.place);
  return trackAgent(
    createAgent({
      id: staffId(post.id),
      needs: [
        { id: "energy", max: 100, min: 0, rate: 0.6, start: 85 },
        { id: "hunger", max: 100, min: 0, rate: 0.9, start: 80 },
      ],
      options: [
        { id: "patrol", base: 0.7 },
        { id: "rest", base: 0.15, terms: [{ need: "energy", curve: { kind: "linear", from: 0.4, to: 0.05 } }] },
      ],
      mood: { tiers: GUEST_MOOD_TIERS, weights: [{ need: "energy", weight: 2 }, { need: "hunger", weight: 1 }] },
      schedule: {
        cycleSeconds: DAY_LENGTH,
        stops: [
          { place: "bunks", arriveAt: 0, activity: "rest" },
          {
            place: post.id,
            arriveAt: DAY_LENGTH * OPEN_FRACTION,
            activity: "work",
            beat,
            beatDwellSeconds: STAFF_POST_SECONDS,
          },
          { place: "bunks", arriveAt: DAY_LENGTH * CLOSE_FRACTION, activity: "rest" },
        ],
        travelSeconds: () => 4,
      },
      switchMargin: 0.05,
      rng,
      devtoolsName: `park.staff.${post.id}`,
    }),
  );
}

export function staffAgentOf(state: StaffState, post: PlacedObject, rng: () => number): Agent {
  const existing = agents.get(state.id);
  if (existing !== undefined) return existing;
  const agent = createStaffAgent(post, rng);
  agent.restore(state.agent);
  return agent;
}

/**
 * A saved-state agent made outside a running world: used to turn a v1 save's happy/hunger/thirst
 * numbers into the shared agent state, and by tests that need a plain snapshot.
 */
export function guestAgentState(
  id: string,
  kind: string,
  values: Readonly<Record<string, number>>,
): AgentSnapshot {
  const agent = createGuestAgent(id, kind, () => 0.5, false, false);
  for (const [need, value] of Object.entries(values)) {
    if (agent.needs.indexOf(need) < 0) continue;
    agent.needs.refill(need, value - agent.needs.value(need));
  }
  const snapshot = agent.snapshot();
  agent.dispose();
  return snapshot;
}

/** Write every live agent back into the session's plain state - called on save and before despawn. */
export function syncAgentStates(): void {
  for (const guest of session.guests.values()) {
    const agent = agents.get(guest.id);
    if (agent !== undefined) guest.agent = agent.snapshot();
  }
  for (const staff of session.staff.values()) {
    const agent = agents.get(staff.id);
    if (agent !== undefined) staff.agent = agent.snapshot();
  }
}
