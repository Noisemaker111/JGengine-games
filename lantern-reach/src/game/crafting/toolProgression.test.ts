import { expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { game } from "../../game.config";
import { content } from "../content";
import { GATHER_NODES } from "../professions/catalog";
import { professionsStore } from "../session/stores";
import { RECIPES } from "./catalog";
import type { RecipeDef } from "@jgengine/core/crafting/recipe";
import { ROAD_CLEAR } from "../quests/lanternCatalog";

test("gathered materials compete for gear, unlock a real tool craft and retain its consumption across reload", async () => {
  const backend = memorySaveBackend(), userId = "tool-progression";
  function boot() {
    const ctx = createGameContext({ definition: game.game, content, player: { userId, isNew: true }, save: { backend, mode: "manual" } });
    game.loop.onInit?.(ctx); game.loop.onNewPlayer?.(ctx);
    ctx.game.commands.run("class.select", { classId: "warrior" });
    return ctx;
  }
  function gather(ctx: GameContext, catalogId: string) {
    let object = ctx.scene.object.list().find(object => object.catalogId === catalogId);
    if (object === undefined) {
      ctx.time.advance(GATHER_NODES.find(node => node.id === catalogId)!.respawnSec);
      object = ctx.scene.object.list().find(object => object.catalogId === catalogId);
    }
    expect(object).toBeDefined();
    const position = object!.position;
    ctx.scene.entity.setPose(userId, { position: [position[0], position[1], position[2]] });
    ctx.game.commands.run("gather", { instanceId: object!.instanceId });
  }
  function supply(ctx: GameContext, catalogId: string, item: string, count: number) {
    for (let attempts = 0; attempts < count * 2 && ctx.player.inventory.count("bags", item) < count; attempts++) gather(ctx, catalogId);
    expect(ctx.player.inventory.count("bags", item), `Gathering ${catalogId} must supply ${item}`).toBeGreaterThanOrEqual(count);
  }
  function craft(ctx: GameContext, recipeId: string) { ctx.game.commands.run("craft.make", { recipeId }); }
  let ctx = boot();
  supply(ctx, "ore_eastbrook", "bone_fragments", 3);
  supply(ctx, "wood_eastbrook", "linen_scrap", 1);
  const bones = ctx.player.inventory.count("bags", "bone_fragments"), linen = ctx.player.inventory.count("bags", "linen_scrap");
  craft(ctx, "recipe_mithril_mining_pick");
  expect(ctx.player.inventory.count("bags", "mithril_mining_pick")).toBe(1);
  expect(ctx.player.inventory.count("bags", "bone_fragments")).toBe(bones - 3);
  expect(ctx.player.inventory.count("bags", "linen_scrap")).toBe(linen - 1);
  expect(ctx.player.inventory.count("bags", "bone_fragments")).toBeLessThan(3);
  craft(ctx, "recipe_eastbrook_chain_vest");
  expect(ctx.player.inventory.count("bags", "eastbrook_chain_vest")).toBe(0);
  craft(ctx, "recipe_thorium_mining_pick");
  expect(ctx.player.inventory.count("bags", "mithril_mining_pick")).toBe(1);
  expect(ctx.player.inventory.count("bags", "thorium_mining_pick")).toBe(0);
  for (let attempts = 0; attempts < 100 && professionsStore.read(ctx, userId).crafting < 75; attempts++) {
    supply(ctx, "herb_eastbrook", "spider_leg", 1);
    craft(ctx, "recipe_tough_jerky");
  }
  expect(professionsStore.read(ctx, userId).crafting).toBe(75);
  for (let attempts = 0; attempts < 60 && professionsStore.read(ctx, userId).mining < 50; attempts++) gather(ctx, "ore_eastbrook");
  expect(professionsStore.read(ctx, userId).mining).toBe(50);
  supply(ctx, "ore_mirefen", "thorium_ore", 4);
  const thorium = ctx.player.inventory.count("bags", "thorium_ore");
  await ctx.game.save!.save();
  ctx = boot(); expect(await ctx.game.save!.load()).toBe(true);
  expect(professionsStore.read(ctx, userId).crafting).toBe(75);
  expect(professionsStore.read(ctx, userId).mining).toBeGreaterThanOrEqual(50);
  craft(ctx, "recipe_thorium_mining_pick");
  expect(ctx.player.inventory.count("bags", "mithril_mining_pick")).toBe(0);
  expect(ctx.player.inventory.count("bags", "thorium_mining_pick")).toBe(1);
  expect(ctx.player.inventory.count("bags", "thorium_ore")).toBe(thorium - 4);
  expect(professionsStore.read(ctx, userId).crafting).toBe(76);
  await ctx.game.save!.save();
  ctx = boot(); expect(await ctx.game.save!.load()).toBe(true);
  craft(ctx, "recipe_thorium_mining_pick");
  expect(ctx.player.inventory.count("bags", "mithril_mining_pick")).toBe(0);
  expect(ctx.player.inventory.count("bags", "thorium_mining_pick")).toBe(1);
  expect(ctx.player.inventory.count("bags", "thorium_ore")).toBe(thorium - 4);
  expect(professionsStore.read(ctx, userId).crafting).toBe(76);
});

test("a custom recipe consumes gathered inputs only after the real quest reward grants its unlock", () => {
  const userId = "gated-craft", ctx = createGameContext({ definition: game.game, content, player: { userId, isNew: true } });
  game.loop.onInit?.(ctx); game.loop.onNewPlayer?.(ctx);
  ctx.game.commands.run("class.select", { classId: "warrior" });
  const ore = ctx.scene.object.list().find(object => object.catalogId === "ore_eastbrook")!;
  ctx.game.commands.run("gather", { instanceId: ore.instanceId });
  const before = ctx.player.inventory.count("bags", "bone_fragments"), potions = ctx.player.inventory.count("bags", "minor_healing_potion");
  const recipes = RECIPES as RecipeDef[], length = recipes.length;
  recipes.push({ id: "road_watch_batch", requires: [ROAD_CLEAR], inputs: [{ itemId: "bone_fragments", count: 1 }], outputs: [{ itemId: "minor_healing_potion", count: 1 }] });
  try {
    ctx.game.commands.run("craft.make", { recipeId: "road_watch_batch" });
    expect(ctx.player.inventory.count("bags", "bone_fragments")).toBe(before);
    expect(ctx.player.inventory.count("bags", "minor_healing_potion")).toBe(potions);
    ctx.game.quest!.accept(userId, "q_wolves");
    ctx.game.quest!.progress(userId, "q_wolves", "kill_wolves", 8);
    expect(ctx.game.quest!.turnIn(userId, "q_wolves")).toBeNull();
    expect(ctx.game.unlocks!.has(userId, ROAD_CLEAR)).toBe(true);
    ctx.game.commands.run("craft.make", { recipeId: "road_watch_batch" });
    expect(ctx.player.inventory.count("bags", "bone_fragments")).toBe(before - 1);
    expect(ctx.player.inventory.count("bags", "minor_healing_potion")).toBe(potions + 1);
  } finally { recipes.splice(length); }
});

// Actual game commands train these paths; tests move to the authored node's pose
// and advance its respawn clock, without writing inventory or profession values.
function trainee(userId: string): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId, isNew: true } });
  game.loop.onInit?.(ctx); game.loop.onNewPlayer?.(ctx);
  ctx.game.commands.run("class.select", { classId: "warrior" });
  return ctx;
}
function harvest(ctx: GameContext, catalogId: string): void {
  let object = ctx.scene.object.list().find(object => object.catalogId === catalogId);
  if (object === undefined) {
    ctx.time.advance(GATHER_NODES.find(node => node.id === catalogId)!.respawnSec);
    object = ctx.scene.object.list().find(object => object.catalogId === catalogId);
  }
  expect(object).toBeDefined();
  ctx.scene.entity.setPose(ctx.player.userId, { position: [...object!.position] });
  ctx.game.commands.run("gather", { instanceId: object!.instanceId });
}

