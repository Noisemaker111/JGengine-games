import { afterEach, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createInputSnapshot } from "@jgengine/core/runtime/inputSnapshot";
import { canTrigger, handledAim, handlingView, noteHandledShot, shotSpreadDeg, spendShotCadence, tickWeaponHandling, type HandlingView } from "./combatFeel";
import { FAMILY_BASES, type GunDef } from "./handroll";
import { resetFeel } from "./feel";
import { resetCharacterState } from "./characters";
const base = FAMILY_BASES.find((entry) => entry.family === "rifle")!;
const gun = { ...base, id: "test_rifle", weapon: base.stats } as GunDef;
const steady: HandlingView = { aiming: false, crouching: false, moving: false, sprinting: false, bloom: 0, climbDeg: 0 };
afterEach(() => { resetFeel(); resetCharacterState(); });
function context() {
  let nowMs = 0;
  const ctx = { game: { store: new Map() }, time: { now: () => nowMs / 1000 }, input: createInputSnapshot(), player: { userId: "p1" }, scene: { entity: { get: () => null } } } as unknown as GameContext;
  return { ctx, at: (value: number) => { nowMs = value; } };
}

test("aiming and crouch make survey shots precise; movement and sustained fire open the cone", () => {
  const hip = shotSpreadDeg(gun, steady);
  const aimed = shotSpreadDeg(gun, { ...steady, aiming: true });
  const braced = shotSpreadDeg(gun, { ...steady, aiming: true, crouching: true });
  expect(braced).toBeLessThan(aimed);
  expect(aimed).toBeLessThan(hip);
  expect(shotSpreadDeg(gun, { ...steady, moving: true })).toBeGreaterThan(hip);
  expect(shotSpreadDeg(gun, { ...steady, bloom: 3 })).toBeGreaterThan(hip);
  const sampled = handledAim(gun, { ...steady, climbDeg: 2 }, { yaw: 0, pitch: 0 }, () => 0);
  expect(sampled.pitch).toBeCloseTo(2 * Math.PI / 180);
});

test("published cadence blocks rapid spam; switching never bypasses a gun's own cooldown", () => {
  const { ctx, at } = context();
  expect(spendShotCadence(ctx, gun)).toBe(true);
  at(50);
  expect(spendShotCadence(ctx, gun)).toBe(false);
  at(128);
  expect(spendShotCadence(ctx, gun)).toBe(true);
});

test("semi-auto requires release while automatic guns keep firing; sprint forbids firing", () => {
  const { ctx } = context();
  const semi = { ...gun, auto: false };
  ctx.input.publish(["fire"]);
  expect(canTrigger(ctx, semi)).toBe(true);
  noteHandledShot(ctx, semi);
  expect(canTrigger(ctx, semi)).toBe(false);
  expect(canTrigger(ctx, gun)).toBe(true);
  ctx.input.publish([]);
  tickWeaponHandling(ctx, 0.1);
  expect(canTrigger(ctx, semi)).toBe(true);
  ctx.input.publish(["sprint", "moveForward"]);
  tickWeaponHandling(ctx, 0.1);
  expect(canTrigger(ctx, gun)).toBe(false);
  expect(handlingView(ctx).sprinting).toBe(true);
});

import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { itemUseHandlers } from "./items/use-handlers";
import { registerGun } from "./handroll/roll";
import { lastHit } from "./feel";
import { magLoaded } from "./handroll";

function liveCombat(health: number, element: GunDef["element"] = "none", shield = 0) {
  const weapon = registerGun({ ...gun, id: `test_damage_${element}`, family: "pistol", ammo: "pistol", auto: false, magSize: 5, reloadMs: 1000, ammoPerShot: 1, element, elementChance: 0, elementDps: 0, weapon: { ...gun.weapon, damage: 20, critChance: 0, critMult: 2, spread: 0 } });
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "combat-regression", assets: createAssetCatalog(), multiplayer: "off" }),
    player: { userId: "p1", isNew: true },
    content: {
      entityById: (id) => ({ stats: { health: { max: id === "p1" ? 90 : health }, shield: { max: id === "p1" ? 0 : shield }, ammo_pistol: { max: 100, current: 50 } }, receive: { damage: { order: ["shield", "health"] } } }),
      itemById: (id) => id === weapon.id ? { weapon: { ...weapon.weapon } } : null,
    },
  });
  ctx.scene.entity.spawn("p1", { id: "p1", position: [0, 0, 0] });
  ctx.scene.entity.spawn("ripper", { id: "target", position: [0, 0, 7] });
  return { ctx, weapon, fire: () => itemUseHandlers.fireGun!.apply(ctx, { from: "p1", itemId: weapon.id, inventoryId: "hotbar", aim: { origin: [0, 1, 0], direction: [0, 0, 1] } }) };
}

test("a native resistant hit commits its matchup before death and cannot resurrect a target", () => {
  const { ctx, weapon, fire } = liveCombat(16, "incendiary");
  fire();
  expect(ctx.scene.entity.get("target")).not.toBeNull();
  expect(ctx.scene.entity.stats.get("target", "health")?.current).toBe(1);
  expect(magLoaded(ctx, weapon)).toBe(4);
  expect(lastHit().kill).toBe(false);
});

