import { afterEach, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { memorySaveBackend, type SaveBackend } from "@jgengine/core/game/saveStore";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { loop } from "../loop";
import { content } from "./content";
import { inventories } from "./inventories";
import { pickCharacter, resetCharacterState } from "./characters";
import { setGamePhase } from "./phase";
import { player } from "./entities/players/catalog";
import { RELAY, relayStore } from "./relay";
import { pendingChassisStore, reserveStore, blackMarketStore, characterIdStore, talentRanksStore, progressionStore } from "./stores";
import { reservePhase, powerSurge } from "./handroll/reserve";
import { starterPistol } from "./items/weapons/catalog";
import { enemyTacticsStore, rememberHome } from "./entities/enemies/ai";
import { gunById, registerGun, rollGun } from "./handroll/roll";
import { seededRng } from "@jgengine/core/random/rng";
import { rememberGun } from "./lootPersistence";
import { shieldProfileById } from "./progression";
import { resumeBuild } from "./commands";

afterEach(resetCharacterState);

function boot(backend: SaveBackend = memorySaveBackend()) {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "player-recovery", assets: createAssetCatalog(), multiplayer: "off", inventories, persist: true, features: { quest: true } }),
    content, player: { userId: "p1", isNew: true },
    save: { backend, key: "player-recovery", mode: "manual" },
  });
  loop.onInit(ctx);
  ctx.scene.entity.spawn(player.id, { id: "p1", role: "player", position: [RELAY.x, 0, RELAY.z], rotationY: 0.7 });
  ctx.player.applyLoadout("p1", "starterKit");
  pickCharacter("gunk");
  setGamePhase(ctx, "playing");
  return ctx;
}

function fatalHit(ctx: ReturnType<typeof boot>) {
  return ctx.scene.entity.effect({ from: "attacking-husk", to: "p1", effect: "damage", via: { amount: 10000 } });
}

test("the real claw attack in onTick restores the chassis before the contract reports failure", () => {
  const ctx = boot();
  ctx.scene.entity.update("p1", { position: [RELAY.x + 2, 0, RELAY.z + 2] });
  ctx.scene.entity.stats.set("p1", "health", { current: 5 });
  ctx.scene.entity.stats.set("p1", "shield", { current: 0 });
  ctx.game.commands.run("relay.start", {});
  const id = relayStore.read(ctx).enemies[0]!;
  const position = [RELAY.x + 3.5, 0, RELAY.z + 2] as const;
  ctx.scene.entity.spawn("husk", { id, position, onExisting: "replace" });
  rememberHome(ctx, id, position, 1);
  ctx.time.advance(0.01);
  loop.onTick(ctx, 0.01);
  expect(enemyTacticsStore.read(ctx)[id]?.phase).toBe("windup");
  ctx.time.advance(0.59);
  loop.onTick(ctx, 0.59);
  expect(ctx.scene.entity.get("p1")).not.toBeNull();
  expect(ctx.scene.entity.stats.get("p1", "health")?.current).toBe(1);
  expect(reservePhase(ctx)).toBe("downed");
  expect(relayStore.read(ctx).phase).toBe("lost");
  expect(gamePhase(ctx)).toBe("ended");
  expect(pendingChassisStore.read(ctx)).toBeNull();
});

test("native lethal hit becomes downed, loses the contract and reconstructs through ordinary Continue", async () => {
  const backend = memorySaveBackend();
  const ctx = boot(backend);
  ctx.scene.entity.stats.set("p1", "health", { max: 123, current: 84.48, min: 1 });
  ctx.scene.entity.stats.set("p1", "shield", { max: 84, current: 0 });
  ctx.scene.entity.stats.set("p1", "ammo_pistol", { max: 260, current: 74 });
  ctx.scene.entity.stats.set("p1", "level", { max: 30, min: 1, current: 4 });
  ctx.game.commands.run("relay.start", {});
  const hostiles = [...relayStore.read(ctx).enemies];
  expect(hostiles).toHaveLength(2);
  expect(fatalHit(ctx)[0]?.lethal).toBe(true);
  expect(reservePhase(ctx)).toBe("downed");
  expect(ctx.scene.entity.get("p1")).toBeNull();
  expect(pendingChassisStore.read(ctx)?.stats.health?.current).toBe(1);

  loop.onTick(ctx, 1 / 60);
  expect(ctx.scene.entity.get("p1")?.position).toEqual([RELAY.x, 0, RELAY.z]);
  expect(ctx.scene.entity.get("p1")?.rotationY).toBe(0.7);
  expect(ctx.scene.entity.get("p1")?.role).toBe("player");
  expect(ctx.scene.entity.stats.get("p1", "health")?.max).toBe(123);
  expect(ctx.scene.entity.stats.get("p1", "shield")?.max).toBe(84);
  expect(ctx.scene.entity.stats.get("p1", "level")?.current).toBe(4);
  expect(relayStore.read(ctx).phase).toBe("lost");
  expect(gamePhase(ctx)).toBe("ended");
  for (const id of hostiles) expect(ctx.scene.entity.get(id)).toBeNull();
  expect(ctx.game.economy.balance("p1", "cash")).toBe(50);
  expect(ctx.player.inventory.state("hotbar").slots[0]?.itemId).toBe(starterPistol.id);
  expect(ctx.scene.entity.stats.get("p1", "ammo_pistol")?.current).toBe(74);

  await ctx.game.save!.checkpoint();
  const reboot = boot(backend);
  expect(await reboot.game.save!.load()).toBe(true);
  expect(reservePhase(reboot)).toBe("downed");
  expect(relayStore.read(reboot).phase).toBe("lost");
  reboot.game.commands.run("relay.continue", {});
  expect(reservePhase(reboot)).toBe("up");
  expect(gamePhase(reboot)).toBe("playing");
  expect(relayStore.read(reboot).phase).toBe("idle");
  expect(reboot.game.economy.balance("p1", "cash")).toBe(47);
  expect(reboot.scene.entity.stats.get("p1", "health")?.current).toBe(123);
  expect(reboot.scene.entity.stats.get("p1", "shield")?.current).toBe(84);
  expect(reboot.scene.entity.stats.get("p1", "ammo_pistol")?.current).toBe(74);
  expect(reboot.player.inventory.state("hotbar").slots[0]?.itemId).toBe(starterPistol.id);
  reboot.game.commands.run("relay.continue", {});
  expect(reboot.game.economy.balance("p1", "cash")).toBe(47);
  expect(fatalHit(reboot)[0]?.lethal).toBe(true);
  expect(pendingChassisStore.read(reboot)).not.toBeNull();
  loop.onTick(reboot, 1 / 60);
  expect(reboot.scene.entity.get("p1")).not.toBeNull();
  expect(reservePhase(reboot)).toBe("downed");
});

