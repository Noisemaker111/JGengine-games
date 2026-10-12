import { terrain, type TerrainEnvironmentDescriptor } from "@jgengine/core/world/features";


export const TERRAIN: TerrainEnvironmentDescriptor = terrain({
  bounds: { w: 84, d: 84 },
  height: 3,
  frequency: 0.05,
  octaves: 4,
  seed: "beacon-bastion",
  baseHeight: 0,
  segments: 130,
  material: "highland",
  // Lush grass valleys rising to sunlit ridges — kept green, not yellow.
  colors: { low: "#4d6a33", high: "#7f9a45", waterline: "#3d6a70" },
  // Subtle noise-driven ground surface — mostly grass, with rock breaking through only on the steep
  // mound flanks. The sand band is pushed below the world (no water here) so the meadow stays green;
  // low strength lets the grass base read through instead of the flat vertex-colour ground it shipped with.
  detail: {
    rockColor: "#7c7862",
    sandColor: "#8f9f4e",
    rockSlopeStart: 0.66,
    snowHeight: 200,
    waterLevel: -40,
    detailScale: 3,
    macroScale: 30,
    roughness: 0.95,
    strength: 0.4,
  },
});
