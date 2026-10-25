import { libraryModel } from "@jgengine/assets/catalogs/modelLibrary";
import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { idea } from "./idea";
import type { ModelRef } from "./ideaShape";

/** A model from `idea.ts`: a path is a file the game serves; a bare name is from the realistic model library. */
export function model(ref: ModelRef): ModelConfig {
  const drawn: ModelConfig = ref.model.startsWith("/")
    ? { url: ref.model, ...(ref.height === undefined ? {} : { targetHeight: ref.height }) }
    : libraryModel(ref.model, ref.height === undefined ? {} : { targetHeight: ref.height });
  return ref.tint === undefined ? drawn : { ...drawn, material: { ...drawn.material, color: ref.tint } };
}

/** Entity catalog id -> the model it draws. */
export const entityModels: Record<string, ModelConfig> = {
  car: model(idea.car),
  ...Object.fromEntries(idea.rivals.map((ref, index) => [`rival${index + 1}`, model(ref)])),
};

/** Scene prop catalog id (an `editor.scene.json` marker's `catalogId`) -> the model it draws. */
export const objectModels: Record<string, ModelConfig> = {
  trackside: model(idea.trackside),
  ...Object.fromEntries(idea.scenery.map((ref, index) => [`scenery${index + 1}`, model(ref)])),
};
