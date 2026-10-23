import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";

/** The last-sighting circle HHPD is working; `center` is world XZ, `radius` metres. */
export interface SearchAreaSnapshot {
  center: readonly [number, number];
  radius: number;
  lastSeenAt: number;
}

export interface WantedSnapshot {
  heat: number;
  /** Escalation tier, 0 (clean) to {@link MAX_STARS}. */
  stars: number;
  peakStars: number;
  /** What HHPD is doing about it right now. */
  response: "patrol" | "investigate" | "pursue" | "roadblock";
  /** Where the search is, from the last sighting; null while clean. */
  search: SearchAreaSnapshot | null;
}

export const MAX_STARS = 5;
/** Heat at the top tier; the HUD bar is a fraction of this. */
export const MAX_HEAT = MAX_STARS * 100;
export const PURSUIT_STARS = 3;
export const RIVAL_RACER_ID = "race_rival";

export interface RaceSnapshot {
  routeId: string;
  label: string;
  active: boolean;
  checkpoint: number;
  total: number;
  position: number;
  timeSec: number;
  finished: boolean;
  won: boolean;
}

export interface VehicleTelemetry {
  mode: "ground" | "aircraft";
  /** Raw ground/air speed in meters per second; the HUD converts to km/h via `formatSpeed` at the edge. */
  speedMs: number;
  altitude: number;
  verticalSpeed: number;
  gear: number;
  rpm: number;
  stalled: boolean;
  vtol: boolean;
}

export const wantedStore = defineStore<WantedSnapshot | undefined>("harbor.wanted", undefined);
export const drivingStore = defineStore<string | null | undefined>("harbor.driving", undefined);
export const raceStore = defineStore<RaceSnapshot | undefined>("harbor.race", undefined);

export interface Handroll {
  enterVehicle(ctx: GameContext, vehicleId: string): void;
  exitVehicle(ctx: GameContext, force?: boolean): void;
  drivingVehicleId(): string | null;
  carSpeedKmh(): number;
  telemetry(): VehicleTelemetry;
  tick(ctx: GameContext, dt: number): void;
  addHeat(ctx: GameContext, amount: number): void;
  clearWanted(ctx: GameContext): void;
  wanted(): WantedSnapshot;
  startRace(ctx: GameContext): boolean;
  raceActive(): boolean;
  explodeVehicle(ctx: GameContext, vehicleId: string, at: readonly [number, number, number]): void;
}
