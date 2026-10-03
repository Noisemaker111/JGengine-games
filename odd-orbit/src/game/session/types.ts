import { createPairKeyCodec } from "@jgengine/core/relation/keyedValues";
import { appendFeed, pruneFeed } from "@jgengine/core/game/feed";

import type { AlienBodyPlan } from "../creatures/bodyPlan";
import type { ResourceLedger } from "@jgengine/core/economy/resourceLedger";
import { createHouseholdEconomy } from "../sim/economy";

import type { NeedId } from "../needs/needs";

export type MemberAction =
  | { kind: "idle" }
  | { kind: "wander"; x: number; z: number }
  | { kind: "seek"; goal: NeedId | "work"; objId: string }
  | { kind: "use"; goal: NeedId | "work"; objId: string }
  | { kind: "social"; withId: string };

export type Lifestyle = "yield" | "bloom";

export interface MemberState {
  id: string;
  name: string;
  bodyPlan: AlienBodyPlan;
  job: string;
  needs: Record<NeedId, number>;
  action: MemberAction;
  assignedByPlayer: boolean;
  actionUntil: number;
  lifestyle: Lifestyle;
  stress: number;
  recovering: boolean;
  workToday: number;
  harvestToday: number;
  shiftProgress: number;
  shiftDay: number;
  completedShifts: number;
  missedShifts: number;
  concern: string | null;
}

export interface LifeEvent {
  id: string;
  text: string;
  at: number;
  tone: "info" | "good" | "milestone";
}

export interface DaySummary {
  day: number;
  income: number;
  harvest: number;
  bill: number;
  missed: number;
}

export interface HouseholdState {
  seed: string;
  members: Record<string, MemberState>;
  order: string[];
  relationships: Record<string, number>;
  milestones: Record<string, string>;
  credits: number;
  pantry: number;
  debt: number;
  day: number;
  economy: ResourceLedger;
  dayIncome: number;
  dayHarvest: number;
  reliefDay: number;
  lastDay: DaySummary | null;
  selectedMemberId: string | null;
  buildTool: string | null;
  events: LifeEvent[];
  eventSeq: number;
  nextLifeEventAt: number;
}

/** Undirected, delimiter-safe key for a member pair; order-independent and serializable. */
const REL_KEY_CODEC = createPairKeyCodec();

export function pairKey(a: string, b: string): string {
  return REL_KEY_CODEC.key(a, b);
}

export function createHousehold(seed: string): HouseholdState {
  return {
    seed,
    members: {},
    order: [],
    relationships: {},
    milestones: {},
    credits: 640,
    pantry: 12,
    debt: 0,
    day: 0,
    economy: createHouseholdEconomy(),
    dayIncome: 0,
    dayHarvest: 0,
    reliefDay: -1,
    lastDay: null,
    selectedMemberId: null,
    buildTool: null,
    events: [],
    eventSeq: 0,
    nextLifeEventAt: 0,
  };
}

export function pushEvent(
  state: HouseholdState,
  text: string,
  at: number,
  tone: LifeEvent["tone"] = "info",
): void {
  state.eventSeq += 1;
  // `LifeEvent` is a flat timestamped entry, so the shared feed primitive bounds it with no envelope.
  state.events = appendFeed(state.events, { id: `ev${state.eventSeq}`, text, at, tone }, { limit: 6 });
}

export function pruneEvents(state: HouseholdState, now: number, ttl: number): void {
  // pruneFeed returns the same reference when nothing expired, preserving the old no-op skip.
  state.events = pruneFeed(state.events, now, ttl);
}
