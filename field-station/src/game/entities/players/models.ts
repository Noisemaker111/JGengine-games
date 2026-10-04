import { locomotionGraph } from "@jgengine/core/anim/locomotionGraph";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { MOVEMENT_TUNING } from "@jgengine/core/movement/movementModel";

import { assets, FIELD_RESEARCHER_ASSET_ID } from "../../assets";
import { player } from "./catalog";

const researcher = assets.resolve(FIELD_RESEARCHER_ASSET_ID);
if (researcher === null) throw new Error(`Missing field researcher asset: ${FIELD_RESEARCHER_ASSET_ID}`);

export const researcherAnimation = locomotionGraph({
  idle: "Idle",
  walk: "Walking_A",
  run: "Running_A",
  walkSpeed: player.walkSpeed * MOVEMENT_TUNING.walkSpeedMultiplier,
  runSpeed: player.walkSpeed * MOVEMENT_TUNING.walkSpeedMultiplier * MOVEMENT_TUNING.runSpeedMultiplier,
});

export const entityModels = {
  [player.id]: {
    url: researcher.url,
    dims: researcher.dims,
    animation: { graph: researcherAnimation },
  },
} satisfies Record<string, ModelConfig>;
