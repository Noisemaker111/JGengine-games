import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { game } from "../../game.config";
import { loop, normalizeAfterRestore } from "../../loop";
import { content } from "../content";
import { registerCommands, startedStore } from "../commands";
import { courierStore, courierOffer, DELIVERY_ROUTES, DISPATCH, finishCourier, normalizeCourier, setupCourierLandmarks, tickCourier } from "./courier";
import { handrollOf } from "../handroll";

function boot(backend = memorySaveBackend()) {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "courier-test", isNew: true }, save: { backend, mode: "manual", key: "courier-test" } });
  ctx.scene.entity.spawn("street_runner", { id: ctx.player.userId, position: [DISPATCH[0], 0, DISPATCH[1]], role: "player" });
  registerCommands(ctx);
  ctx.game.commands.run("game.start", {});
  ctx.game.economy.grant(ctx.player.userId, "cash", 500);
  return ctx;
}

function enterCar(ctx: ReturnType<typeof boot>, id = "courier-car") {
  ctx.scene.entity.spawn("car_compact", { id, position: [DISPATCH[0], ctx.world.groundHeightAt(...DISPATCH), DISPATCH[1]], role: "prop" });
  handrollOf(ctx).enterVehicle(ctx, id);
  return id;
}

function dropOff(ctx: ReturnType<typeof boot>, vehicleId: string) {
  const [x, z] = DELIVERY_ROUTES[courierStore.read(ctx).route]!.position;
  ctx.scene.entity.setPose(vehicleId, { position: [x, ctx.world.groundHeightAt(x, z), z] });
  ctx.game.commands.run("courier.deliver", {});
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

  test("express validates vehicle and bond before accepting; broke riders can recover with standard", () => {
    const ctx = boot();
    const cash = ctx.game.economy.balance(ctx.player.userId, "cash");
    ctx.game.commands.run("courier.accept", { service: "express" });
    expect(courierStore.read(ctx).phase).toBe("idle");
    expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(cash);
    enterCar(ctx);
    if (cash > 0) ctx.game.economy.charge(ctx.player.userId, "cash", cash);
    ctx.game.commands.run("courier.accept", { service: "express" });
    expect(courierStore.read(ctx).phase).toBe("idle");
    ctx.game.commands.run("courier.accept", {});
    expect(courierStore.read(ctx).service).toBe("standard");
    expect(courierStore.read(ctx).phase).toBe("running");
    expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(0);
  });

  test("express pays extra cred and refunds its bond exactly once; crashes reduce pay", () => {
    const ctx = boot();
    const id = enterCar(ctx);
    const cash = ctx.game.economy.balance(ctx.player.userId, "cash");
    const xp = ctx.scene.entity.stats.get(ctx.player.userId, "xp")!.current;
    ctx.game.commands.run("courier.accept", { service: "express" });
    expect(courierStore.read(ctx).remaining).toBe(20);
    expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(cash - 100);
    const health = ctx.scene.entity.stats.get(id, "health")!.current;
    ctx.scene.entity.stats.set(id, "health", { current: health - 40 });
    tickCourier(ctx, 5);
    expect(courierStore.read(ctx).condition).toBe(60);
    tickCourier(ctx, 0);
    expect(courierStore.read(ctx).condition).toBe(60);
    dropOff(ctx, id);
    expect(courierStore.read(ctx).reward).toBe(387);
    expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(cash + 387);
    expect(ctx.scene.entity.stats.get(ctx.player.userId, "xp")!.current - xp).toBe(30);
    ctx.game.commands.run("courier.deliver", {});
    expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(cash + 387);
  });

  test("deadline and recovery forfeit express bond; returning intact cargo refunds it", () => {
    for (const outcome of ["deadline", "recovery", "returned"] as const) {
      const ctx = boot();
      enterCar(ctx);
      const cash = ctx.game.economy.balance(ctx.player.userId, "cash");
      ctx.game.commands.run("courier.accept", { service: "express" });
      if (outcome === "deadline") tickCourier(ctx, 21);
      else if (outcome === "returned") ctx.game.commands.run("courier.return", {});
      else finishCourier(ctx, false, outcome);
      expect(courierStore.read(ctx).failureReason).toBe(outcome);
      expect(courierStore.read(ctx).failed).toBe(outcome === "returned" ? 0 : 1);
      expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(cash - (outcome === "returned" ? 0 : 100));
      ctx.game.commands.run("courier.return", {});
      expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(cash - (outcome === "returned" ? 0 : 100));
    }
  });

  test("destroyed express cargo cannot be delivered or returned for a refund", () => {
    const ctx = boot();
    const id = enterCar(ctx);
    const cash = ctx.game.economy.balance(ctx.player.userId, "cash");
    ctx.game.commands.run("courier.accept", { service: "express" });
    ctx.scene.entity.stats.set(id, "health", { current: 0 });
    ctx.game.commands.run("courier.return", {});
    expect(courierStore.read(ctx).failureReason).toBe("damage");
    expect(courierStore.read(ctx).condition).toBe(0);
    expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(cash - 100);
    dropOff(ctx, id);
    expect(courierStore.read(ctx).completed).toBe(0);
  });

  test("express reload preserves bond, condition and crash accounting without charging twice", async () => {
    const backend = memorySaveBackend();
    const ctx = boot(backend);
    const id = enterCar(ctx);
    ctx.game.commands.run("courier.accept", { service: "express" });
    ctx.scene.entity.stats.set(id, "health", { current: 280 });
    tickCourier(ctx, 4);
    const cash = ctx.game.economy.balance(ctx.player.userId, "cash");
    await ctx.game.save!.save();
    const restored = boot(backend);
    await restored.game.save!.load();
    normalizeAfterRestore(restored, false);
    normalizeCourier(restored);
    expect(courierStore.read(restored).remaining).toBe(16);
    expect(courierStore.read(restored).condition).toBe(80);
    expect(courierStore.read(restored).bond).toBe(100);
    expect(restored.game.economy.balance(restored.player.userId, "cash")).toBe(cash);
    restored.game.commands.run("game.start", {});
    tickCourier(restored, 0);
    expect(courierStore.read(restored).condition).toBe(80);
    expect(courierStore.read(restored).service).toBe("express");
    expect(restored.game.economy.balance(restored.player.userId, "cash")).toBe(cash);
  });

  test("legacy in-flight saves retain free standard terms and their original timer", () => {
    const ctx = boot();
    ctx.game.store.set(courierStore.key, { phase: "running", route: 1, remaining: 52, completed: 1, reward: 0, distance: 20, heading: 0 });
    normalizeCourier(ctx);
    expect(courierStore.read(ctx).service).toBe("standard");
    expect(courierStore.read(ctx).totalSeconds).toBe(courierOffer(1).seconds);
    expect(courierStore.read(ctx).remaining).toBe(52);
    expect(courierStore.read(ctx).bond).toBe(0);
  });
});
