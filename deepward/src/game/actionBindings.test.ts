import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { physics, VAULT_SPAWN, world } from "../world";
import { keybinds, registerControls, tick, viewStore } from "./controls";
import { newDive, RIFLE, SIDEARM, takeLoot } from "./state";

function diveContext() {
  const definition = defineGameDefinition({
    name: "Deepward action invariant", multiplayer: undefined, persist: false,
    world, physics, input: keybinds, lifecycle: "always-live",
    simulation: { hz: 120, maxCatchUpSteps: 8 },
  });
  const ctx = createGameContext({
    definition, player: { userId: "diver", isNew: true },
    content: { entityById(id) {
      if (id === "diver") return { stats: { health: { max: 100 }, oxygen: { max: 110 }, ammo: { max: 6 } } };
      if (id === "fitter") return { stats: { health: { max: 80 } } };
      return null;
    } },
  });
  registerControls(ctx);
  ctx.scene.entity.spawn("diver", { id: ctx.player.userId, position: VAULT_SPAWN, role: "player" });
  viewStore.write(ctx, { ...viewStore.read(ctx), mode: "dive", dive: newDive(1) });
  return ctx;
}

function advanceFrames(ctx: ReturnType<typeof diveContext>, count: number): void {
  // Fixed simulated frames, not a wall-clock wait or an input-dispatch substitute.
  for (let frame = 0; frame < count; frame++) ctx.sim.advance(0.05, dt => tick(ctx, dt));
}

test("actual Deepward bindings register action commands and preserve discrete keys", () => {
  const ctx = diveContext();
  expect(keybinds.deepwardFire).toEqual(["mouse0"]);
  expect(keybinds.deepwardInteract).toEqual(["KeyE"]);
  expect(keybinds.deepwardReload).toEqual(["KeyR"]);
  expect(keybinds.deepwardCache).toEqual(["Tab"]);
  for (const action of Object.keys(keybinds).filter(name => name.startsWith("deepward"))) {
    expect(ctx.game.commands.has(action)).toBe(true);
  }
  for (const name of ["deepward.interact", "deepward.fire", "deepward.reload", "deepward.cache"]) {
    expect(ctx.game.commands.has(name)).toBe(true);
  }
});

test("action fire accepts one shot with no held input and shares the UI cooldown/reload gates", () => {
  const ctx = diveContext();
  // Command-boundary invariant, not a substitute for the parent's native mouse press.
  ctx.input.publish([]);
  advanceFrames(ctx, 1);
  expect(viewStore.read(ctx).dive!.magazine).toBe(6);
  expect(ctx.game.commands.run("deepwardFire", {}).status).toBe("applied");
  const fired = viewStore.read(ctx).dive!;
  expect(fired.magazine).toBe(5);
  expect(fired.shotCooldown).toBe(SIDEARM.interval);
  expect(fired.flash).toBe(0.12);
  ctx.game.commands.run("deepward.fire", {});
  expect(viewStore.read(ctx).dive!.magazine).toBe(5);

  const frame = ctx.sim.advance(0.05, dt => tick(ctx, dt));
  expect(frame.steps).toBeGreaterThan(1);
  expect(viewStore.read(ctx).dive!.magazine).toBe(5);
  advanceFrames(ctx, 8);
  expect(viewStore.read(ctx).dive!.magazine).toBe(5);
  expect(viewStore.read(ctx).dive!.shotCooldown).toBe(0);
  ctx.game.commands.run("deepwardReload", {});
  expect(viewStore.read(ctx).dive!.reload).toBe(1.3);
  ctx.game.commands.run("deepwardFire", {});
  expect(viewStore.read(ctx).dive!.magazine).toBe(5);
});

