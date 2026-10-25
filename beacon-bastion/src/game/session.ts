import type { PathFollowState } from "@jgengine/core/nav/pathFollow";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { BossState } from "@jgengine/core/ai/director/boss";
import type { Encounter } from "@jgengine/core/ai/director/encounter";
import type { PressurePlan } from "@jgengine/core/ai/director/pressure";
import { createStats, type Stats } from "@jgengine/core/stats/statModifiers";
import { createEncounter } from "@jgengine/core/ai/director/encounter";
import { evaluatePressure } from "@jgengine/core/ai/director/pressure";

import { DIRECTOR_SEED, ENCOUNTER } from "./waves/manifest";

export interface CreepRuntime {
  instanceId: string;
  catalogId: string;
  path: PathFollowState;
  speedStats: Stats<"speed">;
}

/** The boss on the field, if it is out: its instance, what it is, phase state, and the stance that phase sets. */
export interface BossRuntime {
  instanceId: string;
  unitId: string;
  state: BossState;
  stance: string;
}

/**
 * The real-time half of a defense: the wave director, raiders mid-route and tower aim. Gold, lives,
 * plots, towers, builds and the run's flags live in the keep's world (`keep.ts`).
 */
export interface SessionState {
  /** The authored raider host and how far through it the run is. */
  encounter: Encounter;
  /** What the director read when the current wave opened, so the HUD can say how hard it is leaning. */
  pressure: PressurePlan;
  /** The Warden, once it walks. */
  boss: BossRuntime | null;
  /** Unit ids the open wave sent, pressure additions included, in entry order. */
  openingComposition: string[];
  creeps: Map<string, CreepRuntime>;
  /** Seconds until each standing tower may fire again: aim state, not keep state. */
  towerCooldowns: Map<string, number>;
  /** The tower card picked in the build bar; local to this player's screen. */
  selectedTowerId: string | null;
  /** The placed tower whose sell/upgrade panel is open; set by clicking its plot. */
  inspectedTowerId: string | null;
  creepSeq: number;
}

function freshState(): SessionState {
  return {
    encounter: createEncounter({ definition: ENCOUNTER, seed: DIRECTOR_SEED }),
    pressure: evaluatePressure({ health: 1, progress: 0, elapsed: 0 }),
    boss: null,
    openingComposition: [],
    creeps: new Map(),
    towerCooldowns: new Map(),
    selectedTowerId: null,
    inspectedTowerId: null,
    creepSeq: 0,
  };
}

export let session: SessionState = freshState();

export function resetSession(): void {
  session = freshState();
}

export function nextCreepInstanceId(): string {
  session.creepSeq += 1;
  return `creep-${session.creepSeq}`;
}

export function newSpeedStats(baseSpeed: number): Stats<"speed"> {
  return createStats<"speed">({ speed: baseSpeed });
}

/** Game clock in milliseconds — the unit `Stats` expiry (`expiresAtMs`) is written and read in. */
export function gameClockMs(ctx: GameContext): number {
  return ctx.time.now() * 1000;
}

export function currentWaveNumber(): number {
  return session.encounter.view().wave;
}

export function wavesComplete(): boolean {
  return session.encounter.view().done;
}

export function activeCreepCount(): number {
  return session.creeps.size;
}
