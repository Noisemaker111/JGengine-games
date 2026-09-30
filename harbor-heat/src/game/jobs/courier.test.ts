import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { game } from "../../game.config";
import { loop, normalizeAfterRestore } from "../../loop";
import { content } from "../content";
import { registerCommands, startedStore } from "../commands";
import { courierStore, DELIVERY_ROUTES, DISPATCH, setupCourierLandmarks, tickCourier } from "./courier";

function boot(backend = memorySaveBackend()) {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "courier-test", isNew: true }, save: { backend, mode: "manual", key: "courier-test" } });
  ctx.scene.entity.spawn("street_runner", { id: ctx.player.userId, position: [DISPATCH[0], 0, DISPATCH[1]], role: "player" });
  registerCommands(ctx);
  ctx.game.commands.run("game.start", {});
  return ctx;
}

describe("Mainsail courier operation", () => {
  test("delivery requires the real drop-off and pays exactly once", () => {
    const ctx = boot();
    ctx.game.commands.run("courier.accept", {});
    const cash = ctx.game.economy.balance(ctx.player.userId, "cash");
    ctx.game.commands.run("courier.deliver", {});
    expect(courierStore.read(ctx).phase).toBe("running");
    const [x, z] = DELIVERY_ROUTES[0].position;
    ctx.scene.entity.setPose(ctx.player.userId, { position: [x, ctx.world.groundHeightAt(x, z), z] });
    tickCourier(ctx, 5);
    ctx.game.commands.run("courier.deliver", {});
    expect(courierStore.read(ctx).phase).toBe("won");
    expect(ctx.game.economy.balance(ctx.player.userId, "cash") - cash).toBe(370);
    ctx.game.commands.run("courier.deliver", {});
    expect(ctx.game.economy.balance(ctx.player.userId, "cash") - cash).toBe(370);
    expect(gamePhase(ctx)).toBe("paused");
    ctx.game.commands.run("courier.dismiss", {});
    expect(gamePhase(ctx)).toBe("playing");
  });

  test("settings cannot unpause a manual pause; failure costs no money", () => {
    const ctx = boot();
    ctx.game.commands.run("courier.accept", {});
    ctx.game.commands.run("session.pause", { paused: true });
    ctx.game.commands.run("session.settings", { open: true });
    ctx.game.commands.run("session.settings", { open: false });
    expect(ctx.time.isPaused()).toBe(true);
    loop.onTick(ctx, 10);
    expect(courierStore.read(ctx).remaining).toBe(65);
    ctx.game.commands.run("session.pause", { paused: false });
    const cash = ctx.game.economy.balance(ctx.player.userId, "cash");
    tickCourier(ctx, 70);
    expect(courierStore.read(ctx).phase).toBe("lost");
    expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(cash);
  });

  test("reload preserves an in-flight parcel, time and landmarks without duplication", async () => {
    const backend = memorySaveBackend();
    const ctx = boot(backend);
    setupCourierLandmarks(ctx);
    ctx.game.commands.run("courier.accept", {});
    tickCourier(ctx, 10);
    await ctx.game.save!.save();
    const restored = boot(backend);
    startedStore.clear(restored);
    expect(await restored.game.save!.load()).toBe(true);
    normalizeAfterRestore(restored, false);
    setupCourierLandmarks(restored);
    expect(courierStore.read(restored).phase).toBe("running");
    expect(courierStore.read(restored).remaining).toBe(55);
    expect(restored.scene.object.list().filter((object) => object.catalogId.startsWith("obj_delivery_") || object.catalogId === "obj_dispatch")).toHaveLength(4);
    expect(restored.time.isPaused()).toBe(true);
    restored.game.commands.run("game.start", {});
    expect(restored.time.isPaused()).toBe(false);
  });
});
