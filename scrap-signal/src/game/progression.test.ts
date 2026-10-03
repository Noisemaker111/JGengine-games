import { describe, expect, test } from "bun:test";
import { seededRng } from "@jgengine/core/random/rng";
import { createLootRegistry } from "@jgengine/core/game/lootTable";
import { gunById, registerGun, rollGun } from "./handroll/roll";
import { starterPistol } from "./items/weapons/catalog";
import { lootTables } from "./entities/enemies/loot-tables";
import { advanceGunDrought, CONTRACT_GUNS, createInitialProgression, normalizeProgression, shieldCapacityFor } from "./progression";

describe("salvage equipment", () => {
  test("published saves can still resolve their original procedural starter", () => {
    const legacy = gunById("gun_1_pistol_common");
    expect(legacy?.family).toBe("pistol");
    expect(legacy?.element).toBe("explosive");
    expect(legacy?.name).toBe("Explosive Ferocious Handline");
    expect(legacy?.weapon.fireIntervalMs).toBe(299);
  });

  test("starter teaches direct hits and contract weapons offer different counters and resource costs", () => {
    expect(starterPistol.element).toBe("none");
    expect(starterPistol.weapon.explosion).toBeUndefined();
    const breacher = CONTRACT_GUNS.find((gun) => gun.id === "relay_breacher")!;
    const surveyor = CONTRACT_GUNS.find((gun) => gun.id === "relay_surveyor")!;
    expect(gunById(breacher.id)).toBe(breacher);
    expect(breacher.weapon.damage * breacher.weapon.pellets!).toBeGreaterThan(surveyor.weapon.damage);
    expect(breacher.weapon.range).toBeLessThan(surveyor.weapon.range / 3);
    expect(breacher.magSize).toBeLessThan(surveyor.magSize);
    expect(breacher.reloadMs).toBeLessThan(surveyor.reloadMs);
    expect(breacher.ammo).not.toBe(surveyor.ammo);
    expect(surveyor.element).toBe("shock");
    expect(surveyor.auto).toBe(false);
  });

  test("legendary slow weapons retain reload and firing windows", () => {
    const rng = seededRng("legendary-cadence-trades");
    for (let i = 0; i < 50; i += 1) {
      expect(rollGun(rng, 2, { family: "shotgun", rarity: "legendary" }).weapon.fireIntervalMs).toBeGreaterThan(350);
      expect(rollGun(rng, 2, { family: "sniper", rarity: "legendary" }).weapon.fireIntervalMs).toBeGreaterThan(250);
      expect(rollGun(rng, 2, { family: "launcher", rarity: "legendary" }).weapon.fireIntervalMs).toBeGreaterThan(600);
    }
  });

  test("restored gun ids advance allocation so later loot cannot overwrite the saved gun", () => {
    const restored = { ...starterPistol, id: "gun_90000_pistol_rare", name: "Saved salvage" };
    registerGun(restored);
    const next = rollGun(seededRng("resume-loot"), 2);
    expect(Number(next.id.split("_")[1])).toBeGreaterThan(90000);
    expect(gunById(restored.id)?.name).toBe("Saved salvage");
  });

  test("faster recovery costs capacity and rekit round trips cannot inflate the shield", () => {
    let max = 85;
    for (let i = 0; i < 100; i += 1) {
      max = shieldCapacityFor(max, "balanced", "skirmish");
      expect(max).toBeCloseTo(59.5);
      max = shieldCapacityFor(max, "skirmish", "bulwark");
      expect(max).toBeCloseTo(119);
      max = shieldCapacityFor(max, "bulwark", "balanced");
    }
    expect(max).toBeCloseTo(85);
  });
});

describe("salvage progression", () => {
  test("five dry kills produce salvage and a real drop resets the guarantee", () => {
    let drought = 0;
    for (let i = 0; i < 4; i += 1) {
      const next = advanceGunDrought(drought, false);
      expect(next.guaranteed).toBe(false);
      drought = next.gunDrought;
    }
    const resumed = JSON.parse(JSON.stringify({ ...createInitialProgression(), gunDrought: drought }));
    expect(advanceGunDrought(normalizeProgression(resumed).gunDrought, false)).toEqual({ gunDrought: 0, guaranteed: true });
    expect(advanceGunDrought(4, true)).toEqual({ gunDrought: 0, guaranteed: false });
  });

  test("saved choices survive JSON and unknown old choices migrate safely", () => {
    const saved = { contractGun: "relay_surveyor", shieldProfile: "skirmish" as const, gunDrought: 3 };
    expect(normalizeProgression(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    expect(normalizeProgression({ contractGun: "missing", shieldProfile: "obsolete", gunDrought: NaN } as never)).toEqual(createInitialProgression());
  });

  test("early salvage supplies usable calibers, while tough enemies introduce scarce ammo", () => {
    const registry = createLootRegistry({ rng: seededRng("loot-registry") });
    for (const table of lootTables) registry.register(table);
    const rng = seededRng("early-salvage");
    let earlyAmmo = 0;
    let lateAmmo = 0;
    for (let i = 0; i < 500; i += 1) {
      const early = registry.roll("drops_bandit", rng);
      expect(early.some((drop) => drop.item === "ammo_sniper_pack" || drop.item === "ammo_rocket_pack")).toBe(false);
      earlyAmmo += Number(early.some((drop) => drop.item?.startsWith("ammo_")));
      lateAmmo += Number(registry.roll("drops_elite", rng).some((drop) => drop.item === "ammo_sniper_pack" || drop.item === "ammo_rocket_pack"));
    }
    expect(earlyAmmo).toBeGreaterThan(180);
    expect(lateAmmo).toBeGreaterThan(70);
  });
});
