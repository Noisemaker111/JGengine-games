import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { createMissionRuntime, type MissionDef, type MissionRuntime, type MissionRuntimeSnapshot } from "@jgengine/core/mission/mission";

import { DAY_LENGTH } from "./catalog";
import { syncAmbience } from "./audio";
import { savePark } from "./persistence";
import { resetPark } from "./parkReset";
import { session } from "./session";

/**
 * Three park scenarios as data on the shared mission runtime
 * (`@jgengine/core/mission/mission`): each one is a timed `survive` objective whose branches read
 * the park's own facts at the close, plus the fail states that end a run early. Nothing here is a
 * second state machine - the runtime owns the goals, the countdown, the fail states and the save.
 */

export interface ScenarioDef {
  id: string;
  title: string;
  blurb: string;
  /** What the park must be true at the close. */
  goal: string;
  /** Money the park opens with. */
  cash: number;
  mission: MissionDef;
}

/** Facts the runtime reads from the park every tick. */
export interface ScenarioFacts {
  cash: number;
  rating: number;
  mood: number;
  visitors: number;
  revenue: number;
  day: number;
}

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: "opening_weekend",
    title: "Opening Weekend",
    blurb: "Two days, one quiet seaside fair, and a gate that has to earn its keep.",
    goal: "Take $2,000 across two days",
    cash: 6000,
    mission: {
      id: "opening_weekend",
      title: "Opening Weekend",
      description: "Take $2,000 at the gate across two days without running out of cash.",
      fail: [
        { id: "broke", message: "The till ran dry before the weekend was out." },
        { id: "short", message: "The weekend closed short of $2,000." },
      ],
      objectives: [
        {
          id: "weekend",
          kind: "survive",
          label: "Take $2,000 across two days",
          duration: DAY_LENGTH * 2,
          failOn: [{ kind: "fact", fact: "cash", atMost: 0, to: "broke", message: "The till ran dry." }],
          branches: [
            { to: "done", when: { fact: "revenue", atLeast: 2000 }, label: "Weekend target met" },
            { to: "short", when: { fact: "revenue" }, label: "Weekend target missed" },
          ],
        },
      ],
      rewards: { economy: { cash: 1500 } },
    },
  },
  {
    id: "star_attraction",
    title: "Star Attraction",
    blurb: "Three days to turn a handful of rides into a 420-star park people talk about.",
    goal: "Reach a 420 star rating by the end of day three",
    cash: 7000,
    mission: {
      id: "star_attraction",
      title: "Star Attraction",
      description: "Reach a park rating of 420 within three days with guests still smiling.",
      fail: [
        { id: "walkout", message: "The crowd turned miserable and stopped coming." },
        { id: "broke", message: "The park ran out of cash chasing the rating." },
        { id: "quiet", message: "Three days gone and the park never became a star attraction." },
      ],
      objectives: [
        {
          id: "season",
          kind: "survive",
          label: "Reach 420 stars by the end of day three",
          duration: DAY_LENGTH * 3,
          failOn: [
            { kind: "fact", fact: "mood", atMost: 20, to: "walkout", message: "Guest mood collapsed below 20%." },
            { kind: "fact", fact: "cash", atMost: 0, to: "broke", message: "The till ran dry." },
          ],
          branches: [
            { to: "done", when: { fact: "rating", atLeast: 420 }, label: "Star attraction" },
            { to: "quiet", when: { fact: "rating" }, label: "Short of 420 stars" },
          ],
        },
      ],
      rewards: { economy: { cash: 2500 } },
    },
  },
  {
    id: "full_house",
    title: "Full House",
    blurb: "One day to pack the midway: eighty visitors through the gate before the lights go down.",
    goal: "Bring 80 visitors through the gate in one day",
    cash: 5000,
    mission: {
      id: "full_house",
      title: "Full House",
      description: "Draw 80 visitors in a single day and keep the till in the black.",
      fail: [
        { id: "broke", message: "The park could not afford the day." },
        { id: "thin", message: "The midway stayed quiet - under 80 visitors came through." },
      ],
      objectives: [
        {
          id: "day",
          kind: "survive",
          label: "Bring 80 visitors through the gate",
          duration: DAY_LENGTH,
          failOn: [{ kind: "fact", fact: "cash", atMost: 0, to: "broke", message: "The till ran dry." }],
          branches: [
            { to: "done", when: { fact: "visitors", atLeast: 80 }, label: "Full house" },
            { to: "thin", when: { fact: "visitors" }, label: "Quiet day" },
          ],
        },
      ],
      rewards: { economy: { cash: 1800 } },
    },
  },
];

