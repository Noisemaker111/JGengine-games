import type { PathFollowState } from "@jgengine/core/nav/pathFollow";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  createSpawnDirectorState,
  type SpawnDirectorState,
} from "@jgengine/core/ai/spawnDirector";
import { createStats, type Stats } from "@jgengine/core/stats/statModifiers";
import { createWorkQueue, type WorkQueueState } from "@jgengine/core/gameplay";

import type { TowerBuildSpec, TowerReservation } from "./build/construction";
import { BUILD_PLOTS } from "./world/path";
import { SPAWN_DIRECTOR_CONFIG } from "./waves/manifest";

export interface CreepRuntime {
  instanceId: string;
  catalogId: string;
  path: PathFollowState;
  speedStats: Stats<"speed">;
}

export interface TowerRuntime {
  instanceId: string;
  catalogId: string;
  plotId: string;
  level: number;
  cooldownSeconds: number;
  branch?: "power" | "reach";
  priority?: "first" | "last" | "strongest";
}

export interface SessionState {
  combatSeconds: number;
  paused: boolean;
  planning: boolean;
  waveIndex: number;
  reserve: number;
  rallySeconds: number;
  rallyCooldown: number;
  leaksThisWave: number;
  lastReport: string;
  savedMessage: string;
  director: SpawnDirectorState;
  buildQueue: WorkQueueState<TowerBuildSpec, TowerReservation>;
  creeps: Map<string, CreepRuntime>;
  towers: Map<string, TowerRuntime>;
  plotOccupant: Map<string, string | null>;
  selectedTowerId: string | null;
  /** The placed tower whose sell/upgrade panel is open; set by clicking its plot. */
  inspectedTowerId: string | null;
  gameOver: boolean;
  victory: boolean;
  creepSeq: number;
  towerSeq: number;
}

function freshState(): SessionState {
  const plotOccupant = new Map<string, string | null>();
  for (const plot of BUILD_PLOTS) plotOccupant.set(plot.id, null);
  return {
    combatSeconds: 0,
    paused: false,
    planning: true,
    waveIndex: 0,
    reserve: 40,
    rallySeconds: 0,
    rallyCooldown: 0,
    leaksThisWave: 0,
    lastReport: "Build a defense, then send the first wave.",
    savedMessage: "",
    director: createSpawnDirectorState(SPAWN_DIRECTOR_CONFIG),
    buildQueue: createWorkQueue<TowerBuildSpec, TowerReservation>(),
    creeps: new Map(),
    towers: new Map(),
    plotOccupant,
    selectedTowerId: null,
    inspectedTowerId: null,
    gameOver: false,
    victory: false,
    creepSeq: 0,
    towerSeq: 0,
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

export function nextTowerInstanceId(): string {
  session.towerSeq += 1;
  return `tower-${session.towerSeq}`;
}

export function newSpeedStats(baseSpeed: number): Stats<"speed"> {
  return createStats<"speed">({ speed: baseSpeed });
}

/** Game clock in milliseconds — the unit `Stats` expiry (`expiresAtMs`) is written and read in. */
export function gameClockMs(_ctx: GameContext): number {
  return session.combatSeconds * 1000;
}

export function currentWaveNumber(): number {
  return session.waveIndex + 1;
}

export function wavesComplete(): boolean {
  return session.victory;
}

export function activeCreepCount(): number {
  return session.creeps.size;
}

export function snapshotSession() {
  return structuredClone({
    ...session,
    towers: [...session.towers.entries()],
    creeps: [...session.creeps.entries()].map(
      ([id, creep]) =>
        [id, { ...creep, speedStats: creep.speedStats.snapshot() }] as const,
    ),
    plotOccupant: [...session.plotOccupant.entries()],
  });
}

export function restoreSession(raw: unknown): void {
  const saved = raw as ReturnType<typeof snapshotSession>;
  if (
    !saved ||
    !Array.isArray(saved.towers) ||
    !Array.isArray(saved.creeps) ||
    !Array.isArray(saved.plotOccupant)
  )
    throw new Error("Invalid Bastion save");
  session = {
    ...saved,
    towers: new Map(saved.towers),
    plotOccupant: new Map(saved.plotOccupant),
    creeps: new Map(
      saved.creeps.map(([id, creep]) => {
        const speedStats = newSpeedStats(creep.speedStats.base.speed);
        speedStats.restore(creep.speedStats);
        return [id, { ...creep, speedStats }];
      }),
    ),
    paused: true,
    savedMessage: "Loaded. Resume when ready.",
  };
}
