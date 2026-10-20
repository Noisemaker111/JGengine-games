import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan, type ModelPick } from "@jgengine/shell/render/resolveModel";

import { assets } from "./assets";
import { BASE_CATALOG_ID } from "./entities/base/catalog";
import { CREEP_CATALOG, type CreepDef } from "./entities/enemies/catalog";

const VILLAGE = "quaternius-medieval-village";
const NATURE = "quaternius-stylized-nature";
const DUNGEON = "kaykit-dungeon";
const CHAR = "kaykit-adventurers";
const SKEL = "kaykit-skeletons";
const HEX = "kaykit-medieval-hexagon";

const RAIDER_HEIGHT = 1.8;

// Preserve automatic clip roles while advancing raiders with the game's accepted clock.
function raiderPick(def: CreepDef): ModelPick {
  return {
    model: `${CHAR}/Rogue`,
    fallbackModel: `${SKEL}/Skeleton_Rogue`,
    style: {
      targetHeight: RAIDER_HEIGHT * def.scale,
      material: { color: def.color },
      animation: { auto: true, clock: "game" },
    },
  };
}

const TOWER_PLAN: Record<string, ModelPick> = {
  tower_archer: {
    model: `${HEX}/building_tower_A_blue`,
    fallbackModel: `${DUNGEON}/wall_archedwindow_gated`,
    style: { targetHeight: 4.2 },
  },
  tower_cannon: {
    model: `${HEX}/building_tower_catapult_blue`,
    fallbackModel: `${DUNGEON}/wall_scaffold`,
    style: { targetHeight: 3.6 },
  },
  tower_frost: {
    model: `${HEX}/building_tower_B_blue`,
    fallbackModel: `${DUNGEON}/wall_corner_gated`,
    style: {
      targetHeight: 4.4,
      material: { emissive: "#3fb9d1", emissiveIntensity: 0.35 },
    },
  },
};

const KEEP_PLAN: ModelPick = {
  model: `${HEX}/building_castle_blue`,
  fallbackModel: `${DUNGEON}/wall_arched`,
  style: { targetHeight: 6.5 },
};

function buildEntityModels(): Record<string, ModelConfig> {
  const plan: Record<string, ModelPick> = {
    [BASE_CATALOG_ID]: KEEP_PLAN,
    ...TOWER_PLAN,
  };
  for (const def of Object.values(CREEP_CATALOG)) {
    plan[def.id] = raiderPick(def);
  }
  return resolveModelPlan(assets, plan);
}

export const entityModels: Record<string, ModelConfig> = buildEntityModels();

/** Scatter palette item → catalog id when live; else InstancedScatter stylized proxy. */
export const scatterModels: Record<string, string> = {};
for (const id of [`${NATURE}/Pine_1`, `${NATURE}/Pine_2`, "nature/tree_pine"] as const) {
  if (assets.resolve(id) !== null) {
    scatterModels.pine = id;
    break;
  }
}
