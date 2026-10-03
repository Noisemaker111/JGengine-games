import { expect, test } from "bun:test";
import { createActionStateTracker, toActionStateBindingMap } from "@jgengine/core/input/actionBindings";
import { keybinds } from "./keybinds";

test("published input tracking accepts either Shift key and held trigger/aim alternatives", () => {
  const tracker = createActionStateTracker(toActionStateBindingMap(keybinds));
  for (const code of ["ShiftLeft", "ShiftRight"]) {
    tracker.handleDown(code);
    expect(tracker.isDown("sprint")).toBe(true);
    tracker.handleUp(code);
    expect(tracker.isDown("sprint")).toBe(false);
  }
  for (const [code, action] of [["KeyF", "fire"], ["KeyV", "aim"]] as const) {
    tracker.handleDown(code);
    expect(tracker.isDown(action)).toBe(true);
    tracker.handleUp(code);
    expect(tracker.isDown(action)).toBe(false);
  }
});
