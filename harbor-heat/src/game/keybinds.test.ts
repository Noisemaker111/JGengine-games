import { expect, test } from "bun:test";
import { createActionStateTracker, toActionStateBindingMap } from "@jgengine/core/input/actionBindings";
import { resolveGamepadFrame, type GamepadCode, type GamepadSnapshot } from "@jgengine/core/input/gamepadModel";
import { createInputSnapshot } from "@jgengine/core/runtime/inputSnapshot";
import { keybinds } from "./keybinds";

const padBindings: Record<string, GamepadCode[]> = Object.fromEntries(Object.entries(keybinds).map(([action, config]) => {
  const modes = config as { hold?: readonly string[]; toggle?: readonly string[] };
  const codes: readonly string[] = Array.isArray(config) ? config : [...(modes.hold ?? []), ...(modes.toggle ?? [])];
  return [action, codes.filter((code): code is GamepadCode => /^pad:\d+$|^padaxis:\d+[+-]$/.test(code))];
}));
const policy = { deadzone: { kind: "axial" as const, inner: 0.12, outer: 0.95 } };

function pad(axes = [0, 0, 0, 0], buttons: Record<number, number> = {}): GamepadSnapshot {
  return { id: "standard-pad-test", connected: true, axes, buttons: Array.from({ length: 17 }, (_, index) => ({ value: buttons[index] ?? 0, pressed: (buttons[index] ?? 0) > 0.5 })) };
}

test("the same pad movement actions support analog walking, ground driving and flight axes", () => {
  const input = createInputSnapshot();
  const frame = resolveGamepadFrame(pad([0.535, -0.535, 0.535, 0], { 7: 0.35, 6: 0.2 }), padBindings, policy);
  input.publish(frame.held);
  input.publishAnalog(frame.analog);
  const driving = input.axis({
    throttle: { positive: ["moveForward"] },
    brake: { positive: ["moveBack"] },
    steer: { positive: ["moveRight"], negative: ["moveLeft"] },
  });
  expect(driving.throttle).toBeCloseTo(0.5, 6);
  expect(driving.brake).toBe(0.2);
  expect(driving.steer).toBeCloseTo(0.5, 6);
  const flight = input.axis({
    pitch: { positive: ["moveBack"], negative: ["moveForward"] },
    roll: { positive: ["moveRight"], negative: ["moveLeft"] },
    yaw: { positive: ["flightYawRight"], negative: ["flightYawLeft"] },
  });
  expect(flight.pitch).toBeCloseTo(-0.3, 6);
  expect(flight.roll).toBeCloseTo(0.5, 6);
  expect(flight.yaw).toBeCloseTo(0.5, 6);

  const triggers = resolveGamepadFrame(pad(undefined, { 7: 0.35, 6: 0.2 }), padBindings, policy);
  expect(triggers.analog.moveForward).toBe(0.35);
  expect(triggers.analog.moveBack).toBe(0.2);
  const opposite = resolveGamepadFrame(pad([-0.535, 0.535, -0.535, 0]), padBindings, policy);
  expect(opposite.held).toEqual(["moveBack", "moveLeft", "flightYawLeft"]);
  expect(opposite.analog.moveLeft).toBeCloseTo(0.5, 6);
  expect(resolveGamepadFrame(pad([0.1, -0.1, 0.1, 0]), padBindings, policy).held).toEqual([]);
  expect(resolveGamepadFrame({ ...pad(), connected: false }, padBindings, policy).held).toEqual([]);
});

test("boarding, exit, handbrake and flight controls do not also dispatch combat or inventory actions", () => {
  const buttons: Record<number, string> = { 0: "jump", 2: "interact", 1: "exitVehicle", 10: "sprint", 5: "fire", 3: "throwGrenade", 8: "useMedkit", 12: "flightThrottleUp", 13: "flightThrottleDown", 4: "flightAirbrake", 11: "flightVectorToggle", 14: "selectSlot1", 15: "selectSlot2" };
  for (const [button, action] of Object.entries(buttons)) {
    expect(resolveGamepadFrame(pad(undefined, { [Number(button)]: 1 }), padBindings, policy).held).toEqual([action]);
  }
  const codes = Object.values(padBindings).flat();
  expect(new Set(codes).size).toBe(codes.length);
  const keyboard = createActionStateTracker(toActionStateBindingMap(keybinds));
  expect(keyboard.handleDown("KeyE")).toBe("interact");
  expect(keyboard.handleDown("KeyF")).toBe("exitVehicle");
  expect(keyboard.handleDown("KeyX")).toBe("flightAirbrake");
  expect(keyboard.handleDown("Space")).toBe("jump");
  expect(keyboard.handleDown("mouse0")).toBe("fire");
});
