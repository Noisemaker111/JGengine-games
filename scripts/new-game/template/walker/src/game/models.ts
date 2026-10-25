import { libraryModel } from "@jgengine/assets/catalogs/modelLibrary";
import type { ModelConfig } from "@jgengine/core/game/playableGame";

import { idea } from "./idea";
import type { ModelRef } from "./ideaShape";

/** A model from `idea.ts`: a path is a file the game serves; a bare name is from the realistic model library. */
export function model(ref: ModelRef): ModelConfig {
  const drawn: ModelConfig = ref.model.startsWith("/")
    ? { url: ref.model, animation: "auto", ...(ref.height === undefined ? {} : { targetHeight: ref.height }) }
    : libraryModel(ref.model, ref.height === undefined ? {} : { targetHeight: ref.height });
  return ref.tint === undefined ? drawn : { ...drawn, material: { ...drawn.material, color: ref.tint } };
}

/** Entity catalog id -> the model it draws. */
export const entityModels: Record<string, ModelConfig> = {
  player: model(idea.hero),
  home: model(idea.home.model),
  ...Object.fromEntries(idea.structures.map((structure) => [structure.id, model(structure.prop)])),
  ...Object.fromEntries(idea.threats.map((threat) => [threat.id, model(threat.model)])),
  ...Object.fromEntries(idea.allies.map((ally) => [ally.id, model(ally.model)])),
};

/** Scene prop catalog id (an `editor.scene.json` marker's `catalogId`) -> the model it draws. */
export const objectModels: Record<string, ModelConfig> = {
  ...Object.fromEntries(idea.nodes.map((node) => [node.id, model(node.prop)])),
  ...Object.fromEntries(idea.scenery.map((ref, index) => [`scenery${index + 1}`, model(ref)])),
};
