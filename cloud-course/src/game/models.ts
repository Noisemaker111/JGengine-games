import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan } from "@jgengine/shell/render/resolveModel";

import { assets } from "./assets";

export const entityModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  player: { model: "course_runner", style: { targetHeight: 1.8, animation: { states: { idle: "Idle", walk: "Walk", run: "Run" } } } },
});

export const objectModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  course_pad: { model: "course_pad" },
  course_step: { model: "course_step" },
  course_checkpoint: { model: "course_checkpoint" },
  course_finish: { model: "course_finish" },
  course_bumper: { model: "course_bumper" },
});
