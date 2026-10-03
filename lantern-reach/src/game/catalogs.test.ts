import { describe, expect, test } from "bun:test";
import { GAME_ICON_NAMES } from "@jgengine/react/gameIcons";
import { CLASSES } from "./classes/catalog";
import { ITEMS } from "./items/catalog";
import { ITEM_SETS } from "./items/sets";
import { MOBS } from "./entities/enemies/catalog";
import { PROFESSIONS } from "./professions/catalog";
import { QUESTS } from "./quests/catalog";
import { NPCS } from "./entities/npcs/catalog";
import { SPECS } from "./talents/catalog";
import { validateLanternContent } from "./contentValidation";

const ICON_SET = new Set<string>(GAME_ICON_NAMES);

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

describe("catalogs", () => {
  test("catalogs meet breadth floors", () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(280);
    expect(MOBS.length).toBeGreaterThanOrEqual(55);
    expect(QUESTS.length).toBeGreaterThanOrEqual(70);
    expect(CLASSES.reduce((total, cls) => total + cls.abilities.length, 0)).toBeGreaterThanOrEqual(110);
    expect(NPCS.length).toBeGreaterThanOrEqual(14);
  });

  test("declared Lantern content references and progression are valid", () => {
    expect(validateLanternContent()).toEqual([]);
  });

  test("every ItemDef.icon is a valid GameIconName", () => {
    for (const item of ITEMS) {
      expect(ICON_SET.has(item.icon), `item "${item.id}" has invalid icon "${item.icon}"`).toBe(true);
    }
  });

  test("every AbilityDef.icon is a valid GameIconName", () => {
    for (const cls of CLASSES) {
      for (const ability of cls.abilities) {
        expect(
          ICON_SET.has(ability.icon),
          `ability "${ability.id}" has invalid icon "${ability.icon}"`,
        ).toBe(true);
      }
    }
  });

  test("no two abilities within the same class share an icon", () => {
    for (const cls of CLASSES) {
      expect(
        duplicates(cls.abilities.map((ability) => ability.icon)),
        `class "${cls.id}" reuses an icon across abilities`,
      ).toEqual([]);
    }
  });

  test("no two specs within the same class share an icon", () => {
    const byClass = new Map<string, string[]>();
    for (const spec of SPECS) {
      const icons = byClass.get(spec.classId) ?? [];
      icons.push(spec.icon);
      byClass.set(spec.classId, icons);
    }
    for (const [classId, icons] of byClass) {
      expect(duplicates(icons), `class "${classId}" reuses an icon across specs`).toEqual([]);
    }
  });

  test("all profession icons are unique", () => {
    expect(duplicates(PROFESSIONS.map((profession) => profession.icon))).toEqual([]);
  });

  test("all item-set proc icons are unique", () => {
    const procs = new Map<string, string>();
    for (const set of Object.values(ITEM_SETS)) {
      for (const tier of set.bonuses) {
        if (tier.effect.proc === undefined) continue;
        procs.set(tier.effect.proc.id, tier.effect.proc.icon);
      }
    }
    expect(duplicates([...procs.values()])).toEqual([]);
  });
});