test("held fire and the same-frame action command share one shot, repeat at cooldown, and stop on release", () => {
  const ctx = diveContext();
  // FrameDriver publishes held input and advances simulation before dispatching
  // the press command. Exercise those public boundaries in that order.
  ctx.input.publish(["deepwardFire"]);
  advanceFrames(ctx, 1);
  expect(viewStore.read(ctx).dive!.magazine).toBe(5);
  ctx.game.commands.run("deepwardFire", {});
  ctx.game.commands.run("deepward.fire", {});
  expect(viewStore.read(ctx).dive!.magazine).toBe(5);
  advanceFrames(ctx, 4);
  expect(viewStore.read(ctx).dive!.magazine).toBe(5);
  advanceFrames(ctx, 2);
  expect(viewStore.read(ctx).dive!.magazine).toBe(4);
  expect(viewStore.read(ctx).dive!.flash).toBeGreaterThan(0);
  expect(viewStore.read(ctx).dive!.shotCooldown).toBeGreaterThan(0);

  ctx.input.publish([]);
  advanceFrames(ctx, 8);
  expect(viewStore.read(ctx).dive!.magazine).toBe(4);
  expect(viewStore.read(ctx).dive!.shotCooldown).toBe(0);
  // A frame with no simulation step can dispatch the press first; the next
  // held-input simulation must still respect that accepted shot's cooldown.
  ctx.input.publish(["deepwardFire"]);
  ctx.game.commands.run("deepwardFire", {});
  advanceFrames(ctx, 1);
  expect(viewStore.read(ctx).dive!.magazine).toBe(3);
});

test("equipped rifle held fire preserves its interval and reload gate, then resumes until release", () => {
  const ctx = diveContext();
  viewStore.update(ctx, view => ({ ...view, dive: takeLoot(view.dive!, "fitter", "service-rifle")! }));
  ctx.game.commands.run("deepward.equip", { hand: "service-rifle" });
  expect(viewStore.read(ctx).dive!.hand).toBe("service-rifle");
  ctx.input.publish(["deepwardFire"]);
  advanceFrames(ctx, 8);
  expect(viewStore.read(ctx).dive!.magazine).toBe(6);
  advanceFrames(ctx, 3);
  expect(viewStore.read(ctx).dive!.magazine).toBe(5);
  expect(viewStore.read(ctx).dive!.shotCooldown).toBeGreaterThan(SIDEARM.interval);
  expect(viewStore.read(ctx).dive!.shotCooldown).toBeLessThanOrEqual(RIFLE.interval);
  advanceFrames(ctx, 6);
  expect(viewStore.read(ctx).dive!.magazine).toBe(5);
  advanceFrames(ctx, 5);
  expect(viewStore.read(ctx).dive!.magazine).toBe(4);

  ctx.game.commands.run("deepwardReload", {});
  const reserve = viewStore.read(ctx).dive!.reserve;
  advanceFrames(ctx, 24);
  expect(viewStore.read(ctx).dive!.reload).toBeGreaterThan(0);
  expect(viewStore.read(ctx).dive!.magazine).toBe(4);
  expect(viewStore.read(ctx).dive!.reserve).toBe(reserve);
  advanceFrames(ctx, 3);
  expect(viewStore.read(ctx).dive!.reload).toBe(0);
  expect(viewStore.read(ctx).dive!.reserve).toBe(reserve - 2);
  expect(viewStore.read(ctx).dive!.magazine).toBe(5);
  ctx.input.publish([]);
  advanceFrames(ctx, 11);
  expect(viewStore.read(ctx).dive!.shotCooldown).toBe(0);
  expect(viewStore.read(ctx).dive!.magazine).toBe(5);
});

test("one cache action remains open across held-input simulation steps, with UI close intact", () => {
  const ctx = diveContext();
  ctx.input.publish(["deepwardCache", "deepwardFire"]);
  ctx.game.commands.run("deepwardCache", {});
  expect(viewStore.read(ctx).panel).toBe("cache");
  const frame = ctx.sim.advance(0.05, dt => tick(ctx, dt));
  expect(frame.steps).toBeGreaterThan(1);
  expect(viewStore.read(ctx).panel).toBe("cache");
  expect(viewStore.read(ctx).dive!.elapsed).toBeGreaterThan(0);
  expect(viewStore.read(ctx).dive!.magazine).toBe(6);
  ctx.input.publish(["deepwardCache"]);
  ctx.game.commands.run("deepward.cache", {});
  expect(viewStore.read(ctx).panel).toBeNull();
  advanceFrames(ctx, 1);
  expect(viewStore.read(ctx).panel).toBeNull();
});
