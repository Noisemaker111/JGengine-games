import { describe, expect, test } from "bun:test";

import { steerToward } from "@jgengine/core/movement/steering";

import { EXIT_Z } from "./constants";
import { ROUTE_GATES } from "../route/gates";
import { PICKUPS } from "./pickups";
import { createRunSession, type RunSession } from "./session";

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
    session.tick(DT, { throttle: 1, brake: 0, steer }, { jumpPressed: shouldJump(session), plowBracing: false });
    elapsed += DT;
  }
}

describe("drift-foundry run session", () => {
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

  test("keeping the truck motor changes the escape build and time without skipping required parts", () => {
    const automatic = createRunSession();
    automatic.start();
    driveStraight(automatic, PAR_SECONDS);
    const retained = createRunSession();
    retained.start();
    for (let frame = 0; frame < 6000 && retained.snapshot().phase === "running"; frame++) {
      if (!retained.snapshot().keepEngine && retained.snapshot().installed.engine?.id === "truck_engine") retained.toggleKeepEngine();
      retained.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: shouldJump(retained), plowBracing: false });
    }
    const result = retained.snapshot();
    expect(result.phase).toBe("won");
    expect(result.installed.engine?.id).toBe("truck_engine");
    expect(automatic.snapshot().installed.engine?.id).toBe("ev_conversion");
    expect(result.outcome!.time).toBeLessThan(automatic.snapshot().outcome!.time);
    expect(result.tuning.turnRate).toBeLessThan(automatic.snapshot().tuning.turnRate);
    expect(result.clearedGateIds.size).toBe(8);
    expect(result.collectedIds.has("pickup_ev_conversion")).toBe(true);
    retained.restart();
    expect(retained.snapshot().keepEngine).toBe(false);
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
      session.tick(DT, { throttle: 1, brake: 0, steer }, { jumpPressed: shouldJump(session), plowBracing: false });
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
});