export function scenarioDef(id: string): ScenarioDef | null {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

/** Persisted scenario state: which one, and how the run ended. */
export interface ScenarioState {
  id: string;
  /** "won" or "failed" once it is over; null while playing. */
  result: "won" | "failed" | null;
  outcome: string | null;
  reason: string | null;
}

const runtimeSlot: { runtime: MissionRuntime | null } = { runtime: null };

/** One mission runtime for the park, built from the scenario catalog the first time it is asked for. */
export function scenarioRuntime(): MissionRuntime {
  if (runtimeSlot.runtime === null) {
    runtimeSlot.runtime = createMissionRuntime({
      missions: SCENARIOS.map((scenario) => scenario.mission),
      devtoolsName: "park.missions",
    });
  }
  return runtimeSlot.runtime;
}

export function resetScenarios(): void {
  runtimeSlot.runtime?.dispose();
  runtimeSlot.runtime = null;
}

/** The facts the mission branches and fail conditions read, straight from the park. */
export function scenarioFacts(): ScenarioFacts {
  return {
    cash: session.cash,
    rating: session.rating,
    mood: session.happinessAvg,
    visitors: session.scenarioVisitors,
    revenue: session.scenarioRevenue,
    day: session.day,
  };
}

function factsRecord(facts: ScenarioFacts): Record<string, number> {
  return { cash: facts.cash, rating: facts.rating, mood: facts.mood, visitors: facts.visitors, revenue: facts.revenue, day: facts.day };
}

/**
 * Begin a scenario from a fresh park: the previous save is archived, the park is rebuilt from the
 * authored starter placements, and the mission machine starts its clock.
 */
export function beginScenario(ctx: GameContext, id: string): boolean {
  const scenario = scenarioDef(id);
  if (scenario === null) return false;
  resetPark(ctx, { cash: scenario.cash });
  resetScenarios();
  session.scenario = { id, result: null, outcome: null, reason: null };
  session.started = true;
  scenarioRuntime().start(scenario.mission.id);
  setGamePhase(ctx, "playing");
  ctx.time.play();
  syncAmbience(ctx);
  savePark(ctx);
  return true;
}

/** Leave the scenario and keep the park as a free-play sandbox. */
export function endScenario(ctx: GameContext): void {
  if (session.scenario === null) return;
  session.scenario = null;
  session.scenarioVisitors = 0;
  session.scenarioRevenue = 0;
  resetScenarios();
  session.started = true;
  setGamePhase(ctx, "playing");
  ctx.time.play();
  syncAmbience(ctx);
  savePark(ctx);
}

/** Replay the current scenario from a fresh park. */
export function replayScenario(ctx: GameContext): boolean {
  const id = session.scenario?.id;
  if (id === undefined) return false;
  return beginScenario(ctx, id);
}

/**
 * Drive the active scenario: the runtime judges the park's facts, and the park answers its events.
 * A completion pays the authored reward; a failure names the fail state the runtime landed in.
 */
export function tickScenario(ctx: GameContext, dt: number): void {
  const active = session.scenario;
  if (active === null || active.result !== null || !session.started || session.gameOver) return;
  const runtime = scenarioRuntime();
  const events = runtime.tick(dt, { facts: factsRecord(scenarioFacts()) });
  for (const event of events) {
    if (event.kind === "failed") {
      session.scenario = { ...active, result: "failed", outcome: event.state, reason: event.reason };
      ctx.time.pause();
      setGamePhase(ctx, "paused");
      syncAmbience(ctx);
      ctx.game.audio.play("bankrupt");
      savePark(ctx);
      return;
    }
    if (event.kind === "completed") {
      const reward = event.rewards?.economy?.cash ?? 0;
      session.cash += reward;
      session.scenario = { ...active, result: "won", outcome: "done", reason: null };
      ctx.time.pause();
      setGamePhase(ctx, "paused");
      syncAmbience(ctx);
      ctx.game.audio.play("ribbon");
      savePark(ctx);
      return;
    }
    if (event.kind === "objective") {
      ctx.game.notices.push({ text: event.label, tone: "info" });
    }
  }
}

/** The HUD's read of the active run: goal, countdown and result. */
export function scenarioView(): {
  title: string;
  goal: string;
  label: string;
  remaining: number | null;
  duration: number | null;
  result: "won" | "failed" | null;
  reason: string | null;
  facts: ScenarioFacts;
} | null {
  const active = session.scenario;
  if (active === null) return null;
  const def = scenarioDef(active.id);
  if (def === null) return null;
  const view = scenarioRuntime().view();
  const duration = def.mission.objectives[0]?.duration ?? null;
  return {
    title: def.title,
    goal: def.goal,
    label: view?.label ?? def.goal,
    remaining: view?.remaining ?? null,
    duration,
    result: active.result,
    reason: active.reason,
    facts: scenarioFacts(),
  };
}

export function scenarioSnapshot(): MissionRuntimeSnapshot | null {
  return runtimeSlot.runtime?.snapshot() ?? null;
}

export function restoreScenario(mission: MissionRuntimeSnapshot | null): void {
  if (mission === null) return;
  scenarioRuntime().restore(mission);
}
