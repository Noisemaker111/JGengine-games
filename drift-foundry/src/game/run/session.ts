import { createGameFeed } from "@jgengine/core/game/feed";
import type { NoticeFeed, NoticeTone } from "@jgengine/core/game/notices";
import { damagedAxis, type VehicleDamageEffectResolved, type VehicleDamageZoneState } from "@jgengine/core/physics/vehicleDamage";
import { defineStore } from "@jgengine/core/store/defineStore";

import { createRunLoop, type RunSettlement } from "@jgengine/core/run/runLoop";

import { activeSurge, compactorGap, compactorZAt, type CompactorPlan, type CompactorSurge } from "../compactor/schedule";
import { lineReading } from "./haul";
import { compactorPlanForShift, rivalsForShift, shiftInfo, SHIFT_TABLE, type ShiftEffect } from "./shifts";
import { readRunState, saveRunState } from "./shiftState";
import { resolveCrusherContact } from "../compactor/contact";
import { partInSlotId, tuningFrom, type KartTuning } from "../parts/build";
import type { DriftFoundryPartDef } from "../parts/catalog";
import { PART_SLOTS, partById, type PartSlotId } from "../parts/catalog";
import { createKartDamage, impactImpulse, noseHitPoint } from "../vehicle/damage";
import { surfaceAt, type SurfaceSample } from "../vehicle/surface";
import { createOpponentField, RIVAL_DEFS, type OpponentField, type RivalBody } from "../race/opponents";
import { createStandings, PLAYER_RACER_ID, type RaceSnapshot, type Standings } from "../race/standings";
import { grantPickup, nearestUncollected, PICKUPS, type PickupDef } from "./pickups";
import { gateSatisfied, inLane, ROUTE_GATES } from "../route/gates";
import { createVehicleController, type DriveAxis, type VehicleController, type VehiclePose } from "../vehicle/controller";
import { EXIT_Z, NEAR_MISS_ENTER, NEAR_MISS_EXIT, RUN_SEED, SPAWN_Z } from "./constants";
import { zoneAt, zoneProgress, type ZoneDef } from "../zones/catalog";
import { browserRecordStorage, completeRun, readRecords, saveRecords, type PersonalBest, type RunRecords, type RecordStorage } from "./records";
import { checkpointParts, readParkedRun, saveParkedRun, type ParkedRun } from "./progress";
import { ESCAPE_BONUS, bankOf, buyPart as buyGaragePart, garageRows, ownedParts, readCareer, SALVAGE_CREDITS, saveCareer, settleRun, standingOf, DRIVER, type CareerSave } from "../career";

/**
 * Where a run stands, in the player's words. It is derived, never stored: a settled run reports the
 * outcome the shared run loop closed it with, and an open run is playing once it has begun.
 */
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
  /** Where the player's kart finished in the four-kart field. */
  place: number;
  fieldSize: number;
  /** Salvage the run carried home, before the line multiplier. */
  carried: number;
  /** What the line paid: 0 on a wreck, 0.5-1.8 on an escape. */
  lineMultiplier: number;
  /** Why the line paid that, one line per term, for the results card. */
  lineNotes: readonly string[];
  /** Credits that reached the bank, or 0 on a wreck. */
  banked: number;
  /** Credits the compactor took, or 0 on an escape. */
  lost: number;
  /** What the next run changes, drawn as this one was settled. */
  nextShift: { id: string; label: string; hint: string } | null;
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
  /** Salvage this run is carrying and would bank on an escape. */
  salvageAtRisk: number;
  /** What this run changes about the yard, or `null` on the honest first run. */
  shift: { id: string; label: string; hint: string } | null;
  /** Runs settled in this career, and the loop's own lifetime totals. */
  runsPlayed: number;
  runSaved: boolean;
  /** Live four-kart standings: the player's place, the lap, and the field order. */
  race: RaceSnapshot;
  /** Where the three yard karts are this tick - the loop poses their entities from this. */
  rivals: readonly RivalBody[];
  /** Career money, standing and the garage's next rung per slot, as the pit screen reads them. */
  career: { credits: number; standing: number; tier: string; garage: ReturnType<typeof garageRows>; saved: boolean };
}

export interface RunSession {
  snapshot(): SessionSnapshot;
  start(): void;
  restart(): void;
  returnToTitle(): void;
  /** Buy the next rung of a slot's ladder; the pit screen re-reads the career from the snapshot. */
  buyPart(slot: PartSlotId): { ok: boolean; reason?: string };
  /** Park the stopped, grounded run where it stands; false when it is moving or airborne. */
  park(): boolean;
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
  let begun = false;
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
  let career: CareerSave = readCareer(storage);
  let careerSaved = true;
  let runSaved = true;
  // The run loop owns what a run carries, what a settled run banks or loses, and the shift the next
  // run draws. The money stays in the career bank; this only decides how much of it arrives. Every
  // carry writes the loop's own state and a checkpoint of the live run, so a reload or a crash
  // mid-run comes back to the haul and the route instead of the pit.
  const loop = createRunLoop<ShiftEffect>({
    seed: RUN_SEED,
    changes: SHIFT_TABLE,
    persist: {
      load: () => readRunState(storage),
      save: (state) => {
        runSaved = saveRunState(state, storage);
      },
    },
  });
  let shift: { id: string; label: string; hint: string } | null = shiftInfo(loop.offer().changeId);
  let compactor: CompactorPlan = compactorPlanForShift(loop.offer().changeId);

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