test("native lethal hits keep kill feedback after despawn; shield break is separately confirmed", () => {
  resetFeel();
  const lethal = liveCombat(10);
  lethal.fire();
  expect(lethal.ctx.scene.entity.get("target")).toBeNull();
  expect(lastHit().kill).toBe(true);
  resetFeel();
  const shielded = liveCombat(30, "shock", 25);
  shielded.fire();
  expect(shielded.ctx.scene.entity.stats.get("target", "shield")?.current).toBe(0);
  expect(shielded.ctx.scene.entity.stats.get("target", "health")?.current).toBe(15);
  expect(lastHit()).toMatchObject({ shield: true, shieldBreak: true, kill: false });
});

test("native shotgun pellet reports each commit one pellet worth of matchup damage", () => {
  const { ctx, weapon, fire } = liveCombat(100);
  weapon.weapon.damage = 7;
  weapon.weapon.pellets = 6;
  fire();
  expect(ctx.scene.entity.stats.get("target", "health")?.current).toBe(58);
  expect(magLoaded(ctx, weapon)).toBe(4);
});

import { pickCharacter, talentTree } from "./characters";
import { GRENADE, resetWeaponState } from "./items/use-handlers";

function nativeSplash(options: { damage?: number; radius?: number; critChance?: number; element?: GunDef["element"]; health?: number } = {}) {
  const damage = options.damage ?? 20;
  const radius = options.radius ?? 5;
  const health = options.health ?? 200;
  const weapon = registerGun({ ...gun, id: "test_splash", family: "launcher", ammo: "rocket", auto: false, magSize: 3, reloadMs: 1000, ammoPerShot: 1, element: options.element ?? "none", elementChance: 0, elementDps: 0,
    weapon: { ...gun.weapon, damage, critChance: options.critChance ?? 0, critMult: 2, spread: 0, explosion: { radius }, projectile: { speed: 10, fuseTime: 1 } } });
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "splash-regression", assets: createAssetCatalog(), multiplayer: "off" }),
    player: { userId: "p1", isNew: true },
    content: {
      entityById: () => ({ stats: { health: { max: health }, shield: { max: 0 }, grenades: { current: 2, max: 6 }, ammo_rocket: { max: 30, current: 10 } }, receive: { damage: { order: ["shield", "health"] } } }),
      itemById: (id) => id === weapon.id ? { weapon: { ...weapon.weapon } } : id === "frag_grenade" ? { weapon: { damage: GRENADE.damage, explosion: { radius: GRENADE.radius }, projectile: { speed: GRENADE.speed, fuseTime: GRENADE.fuseTime } } } : null,
    },
  });
  ctx.scene.entity.spawn("p1", { id: "p1", position: [0, 0, -20] });
  ctx.scene.entity.spawn("ripper", { id: "center", position: [0, 0, 0] });
  ctx.scene.entity.spawn("ripper", { id: "edge", position: [radius * 0.8, 0, 0] });
  const aim = { origin: [0, 0, 0] as const, direction: [0, 0, 1] as const };
  return { ctx, weapon, aim, damageAt: (id: string) => health - (ctx.scene.entity.stats.get(id, "health")?.current ?? 0) };
}

test("native splash falloff is preserved before and after a critical multiplier", () => {
  const native = nativeSplash();
  const shot = native.ctx.scene.entity.fireProjectile({ from: "p1", via: { item: native.weapon.id }, aim: native.aim, effect: "damage" });
  const report = native.ctx.scene.entity.settleProjectile(shot);
  expect(report.status).toBe("settled");
  expect(native.damageAt("center")).toBeCloseTo(20);
  expect(native.damageAt("edge")).toBeCloseTo(4);
  const game = nativeSplash({ critChance: 1 });
  itemUseHandlers.fireGun!.apply(game.ctx, { from: "p1", itemId: game.weapon.id, inventoryId: "hotbar", aim: game.aim });
  game.ctx.time.advance(1);
  expect(game.damageAt("center")).toBeCloseTo(40);
  expect(game.damageAt("edge")).toBeCloseTo(8);
  expect(magLoaded(game.ctx, game.weapon)).toBe(2);
});

test("native elemental blast resistance commits before death", () => {
  const game = nativeSplash({ element: "incendiary", health: 16 });
  itemUseHandlers.fireGun!.apply(game.ctx, { from: "p1", itemId: game.weapon.id, inventoryId: "hotbar", aim: game.aim });
  game.ctx.time.advance(1);
  expect(game.ctx.scene.entity.get("center")).not.toBeNull();
  expect(game.ctx.scene.entity.stats.get("center", "health")?.current).toBe(1);
});

test("grenade talent damage shares the native center and edge falloff", () => {
  pickCharacter("cipher");
  talentTree()!.hydrate({ points: 0, ranks: { cipher_scatter_protocol: 1 } });
  resetWeaponState();
  const game = nativeSplash({ radius: GRENADE.radius });
  itemUseHandlers.throwGrenade!.apply(game.ctx, { from: "p1", itemId: "frag_grenade", inventoryId: "backpack", aim: game.aim });
  game.ctx.time.advance(GRENADE.fuseTime);
  expect(game.damageAt("center")).toBeCloseTo(66);
  expect(game.damageAt("edge")).toBeCloseTo(13);
  expect(game.ctx.scene.entity.stats.get("p1", "grenades")?.current).toBe(1);
});
