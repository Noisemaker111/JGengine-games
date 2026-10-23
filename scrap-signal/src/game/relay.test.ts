import { afterEach, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { content } from "./content";
import { pickCharacter, resetCharacterState } from "./characters";
import { lootTables } from "./entities/enemies/loot-tables";
import { RELAY, registerRelay, relayEnemyDied, relayStore, tickRelay } from "./relay";
import { deadAirBoard, restoreDeadAir, startDeadAir } from "./missions/deadAir";

afterEach(resetCharacterState);

function boot(backend = memorySaveBackend()) {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "dead-air-test", assets: createAssetCatalog(), multiplayer: "off", persist: true }),
    content, player: { userId: "reclaimer", isNew: true },
    save: { backend, key: "dead-air-test", mode: "manual" },
  });
  ctx.scene.entity.spawn("reactor_hunter", { id: "reclaimer", position: [RELAY.x, 0, RELAY.z] });
  for (const table of lootTables) ctx.game.loot.register(table);
  registerRelay(ctx, () => {});
  ctx.game.events.on("entity.died", (event) => relayEnemyDied(ctx, event));
  pickCharacter("gunk");
  setGamePhase(ctx, "playing");
  return ctx;
}

/** Kill every live ambusher from where the player stands. */
function clearWave(ctx: ReturnType<typeof boot>): void {
  for (const id of relayStore.read(ctx).enemies) {
    ctx.scene.entity.effect({ from: ctx.player.userId, to: id, effect: "damage", via: { amount: 10000 } });
  }
}

function tick(ctx: ReturnType<typeof boot>, seconds: number, step = 0.25): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += step) tickRelay(ctx, step);
}

test("the contract is a three-step chain: reach, clear from inside the ring, then hold", () => {
  const ctx = boot();
  ctx.game.commands.run("relay.start", {});
  expect(deadAirBoard.read(ctx).active).toBe(true);
  expect(deadAirBoard.read(ctx).view?.objectiveId).toBe("reach");
  expect(deadAirBoard.read(ctx).view?.step).toBe(1);
  expect(deadAirBoard.read(ctx).view?.steps).toBe(3);

  tickRelay(ctx, 0.1);
  expect(deadAirBoard.read(ctx).view?.objectiveId).toBe("clear");
  expect(relayStore.read(ctx).wave).toBe(1);

  clearWave(ctx);
  tickRelay(ctx, 0.1);
  expect(deadAirBoard.read(ctx).view?.objectiveId).toBe("hold");
  expect(deadAirBoard.read(ctx).view?.step).toBe(3);
  expect(deadAirBoard.read(ctx).view?.remaining).toBe(60);
});

test("a kill outside the copper ring does not advance the constrained objective", () => {
  const ctx = boot();
  ctx.game.commands.run("relay.start", {});
  tickRelay(ctx, 0.1);
  ctx.scene.entity.update("reclaimer", { position: [RELAY.x + RELAY.radius + 6, 0, RELAY.z] });
  clearWave(ctx);
  tickRelay(ctx, 0.1);
  expect(deadAirBoard.read(ctx).view?.objectiveId).toBe("clear");
  expect(deadAirBoard.read(ctx).view?.counted).toBe(0);
});

test("leaving the ring fails the hold, and the reward is not paid", () => {
  const ctx = boot();
  ctx.game.commands.run("relay.start", {});
  tickRelay(ctx, 0.1);
  clearWave(ctx);
  tickRelay(ctx, 0.1);
  expect(deadAirBoard.read(ctx).view?.objectiveId).toBe("hold");

  tick(ctx, 10);
  ctx.scene.entity.update("reclaimer", { position: [RELAY.x + RELAY.radius + 12, 0, RELAY.z] });
  tickRelay(ctx, 0.1);
  expect(deadAirBoard.read(ctx).active).toBe(false);
  expect(relayStore.read(ctx).phase).toBe("lost");
  expect(relayStore.read(ctx).reason).toContain("left the copper ring");
  expect(ctx.game.economy.balance("reclaimer", "cash")).toBe(0);
  expect(gamePhase(ctx)).toBe("ended");
});

test("holding the sixty-second window pays once, and a replay pays nothing", () => {
  const ctx = boot();
  ctx.game.commands.run("relay.start", {});
  tickRelay(ctx, 0.1);
  for (let wave = 1; wave <= 2; wave += 1) { clearWave(ctx); tick(ctx, 20.5); }
  clearWave(ctx);
  const beforeWin = ctx.game.economy.balance("reclaimer", "cash");
  const coresBefore = ctx.game.economy.balance("reclaimer", "cores");
  tick(ctx, 20.5);
  expect(relayStore.read(ctx).phase).toBe("won");
  expect(ctx.game.economy.balance("reclaimer", "cash") - beforeWin).toBe(120);
  expect(ctx.game.economy.balance("reclaimer", "cores") - coresBefore).toBe(3);
  expect(gamePhase(ctx)).toBe("ended");

  ctx.game.commands.run("relay.continue", {});
  expect(relayStore.read(ctx).phase).toBe("idle");
  ctx.game.commands.run("relay.start", {});
  tickRelay(ctx, 0.1);
  clearWave(ctx);
  tick(ctx, 20.5);
  clearWave(ctx);
  tick(ctx, 20.5);
  clearWave(ctx);
  const beforeReplayWin = ctx.game.economy.balance("reclaimer", "cash");
  tick(ctx, 20.5);
  expect(relayStore.read(ctx).phase).toBe("won");
  // Kills pay small change; the contract itself must not pay a second time.
  expect(ctx.game.economy.balance("reclaimer", "cash") - beforeReplayWin).toBe(0);
  expect(relayStore.read(ctx).rewarded).toBe(true);
});

test("a reload resumes the hold with the seconds it had left", async () => {
  const backend = memorySaveBackend();
  const ctx = boot(backend);
  ctx.game.commands.run("relay.start", {});
  tickRelay(ctx, 0.1);
  clearWave(ctx);
  tickRelay(ctx, 0.1);
  tick(ctx, 25);
  const remaining = deadAirBoard.read(ctx).view?.remaining ?? 0;
  expect(remaining).toBeGreaterThan(30);
  expect(remaining).toBeLessThan(60);
  await ctx.game.save!.save();

  const restored = boot(backend);
  expect(await restored.game.save!.load()).toBe(true);
  restoreDeadAir(restored);
  expect(deadAirBoard.read(restored).active).toBe(true);
  expect(deadAirBoard.read(restored).view?.objectiveId).toBe("hold");
  // The snapshot is written on the second the readout changes, so the resume is within a second.
  expect(Math.abs((deadAirBoard.read(restored).view?.remaining ?? 0) - remaining)).toBeLessThanOrEqual(1);
  startDeadAir(restored);
  expect(deadAirBoard.read(restored).view?.objectiveId).toBe("reach");
});
