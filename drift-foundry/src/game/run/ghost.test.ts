import { describe, expect, test } from "bun:test";

import { createGhostRecorder, readGhosts, replayGhost, saveGhost, GHOST_KEY } from "./ghost";
import { createRunSession } from "./session";
import { ROUTE_GATES } from "../route/gates";

const DT = 1 / 60;

function memory() {
  const map = new Map<string, string>();
  return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
}

function driveLine(session: ReturnType<typeof createRunSession>, stall = 0): void {
  for (let t = 0; t < 150; t += DT) {
    const snap = session.snapshot();
    if (snap.phase !== "running") return;
    const braking = t > 8 && t < 8 + stall;
    const next = ROUTE_GATES.find((gate) => gate.atZ >= snap.pose.position[2]);
    const jump = next?.requirement === "jump" && !snap.pose.airborne && next.atZ - snap.pose.position[2] < Math.max(5, snap.pose.speedKmh / 3.6 * 0.5);
    session.tick(DT, { throttle: braking ? 0 : 1, brake: braking ? 1 : 0, steer: 0 }, { jumpPressed: !braking && jump, plowBracing: true });
  }
}

describe("best-run ghost", () => {
  test("a recording replays its poses on the run clock and disappears past its finish", () => {
    const recorder = createGhostRecorder();
    for (let t = 0; t <= 10; t += DT) recorder.record(t, { position: [0, 0, t * 10], rotationY: 0 });
    const ghost = recorder.take(10);
    expect(ghost.frames.length).toBeGreaterThan(90);
    expect(ghost.frames.length).toBeLessThan(110);
    const replay = replayGhost(ghost);
    expect(replay.poseAt(5.05)?.position[2]).toBeCloseTo(50.5, 0);
    expect(replay.poseAt(20)).toBeNull();
  });

  test("saved ghosts survive a reload and junk rows are dropped", () => {
    const storage = memory();
    saveGhost("time-sheet", { time: 30, frames: [[0, 0, 0, 0, 0], [1, 0, 0, 10, 0]] }, storage);
    storage.setItem(GHOST_KEY, JSON.stringify({ ...JSON.parse(storage.getItem(GHOST_KEY)!), broken: { time: "x", frames: [] } }));
    expect(Object.keys(readGhosts(storage))).toEqual(["time-sheet"]);
  });

  test("the Time Sheet replays your best escape, and only a faster escape replaces it", () => {
    const storage = memory();
    const session = createRunSession(() => 0, storage);
    session.selectEvent("time-sheet");
    expect(session.snapshot().ghost).toBeNull();
    session.start();
    driveLine(session, 3);
    const first = session.snapshot().outcome!.time;

    session.restart();
    expect(session.snapshot().ghost?.best).toBeCloseTo(first, 1);
    driveLine(session, 0);
    const faster = session.snapshot().outcome!.time;
    expect(faster).toBeLessThan(first);

    session.restart();
    expect(session.snapshot().ghost?.best).toBeCloseTo(faster, 1);
    for (let t = 0; t < 12; t += DT) session.tick(DT, { throttle: 0, brake: 1, steer: 0 }, { jumpPressed: false, plowBracing: false });
    const live = session.snapshot().ghost!;
    expect(live.pose).not.toBeNull();
    expect(live.aheadMetres!).toBeLessThan(-40);
  });

  test("untimed events race without a ghost", () => {
    const session = createRunSession(() => 0, memory());
    session.start();
    driveLine(session);
    session.restart();
    expect(session.snapshot().ghost).toBeNull();
  });
});
