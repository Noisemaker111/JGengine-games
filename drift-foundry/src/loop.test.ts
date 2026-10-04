import { expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { activeActionCodes, playControlsActive } from "@jgengine/core/game/controlGate";
import { syncLifecyclePhase } from "@jgengine/core/game/gamePhase";
import { createActionStateTracker, toActionStateBindingMap } from "@jgengine/core/input/actionBindings";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { lifecycle, onInit, onTick } from "./loop";
import { runSessionStore } from "./game/run/session";
import { driveInputStore, worldRuntimeStore } from "./game/run/store";

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

test("fresh throttle immediately after Restart survives the first scenery restore tick", () => {
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "restart-input", input: keybinds, lifecycle }), content, player: { userId: "p1", isNew: true } });
  onInit(ctx);
  ctx.game.commands.run("startRun", {});
  const input = driveInputStore.peek(ctx)!;
  input.keyDown("KeyW");
  for (let i = 0; i < 10; i++) onTick(ctx, .05);
  expect(worldRuntimeStore.peek(ctx)!.lastRunTime).toBeGreaterThan(0);
  ctx.game.commands.run("restart", {});
  expect(input.isDown("throttle")).toBe(false);
  input.keyDown("KeyW");
  onTick(ctx, .05);
  expect(input.isDown("throttle")).toBe(true);
  expect(runSessionStore.peek(ctx)!.snapshot().pose.speedKmh).toBeGreaterThan(0);
  expect(runSessionStore.peek(ctx)!.snapshot().pose.position[2]).toBeGreaterThan(4);
});
