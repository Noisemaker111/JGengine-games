import type { InstalledPart } from "@jgengine/core/item/modularItem";
import { swapPart } from "../parts/build";
import { partById } from "../parts/catalog";
import { ROUTE_GATES } from "../route/gates";
import { CORRIDOR_DRIVE_HALF_WIDTH, EXIT_Z, SPAWN_Z } from "./constants";
import { PICKUPS } from "./pickups";
import type { RecordStorage } from "./records";

export const PROGRESS_KEY = "drift-foundry.parked-run.v1";
export interface ParkedRun {
  version: 1;
  position: readonly [number, number, number];
  heading: number;
  runTime: number;
  partIds: string[];
  collectedIds: string[];
  gateIds: string[];
  armorSaveArmed: boolean;
  armorSavesUsed: number;
  nearMissCount: number;
  closestGap: number;
  wasNear: boolean;
  announcedSurge: string | null;
}

export function checkpointParts(run: ParkedRun): readonly InstalledPart[] {
  let installed: readonly InstalledPart[] = [];
  for (const id of run.partIds) installed = swapPart(installed, partById(id)!).installed;
  return installed;
}

/** Checkpoints represent a grounded, stopped buggy, never a reconstructed moving physics state. */
export function readParkedRun(storage?: RecordStorage): ParkedRun | null {
  try {
    const run = JSON.parse(storage?.getItem(PROGRESS_KEY) ?? "null");
    const nonnegative = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
    const ids = (value: unknown, known: ReadonlySet<string>) => Array.isArray(value) && value.every(id => typeof id === "string" && known.has(id)) && new Set(value).size === value.length;
    if (!run || run.version !== 1 || !Array.isArray(run.position) || run.position.length !== 3 || !run.position.every((value: unknown) => typeof value === "number" && Number.isFinite(value)) || Math.abs(run.position[0]) > CORRIDOR_DRIVE_HALF_WIDTH || run.position[2] < SPAWN_Z || run.position[2] >= EXIT_Z || !Number.isFinite(run.heading) || !nonnegative(run.runTime) || run.runTime === 0) return null;
    if (!ids(run.collectedIds, new Set(PICKUPS.map(p => p.id))) || !ids(run.gateIds, new Set(ROUTE_GATES.map(g => g.id))) || !Array.isArray(run.partIds) || run.partIds.some((id: unknown) => typeof id !== "string" || !partById(id))) return null;
    const categories = run.partIds.map((id: string) => partById(id)!.category);
    if (new Set(categories).size !== categories.length || run.partIds.some((id: string) => !PICKUPS.some(p => p.partId === id && run.collectedIds.includes(p.id)))) return null;
    if (typeof run.armorSaveArmed !== "boolean" || typeof run.wasNear !== "boolean" || !nonnegative(run.armorSavesUsed) || !Number.isInteger(run.armorSavesUsed) || !nonnegative(run.nearMissCount) || !Number.isInteger(run.nearMissCount) || !nonnegative(run.closestGap) || !(run.announcedSurge === null || typeof run.announcedSurge === "string")) return null;
    if (checkpointParts(run).length !== run.partIds.length) return null;
    return run;
  } catch { return null; }
}

export function saveParkedRun(run: ParkedRun | null, storage?: RecordStorage): boolean {
  if (!storage) return false;
  try { storage.setItem(PROGRESS_KEY, JSON.stringify(run)); return true; }
  catch { return false; }
}
