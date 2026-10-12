import { environment, sky, type WorldFeature } from "@jgengine/core/world/features";
import type { PhysicsConfig } from "@jgengine/core/game/defineGame";

import { CLEARINGS, TERRAIN_SCULPT } from "./editorLayers";
import { TERRAIN } from "./game/world/terrain";

export const world: WorldFeature = environment({
  terrain: TERRAIN,
  // Authored mounds layered over the base terrain — same snapshot the editor edits.
  sculpt: TERRAIN_SCULPT,
  // Level gameplay footing without flattening the draped approach.
  clearings: CLEARINGS,
  // Golden-hour sky with a hazy warm horizon and blue zenith; fog melts the far terrain edge into the
  // haze so the arena reads as open country instead of a floating slab with a hard silhouette.
  sky: sky({
    preset: "day",
    horizonColor: "#cfdcc2",
    zenithColor: "#5b93c9",
    sunIntensity: 1.1,
    ambientIntensity: 0.55,
    hazeStrength: 0.4,
    sunGlowStrength: 1.2,
    radius: 240,
    fog: { color: "#c2d3cb", near: 110, far: 230 },
  }),
});

export const physics: PhysicsConfig = { gravity: -20 };
