import { createGameFeed } from "@jgengine/core/game/feed";
import { createToastQueue, type Toast } from "@jgengine/core/game/toasts";
import type { InstalledPart } from "@jgengine/core/item/modularItem";
import { defineStore } from "@jgengine/core/store/defineStore";

import { activeSurge, compactorGap, compactorZAt, type CompactorSurge } from "../compactor/schedule";
import { resolveCrusherContact } from "../compactor/contact";
import { partInSlotId, tuningFrom, swapPart, type KartTuning } from "../parts/build";
import { partById, PART_SLOTS, type PartSlotId, type DriftFoundryPartDef } from "../parts/catalog";
import { nearestUncollected, PICKUPS, type PickupDef } from "./pickups";
import { gateSatisfied, inLane, ROUTE_GATES } from "../route/gates";
import { createVehicleController, type DriveAxis, type VehicleController, type VehiclePose } from "../vehicle/controller";
import { EXIT_Z, NEAR_MISS_ENTER, NEAR_MISS_EXIT, SPAWN_Z } from "./constants";
import { zoneAt, zoneProgress, type ZoneDef } from "../zones/catalog";
import { browserRecordStorage, readRecords, saveRecords, type RunRecords, type RecordStorage } from "./records";

export type RunPhase = "start" | "running" | "won" | "crushed";

export interface RadioLine {
  id: number;
  text: string;
}

export interface RunOutcome {
  kind: "won" | "crushed";
  time: number;
  partsOnExit: number;
  nearMisses: number;
  closestGap: number;
  armorSaves: number;
  zoneLabel: string;
}

export interface SessionSnapshot {
  paused: boolean;
  records: RunRecords;
  recordsSaved: boolean;
  clearedGateIds: ReadonlySet<string>;
  phase: RunPhase;
  runTime: number;
  pose: VehiclePose;
  zone: ZoneDef;
  progress: number;
  compactorZ: number;
  compactorGap: number;
  compactorSurge: CompactorSurge | null;
  installed: Readonly<Record<PartSlotId, DriftFoundryPartDef | null>>;
  tuning: KartTuning;
  toast: Toast<string> | null;
  ticker: readonly RadioLine[];
  nearMissCount: number;
  closestGap: number;
  armorSaveArmed: boolean;
  armorSavesUsed: number;
  outcome: RunOutcome | null;
  collectedIds: ReadonlySet<string>;
}

export interface RunSession {
  snapshot(): SessionSnapshot;
  start(): void;
  restart(): void;
  returnToTitle(): void;
  togglePause(): void;
  suspend(value: boolean): void;
  tick(dt: number, axis: DriveAxis, input: { jumpPressed: boolean; plowBracing: boolean }): void;
}

export const runSessionStore = defineStore<RunSession>("runSession", () => createRunSession());

const SPAWN_POSITION: readonly [number, number, number] = [0, 0, SPAWN_Z];
const SPAWN_HEADING = 0;
const TICKER_LIMIT = 6;
const TOAST_HOLD_SECONDS = 3.2;