test("starter crafting can train to the next recipe band without granting skill directly", () => {
  const ctx = trainee("craft-training");
  for (let attempts = 0; attempts < 90; attempts++) {
    if (ctx.player.inventory.count("bags", "spider_leg") === 0) harvest(ctx, "herb_eastbrook");
    ctx.game.commands.run("craft.make", { recipeId: "recipe_tough_jerky" });
  }
  expect(professionsStore.read(ctx, ctx.player.userId).crafting).toBe(75);
});

for (const [profession, prefix, material, summitMaterial] of [
  ["mining", "ore", "thorium_ore", "arcanite_bar"],
  ["logging", "wood", "ashwood_log", "elderwood_log"],
  ["herbalism", "herb", "goldleaf_herb", "sunpetal_herb"],
] as const) {
  test(`${profession} earns both regional gates through gathering commands`, () => {
    const ctx = trainee(`gather-${profession}`), userId = ctx.player.userId;
    harvest(ctx, `${prefix}_mirefen`);
    expect(ctx.player.inventory.count("bags", material)).toBe(0);
    expect(professionsStore.read(ctx, userId)[profession]).toBe(1);
    for (let attempts = 0; attempts < 55 && professionsStore.read(ctx, userId)[profession] < 50; attempts++) harvest(ctx, `${prefix}_eastbrook`);
    expect(professionsStore.read(ctx, userId)[profession]).toBe(50);
    harvest(ctx, `${prefix}_mirefen`);
    expect(ctx.player.inventory.count("bags", material)).toBeGreaterThan(0);
    expect(professionsStore.read(ctx, userId)[profession]).toBe(51);
    for (let attempts = 0; attempts < 105 && professionsStore.read(ctx, userId)[profession] < 150; attempts++) harvest(ctx, `${prefix}_mirefen`);
    expect(professionsStore.read(ctx, userId)[profession]).toBe(150);
    harvest(ctx, `${prefix}_highwatch`);
    expect(ctx.player.inventory.count("bags", summitMaterial)).toBeGreaterThan(0);
    expect(professionsStore.read(ctx, userId)[profession]).toBe(151);
  });
}

for (const [tool, inputs] of [
  ["ironbark_axe", [["wood_eastbrook", "linen_scrap", 3], ["ore_eastbrook", "bone_fragments", 1]]],
  ["silverleaf_sickle", [["herb_eastbrook", "spider_leg", 3], ["wood_eastbrook", "linen_scrap", 1]]],
] as const) {
  test(`${tool} is craftable from gathered starter materials and spends its exact recipe`, () => {
    const ctx = trainee(`starter-${tool}`);
    for (const [node, item, count] of inputs) {
      for (let attempts = 0; attempts < count * 2 && ctx.player.inventory.count("bags", item) < count; attempts++) harvest(ctx, node);
      expect(ctx.player.inventory.count("bags", item)).toBeGreaterThanOrEqual(count);
    }
    const before = inputs.map(([, item]) => ctx.player.inventory.count("bags", item));
    ctx.game.commands.run("craft.make", { recipeId: `recipe_${tool}` });
    expect(ctx.player.inventory.count("bags", tool)).toBe(1);
    inputs.forEach(([, item, count], index) => expect(ctx.player.inventory.count("bags", item)).toBe(before[index]! - count));
  });
}
