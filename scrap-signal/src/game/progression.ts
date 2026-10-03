import type { GunDef } from "./handroll/guns";

export type ShieldProfileId = "balanced" | "skirmish" | "bulwark";

export interface ShieldProfile {
  id: ShieldProfileId;
  name: string;
  capacityMult: number;
  delayMs: number;
  regenFraction: number;
  blurb: string;
}

export const SHIELD_PROFILES: readonly ShieldProfile[] = [
  { id: "balanced", name: "Field capacitor", capacityMult: 1, delayMs: 5000, regenFraction: 0.12, blurb: "Full capacity · 5s quiet · 12% recharge/s" },
  { id: "skirmish", name: "Quickcycle capacitor", capacityMult: 0.7, delayMs: 2000, regenFraction: 0.2, blurb: "30% less capacity · 2s quiet · 20% recharge/s" },
  { id: "bulwark", name: "Siege capacitor", capacityMult: 1.4, delayMs: 7000, regenFraction: 0.09, blurb: "40% more capacity · 7s quiet · 9% recharge/s" },
];

export function shieldProfileById(id: string): ShieldProfile | undefined {
  return SHIELD_PROFILES.find((profile) => profile.id === id);
}

export function shieldCapacityFor(max: number, fromId: ShieldProfileId, toId: ShieldProfileId): number {
  const from = shieldProfileById(fromId)!;
  const to = shieldProfileById(toId)!;
  return Math.max(1, max / from.capacityMult * to.capacityMult);
}

export const CONTRACT_GUNS: readonly GunDef[] = [
  {
    id: "relay_breacher", kind: "gun", name: "Copper Breacher", family: "shotgun", manufacturer: "Chuckwerk",
    rarity: "rare", element: "none", level: 2, ammo: "shotgun", auto: false, ammoPerShot: 1,
    magSize: 4, reloadMs: 1550, elementChance: 0, elementDps: 0, use: "fireGun",
    weapon: { damage: 6, pellets: 7, range: 18, spread: 5.2, fireIntervalMs: 900, critChance: 0.05, critMult: 1.5 },
  },
  {
    id: "relay_surveyor", kind: "gun", name: "Carrier Surveyor", family: "rifle", manufacturer: "Apex",
    rarity: "rare", element: "shock", level: 2, ammo: "rifle", auto: false, ammoPerShot: 1,
    magSize: 10, reloadMs: 2000, elementChance: 0.5, elementDps: 8, use: "fireGun",
    weapon: { damage: 24, range: 80, spread: 0.45, fireIntervalMs: 360, critChance: 0.12, critMult: 2 },
  },
];

export const CONTRACT_GUN_ROLES: Readonly<Record<string, string>> = {
  relay_breacher: "Close ambush counter · 7 × 6 damage · 18m · 4 shells · quick reload",
  relay_surveyor: "Shield counter · shock · 24 damage · 80m · 10 rifle rounds · precise single shots",
};

export interface ProgressionState {
  contractGun: string | null;
  shieldProfile: ShieldProfileId;
  gunDrought: number;
}

export function createInitialProgression(): ProgressionState {
  return { contractGun: null, shieldProfile: "balanced", gunDrought: 0 };
}

export function normalizeProgression(raw: Partial<ProgressionState> | null | undefined): ProgressionState {
  return {
    contractGun: CONTRACT_GUNS.some((gun) => gun.id === raw?.contractGun) ? raw!.contractGun! : null,
    shieldProfile: shieldProfileById(raw?.shieldProfile ?? "")?.id ?? "balanced",
    gunDrought: Number.isSafeInteger(raw?.gunDrought) && raw!.gunDrought! >= 0 ? Math.min(4, raw!.gunDrought!) : 0,
  };
}

export function advanceGunDrought(current: number, rolled: boolean): { gunDrought: number; guaranteed: boolean } {
  if (rolled) return { gunDrought: 0, guaranteed: false };
  const next = Math.max(0, Math.floor(Number.isFinite(current) ? current : 0)) + 1;
  return next >= 5 ? { gunDrought: 0, guaranteed: true } : { gunDrought: next, guaranteed: false };
}
