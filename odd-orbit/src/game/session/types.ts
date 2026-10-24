import { createPairKeyCodec } from "@jgengine/core/relation/keyedValues";
import type { NoticeFeed, NoticeTone } from "@jgengine/core/game/notices";

import type { AlienBodyPlan } from "../creatures/bodyPlan";
import type { ResourceLedger } from "@jgengine/core/economy/resourceLedger";
import type { StandingState } from "@jgengine/core/progression/standing";
import type { UpgradeState } from "@jgengine/core/progression/upgrades";
import { createHouseholdEconomy } from "../sim/economy";

import type { NeedId } from "../needs/needs";

export type MemberAction =
  | { kind: "idle" }
  | { kind: "wander"; x: number; z: number; company?: string }
  | { kind: "seek"; goal: NeedId | "work"; objId: string }
  | { kind: "use"; goal: NeedId | "work"; objId: string }
  | { kind: "social"; withId: string };

/** The crops a bloom-lifestyle being can plant, and their one list. */
export const BLOOM_CROPS = ["pantry", "export"] as const;
export type BloomCrop = (typeof BLOOM_CROPS)[number];

/** The two lifestyles, and their one list: the save decoder reads this, never a copy. */
export const LIFESTYLES = ["yield", "bloom"] as const;
export type Lifestyle = (typeof LIFESTYLES)[number];

export interface MemberState {
  id: string;
  name: string;
  bodyPlan: AlienBodyPlan;
  job: string;
  /** The shared agent's need values, saved as plain numbers the HUD and the loop both read. */
  needs: Record<NeedId, number>;
  action: MemberAction;
  assignedByPlayer: boolean;
  actionUntil: number;
  lifestyle: Lifestyle;
  /** Absent in legacy v1 saves: pantry crops preserve their original harvest. */
  bloomCrop?: BloomCrop;
  stress: number;
  recovering: boolean;
  workToday: number;
  harvestToday: number;
  shiftProgress: number;
  /** Published from the shift session loop: the day whose shift closed, -1 before any. */
  shiftDay: number;
  completedShifts: number;
  missedShifts: number;
  concern: string | null;
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
  /** Opinion per pair, from the shared relationship book. */
  relationships: Record<string, number>;
  /** How much time each pair has shared; a bond needs this as well as opinion. */
  familiarity: Record<string, number>;
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
  /** Household notices raised so far; seeds life-event rolls. */
  eventSeq: number;
  nextLifeEventAt: number;
  /** Per-being standing: shift counts per station and the household standing rungs read. */
  standing?: StandingState;
  /** Post rungs bought so far; absent in legacy v1 saves. */
  careers?: UpgradeState;
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
    familiarity: {},
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
    eventSeq: 0,
    nextLifeEventAt: 0,
    standing: { records: {} },
    careers: { ranks: {} },
  };
}

/** Raise a household notice in the shell feed and count it toward the life-event seed. */
export function noteEvent(state: HouseholdState, notices: Pick<NoticeFeed, "push">, text: string, tone: NoticeTone = "info"): void {
  state.eventSeq += 1;
  notices.push({ text, tone });
}
