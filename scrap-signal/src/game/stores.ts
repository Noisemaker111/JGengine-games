import { defineStore } from "@jgengine/core/store/defineStore";

import type { BlackMarketCounts } from "./commands";
import type { ReservePhase } from "./handroll";
import type { GunDef } from "./handroll/guns";
import type { ProgressionState } from "./progression";

export const selectedSlotStore = defineStore<number>("selectedSlot", 0);

export interface ReserveView {
  phase: ReservePhase;
  untilMs: number;
}

export const reserveStore = defineStore<ReserveView>("reserve", { phase: "up", untilMs: 0 });

export const lastPickupStore = defineStore<{ gunId: string; atMs: number } | null>("lastPickup", null);

export const openedChestsStore = defineStore<readonly string[]>("openedChests", () => []);

export const vendorOpenStore = defineStore<string | null>("vendorOpen", null);

export const echoStore = defineStore<{ questId: string; atMs: number } | null>("echo", null);

export const blackMarketOpenStore = defineStore<boolean>("blackMarketOpen", false);

export const travelOpenStore = defineStore<boolean>("travelOpen", false);

export const discoveredStationsStore = defineStore<readonly string[]>("discoveredStations", () => []);

export const blackMarketStore = defineStore<BlackMarketCounts>("blackMarket", () => ({}));

export const skillsOpenStore = defineStore<boolean>("skillsOpen", false);

export const characterIdStore = defineStore<string | null>("characterId", null);

export const talentRanksStore = defineStore<Record<string, number>>("talentRanks", () => ({}));

export const progressionStore = defineStore<ProgressionState>("scrap.progression", () => ({ contractGun: null, shieldProfile: "balanced", gunDrought: 0 }));

export const gunCatalogStore = defineStore<Record<string, GunDef>>("scrap.gunCatalog", () => ({}));

export const reactorOpenStore = defineStore<{ atMs: number } | null>("reactorOpen", null);

export const ruskDownStore = defineStore<boolean>("ruskDown", false);

export interface CurrentZoneView {
  id: string;
  name: string;
  level: number;
  atMs: number;
}

export const currentZoneStore = defineStore<CurrentZoneView | null>("currentZone", null);
