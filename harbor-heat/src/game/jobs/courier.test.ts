import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { game } from "../../game.config";
import { loop, normalizeAfterRestore } from "../../loop";
import { content } from "../content";
import { registerCommands, startedStore } from "../commands";
import { registerMissionContracts } from "../missions/register";
import { cargoCondition, courierStore, DELIVERY_ROUTES, DISPATCH, setupCourierLandmarks, tickCourier } from "./courier";
import { missionBoard } from "../missions/missions";

function boot(backend = memorySaveBackend()) {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "courier-test", isNew: true }, save: { backend, mode: "manual", key: "courier-test" } });
  ctx.scene.entity.spawn("street_runner", { id: ctx.player.userId, position: [DISPATCH[0], 0, DISPATCH[1]], role: "player" });
  registerCommands(ctx);
  registerMissionContracts(ctx);
  ctx.game.commands.run("game.start", {});
  return ctx;
}

/** Run the world forward through the real loop, the way play does. */
function advance(ctx: ReturnType<typeof boot>, seconds: number): void {
  const step = 1 / 30;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) loop.onTick(ctx, step);
}

function moveTo(ctx: ReturnType<typeof boot>, position: readonly [number, number]): void {
  ctx.scene.entity.setPose(ctx.player.userId, { position: [position[0], ctx.world.groundHeightAt(position[0], position[1]), position[1]] });
}

describe("Mainsail courier operation", () => {
  test("a delivery is a mission with a deadline, and the deadline fails the run", () => {
    const ctx = boot();
    ctx.game.commands.run("courier.accept", {});
    const board = missionBoard.read(ctx);
    expect(board.active).toBe("courier_0_standard");
    expect(board.view?.remaining).toBe(65);

    advance(ctx, 64);
    expect(courierStore.read(ctx).phase).toBe("running");
    expect(missionBoard.read(ctx).view!.remaining).toBeLessThanOrEqual(2);

    advance(ctx, 2);
    expect(courierStore.read(ctx).phase).toBe("lost");
    expect(missionBoard.read(ctx).active).toBeNull();
    expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(0);
  });

  test("the drop pays once, and only at the real drop-off", () => {
    const ctx = boot();
    ctx.game.commands.run("courier.accept", {});
    const cash = ctx.game.economy.balance(ctx.player.userId, "cash");
    ctx.game.commands.run("courier.deliver", {});
    expect(courierStore.read(ctx).phase).toBe("running");

    const [x, z] = DELIVERY_ROUTES[0]!.position;
    moveTo(ctx, [x, z]);
    advance(ctx, 5);
    ctx.game.commands.run("courier.deliver", {});
    expect(courierStore.read(ctx).phase).toBe("won");
    expect(ctx.game.economy.balance(ctx.player.userId, "cash") - cash).toBeGreaterThan(300);

    ctx.game.commands.run("courier.deliver", {});
    expect(ctx.game.economy.balance(ctx.player.userId, "cash") - cash).toBe(370);
    expect(gamePhase(ctx)).toBe("paused");
    ctx.game.commands.run("courier.dismiss", {});
    expect(gamePhase(ctx)).toBe("playing");
  });

  test("a wrecked parcel fails the mission into its cargo state", () => {
    const ctx = boot();
    ctx.game.commands.run("courier.accept", {});
    // The player is wasted mid-run: the cargo does not survive.
    const health = ctx.scene.entity.stats.get(ctx.player.userId, "health");
    if (health !== null) ctx.scene.entity.stats.set(ctx.player.userId, "health", { current: 0 });
    advance(ctx, 0.2);
    expect(courierStore.read(ctx).phase).toBe("lost");
    expect(missionBoard.read(ctx).active).toBeNull();
    expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(0);
  });

  test("rush cargo spoils above the speed limit, and the condition scales pay", () => {
    expect(cargoCondition(100, 10, 35, 0)).toBe(100);
    expect(cargoCondition(100, 10, 65, 0)).toBe(64);
    expect(cargoCondition(100, 10, 35, 20)).toBe(60);
  });

  test("settings cannot unpause a manual pause", () => {
    const ctx = boot();
    ctx.game.commands.run("courier.accept", {});
    ctx.game.commands.run("session.pause", { paused: true });
    ctx.game.commands.run("session.settings", { open: true });
    ctx.game.commands.run("session.settings", { open: false });
    expect(ctx.time.isPaused()).toBe(true);
    loop.onTick(ctx, 10);
    expect(courierStore.read(ctx).remaining).toBe(65);
  });

  test("reload resumes the delivery with the time it had left", async () => {
    const backend = memorySaveBackend();
    const ctx = boot(backend);
    setupCourierLandmarks(ctx);
    ctx.game.commands.run("courier.accept", {});
    advance(ctx, 10);
    await ctx.game.save!.save();
    const saved = courierStore.read(ctx).remaining;

    const restored = boot(backend);
    startedStore.clear(restored);
    expect(await restored.game.save!.load()).toBe(true);
    normalizeAfterRestore(restored, false);
    setupCourierLandmarks(restored);
    expect(courierStore.read(restored).phase).toBe("running");
    expect(missionBoard.read(restored).active).toBe("courier_0_standard");
    // The snapshot is written on the second the readout changes, so the resume is within a second.
    expect(Math.abs((missionBoard.read(restored).view?.remaining ?? 0) - saved)).toBeLessThanOrEqual(1);
    expect(restored.scene.object.list().filter((object) => object.catalogId.startsWith("obj_delivery_") || object.catalogId === "obj_dispatch")).toHaveLength(4);
    expect(restored.time.isPaused()).toBe(true);
    restored.game.commands.run("game.start", {});
    expect(restored.time.isPaused()).toBe(false);
  });
});
