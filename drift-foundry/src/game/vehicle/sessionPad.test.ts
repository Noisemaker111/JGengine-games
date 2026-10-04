import { expect, test } from "bun:test";
import { createSessionPad } from "./sessionPad";
import { keybinds } from "../keybinds";
import { createRunSession } from "../run/session";

const pad = (button: number | null) => ({ id: "test", connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ value: i === button ? 1 : 0, pressed: i === button })) });
test("menu pad edges start, pause/resume and choose a motor without repeating held buttons", () => {
  const sample = createSessionPad();
  const run = createRunSession(() => 0);
  expect(sample([pad(9)], keybinds)).toEqual(["startRun"]);
  run.start();
  expect(run.snapshot().phase).toBe("running");
  expect(sample([pad(9)], keybinds)).toEqual([]);
  sample([pad(null)], keybinds);
  expect(sample([pad(8)], keybinds)).toEqual(["pauseRun"]);
  run.togglePause();
  expect(run.snapshot().paused).toBe(true);
  sample([pad(null)], keybinds);
  expect(sample([pad(8)], keybinds)).toEqual(["pauseRun"]);
  run.togglePause();
  expect(run.snapshot().paused).toBe(false);
  expect(sample([pad(2)], keybinds)).toEqual(["keepEngine"]);
  run.toggleKeepEngine();
  expect(run.snapshot().keepEngine).toBe(true);
  expect(sample([pad(2)], keybinds)).toEqual([]);
  expect(sample([], keybinds)).toEqual([]);
  expect(sample([pad(2)], keybinds)).toEqual(["keepEngine"]);
});
test("pad session actions respect overridden bindings and ignore driving controls", () => {
  const sample = createSessionPad();
  expect(sample([pad(7)], keybinds)).toEqual([]);
  const rebound = { ...keybinds, pauseRun: ["pad:11"] };
  expect(sample([pad(8)], rebound)).toEqual([]);
  expect(sample([pad(11)], rebound)).toEqual(["pauseRun"]);
});
