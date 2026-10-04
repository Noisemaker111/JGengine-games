import { afterEach, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { content } from "./content";
import { inventories } from "./inventories";
import { combatProbe } from "./combatProbe";
import { noteHit, resetFeel } from "./feel";

afterEach(resetFeel);
test("native probe serializes finite metrics before and after a confirmed hit", () => {
  resetFeel();
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "combat-probe", assets: createAssetCatalog(), multiplayer: "off", inventories }),
    content, player: { userId: "p1", isNew: true },
  });
  const before = combatProbe(ctx);
  expect(before.hitAgeMs).toBe(-1);
  expect(before.hitShieldBreak).toBe(0);
  expect(Object.values(before).every(Number.isFinite)).toBe(true);
  noteHit(0, true, true, true, true);
  ctx.time.advance(0.1);
  const after = combatProbe(ctx);
  expect(after.hitAgeMs).toBeCloseTo(100);
  expect(after.hitKill).toBe(1);
  expect(after.hitCritical).toBe(1);
  expect(after.hitShieldBreak).toBe(1);
  expect(JSON.parse(JSON.stringify(after))).toEqual(after);
});
