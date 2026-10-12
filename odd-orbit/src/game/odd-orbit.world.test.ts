import { describe, expect, test } from "bun:test";

import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { editableTerrainFromSnapshot } from "@jgengine/core/world/terraform";
import { editorLayers } from "../editorLayers";

import { world } from "../world";
import { game } from "../game.config";
import { content } from "./content";
import { onInit } from "../loop";
import { DECOR, FURNITURE } from "./objects/catalog";
import { householdStore } from "./session/store";

function boot(): GameContext {
  const ctx = createGameContext({
    definition: game.game,
    content,
    player: { userId: "director", isNew: true },
  });
  onInit(ctx);
  return ctx;
}

describe("odd-orbit world", () => {
  test("environment world resolves a terrain backdrop", () => {
    if (world.kind !== "environment") throw new Error("expected environment world");
    const summary = summarizeEnvironment(world);
    expect(summary.isEmpty).toBe(false);
    expect(summary.terrain).toBeDefined();
  });

  test("authored home and garden surfaces reach the world without moving starter content or ground", () => {
    if (world.kind !== "environment" || world.sculpt === undefined) throw new Error("expected authored ground");
    expect(world.sculpt).toBe(editorLayers.terrain);
    const paint = editableTerrainFromSnapshot(world.sculpt);
    expect(paint.surfaceAt(0, -2)).toBe("grass");
    expect(paint.surfaceAt(8, 4)).toBe("sand");
    expect(paint.surfaceAt(26, 20)).toBe("rock");
    expect(world.sculpt.offsets.every(offset => offset === 0)).toBe(true);
    expect(world.sky?.timeOfDay).toBe(false);
    expect(editorLayers.markers).toHaveLength(32);
    const starter = editorLayers.markers.find(marker => marker.id === "starter:bloom_planter");
    expect(starter?.position).toEqual({ x: 0, y: 0, z: -2 });
  });

  test("setup seeds the household and furnishes the habitat", () => {
    const ctx = boot();
    const household = householdStore.read(ctx);
    expect(household.order.length).toBe(4);
    for (const id of household.order) {
      expect(ctx.scene.entity.get(id)).not.toBeNull();
      expect(household.members[id]?.name.length ?? 0).toBeGreaterThan(1);
    }
    const objects = ctx.scene.object.list();
    const catalogIds = new Set(objects.map((o) => o.catalogId));
    for (const def of FURNITURE) expect(catalogIds.has(def.id)).toBe(true);
    expect(objects.filter((o) => DECOR.some((d) => d.id === o.catalogId)).length).toBeGreaterThan(4);
  });

  test("body plans are varied across the household", () => {
    const ctx = boot();
    const household = householdStore.read(ctx);
    const shapes = new Set(household.order.map((id) => household.members[id]?.bodyPlan.shape));
    expect(shapes.size).toBeGreaterThan(1);
  });
});
