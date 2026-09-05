import type { TowerDef } from "./catalog";

export const MAX_TOWER_LEVEL = 3;
export const SELL_REFUND_RATIO = 0.7;

const UPGRADE_COST_RATIO = 0.75;
const DAMAGE_PER_LEVEL = 0.5;
const RANGE_PER_LEVEL = 0.5;
const FIRE_RATE_PER_LEVEL = 0.15;
const SPLASH_PER_LEVEL = 0.3;

export interface TowerCombatStats {
  range: number;
  damage: number;
  fireRateHz: number;
  splashRadius: number;
}

/** Gold to raise a tower from `level` to `level + 1`; `null` once it is at {@link MAX_TOWER_LEVEL}. */
export function upgradeCost(def: TowerDef, level: number): number | null {
  if (level >= MAX_TOWER_LEVEL) return null;
  return Math.round(def.cost * UPGRADE_COST_RATIO * level);
}

/** Everything spent on a tower so far: placement plus every upgrade below `level`. */
export function investedGold(def: TowerDef, level: number): number {
  let total = def.cost;
  for (let from = 1; from < level; from += 1) total += upgradeCost(def, from) ?? 0;
  return total;
}

export function sellValue(def: TowerDef, level: number): number {
  return Math.round(investedGold(def, level) * SELL_REFUND_RATIO);
}

export function towerStats(def: TowerDef, level: number): TowerCombatStats {
  const steps = Math.max(0, level - 1);
  return {
    range: def.range + RANGE_PER_LEVEL * steps,
    damage: def.damage * (1 + DAMAGE_PER_LEVEL * steps),
    fireRateHz: def.fireRateHz * (1 + FIRE_RATE_PER_LEVEL * steps),
    splashRadius: def.splashRadius > 0 ? def.splashRadius + SPLASH_PER_LEVEL * steps : 0,
  };
}