test("checkpoint between native despawn and the next game tick retains the pending downed chassis", async () => {
  const backend = memorySaveBackend();
  const ctx = boot(backend);
  ctx.scene.entity.stats.set("p1", "ammo_pistol", { current: 33 });
  fatalHit(ctx);
  await ctx.game.save!.checkpoint();
  const reboot = boot(backend);
  expect(await reboot.game.save!.load()).toBe(true);
  expect(reboot.scene.entity.get("p1")).toBeNull();
  expect(reservePhase(reboot)).toBe("downed");
  const untilMs = reserveStore.read(reboot).untilMs;
  loop.onTick(reboot, 1 / 60);
  expect(reboot.scene.entity.get("p1")).not.toBeNull();
  expect(reboot.scene.entity.stats.get("p1", "health")?.current).toBe(1);
  expect(reboot.scene.entity.stats.get("p1", "ammo_pistol")?.current).toBe(33);
  expect(reserveStore.read(reboot).untilMs).toBe(untilMs);
  expect(pendingChassisStore.read(reboot)).toBeNull();
  powerSurge(reboot);
  expect(reservePhase(reboot)).toBe("up");
  expect(reboot.scene.entity.stats.get("p1", "health")?.current).toBeGreaterThan(1);
  expect(fatalHit(reboot)[0]?.lethal).toBe(true);
  expect(reservePhase(reboot)).toBe("downed");
  loop.onTick(reboot, 1 / 60);
  expect(reboot.scene.entity.get("p1")).not.toBeNull();
});

test("checkpoint inside the death event restores an existing pending actor with downed movement", async () => {
  const backend = memorySaveBackend();
  const ctx = boot(backend);
  let checkpoint: Promise<void> | undefined;
  ctx.game.events.on("entity.died", (event) => {
    if (event.instanceId === "p1") checkpoint = ctx.game.save!.checkpoint();
  });
  fatalHit(ctx);
  expect(checkpoint).toBeDefined();
  await checkpoint;
  const reboot = boot(backend);
  expect(await reboot.game.save!.load()).toBe(true);
  expect(reboot.scene.entity.get("p1")).not.toBeNull();
  expect(pendingChassisStore.read(reboot)).not.toBeNull();
  expect(reservePhase(reboot)).toBe("downed");
  loop.onTick(reboot, 1 / 60);
  expect(reboot.scene.entity.get("p1")?.movement.walkSpeed).toBe(1.6);
  expect(reboot.scene.entity.stats.get("p1", "health")?.current).toBe(1);
  expect(pendingChassisStore.read(reboot)).toBeNull();
});

test("reconstruction and power surge retain learned movement speed instead of resetting to the base chassis", () => {
  const ctx = boot();
  characterIdStore.write(ctx, "nyx");
  talentRanksStore.write(ctx, { nyx_lightweight_rails: 2 });
  expect(resumeBuild(ctx)).toBe(true);
  ctx.game.commands.run("relay.start", {});
  fatalHit(ctx);
  loop.onTick(ctx, 1 / 60);
  expect(ctx.scene.entity.get("p1")?.movement.walkSpeed).toBe(1.6);
  ctx.game.commands.run("relay.continue", {});
  expect(ctx.scene.entity.get("p1")?.movement.walkSpeed).toBe(6.4);
  fatalHit(ctx);
  loop.onTick(ctx, 1 / 60);
  ctx.scene.entity.spawn("husk", { id: "surge-target", position: [RELAY.x + 30, 0, RELAY.z] });
  ctx.scene.entity.effect({ from: "p1", to: "surge-target", effect: "damage", via: { amount: 1000 } });
  expect(reservePhase(ctx)).toBe("up");
  expect(ctx.scene.entity.get("p1")?.movement.walkSpeed).toBe(6.4);
});

