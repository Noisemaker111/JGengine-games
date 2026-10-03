import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environmentContentFromDocument } from "@jgengine/core/editor/index";
import { building, environment, grass, sky, terrain, type EnvironmentWorldFeature } from "@jgengine/core/world/features";

import { editorLayers } from "./editorLayers";
import { DUNGEONS } from "./game/dungeons/catalog";
import { CRYPT, WORLD_DEPTH, WORLD_WIDTH, ZONES } from "./game/world/zones";

const [vale] = ZONES;
const compounds = DUNGEONS.filter((dungeon) => dungeon.id !== "hollow_crypt");

const content = environmentContentFromDocument(editorLayers, {
  minBounds: { w: WORLD_WIDTH, d: WORLD_DEPTH },
});

export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: content.bounds,
    seed: "woc-20061",
    material: "grass",
    colors: { low: "#657d51", high: "#87907d", waterline: "#c2b283" },
    height: 16,
    frequency: 0.012,
    octaves: 4,
    baseHeight: 9,
    waterLevel: -1.5,
    segments: 220,
    // Legacy nonsettlement masks keep their original blend rings; the published
    // editor clearing contract cannot express a per-marker falloff.
    flatten: [
      ...ZONES.map((zone) => ({ center: [zone.graveyard.x, zone.graveyard.z] as [number, number], radius: 8, falloff: 6 })),
      { center: [CRYPT.x, CRYPT.z], radius: CRYPT.radius, falloff: 14 },
      ...compounds.map((dungeon) => ({ center: dungeon.center, radius: dungeon.radius, falloff: 12 })),
    ],
    detail: {
      rockColor: "#6b6d66",
      sandColor: "#c2b283",
      snowColor: "#eef3f7",
      rockSlopeStart: 0.28,
      snowHeight: 17,
      detailScale: 5.5,
      macroScale: 48,
      roughness: 0.92,
    },
  }),
  clearings: content.clearings,
  sculpt: content.sculpt,
  sky: sky(content.sky),
  // Weather is authored in editor.scene.json and rendered from ctx.environment's clock.
  vegetation: [
    grass({ area: { w: WORLD_WIDTH, d: vale.zMax - vale.zMin, position: [0, (vale.zMin + vale.zMax) / 2] }, density: 0.3, colors: ["#9bb48d", "#a7b886", "#768c44"], seed: "vale-grass" }),
  ],
  structures: compounds.map((dungeon) =>
    building({ position: dungeon.center, count: dungeon.raid === true ? 6 : 4, seed: dungeon.id, stories: [1, 2], style: "ruin" }),
  ),
});

export const physics: PhysicsConfig = { gravity: -16, jumpVelocity: 6, projectileObstacles: true };
