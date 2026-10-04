import { afterEach, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { seededRng } from "@jgengine/core/random/rng";
import { content } from "./content";
import { inventories } from "./inventories";
import { registerCommands } from "./commands";
import { RELAY, relayStore } from "./relay";
import { progressionStore } from "./stores";
import { resetCharacterState } from "./characters";
import { gunById, rollGun, registerGun } from "./handroll/roll";
import { enterDowned, reservePhase, reserveExpired } from "./handroll/reserve";
import { rememberGun, restoreGuns } from "./lootPersistence";

afterEach(resetCharacterState);

function boot(backend = memorySaveBackend()) {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "field-recovery", assets: createAssetCatalog(), multiplayer: "off", inventories, persist: true }),
    content, player: { userId: "p1", isNew: true },
    save: { backend, key: "field-recovery", mode: "manual" },
  });
  ctx.scene.entity.spawn("reactor_hunter", { id: "p1", position: [RELAY.x, 0, RELAY.z] });
  registerCommands(ctx);
  return ctx;
}

test("first completion chooses one permanent counter weapon, including full-hotbar recovery", async () => {
  const backend = memorySaveBackend();
  const ctx = boot(backend);
  ctx.game.commands.run("progression.claimGun", { gunId: "relay_breacher" });
  expect(progressionStore.read(ctx).contractGun).toBeNull();
  relayStore.update(ctx, (state) => ({ ...state, rewarded: true, phase: "won" }));
  for (let slot = 0; slot < 4; slot++) ctx.player.inventory.put("hotbar", `test_${slot}`, 1, { slot });
  ctx.game.commands.run("progression.claimGun", { gunId: "relay_breacher" });
  expect(progressionStore.read(ctx).contractGun).toBe("relay_breacher");
  expect(ctx.scene.worldItem.list().filter((item) => item.itemId === "relay_breacher")).toHaveLength(1);
  ctx.game.commands.run("progression.claimGun", { gunId: "relay_surveyor" });
  expect(ctx.scene.worldItem.list().filter((item) => item.itemId === "relay_surveyor")).toHaveLength(0);
  await ctx.game.save!.checkpoint();
  const reboot = boot(backend);
  await reboot.game.save!.load();
  reboot.game.commands.run("progression.claimGun", { gunId: "relay_surveyor" });
  expect(progressionStore.read(reboot).contractGun).toBe("relay_breacher");
});

test("field rekit preserves missing shield fraction and cannot be done in combat or away from the rack", () => {
  const ctx = boot();
  ctx.scene.entity.stats.set("p1", "shield", { max: 60, current: 30 });
  ctx.game.commands.run("progression.shield", { profileId: "skirmish" });
  expect(ctx.scene.entity.stats.get("p1", "shield")?.max).toBeCloseTo(42);
  expect(ctx.scene.entity.stats.get("p1", "shield")?.current).toBeCloseTo(21);
  relayStore.update(ctx, (state) => ({ ...state, phase: "defend" }));
  ctx.game.commands.run("progression.shield", { profileId: "bulwark" });
  expect(progressionStore.read(ctx).shieldProfile).toBe("skirmish");
  relayStore.update(ctx, (state) => ({ ...state, phase: "idle" }));
  ctx.scene.entity.update("p1", { position: [RELAY.x + 10, 0, RELAY.z] });
  ctx.game.commands.run("progression.shield", { profileId: "bulwark" });
  expect(progressionStore.read(ctx).shieldProfile).toBe("skirmish");
  ctx.scene.entity.update("p1", { position: [RELAY.x, 0, RELAY.z] });
  ctx.game.commands.run("progression.shield", { profileId: "balanced" });
  expect(ctx.scene.entity.stats.get("p1", "shield")?.current).toBeCloseTo(30);
});

test("checkpoint carries rolled gun data and downed recovery deadline into a new context", async () => {
  const backend = memorySaveBackend();
  const ctx = boot(backend);
  const gun = rollGun(seededRng("save-loot"), 4, { family: "rifle", rarity: "rare" });
  ctx.player.inventory.put("hotbar", gun.id, 1, { slot: 2 });
  rememberGun(ctx, gun.id);
  enterDowned(ctx, 5000);
  await ctx.game.save!.checkpoint();
  registerGun({ ...gun, name: "stale registry" });
  const reboot = boot(backend);
  expect(await reboot.game.save!.load()).toBe(true);
  restoreGuns(reboot);
  expect(gunById(gun.id)).toEqual(gun);
  expect(reboot.player.inventory.state("hotbar").slots[2]?.itemId).toBe(gun.id);
  expect(reservePhase(reboot)).toBe("downed");
  expect(reserveExpired(reboot, 16999)).toBe(false);
  expect(reserveExpired(reboot, 17000)).toBe(true);
});
