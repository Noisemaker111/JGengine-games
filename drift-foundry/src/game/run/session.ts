import { createGameFeed } from "@jgengine/core/game/feed";
import type { NoticeFeed, NoticeTone } from "@jgengine/core/game/notices";
import { damagedAxis, type VehicleDamageEffectResolved, type VehicleDamageZoneState } from "@jgengine/core/physics/vehicleDamage";
import { defineStore } from "@jgengine/core/store/defineStore";

import { activeSurge, compactorGap, compactorZAt, type CompactorSurge } from "../compactor/schedule";
import { resolveCrusherContact } from "../compactor/contact";
import { partInSlotId, tuningFrom, type KartTuning } from "../parts/build";
import type { DriftFoundryPartDef } from "../parts/catalog";
import { PART_SLOTS, partById, type PartSlotId } from "../parts/catalog";
import { createKartDamage, impactImpulse, noseHitPoint } from "../vehicle/damage";
import { surfaceAt, type SurfaceSample } from "../vehicle/surface";
import { grantPickup, nearestUncollected, PICKUPS, type PickupDef } from "./pickups";
import { gateSatisfied, inLane, ROUTE_GATES } from "../route/gates";
import { createVehicleController, type DriveAxis, type VehicleController, type VehiclePose } from "../vehicle/controller";
import { EXIT_Z, NEAR_MISS_ENTER, NEAR_MISS_EXIT, SPAWN_Z } from "./constants";
import { zoneAt, zoneProgress, type ZoneDef } from "../zones/catalog";
import { browserRecordStorage, completeRun, readRecords, saveRecords, type PersonalBest, type RunRecords, type RecordStorage } from "./records";
import { checkpointParts, readParkedRun, saveParkedRun, type ParkedRun } from "./progress";

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
  personalBest: PersonalBest;
  parkedRun: ParkedRun | null;
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
  /** Ground under the kart: which yard, and how much grip it is giving. */
  surface: SurfaceSample;
  /** Front-corner damage, one entry per authored zone - a bent nose reads here and in `tuning.feel`. */
  damage: readonly VehicleDamageZoneState[];
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
  tick(dt: number, axis: DriveAxis, input: { jumpPressed: boolean; plowBracing: boolean; salvageSwap?: boolean }): void;
}

export const runSessionStore = defineStore<RunSession>("runSession", () => createRunSession());

const SPAWN_POSITION: readonly [number, number, number] = [0, 0, SPAWN_Z];
const SPAWN_HEADING = 0;
const TICKER_LIMIT = 6;

