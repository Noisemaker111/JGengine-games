import { describe, expect, test } from "bun:test";

import { TOWER_CATALOG, TOWER_IDS } from "./catalog";
import { MAX_TOWER_LEVEL, investedGold, sellValue, towerStats, upgradeCost } from "./progression";

const archer = TOWER_CATALOG.tower_archer!;
const cannon = TOWER_CATALOG.tower_cannon!;

describe("tower progression", () => {
  test("upgrade cost grows with level and stops at the cap", () => {
    expect(upgradeCost(archer, 1)).toBe(38);
    expect(upgradeCost(archer, 2)).toBe(75);
    expect(upgradeCost(archer, MAX_TOWER_LEVEL)).toBeNull();
  });

  test("invested gold sums placement and upgrades", () => {
    expect(investedGold(archer, 1)).toBe(50);
    expect(investedGold(archer, 3)).toBe(50 + 38 + 75);
  });

  test("selling refunds a fraction of everything invested, never the full price", () => {
    for (const id of TOWER_IDS) {
      const def = TOWER_CATALOG[id]!;
      for (let level = 1; level <= MAX_TOWER_LEVEL; level += 1) {
        const refund = sellValue(def, level);
        expect(refund).toBeGreaterThan(0);
        expect(refund).toBeLessThan(investedGold(def, level));
      }
    }
  });

  test("each level raises damage, range, and fire rate; splash only for splash towers", () => {
    const l1 = towerStats(cannon, 1);
    const l2 = towerStats(cannon, 2);
    expect(l1).toEqual({ range: cannon.range, damage: cannon.damage, fireRateHz: cannon.fireRateHz, splashRadius: cannon.splashRadius });
    expect(l2.damage).toBeGreaterThan(l1.damage);
    expect(l2.range).toBeGreaterThan(l1.range);
    expect(l2.fireRateHz).toBeGreaterThan(l1.fireRateHz);
    expect(l2.splashRadius).toBeGreaterThan(l1.splashRadius);
    expect(towerStats(archer, 3).splashRadius).toBe(0);
  });
});
