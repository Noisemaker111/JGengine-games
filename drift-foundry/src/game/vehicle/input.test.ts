import { expect, test } from "bun:test";
import { createInputSnapshot } from "@jgengine/core/runtime/inputSnapshot";
import { createDriveInput } from "./input";

test("keyboard and touch releases preserve the other held source, then reset clears both", () => {
  const drive = createDriveInput();
  const host = createInputSnapshot();
  drive.keyDown("KeyW");
  drive.press("throttle");
  drive.release("throttle");
  expect(drive.sample(.05, host, true).throttle).toBeGreaterThan(0);
  drive.press("throttle");
  drive.keyUp("KeyW");
  expect(drive.isDown("throttle")).toBe(true);
  drive.reset();
  expect(drive.sample(.05, host, true).throttle).toBe(0);
});

test("closing settings refreshes bindings and releases held keys without duplicating jump edges", () => {
  let code = "KeyW";
  const drive = createDriveInput(() => ({ throttle: [code], jumpHop: ["Space"] }));
  drive.keyDown("KeyW");
  code = "KeyI";
  drive.refreshBindings();
  drive.keyDown("KeyW");
  expect(drive.isDown("throttle")).toBe(false);
  drive.keyDown("KeyI");
  expect(drive.isDown("throttle")).toBe(true);
  drive.keyDown("Space");
  expect(drive.consumeJump()).toBe(true);
  expect(drive.consumeJump()).toBe(false);
  drive.sample(.05, createInputSnapshot(), true);
  drive.keyDown("Space");
  expect(drive.consumeJump()).toBe(false);
});
