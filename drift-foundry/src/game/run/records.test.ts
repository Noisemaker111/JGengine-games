import { expect, test } from "bun:test";
import { EMPTY_RECORDS, readRecords, saveRecords } from "./records";
import { createRunSession } from "./session";

test("finished run records survive constructing a fresh session without overwriting another save", () => {
  const data = new Map([["other-game-save", "preserved"]]);
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const run = createRunSession(() => 0, storage);
  run.start();
  for (let i = 0; i < 300; i++) run.tick(.05, { throttle: 0, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
  expect(run.snapshot().phase).toBe("crushed");
  expect(createRunSession(() => 0, storage).snapshot().records.attempts).toBe(1);
  expect(data.get("other-game-save")).toBe("preserved");
});

test("blocked or corrupt storage remains playable and reports failure honestly", () => {
  const bad = { getItem: () => "broken json", setItem: () => { throw new Error("quota"); } };
  expect(readRecords(bad)).toEqual(EMPTY_RECORDS);
  expect(saveRecords(EMPTY_RECORDS, bad)).toBe(false);
});

test("pause and settings suspension freeze both the car and crusher, including a large resume delta", () => {
  const run = createRunSession();
  run.start();
  run.tick(.05, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
  const before = run.snapshot();
  run.togglePause();
  run.tick(12, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: true, plowBracing: false });
  expect(run.snapshot().pose).toEqual(before.pose);
  expect(run.snapshot().compactorZ).toBe(before.compactorZ);
  run.togglePause();
  run.suspend(true);
  run.tick(12, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: true, plowBracing: false });
  expect(run.snapshot().runTime).toBe(before.runTime);
  run.suspend(false);
  run.tick(12, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
  expect(run.snapshot().runTime).toBeCloseTo(before.runTime + .05);
});