/** `notices` is the game's shared feed (`ctx.game.notices`); pickups, saves and armor saves surface there. */
export function createRunSession(
  groundHeightAt: (x: number, z: number) => number = () => 0,
  storage: RecordStorage | undefined = browserRecordStorage(),
  notices?: Pick<NoticeFeed, "push">,
): RunSession {
  let phase: RunPhase = "start";
  let paused = false;
  let suspended = false;
  let records = readRecords(storage);
  let recordsSaved = true;
  let personalBest: PersonalBest = "unchanged";
  let parkedRun = readParkedRun(storage);
  let runTime = 0;
  let installed: readonly DriftFoundryPartDef[] = [];
  let collected = new Set<string>();
  let gateAnnounced = new Set<string>();
  let announcedSurge: string | null = null;
  let armorSaveArmed = false;
  let armorSavesUsed = 0;
  let nearMissCount = 0;
  let wasNear = false;
  let closestGap = Number.POSITIVE_INFINITY;
  const radioFeed = createGameFeed({ limit: TICKER_LIMIT });
  let radioCounter = 0;
  let outcome: RunOutcome | null = null;

  // Handling is composed from the installed parts and the damage baked into the body, then handed to
  // the sim as one object. The controller retunes by reference, so an installed part or a bent nose
  // changes the numbers without the kart losing its momentum.
  const damage = createKartDamage();
  let damageEffect: VehicleDamageEffectResolved = damage.effect();
  let tuning: KartTuning = tuningFrom(installed);
  /** One barricade hit per approach: pinned against a gate must not grind damage tick after tick. */
  let gateImpactArmed = true;

  function rebuildTuning(): void {
    tuning = tuningFrom(installed, damage.total() > 0 ? damageEffect : undefined);
  }

  const vehicle: VehicleController = createVehicleController({ position: SPAWN_POSITION, heading: SPAWN_HEADING });
  let pose: VehiclePose = {
    position: SPAWN_POSITION,
    heading: SPAWN_HEADING,
    speedKmh: 0,
    slip: 0,
    surface: 1,
    loadGrip: 1,
    airborne: false,
    blockedByGate: false,
  };

  function pushRadio(text: string): void {
    radioCounter += 1;
    radioFeed.push("radio", { id: radioCounter, text });
  }

  function notify(text: string, tone: NoticeTone): void {
    notices?.push({ text, tone });
  }

  function installedBySlot(): Record<PartSlotId, DriftFoundryPartDef | null> {
    const result = {} as Record<PartSlotId, DriftFoundryPartDef | null>;
    for (const slot of PART_SLOTS) {
      const id = partInSlotId(installed, slot);
      result[slot] = id === null ? null : partById(id);
    }
    return result;
  }

  function applyPickup(consent: boolean): void {
    const found: PickupDef | null = nearestUncollected(pose.position, collected);
    if (found === null) return;
    const incoming = partById(found.partId);
    // Preserve safe route-capability lessons; engine/frame swaps are commitments.
    if (incoming !== null && (incoming.slot === "engine" || incoming.slot === "frame") && partInSlotId(installed, incoming.slot) !== null && !consent) return;
    const grant = grantPickup(found, installed, collected);
    if (grant.status !== "accepted") return;
    const { part, ejected } = grant;
    installed = grant.installed;
    rebuildTuning();
    collected.add(found.id);
    notify(part.radioLine, "success");
    pushRadio(part.radioLine);
    if (ejected !== null) pushRadio(`${ejected.label.toUpperCase()} FLEW OFF THE BACK`);
    if ((part.grants?.armor ?? 0) > 0) armorSaveArmed = true;
  }

  function announceGates(): void {
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
    radioFeed.hydrate({});
    outcome = null;
    personalBest = "unchanged";
    damage.reset();
    damageEffect = damage.effect();
    rebuildTuning();
    gateImpactArmed = true;
    vehicle.resetTo(SPAWN_POSITION, SPAWN_HEADING);
    pose = { position: SPAWN_POSITION, heading: SPAWN_HEADING, speedKmh: 0, slip: 0, surface: 1, loadGrip: 1, airborne: false, blockedByGate: false };
  }

  reset();

  function parkRun(): void {
    if (phase !== "running" || pose.airborne || pose.speedKmh > 0.1 || runTime <= 0) return;
    const checkpoint: ParkedRun = { version: 1, position: pose.position, heading: pose.heading, runTime, partIds: installed.map(entry => entry.id), collectedIds: [...collected], gateIds: [...gateAnnounced], armorSaveArmed, armorSavesUsed, nearMissCount, closestGap: Number.isFinite(closestGap) ? closestGap : 0, wasNear, announcedSurge };
    if (saveParkedRun(checkpoint, storage)) { parkedRun = checkpoint; notify("PARKED RUN SAVED — CONTINUE FROM THE PIT", "success"); }
    else notify("THIS BROWSER COULD NOT SAVE YOUR PARKED RUN", "warn");
  }

  function recordOutcome(): void {
    const completed = completeRun(records, { kind: phase === "won" ? "won" : "crushed", time: runTime, distance: Math.min(EXIT_Z, pose.position[2]) });
    records = completed.records;
    personalBest = completed.personalBest;
    recordsSaved = saveRecords(records, storage);
    parkedRun = null;
    saveParkedRun(null, storage);
  }

  return {
    snapshot() {
      return {
        paused: paused || suspended,
        records,
        recordsSaved,
        personalBest,
        parkedRun,
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
        tuning,
        surface: surfaceAt(pose.position[0], pose.position[2]),
        damage: damage.zones(),
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
        if (parkedRun !== null) {
          const checkpoint = parkedRun;
          installed = checkpointParts(checkpoint);
          collected = new Set(checkpoint.collectedIds);
          gateAnnounced = new Set(checkpoint.gateIds);
          runTime = checkpoint.runTime;
          armorSaveArmed = checkpoint.armorSaveArmed;
          armorSavesUsed = checkpoint.armorSavesUsed;
          nearMissCount = checkpoint.nearMissCount;
          closestGap = checkpoint.closestGap;
          wasNear = checkpoint.wasNear;
          announcedSurge = checkpoint.announcedSurge;
          vehicle.resetTo(checkpoint.position, checkpoint.heading);
          pose = { position: checkpoint.position, heading: checkpoint.heading, speedKmh: 0, slip: 0, surface: 1, loadGrip: 1, airborne: false, blockedByGate: false };
          // A parked build is restored undamaged: the checkpoint stores parts, not dents.
          damage.reset();
          damageEffect = damage.effect();
          rebuildTuning();
          pushRadio("PARKED RUN RESTORED — YOUR BUILD IS STILL BOLTED ON");
        }
        phase = "running";
        if (parkedRun === null) pushRadio("BOLT IT ON, GO GO");
      }
    },
    restart() {
      parkedRun = null;
      saveParkedRun(null, storage);
      reset();
      phase = "running";
      pushRadio("BOLT IT ON, GO GO");
    },
    returnToTitle() { parkRun(); reset(); },
    togglePause() { if (phase === "running") { if (!paused) parkRun(); paused = !paused; } },
    suspend(value) { suspended = value; },
    tick(dt, axis, input) {
      if (phase !== "running" || paused || suspended) return;
      // A resumed/background tab cannot advance the crusher by a large wall-clock delta.
      dt = Math.max(0, Math.min(dt, 0.05));
      runTime += dt;

      // A bent frame pulls the wheel on its own; the last stage of a nose zone adds that bias here.
      const approachKmh = pose.speedKmh;
      pose = vehicle.tick(dt, damagedAxis({ ...axis, handbrake: axis.handbrake ?? 0 }, damageEffect), tuning, input, groundHeightAt);

      // A barricade the build cannot clear stops the kart on the nose. One impulse per approach at the
      // approach speed: leaning on a gate afterwards must not keep folding metal.
      if (!pose.blockedByGate) gateImpactArmed = true;
      else if (gateImpactArmed) {
        gateImpactArmed = false;
        const transitions = damage.hit(noseHitPoint(axis.steer), impactImpulse(approachKmh));
        if (transitions.length > 0) {
          damageEffect = damage.effect();
          rebuildTuning();
          notify("FRONT END FOLDED — SHE PULLS WHEN YOU STEER", "warn");
          pushRadio(transitions[0]!.stage >= 2 ? "NOSE IS FOLDED FLAT — BABY HER HOME" : "CLIPPED THE BARRIER — FRONT END'S BENT");
        }
      }

      applyPickup(input.salvageSwap === true);
      announceGates();

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
        notify("ARMOR PLATE SAVED YOUR HIDE", "warn");
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
