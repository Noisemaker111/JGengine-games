import { clearanceZonesFrom } from "@jgengine/core/world/scatterRegion";
import { editorLayers } from "./editorLayers";
import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { environment, sky, terrain, type EnvironmentWorldFeature } from "@jgengine/core/world/features";

export const world: EnvironmentWorldFeature = environment({
  sculpt: editorLayers.terrain,
  clearings: clearanceZonesFrom(editorLayers),
  terrain: terrain({
    // Far wider than the 92 m playable box so the RTS camera sees highland past the edge, not sky.
    bounds: { w: 260, d: 260 },
    height: 2.6,
    frequency: 0.045,
    octaves: 4,
    seed: "ember-command-vale",
    segments: 240,
    material: "highland",
    colors: { low: "#4c6a31", high: "#728b40", waterline: "#3d5a4a" },
    // Push sand/snow off-world so the detail shader reads as pure grass → rock relief.
    detail: {
      rockColor: "#6b6157",
      sandColor: "#8a7a5a",
      rockSlopeStart: 0.58,
      snowHeight: 400,
      waterLevel: -80,
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
    fog: { color: "#b7c3ae", near: 70, far: 190 },
  }),
});

export const physics: PhysicsConfig = { gravity: -24 };