  function createField(): OpponentField {
    return createOpponentField({
      groundHeightAt,
      defs: rivalsForShift(loop.offer().changeId),
      // A rival's bumper is real: contact moves the player's kart too, without costing either kart the
      // momentum their driver had built up.
      onPlayerKnock: (dx, dz) => {
        vehicle.shove(dx, dz);
        pose = { ...pose, position: [pose.position[0] + dx, pose.position[1], pose.position[2] + dz] };
      },
    });
  }

  // The field and its standings run on the same authored corridor and the same composed handling as
  // the player; `createStandings` wraps the shared race state machine, which owns order, laps and
  // the finish condition. The field is rebuilt per run because a shift can change a rival's line.
  let opponents: OpponentField = createField();
  const standings: Standings = createStandings({
    ...Object.fromEntries(RIVAL_DEFS.map((def) => [def.id, def.name])),
    // Added last so the player starts bottom of the grid, behind all three rivals.
    [PLAYER_RACER_ID]: "YOU",
  });
  const FIELD_SIZE = RIVAL_DEFS.length + 1;
  let announcedPlace = standings.placeOf(PLAYER_RACER_ID);
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

  /**
   * Where the run stands. A settled run reports the outcome the shared run loop closed it with: the
   * readout has no outcome field, and its banked/lost totals cannot tell a zero-haul escape from a
   * zero-haul wreck, so the settlement the loop returned is the only honest answer. `begun` is the
   * one bit the loop cannot know - it opens a run at the pit, before the engine starts.
   */
  function phaseNow(): RunPhase {
    if (outcome !== null) return outcome.kind;
    return begun ? "running" : "start";
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
    loop.carry(SALVAGE_CREDITS);
    // The loop has just written what the kart carries; write where it is too, so the reload resumes
    // the route instead of handing the haul back at the start line.
    checkpointLiveRun();
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

  /** `keepRun` resumes the run already open (a parked checkpoint); otherwise this starts a new one. */
  function reset(keepRun = false): void {
    begun = false;
    paused = false;
    runTime = 0;
    installed = ownedParts(career);
    // Salvage a run still carried when the player walks away from it is gone, and the run counts.
    if (!keepRun) {
      if (loop.haul() > 0) loop.settle("lost");
      loop.start();
    }
    shift = shiftInfo(loop.offer().changeId);
    compactor = compactorPlanForShift(loop.offer().changeId);
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
    opponents = createField();
    standings.reset();
    announcedPlace = standings.placeOf(PLAYER_RACER_ID);
  }

  reset(parkedRun !== null);

  /** The live run as the pit would restore it: parts, route, clocks, haul-side details. */
  function checkpointNow(): ParkedRun {
    return { version: 1, position: pose.position, heading: pose.heading, runTime, partIds: installed.map(entry => entry.id), collectedIds: [...collected], gateIds: [...gateAnnounced], armorSaveArmed, armorSavesUsed, nearMissCount, closestGap: Number.isFinite(closestGap) ? closestGap : 0, wasNear, announcedSurge };
  }

  /**
   * Write the checkpoint the loop's own persistence hook fires on each carry, so a reload finds the
   * route too. A pause or a banner is not written: only what the run has already earned.
   */
  function checkpointLiveRun(): void {
    if (phaseNow() !== "running" || runTime <= 0) return;
    const checkpoint = checkpointNow();
    if (saveParkedRun(checkpoint, storage)) parkedRun = checkpoint;
  }

  function parkRun(): void {
    if (phaseNow() !== "running" || pose.airborne || pose.speedKmh > 0.1 || runTime <= 0) return;
    const checkpoint: ParkedRun = checkpointNow();
    if (saveParkedRun(checkpoint, storage)) {
      parkedRun = checkpoint;
      // The salvage in the kart's hold is part of the parked run; the loop has already written it, and
      // this keeps an explicit park in step with an autosaved one.
      runSaved = saveRunState(loop.snapshot(), storage);
      notify("PARKED RUN SAVED — CONTINUE FROM THE PIT", "success");
    }
    else notify("THIS BROWSER COULD NOT SAVE YOUR PARKED RUN", "warn");
  }

  function recordOutcome(settlement: RunSettlement<ShiftEffect>): void {
    const completed = completeRun(records, { kind: outcome?.kind === "won" ? "won" : "crushed", time: runTime, distance: Math.min(EXIT_Z, pose.position[2]) });
    records = completed.records;
    personalBest = completed.personalBest;
    recordsSaved = saveRecords(records, storage);
    // What the loop settled is the whole payment: an escape banks its line-scaled salvage, a wreck
    // carries its salvaged haul into the bank's lost counter and leaves the banked credits alone.
    career = settleRun(career, {
      kind: outcome?.kind === "won" ? "escape" : "crushed",
      place: standings.placeOf(PLAYER_RACER_ID),
      haul: outcome?.kind === "won" ? settlement.banked : settlement.lost,
    });
    careerSaved = saveCareer(career, storage);
    runSaved = saveRunState(loop.snapshot(), storage);
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
        phase: phaseNow(),
        runTime,
        pose,
        zone: zoneAt(pose.position[2]),
        progress: zoneProgress(pose.position[2]),
        compactorZ: compactorZAt(runTime, compactor),
        compactorGap: compactorGap(pose.position[2], compactorZAt(runTime, compactor)),
        compactorSurge: activeSurge(runTime, compactor),
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
        salvageAtRisk: loop.haul(),
        shift,
        runsPlayed: loop.snapshot().completed,
        runSaved,
        race: standings.snapshot(),
        rivals: opponents.bodies(),
        career: {
          credits: bankOf(career).banked(),
          standing: standingOf(career).standing(DRIVER, "yard"),
          tier: standingOf(career).tier(DRIVER, "yard").id,
          garage: garageRows(career),
          saved: careerSaved,
        },
      };
    },
    start() {
      if (phaseNow() === "start") {
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
        begun = true;
        if (parkedRun === null) pushRadio("BOLT IT ON, GO GO");
      }
    },
    buyPart(slot) {
      try {
        career = buyGaragePart(career, slot);
        careerSaved = saveCareer(career, storage);
        if (phaseNow() === "start") {
          installed = ownedParts(career);
          rebuildTuning();
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: (error as Error).message };
      }
    },
    restart() {
      parkedRun = null;
      saveParkedRun(null, storage);
      reset();
      begun = true;
      pushRadio("BOLT IT ON, GO GO");
    },
    returnToTitle() { parkRun(); reset(parkedRun !== null); },
    park() { parkRun(); return parkedRun !== null; },
    togglePause() { if (phaseNow() === "running") { if (!paused) parkRun(); paused = !paused; } },
    suspend(value) { suspended = value; },
    tick(dt, axis, input) {
      if (phaseNow() !== "running" || paused || suspended) return;
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

      // The field races the same corridor every tick, then the shared race state machine re-orders
      // the four karts from their positions and tells us if the player's place changed. Its lap timer
      // is the shared wall clock, so the HUD's lap time and the results screen's splits are one source.
      opponents.tick(dt, pose.position);
      standings.tick(dt);
      standings.update(runTime, { [PLAYER_RACER_ID]: pose.position, ...opponents.positions() });
      const place = standings.placeOf(PLAYER_RACER_ID);
      if (place !== announcedPlace) {
        pushRadio(place < announcedPlace ? `P${place} OF ${FIELD_SIZE} — TOOK HIM` : `P${place} OF ${FIELD_SIZE} — PASSED`);
        announcedPlace = place;
      }

      const compactorZ = compactorZAt(runTime, compactor);
      const surge = activeSurge(runTime, compactor);
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
        const settlement = loop.settle("lost");
        outcome = {
          kind: "crushed",
          time: runTime,
          partsOnExit: installed.length,
          nearMisses: nearMissCount,
          closestGap: Number.isFinite(closestGap) ? closestGap : 0,
          armorSaves: armorSavesUsed,
          zoneLabel: zoneAt(pose.position[2]).label,
          place: standings.placeOf(PLAYER_RACER_ID),
          fieldSize: FIELD_SIZE,
          carried: settlement.haul,
          lineMultiplier: 0,
          lineNotes: [],
          banked: settlement.banked,
          lost: settlement.lost,
          nextShift: shiftInfo(settlement.next.changeId),
        };
        recordOutcome(settlement);
        return;
      }

      if (pose.position[2] >= EXIT_Z) {
        // The gate bonus is part of what the run carried, so the line is paid on the whole haul.
        loop.carry(ESCAPE_BONUS);
        const place = standings.placeOf(PLAYER_RACER_ID);
        const line = lineReading({
          barriers: gateAnnounced.size,
          place,
          time: runTime,
          damageStage: Math.max(0, ...damage.zones().map((zone) => zone.stage)),
          armorSaves: armorSavesUsed,
        });
        const settlement = loop.settle("banked", line.multiplier);
        outcome = {
          kind: "won",
          time: runTime,
          partsOnExit: installed.length,
          nearMisses: nearMissCount,
          closestGap: Number.isFinite(closestGap) ? closestGap : 0,
          armorSaves: armorSavesUsed,
          zoneLabel: zoneAt(pose.position[2]).label,
          place,
          fieldSize: FIELD_SIZE,
          carried: settlement.haul,
          lineMultiplier: line.multiplier,
          lineNotes: line.notes,
          banked: settlement.banked,
          lost: settlement.lost,
          nextShift: shiftInfo(settlement.next.changeId),
        };
        recordOutcome(settlement);
      }
    },
  };
}

export const ALL_PICKUP_COUNT = PICKUPS.length;
