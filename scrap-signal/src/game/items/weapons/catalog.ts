import { seededRng } from "@jgengine/core/random/rng";
import { registerGun, rollGun } from "../../handroll/roll";
import type { GunDef } from "../../handroll/guns";
import { CONTRACT_GUNS } from "../../progression";

registerGun({ ...rollGun(seededRng("scrap-starter-arsenal"), 1, { family: "pistol", rarity: "common" }), id: "gun_1_pistol_common" });

export const starterPistol: GunDef = registerGun({
  id: "starter_coilpin", kind: "gun", name: "Rustline Coilpin", family: "pistol", manufacturer: "Chuckwerk",
  rarity: "common", element: "none", level: 1, ammo: "pistol", auto: false, ammoPerShot: 1,
  magSize: 10, reloadMs: 1100, elementChance: 0, elementDps: 0, use: "fireGun",
  weapon: { damage: 14, range: 46, spread: 1.1, fireIntervalMs: 280, critChance: 0.12, critMult: 2 },
});

for (const gun of CONTRACT_GUNS) registerGun(gun);

export { registerGun, rollGun };
export type { GunDef };
