import type { LootTableDef } from "@jgengine/core/game/lootTable";

interface Profile {
  id: string;
  cash: [number, number];
  cashWeight: number;
  ammoWeight: number;
  healthWeight: number;
  rolls: number;
  ammo: readonly number[];
}

const PROFILES: readonly Profile[] = [
  { id: "drops_bandit", cash: [2, 9], cashWeight: 40, ammoWeight: 50, healthWeight: 10, rolls: 1, ammo: [45, 15, 20, 20, 0, 0] },
  { id: "drops_ripper", cash: [1, 6], cashWeight: 35, ammoWeight: 45, healthWeight: 20, rolls: 1, ammo: [45, 10, 30, 15, 0, 0] },
  { id: "drops_tough", cash: [8, 20], cashWeight: 35, ammoWeight: 50, healthWeight: 15, rolls: 2, ammo: [15, 20, 20, 30, 10, 5] },
  { id: "drops_elite", cash: [20, 45], cashWeight: 30, ammoWeight: 50, healthWeight: 20, rolls: 2, ammo: [10, 15, 15, 25, 20, 15] },
  { id: "drops_boss", cash: [80, 160], cashWeight: 40, ammoWeight: 40, healthWeight: 20, rolls: 3, ammo: [5, 10, 20, 20, 20, 25] },
];

const AMMO_ITEMS = ["ammo_pistol_pack", "ammo_smg_pack", "ammo_shotgun_pack", "ammo_rifle_pack", "ammo_sniper_pack", "ammo_rocket_pack"];

function buildTable(profile: Profile): LootTableDef {
  return {
    id: profile.id,
    rolls: profile.rolls,
    entries: [
      { currency: "cash", count: profile.cash, weight: profile.cashWeight },
      ...AMMO_ITEMS.flatMap((item, index) => profile.ammo[index]! > 0
        ? [{ item, count: 1 as const, weight: profile.ammoWeight * profile.ammo[index]! / 100 }]
        : []),
      { item: "insta_health", count: 1, weight: profile.healthWeight },
    ],
  };
}

export const lootTables: readonly LootTableDef[] = PROFILES.map(buildTable);
