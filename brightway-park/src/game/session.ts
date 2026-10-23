import {
  addScheduledRule,
  createResourceLedger,
  type ResourceLedger,
} from "@jgengine/core/economy/resourceLedger";
import type { AgentSnapshot } from "@jgengine/core/agents/agent";

import { DAY_LENGTH, STARTING_CASH } from "./catalog";
import type { LoanState } from "./sim/finance";
import type { ScenarioState } from "./scenarios";

/**
 * The park's money as a serializable scheduled-transaction ledger. The daily upkeep+restock
 * charge is a recurring rule settled deterministically by the core `resourceLedger`; the nominal
 * amount is `0` because the real per-day cost comes from live park metrics via a policy at
 * settlement time (see `settleDailyUpkeep`).
 */
export function createParkLedger(day = 1, cash = STARTING_CASH, hasLoan = false): ResourceLedger {
  let ledger = addScheduledRule(createResourceLedger({ accounts: { park: { cash } } }), {
    id: "daily-upkeep",
    currency: "cash",
    amount: 0,
    everySeconds: DAY_LENGTH,
    startSeconds: DAY_LENGTH,
    source: "park",
  });
  // A loan is the same shared ledger: one more rule, whose amount the settlement policy reads.
  if (hasLoan) {
    ledger = addScheduledRule(ledger, {
      id: "loan-payment",
      currency: "cash",
      amount: 0,
      everySeconds: DAY_LENGTH,
      startSeconds: DAY_LENGTH,
      source: "park",
    });
  }
  // Each completed day settles exactly one cycle. Rebuild this canonical rule
  // from the save's day rather than accepting arbitrary saved financial rules.
  ledger.nowSeconds = (day - 1) * DAY_LENGTH;
  ledger.cursors["daily-upkeep"]!.nextDueSeconds = day * DAY_LENGTH;
  ledger.cursors["daily-upkeep"]!.fired = day - 1;
  if (hasLoan) {
    ledger.cursors["loan-payment"]!.nextDueSeconds = day * DAY_LENGTH;
    ledger.cursors["loan-payment"]!.fired = day - 1;
  }
  return ledger;
}

export interface PlacedObject {
  id: string;
  catalogId: string;
  x: number;
  z: number;
  stock: number;
  soldTotal: number;
  occupants: number;
}

export type GuestPhase = "seeking" | "busy" | "queued" | "riding" | "leaving";

export interface GuestState {
  id: string;
  kind: string;
  money: number;
  visits: number;
  phase: GuestPhase;
  targetId: string | null;
  target: readonly [number, number, number] | null;
  /** Absolute game-second the guest gives up on a target it cannot reach. */
  targetUntil: number;
  busy: number;
  litterTimer: number;
  /** Everything the shared agent loop owns: needs, mood, held action and the far flag. */
  agent: AgentSnapshot;
}

/** One staffed post's janitor: an agent walking the beat its post authored. */
export interface StaffState {
  id: string;
  postId: string;
  agent: AgentSnapshot;
}

export interface Session {
  selectedTool: string | null;
  selectedObject: string | null;
  placed: Map<string, PlacedObject>;
  occupied: Map<string, string>;
  guests: Map<string, GuestState>;
  staff: Map<string, StaffState>;
  cash: number;
  ledger: ResourceLedger;
  rating: number;
  happinessAvg: number;
  litter: number;
  ticketPrice: number;
  day: number;
  open: boolean;
  guestsToday: number;
  revenueToday: number;
  revenueYesterday: number;
  upkeepYesterday: number;
  spawnAcc: number;
  guestSeq: number;
  objectSeq: number;
  bankruptDays: number;
  gameOver: boolean;
  started: boolean;
  hasSave: boolean;
  saveStatus: string;
  won: boolean;
  winDismissed: boolean;
  /** A ride's own ticket price, by catalog id; the catalog default applies until the park sets one. */
  ridePrices: Record<string, number>;
  /** The park's outstanding loan, or null when it owes nothing. */
  loan: LoanState | null;
  /** The scenario being played, or null in free play. */
  scenario: ScenarioState | null;
  /** Visitors through the gate since the scenario began. */
  scenarioVisitors: number;
  /** Gate, ride and stall takings since the scenario began. */
  scenarioRevenue: number;
}

function freshSession(): Session {
  return {
    selectedTool: null,
    selectedObject: null,
    placed: new Map(),
    occupied: new Map(),
    guests: new Map(),
    staff: new Map(),
    cash: STARTING_CASH,
    ledger: createParkLedger(),
    rating: 0,
    happinessAvg: 55,
    litter: 0,
    ticketPrice: 18,
    day: 1,
    open: false,
    guestsToday: 0,
    revenueToday: 0,
    revenueYesterday: 0,
    upkeepYesterday: 0,
    spawnAcc: 0,
    guestSeq: 0,
    objectSeq: 0,
    bankruptDays: 0,
    gameOver: false,
    started: false,
    hasSave: false,
    saveStatus: "Saved on builds, ticket changes, pause and day close",
    won: false,
    winDismissed: false,
    ridePrices: {},
    loan: null,
    scenario: null,
    scenarioVisitors: 0,
    scenarioRevenue: 0,
  };
}

export const session: Session = freshSession();

export function resetSession(): void {
  Object.assign(session, freshSession());
}

export function nextObjectId(catalogId: string): string {
  session.objectSeq += 1;
  return `${catalogId}#${session.objectSeq}`;
}

export function nextGuestId(): string {
  session.guestSeq += 1;
  return `guest#${session.guestSeq}`;
}