export function createRunSession(groundHeightAt: (x: number, z: number) => number = () => 0, storage: RecordStorage | undefined = browserRecordStorage()): RunSession {
  let phase: RunPhase = "start";
  let paused = false;
  let suspended = false;
  let records = readRecords(storage);
  let recordsSaved = true;
  let runTime = 0;
  let installed: readonly InstalledPart[] = [];
  let collected = new Set<string>();
  let gateAnnounced = new Set<string>();
  let announcedSurge: string | null = null;
  let armorSaveArmed = false;
  let armorSavesUsed = 0;
  let nearMissCount = 0;
  let wasNear = false;
  let closestGap = Number.POSITIVE_INFINITY;
  const toastQueue = createToastQueue<string>({ cap: 1, ttlSeconds: TOAST_HOLD_SECONDS });
  const radioFeed = createGameFeed({ limit: TICKER_LIMIT });
  let radioCounter = 0;
  let outcome: RunOutcome | null = null;

  const vehicle: VehicleController = createVehicleController({ position: SPAWN_POSITION, heading: SPAWN_HEADING });
  let pose: VehiclePose = {
    position: SPAWN_POSITION,
    heading: SPAWN_HEADING,
    speedKmh: 0,
    airborne: false,
    blockedByGate: false,
  };

  function pushRadio(text: string): void {
    radioCounter += 1;
    radioFeed.push("radio", { id: radioCounter, text });
  }

  function pushToast(message: string): void {
    toastQueue.push(message, runTime);
  }

  function installedBySlot(): Record<PartSlotId, DriftFoundryPartDef | null> {
    const result = {} as Record<PartSlotId, DriftFoundryPartDef | null>;
    for (const slot of PART_SLOTS) {
      const id = partInSlotId(installed, slot);
      result[slot] = id === null ? null : partById(id);
    }
    return result;
  }

  function applyPickup(): void {
    const found: PickupDef | null = nearestUncollected(pose.position, collected);
    if (found === null) return;
    collected.add(found.id);
    const part = partById(found.partId);
    if (part === null) return;
    const { installed: nextInstalled, ejected } = swapPart(installed, part);
    installed = nextInstalled;
    pushToast(part.radioLine);
    pushRadio(part.radioLine);
    if (ejected !== null) pushRadio(`${ejected.label.toUpperCase()} FLEW OFF THE BACK`);
    if (part.stats.armor > 0) armorSaveArmed = true;
  }

  function announceGates(): void {
    const tuning = tuningFrom(installed);
    for (const gate of ROUTE_GATES) {
      if (gateAnnounced.has(gate.id)) continue;
      if (!inLane(pose.position[0], gate.laneX)) continue;
      if (pose.position[2] <= gate.atZ) continue;
      if (!gateSatisfied(gate, tuning)) continue;
      gateAnnounced.add(gate.id);
      pushRadio(gate.radioLine);
    }
  }

  function reset(): void {
    phase = "start";
    paused = false;
    runTime = 0;
    installed = [];
    collected = new Set<string>();
    gateAnnounced = new Set<string>();
    announcedSurge = null;
    armorSaveArmed = false;
    armorSavesUsed = 0;
    nearMissCount = 0;
    wasNear = false;
    closestGap = Number.POSITIVE_INFINITY;
    toastQueue.clear();
    radioFeed.hydrate({});
    outcome = null;
    vehicle.resetTo(SPAWN_POSITION, SPAWN_HEADING);
    pose = { position: SPAWN_POSITION, heading: SPAWN_HEADING, speedKmh: 0, airborne: false, blockedByGate: false };
  }

  reset();

  function recordOutcome(): void {
    records = { ...records, attempts: records.attempts + 1, farthest: Math.max(records.farthest, Math.min(EXIT_Z, pose.position[2])) };
    if (phase === "won") {
      records.escapes += 1;
      records.bestTime = records.bestTime === null ? runTime : Math.min(records.bestTime, runTime);
    }
    recordsSaved = saveRecords(records, storage);
  }

  return {
    snapshot() {
      return {
        paused: paused || suspended,
        records,
        recordsSaved,
        clearedGateIds: gateAnnounced,
        phase,
        runTime,
        pose,
        zone: zoneAt(pose.position[2]),
        progress: zoneProgress(pose.position[2]),
        compactorZ: compactorZAt(runTime),
        compactorGap: compactorGap(pose.position[2], compactorZAt(runTime)),
        compactorSurge: activeSurge(runTime),
        installed: installedBySlot(),
        tuning: tuningFrom(installed),
        toast: toastQueue.list()[0] ?? null,
        ticker: radioFeed.recent("radio").map((entry) => entry.data as RadioLine),
        nearMissCount,
        closestGap: Number.isFinite(closestGap) ? closestGap : 0,
        armorSaveArmed,
        armorSavesUsed,
        outcome,
        collectedIds: collected,
      };
    },
    start() {
      if (phase === "start") {
        phase = "running";
        pushRadio("BOLT IT ON, GO GO");
      }
    },
    restart() {
      reset();
      phase = "running";
      pushRadio("BOLT IT ON, GO GO");
    },
    returnToTitle() { reset(); },
    togglePause() { if (phase === "running") paused = !paused; },
    suspend(value) { suspended = value; },
    tick(dt, axis, input) {
      if (phase !== "running" || paused || suspended) return;
      // A resumed/background tab cannot advance the crusher by a large wall-clock delta.
      dt = Math.max(0, Math.min(dt, 0.05));
      runTime += dt;

      const tuning = tuningFrom(installed);
      pose = vehicle.tick(dt, axis, tuning, input, groundHeightAt);

      applyPickup();
      announceGates();
      toastQueue.prune(runTime);

      const compactorZ = compactorZAt(runTime);
      const surge = activeSurge(runTime);
      if (surge !== null && surge.id !== announcedSurge) {
        announcedSurge = surge.id;
        pushRadio(surge.label);
      }

      const gap = compactorGap(pose.position[2], compactorZ);
      if (gap < closestGap) closestGap = gap;
      if (!wasNear && gap < NEAR_MISS_ENTER) {
        wasNear = true;
        nearMissCount += 1;
        pushRadio("TOO CLOSE, TOO CLOSE");
      } else if (wasNear && gap > NEAR_MISS_EXIT) {
        wasNear = false;
      }

      const contact = resolveCrusherContact(pose.position[2], compactorZ, armorSaveArmed);
      if (contact.outcome === "saved") {
        armorSaveArmed = false;
        armorSavesUsed += 1;
        vehicle.resetTo([pose.position[0], pose.position[1], contact.reboundZ], pose.heading);
        pose = { ...pose, position: [pose.position[0], pose.position[1], contact.reboundZ] };
        pushToast("ARMOR PLATE SAVED YOUR HIDE");
        pushRadio("ARMOR PLATE TOOK THE HIT — KEEP MOVING");
      } else if (contact.outcome === "crushed") {
        phase = "crushed";
        outcome = {
          kind: "crushed",
          time: runTime,
          partsOnExit: installed.length,
          nearMisses: nearMissCount,
          closestGap: Number.isFinite(closestGap) ? closestGap : 0,
          armorSaves: armorSavesUsed,
          zoneLabel: zoneAt(pose.position[2]).label,
        };
        recordOutcome();
        return;
      }

      if (pose.position[2] >= EXIT_Z) {
        phase = "won";
        outcome = {
          kind: "won",
          time: runTime,
          partsOnExit: installed.length,
          nearMisses: nearMissCount,
          closestGap: Number.isFinite(closestGap) ? closestGap : 0,
          armorSaves: armorSavesUsed,
          zoneLabel: zoneAt(pose.position[2]).label,
        };
        recordOutcome();
      }
    },
  };
}

export const ALL_PICKUP_COUNT = PICKUPS.length;
