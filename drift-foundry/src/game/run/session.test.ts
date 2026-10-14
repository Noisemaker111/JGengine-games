import { describe, expect, test } from "bun:test";

import { steerToward } from "@jgengine/core/movement/steering";

import { EXIT_Z } from "./constants";
import { COMPACTOR_SURGES } from "../compactor/schedule";
import { ROUTE_GATES } from "../route/gates";
import type { RecordStorage } from "./records";
import { PICKUPS } from "./pickups";
import { createRunSession, type RunCue, type RunSession } from "./session";

const DT = 1 / 30;
const PAR_SECONDS = 100;

function shouldJump(session: RunSession): boolean {
  const snap = session.snapshot();
  const next = ROUTE_GATES.find(g => g.atZ >= snap.pose.position[2]);
  return next?.requirement === "jump" && !snap.pose.airborne && next.atZ - snap.pose.position[2] < Math.max(5, snap.pose.speedKmh / 3.6 * .5);
}

function driveStraight(session: RunSession, seconds: number): void {
  let elapsed = 0;
  while (elapsed < seconds) {
    if (session.snapshot().phase !== "running") return;
    session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: shouldJump(session), plowBracing: false });
    elapsed += DT;
  }
}

function steerTowardX(heading: number, dx: number): number {
  const desiredHeading = Math.max(-0.5, Math.min(0.5, dx * 0.03));
  return Math.max(-0.5, Math.min(0.5, steerToward(heading, desiredHeading) * 2));
}

function driveCollectingPickups(session: RunSession, seconds: number): void {
  let elapsed = 0;
  while (elapsed < seconds) {
    const snap = session.snapshot();
    if (snap.phase !== "running") return;
    const target = PICKUPS.find((p) => !snap.collectedIds.has(p.id) && p.position[2] > snap.pose.position[2] - 6);
    const targetX = target?.position[0] ?? 0;
    const steer = steerTowardX(snap.pose.heading, targetX - snap.pose.position[0]);
    session.tick(DT, { throttle: 1, brake: 0, steer }, { jumpPressed: shouldJump(session), plowBracing: false, salvageSwap: true });
    elapsed += DT;
  }
}

