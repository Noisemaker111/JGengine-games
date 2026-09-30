import { createPairKeyCodec } from "@jgengine/core/relation/keyedValues";
import { appendFeed, pruneFeed } from "@jgengine/core/game/feed";

import type { AlienBodyPlan } from "../creatures/bodyPlan";
import type { NeedId } from "../needs/needs";

export type MemberAction =
  | { kind: "idle" }
  | { kind: "wander"; x: number; z: number }
  | { kind: "seek"; goal: NeedId | "work"; objId: string }
  | { kind: "use"; goal: NeedId | "work"; objId: string }
  | { kind: "social"; withId: string };

export interface MemberState {
  id: string;
  name: string;
  bodyPlan: AlienBodyPlan;
  job: string;
  needs: Record<NeedId, number>;
  action: MemberAction;
  assignedByPlayer: boolean;
  actionUntil: number;
}

export interface LifeEvent {
  id: string;
  text: string;
  at: number;
  tone: "info" | "good" | "milestone";
}

export interface OrbitChallenge {
  phase: "welcome" | "active" | "won" | "recovery" | "sandbox";
  elapsed: number;
  earned: number;
  built: number;
  comfort: number;
}

export interface HouseholdState {
  /** Optional for compatibility with households saved before the first-orbit challenge. */
  orbit?: OrbitChallenge;
  saveMessage?: string;
  seed: string;
  members: Record<string, MemberState>;
  order: string[];
  relationships: Record<string, number>;
  milestones: Record<string, string>;
  credits: number;
  selectedMemberId: string | null;
  buildTool: string | null;
  events: LifeEvent[];
  eventSeq: number;
}

/** Undirected, delimiter-safe key for a member pair; order-independent and serializable. */
const REL_KEY_CODEC = createPairKeyCodec();

export function pairKey(a: string, b: string): string {
  return REL_KEY_CODEC.key(a, b);
}

export function createHousehold(seed: string): HouseholdState {
  return {
    seed,
    orbit: { phase: "welcome", elapsed: 0, earned: 0, built: 0, comfort: 0 },
    members: {},
    order: [],
    relationships: {},
    milestones: {},
    credits: 640,
    selectedMemberId: null,
    buildTool: null,
    events: [],
    eventSeq: 0,
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
