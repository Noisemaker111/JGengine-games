import { expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { activeActionCodes, playControlsActive } from "@jgengine/core/game/controlGate";
import { syncLifecyclePhase } from "@jgengine/core/game/gamePhase";
import { createActionStateTracker, toActionStateBindingMap } from "@jgengine/core/input/actionBindings";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { lifecycle, onInit } from "./loop";
import { runSessionStore } from "./game/run/session";

test("a menu-born published tracker retains pedal and hop bindings through Start", () => {
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "pad-boot", input: keybinds, lifecycle }), content, player: { userId: "p1", isNew: true } });
  onInit(ctx);
  syncLifecyclePhase(ctx, lifecycle);
  expect(playControlsActive(ctx)).toBe(false);
  const tracker = createActionStateTracker(toActionStateBindingMap(activeActionCodes(ctx, keybinds)));
  runSessionStore.peek(ctx)!.start();
  syncLifecyclePhase(ctx, lifecycle);
  expect(playControlsActive(ctx)).toBe(true);
  expect(tracker.handleDown("pad:7")).toBe("throttle");
  expect(tracker.handleDown("pad:0")).toBe("jumpHop");
  expect(tracker.isDown("jumpHop")).toBe(true);
});