describe("drift-foundry run session", () => {
  test("later EV decision reverses the earlier tradeoff: give up truck speed for steering", () => {
    const truck = createRunSession();
    const electric = createRunSession();
    for (const [session, takeElectric] of [[truck, false], [electric, true]] as const) {
      session.start();
      for (let i = 0; i < 3000 && session.snapshot().phase === "running" && session.snapshot().pose.position[2] < 190; i++) {
        session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: shouldJump(session), plowBracing: false, salvageSwap: session.snapshot().pose.position[2] < 70 || takeElectric });
      }
    }
    expect(truck.snapshot().installed.engine?.id).toBe("truck_engine");
    expect(electric.snapshot().installed.engine?.id).toBe("ev_conversion");
    expect(electric.snapshot().tuning.topSpeed).toBeLessThan(truck.snapshot().tuning.topSpeed);
    expect(electric.snapshot().tuning.turnRate).toBeGreaterThan(truck.snapshot().tuning.turnRate);
    // Midair swaps retain momentum. The speed cost becomes tangible after
    // braking for an obstacle, rather than inventing an instantaneous slowdown.
    for (const session of [truck, electric]) {
      for (let i=0;i<60;i++) session.tick(DT, { throttle: 0, brake: 1, steer: 0 }, { jumpPressed: false, plowBracing: false });
      for (let i=0;i<60;i++) session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
    }
    expect(truck.snapshot().pose.speedKmh).toBeGreaterThan(electric.snapshot().pose.speedKmh);
  });
  test("passing keeps the engine; holding swap commits faster, less nimble truck", () => {
    const keep = createRunSession();
    const swap = createRunSession();
    for (const [session, consent] of [[keep, false], [swap, true]] as const) {
      session.start();
      for (let i = 0; i < 1500 && session.snapshot().pose.position[2] < 60; i++) session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false, salvageSwap: consent });
    }
    expect(keep.snapshot().installed.engine?.id).toBe("salvage_v6");
    expect(swap.snapshot().installed.engine?.id).toBe("truck_engine");
    expect(swap.snapshot().tuning.topSpeed).toBeGreaterThan(keep.snapshot().tuning.topSpeed);
    expect(swap.snapshot().tuning.turnRate).toBeLessThan(keep.snapshot().tuning.turnRate);
    expect(keep.snapshot().collectedIds.has("pickup_truck_engine")).toBe(false);
    expect(swap.snapshot().collectedIds.has("pickup_truck_engine")).toBe(true);
  });
  test("holding throttle without jumping stops at the tire stack and loses", () => {
    const session = createRunSession();
    session.start();
    for (let i = 0; i < 3000 && session.snapshot().phase === "running"; i++) {
      session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
    }
    expect(session.snapshot().phase).toBe("crushed");
    expect(session.snapshot().pose.position[2]).toBeLessThanOrEqual(150);
    expect(session.snapshot().clearedGateIds.size).toBe(1);
  });
  test("does nothing while waiting on the start screen", () => {
    const session = createRunSession();
    session.tick(1, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("start");
    expect(snapshot.runTime).toBe(0);
  });

  test("start() enters running and queues the opening pit-radio line", () => {
    const session = createRunSession();
    session.start();
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("running");
    expect(snapshot.ticker[0]?.text).toBe("BOLT IT ON, GO GO");
  });

  test("a centerline run with timed jumps collects the route parts and escapes", () => {
    const session = createRunSession();
    session.start();
    driveStraight(session, PAR_SECONDS);
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("won");
    expect(snapshot.outcome).not.toBeNull();
    expect(snapshot.outcome?.kind).toBe("won");
    expect(snapshot.outcome!.time).toBeLessThan(PAR_SECONDS);
    expect(snapshot.pose.position[2]).toBeGreaterThanOrEqual(EXIT_Z);
    // Reaching the exit is only possible because the run bolted on the plow and jump parts on the way —
    // the corridor is walled by barricades that a bare chassis cannot pass.
    expect(snapshot.tuning.hasPlow).toBe(true);
    expect(snapshot.tuning.jumpPower).toBeGreaterThan(0);
  });

  test("a kart that skips the plow/jump drops is walled in at the first barricade and gets crushed", () => {
    // Drive fast but steer hard to the corridor edge to dodge the centerline part drops. With no plow
    // and no jump the first barricade is an impassable wall, so the compactor eats the kart short of the exit.
    const session = createRunSession();
    session.start();
    let elapsed = 0;
    while (elapsed < PAR_SECONDS && session.snapshot().phase === "running") {
      session.tick(DT, { throttle: 1, brake: 0, steer: 1 }, { jumpPressed: false, plowBracing: false });
      elapsed += DT;
    }
    const snapshot = session.snapshot();
    expect(snapshot.tuning.hasPlow).toBe(false);
    expect(snapshot.tuning.jumpPower).toBe(0);
    expect(snapshot.phase).toBe("crushed");
    expect(snapshot.pose.position[2]).toBeLessThan(EXIT_Z);
  });

  test("an idle kart is caught and crushed by the compactor", () => {
    const session = createRunSession();
    session.start();
    let elapsed = 0;
    while (elapsed < 20 && session.snapshot().phase === "running") {
      session.tick(DT, { throttle: 0, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
      elapsed += DT;
    }
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("crushed");
    expect(snapshot.outcome?.kind).toBe("crushed");
    expect(snapshot.outcome?.zoneLabel).toBeTruthy();
  });

  test("restart fully resets state — no leftover progress, parts, or score", () => {
    const session = createRunSession();
    session.start();
    driveCollectingPickups(session, 6);
    const midRun = session.snapshot();
    expect(midRun.runTime).toBeGreaterThan(0);

    session.restart();
    const afterRestart = session.snapshot();
    expect(afterRestart.phase).toBe("running");
    expect(afterRestart.runTime).toBe(0);
    expect(afterRestart.pose.position[2]).toBeLessThan(10);
    expect(afterRestart.collectedIds.size).toBe(0);
    expect(Object.values(afterRestart.installed).every((part) => part === null)).toBe(true);
    expect(afterRestart.nearMissCount).toBe(0);
    expect(afterRestart.armorSavesUsed).toBe(0);
    expect(afterRestart.outcome).toBeNull();
    expect(afterRestart.ticker[0]?.text).toBe("BOLT IT ON, GO GO");
  });

  test("driving the full route collects most debris and swaps fill every slot", () => {
    const session = createRunSession();
    session.start();
    driveCollectingPickups(session, PAR_SECONDS);
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("won");
    expect(snapshot.collectedIds.size).toBeGreaterThanOrEqual(8);
    expect(Object.values(snapshot.installed).filter((part) => part !== null).length).toBe(4);
    expect(snapshot.outcome?.partsOnExit).toBe(4);
  });

  test("armor plating survives exactly one crusher clip, then a second clip crushes", () => {
    const session = createRunSession();
    session.start();

    let armElapsed = 0;
    while (armElapsed < 300) {
      const snap = session.snapshot();
      if (snap.phase !== "running" || snap.armorSaveArmed) break;
      const target = PICKUPS.find((p) => !snap.collectedIds.has(p.id) && p.position[2] > snap.pose.position[2] - 6);
      const targetX = target?.position[0] ?? 0;
      const steer = steerTowardX(snap.pose.heading, targetX - snap.pose.position[0]);
      session.tick(DT, { throttle: 1, brake: 0, steer }, { jumpPressed: shouldJump(session), plowBracing: false, salvageSwap: true });
      armElapsed += DT;
    }
    const armed = session.snapshot();
    expect(armed.phase).toBe("running");
    expect(armed.armorSaveArmed).toBe(true);

    let idleElapsed = 0;
    while (idleElapsed < 120) {
      const snap = session.snapshot();
      if (snap.phase !== "running" || snap.armorSavesUsed > 0) break;
      session.tick(DT, { throttle: 0, brake: 1, steer: 0 }, { jumpPressed: false, plowBracing: false });
      idleElapsed += DT;
    }
    const afterFirstClip = session.snapshot();
    expect(afterFirstClip.phase).toBe("running");
    expect(afterFirstClip.armorSavesUsed).toBe(1);
    expect(afterFirstClip.armorSaveArmed).toBe(false);

    let idleElapsed2 = 0;
    while (idleElapsed2 < 120 && session.snapshot().phase === "running") {
      session.tick(DT, { throttle: 0, brake: 1, steer: 0 }, { jumpPressed: false, plowBracing: false });
      idleElapsed2 += DT;
    }
    expect(session.snapshot().phase).toBe("crushed");
  });

  test("back to pit refuses while the buggy is moving, then parks the run once it stops", () => {
    const session = createRunSession(undefined, memoryStorage());
    session.start();
    for (let i = 0; i < 60; i++) session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
    session.togglePause();
    const moving = session.snapshot();
    expect(moving.pose.speedKmh).toBeGreaterThan(0.1);
    expect(moving.parkedRun).toBeNull();
    session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
    expect(session.snapshot().cues).toEqual([]);

    session.returnToTitle();
    const refused = session.snapshot();
    expect(refused.phase).toBe("running");
    expect(refused.paused).toBe(true);
    expect(refused.runTime).toBe(moving.runTime);
    expect(refused.toast?.body).toBe("BRAKE TO A STOP TO PARK THIS RUN");

    session.togglePause();
    for (let i = 0; i < 600 && session.snapshot().pose.speedKmh > 0.1; i++) {
      const brake = session.snapshot().pose.speedKmh > 5 ? 1 : 0;
      session.tick(DT, { throttle: 0, brake, steer: 0 }, { jumpPressed: false, plowBracing: false });
    }
    expect(session.snapshot().pose.speedKmh).toBeLessThanOrEqual(0.1);
    session.togglePause();
    session.returnToTitle();
    const parked = session.snapshot();
    expect(parked.phase).toBe("start");
    expect(parked.parkedRun).not.toBeNull();
  });

  test("a full run voices every barricade and each compactor surge once", () => {
    const session = createRunSession();
    session.start();
    const voiced: RunCue[] = [];
    let elapsed = 0;
    while (elapsed < PAR_SECONDS && session.snapshot().phase === "running") {
      session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: shouldJump(session), plowBracing: false });
      voiced.push(...session.snapshot().cues);
      elapsed += DT;
    }
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("won");
    expect(snapshot.clearedGateIds.size).toBeGreaterThan(0);
    expect(voiced.filter(cue => cue === "gate")).toHaveLength(snapshot.clearedGateIds.size);
    const surgesReached = COMPACTOR_SURGES.filter(surge => surge.startT <= snapshot.runTime).length;
    expect(surgesReached).toBeGreaterThan(0);
    expect(voiced.filter(cue => cue === "surge")).toHaveLength(surgesReached);
  });

  test("a hard turn-in at speed voices one tire slip, a held lock repeats nothing, a snap voices again, and standing still voices none", () => {
    const session = createRunSession();
    session.start();
    const tick = (steer: number) => session.tick(DT, { throttle: 1, brake: 0, steer }, { jumpPressed: false, plowBracing: false });
    for (let i = 0; i < 120; i++) tick(0);
    const slipCues = () => session.snapshot().cues.filter(cue => cue === "slip").length;

    let heard = 0;
    for (let i = 0; i < 60; i++) { tick(-1); heard += slipCues(); }
    expect(session.snapshot().pose.speedKmh).toBeGreaterThan(15);
    expect(heard).toBe(1);
    for (let i = 0; i < 60; i++) { tick(-1); heard += slipCues(); }
    expect(heard).toBe(1);
    for (let i = 0; i < 60; i++) { tick(1); heard += slipCues(); }
    expect(heard).toBe(2);

    const still = createRunSession();
    still.start();
    let stillHeard = 0;
    for (let i = 0; i < 60; i++) {
      still.tick(DT, { throttle: 0, brake: 0, steer: i % 10 < 5 ? 1 : -1 }, { jumpPressed: false, plowBracing: false });
      stillHeard += still.snapshot().cues.filter(cue => cue === "slip").length;
    }
    expect(stillHeard).toBe(0);
  });
});

function memoryStorage(): RecordStorage {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}