test("an older missing-chassis checkpoint rebuilds a damaged saved build without charging or refilling twice", async () => {
  const backend = memorySaveBackend();
  const old = boot(backend);
  characterIdStore.write(old, "gunk");
  talentRanksStore.write(old, { gunk_reinforced_chassis: 2 });
  blackMarketStore.write(old, { health: 1, shield: 1, ammo: 1, grenade: 1 });
  progressionStore.write(old, { contractGun: "relay_breacher", shieldProfile: "bulwark", gunDrought: 3 });
  old.game.quest!.accept("p1", "q_ripper_control");
  old.game.quest!.progress("p1", "q_ripper_control", "pups", 2);
  old.game.economy.grant("p1", "cash", 27);
  const gun = rollGun(seededRng("legacy-recovered-salvage"), 4, { family: "rifle", rarity: "rare" });
  old.player.inventory.put("hotbar", gun.id, 1, { slot: 1 });
  rememberGun(old, gun.id);
  old.game.commands.run("relay.start", {});
  old.scene.entity.despawn("p1");
  pendingChassisStore.clear(old);
  reserveStore.write(old, { phase: "up", untilMs: 0 });
  await old.game.save!.checkpoint();
  registerGun({ ...gun, name: "unhydrated registry" });

  const reboot = boot(backend);
  await loop.resumeOrStart(reboot);
  expect(reboot.scene.entity.get("p1")?.role).toBe("player");
  expect(reservePhase(reboot)).toBe("downed");
  expect(gamePhase(reboot)).toBe("ended");
  expect(relayStore.read(reboot).phase).toBe("lost");
  expect(relayStore.read(reboot).enemies).toHaveLength(0);
  expect(relayStore.read(reboot).reason).toContain("level/XP and reserve ammo");
  expect(reboot.scene.entity.stats.get("p1", "health")).toMatchObject({ current: 1, min: 1, max: 129 });
  expect(reboot.scene.entity.stats.get("p1", "shield")?.current).toBe(0);
  expect(reboot.scene.entity.stats.get("p1", "shield")?.max).toBeCloseTo(119);
  expect(reboot.scene.entity.stats.get("p1", "ammo_pistol")).toMatchObject({ current: 0, max: 260 });
  expect(reboot.scene.entity.stats.get("p1", "ammo_smg")?.current).toBe(0);
  expect(reboot.scene.entity.stats.get("p1", "ammo_shotgun")?.current).toBe(0);
  expect(reboot.scene.entity.stats.get("p1", "grenades")).toMatchObject({ current: 0, max: 7 });
  expect(reboot.scene.entity.stats.get("p1", "level")?.current).toBe(1);
  expect(reboot.scene.entity.stats.get("p1", "xp")?.current).toBe(0);
  expect(progressionStore.read(reboot).shieldProfile).toBe("bulwark");
  expect(shieldProfileById(progressionStore.read(reboot).shieldProfile)?.name).toBe("Siege capacitor");
  expect(progressionStore.read(reboot).contractGun).toBe("relay_breacher");
  expect(gunById(gun.id)).toEqual(gun);
  expect(reboot.player.inventory.state("hotbar").slots[1]?.itemId).toBe(gun.id);
  expect(reboot.game.economy.balance("p1", "cash")).toBe(77);
  expect(reboot.game.quest!.list("p1").find((quest) => quest.questId === "q_ripper_control")?.objectives.find((objective) => objective.id === "pups")?.progress).toBe(2);

  const pendingReturn = boot(backend);
  await loop.resumeOrStart(pendingReturn);
  expect(pendingReturn.scene.entity.stats.get("p1", "health")?.current).toBe(1);
  expect(pendingReturn.game.economy.balance("p1", "cash")).toBe(77);
  pendingReturn.game.commands.run("relay.continue", {});
  expect(pendingReturn.game.economy.balance("p1", "cash")).toBe(72);
  expect(pendingReturn.scene.entity.stats.get("p1", "health")?.current).toBe(129);
  expect(pendingReturn.scene.entity.stats.get("p1", "shield")?.current).toBeCloseTo(119);
  expect(pendingReturn.scene.entity.stats.get("p1", "ammo_pistol")?.current).toBe(0);
  await pendingReturn.game.save!.checkpoint();
  const nextBoot = boot(backend);
  await loop.resumeOrStart(nextBoot);
  expect(nextBoot.game.economy.balance("p1", "cash")).toBe(72);
  expect(reservePhase(nextBoot)).toBe("up");
  expect(relayStore.read(nextBoot).phase).toBe("idle");
  nextBoot.game.commands.run("relay.continue", {});
  expect(nextBoot.game.economy.balance("p1", "cash")).toBe(72);
});
