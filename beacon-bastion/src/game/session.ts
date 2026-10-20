import type { PathFollowState } from "@jgengine/core/nav/pathFollow";
import { appendFeed } from "@jgengine/core/game/feed";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createSpawnDirectorState, type SpawnDirectorState } from "@jgengine/core/ai/spawnDirector";
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
}

/** A short player-facing line (e.g. why a click was refused) shown briefly over the field. */
export interface Notice {
  id: number;
  text: string;
  at: number;
}

export interface SessionState {
  director: SpawnDirectorState;
  buildQueue: WorkQueueState<TowerBuildSpec, TowerReservation>;
  creeps: Map<string, CreepRuntime>;
  towers: Map<string, TowerRuntime>;
  plotOccupant: Map<string, string | null>;
  selectedTowerId: string | null;
  /** The placed tower whose sell/upgrade panel is open; set by clicking its plot. */
  inspectedTowerId: string | null;
  /** The player releases each wave; living raiders may still be on the approach. */
  waveReady: boolean;
  waveStarted: boolean;
  lastWaveBonus: number;
  notices: Notice[];
  noticeSeq: number;
  gameOver: boolean;
  victory: boolean;
  creepSeq: number;
  towerSeq: number;
}

function freshState(): SessionState {
  const plotOccupant = new Map<string, string | null>();
  for (const plot of BUILD_PLOTS) plotOccupant.set(plot.id, null);
  return {
    director: createSpawnDirectorState(SPAWN_DIRECTOR_CONFIG),
    buildQueue: createWorkQueue<TowerBuildSpec, TowerReservation>(),
    creeps: new Map(),
    towers: new Map(),
    plotOccupant,
    selectedTowerId: null,
    inspectedTowerId: null,
    waveReady: true,
    waveStarted: false,
    lastWaveBonus: 0,
    notices: [],
    noticeSeq: 0,
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

/** Shows `text` over the field; the feed keeps only the newest few so a click spree cannot pile up. */
export function pushNotice(text: string, now: number): void {
  session.noticeSeq += 1;
  session.notices = appendFeed(session.notices, { id: session.noticeSeq, text, at: now }, { limit: 3 });
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
export function gameClockMs(ctx: GameContext): number {
  return ctx.time.now() * 1000;
}

export function currentWaveNumber(): number {
  return session.director.wave + 1;
}

export function wavesComplete(): boolean {
  return session.director.done;
}

export function activeCreepCount(): number {
  return session.creeps.size;
}
