import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { groundFieldFor } from "@jgengine/core/world/terrain";

import { editorLayers } from "../editorLayers";
import { world } from "../world";
import { CRYPT, WORLD_DEPTH, WORLD_WIDTH, ZONES, zoneAt } from "./world/zones";
import { objectModels } from "./scenery";

describe("lantern-reach world", () => {
  const summary = summarizeEnvironment(world);

  test("terrain spans the three zone bands with authored relief and lighting", () => {
    expect(world.kind).toBe("environment");
    expect(summary.isEmpty).toBe(false);
    expect(summary.terrain?.bounds.w).toBeGreaterThanOrEqual(WORLD_WIDTH);
    expect(summary.terrain?.bounds.d).toBeGreaterThanOrEqual(WORLD_DEPTH);
    expect(summary.terrain?.height.finite).toBe(true);
    expect(world.sculpt).toEqual(editorLayers.terrain);
    expect(Math.max(...editorLayers.terrain!.offsets)).toBeGreaterThan(10);
    expect(editorLayers.terrain!.surfaces.filter((id) => id === "dirt").length).toBeGreaterThan(50);
    expect(world.sky?.preset).toBe(editorLayers.environment?.preset);
  });

  test("town buildings resolve catalog roofs and entrance walls from the document", () => {
    const buildings = editorLayers.collections.filter((entry) => entry.id.startsWith("building:"));
    expect(buildings.length).toBeGreaterThanOrEqual(11);
    for (const building of buildings) {
      const prefab = editorLayers.prefabs.find((entry) => entry.id === building.id);
      expect(prefab).toBeDefined();
      const parts = prefab!.fragment.markers;
      expect(parts.some((part) => part.catalogId?.includes("Roof_"))).toBe(true);
      expect(parts.some((part) => part.catalogId?.includes("_Door_Round"))).toBe(true);
      for (const part of parts) expect(objectModels[part.catalogId!]).toBeDefined();
      const baked = editorLayers.markers.find((marker) => building.memberIds.includes(marker.id));
      expect(objectModels[baked!.catalogId!]).toBeDefined();
      expect(baked!.meta?.sourcePrefabId).toBe(prefab!.id);
    }
    expect(editorLayers.paths.find((path) => path.id === "eastbrook:market-square")?.width).toBe(7);
    expect(editorLayers.paths.find((path) => path.id === "eastbrook:reach-road")?.points.length).toBeGreaterThan(3);
  });

  test("the main town has a level construction pad across each building", () => {
    const ground = groundFieldFor(world);
    const hub = editorLayers.markers.find((marker) => marker.id === "hub:vale")!;
    const height = ground.sampleHeight(hub.position.x, hub.position.z);
    for (const part of editorLayers.markers.filter((marker) => marker.id.startsWith("architecture:") && marker.position.z < -260 && marker.position.z > -335 && marker.meta?.building !== "Eastbrook tree belt")) {
      expect(ground.sampleHeight(part.position.x, part.position.z)).toBeCloseTo(height, 5);
    }
  });

  test("legacy biome effects and outlying construction blend rings remain", () => {
    expect(world.weather?.map((effect) => effect.kind)).toEqual(["rain", "snow"]);
    expect(world.vegetation?.[0]?.kind).toBe("grass");
    for (const zone of ZONES) {
      expect(world.terrain?.flatten).toContainEqual({ center: [zone.graveyard.x, zone.graveyard.z], radius: 8, falloff: 6 });
    }
    expect(world.terrain?.flatten).toContainEqual({ center: [CRYPT.x, CRYPT.z], radius: CRYPT.radius, falloff: 14 });
  });

  test("zone bands resolve by z and the crypt sits inside the peaks", () => {
    expect(zoneAt(-300).id).toBe("vale");
    expect(zoneAt(0).id).toBe("marsh");
    expect(zoneAt(300).id).toBe("peaks");
    expect(zoneAt(CRYPT.z).id).toBe("peaks");
  });
});
