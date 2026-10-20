import { clearanceZonesFrom } from "@jgengine/core/world/scatterRegion";
import { editorLayers } from "./editorLayers";
import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, sky, terrain, type EnvironmentWorldFeature } from "@jgengine/core/world/features";

export const world: EnvironmentWorldFeature = environment({
  sculpt: editorLayers.terrain,
  clearings: clearanceZonesFrom(editorLayers),
  terrain: terrain({
    bounds: { w: 104, d: 104 },
    height: 2.6,
    frequency: 0.045,
    octaves: 4,
    seed: "ember-command-vale",
    segments: 120,
    material: "highland",
    colors: { low: "#4c6a31", high: "#728b40", waterline: "#3d5a4a" },
    // Push snow off-world so the detail shader reads as pure grass → rock relief.
    detail: {
      rockColor: "#6b6157",
      sandColor: "#8a7a5a",
      rockSlopeStart: 0.58,
      snowHeight: 400,
      detailScale: 3,
      macroScale: 26,
      roughness: 0.95,
      strength: 0.45,
    },
  }),
  sky: sky({
    preset: "day",
    horizonColor: "#d3e2f0",
    zenithColor: "#7fb0e0",
    sunIntensity: 1.15,
    ambientIntensity: 0.55,
    hazeStrength: 0.4,
    sunGlowStrength: 0.5,
    fog: { color: "#c6d9e8", near: 78, far: 168 },
  }),
});

export const physics: PhysicsConfig = { gravity: -24 };
