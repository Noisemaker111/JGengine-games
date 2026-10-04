import { expect, test } from "bun:test";
import { createActionStateTracker, toActionStateBindingMap } from "@jgengine/core/input/actionBindings";
import { resolveGamepadFrame, type GamepadCode, type GamepadSnapshot } from "@jgengine/core/input/gamepadModel";
import { createInputSnapshot } from "@jgengine/core/runtime/inputSnapshot";
import { keybinds } from "./keybinds";
import { createDriveInput } from "./vehicle/input";

const padBindings: Record<string, GamepadCode[]> = Object.fromEntries(Object.entries(keybinds).map(([action, config]) => {
  const modes = config as { hold?: readonly string[]; toggle?: readonly string[] };
  const codes: readonly string[] = Array.isArray(config) ? config : [...(modes.hold ?? []), ...(modes.toggle ?? [])];
  return [action, codes.filter((code): code is GamepadCode => /^pad:\d+$|^padaxis:\d+[+-]$/.test(code))];
}));
const policy = { deadzone: { kind: "axial" as const, inner: 0.12, outer: 0.95 } };

function pad(axes = [0, 0, 0, 0], buttons: Record<number, number> = {}): GamepadSnapshot {
  return { id: "standard-pad-test", connected: true, axes, buttons: Array.from({ length: 17 }, (_, index) => ({ value: buttons[index] ?? 0, pressed: (buttons[index] ?? 0) > 0.5 })) };
}

test("standard triggers and steering retain analog magnitude through the real kart input", () => {
  const snapshot = createInputSnapshot();
  const drive = createDriveInput(() => keybinds);
  const frame = resolveGamepadFrame(pad([0.535, 0, 0, 0], { 7: 0.35, 6: 0.2 }), padBindings, policy);
  snapshot.publish(frame.held);
  snapshot.publishAnalog(frame.analog);
  expect(snapshot.value("throttle")).toBe(0.35);
  expect(snapshot.value("brake")).toBe(0.2);
  expect(snapshot.value("steerRight")).toBeCloseTo(0.5, 6);
  expect(snapshot.isDown("steerLeft")).toBe(false);
  let axis = drive.sample(0.05, snapshot, true);
  for (let i = 0; i < 90; i++) axis = drive.sample(0.05, snapshot, true);
  expect(axis.throttle).toBeCloseTo(0.35, 6);
  expect(axis.brake).toBeCloseTo(0.2, 6);
  expect(axis.steer).toBeCloseTo(0.5, 6);

  const left = resolveGamepadFrame(pad([-0.535, 0, 0, 0]), padBindings, policy);
  snapshot.publish(left.held);
  snapshot.publishAnalog(left.analog);
  axis = drive.sample(0.05, snapshot, true);
  expect(axis.throttle).toBe(0);
  expect(axis.brake).toBe(0);
  for (let i = 0; i < 90; i++) axis = drive.sample(0.05, snapshot, true);
  expect(axis.steer).toBeCloseTo(-0.5, 6);
  const disconnected = resolveGamepadFrame({ ...pad([1, 0, 0, 0], { 7: 1 }), connected: false }, padBindings, policy);
  expect(disconnected).toEqual({ held: [], analog: {} });
});

test("hop, brace, motor choice and session controls resolve to separate pad actions", () => {
  const buttons: Record<number, string> = { 0: "jumpHop", 4: "plowBrace", 2: "keepEngine", 3: "restart", 9: "startRun", 8: "pauseRun" };
  for (const [button, action] of Object.entries(buttons)) {
    expect(resolveGamepadFrame(pad(undefined, { [Number(button)]: 1 }), padBindings, policy).held).toEqual([action]);
  }
  const codes = Object.values(padBindings).flat();
  expect(new Set(codes).size).toBe(codes.length);
  const keyboard = createActionStateTracker(toActionStateBindingMap(keybinds));
  expect(keyboard.handleDown("KeyX")).toBe("keepEngine");
  expect(keyboard.handleDown("KeyW")).toBe("throttle");
  expect(keyboard.handleDown("ArrowDown")).toBe("brake");
  expect(keyboard.handleDown("Space")).toBe("jumpHop");
});
