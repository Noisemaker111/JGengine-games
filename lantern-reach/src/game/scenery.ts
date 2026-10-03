import type { ModelConfig } from "@jgengine/core/game/playableGame";

import provenance from "../../scripts/model-provenance.json";

export const objectModels: Record<string, ModelConfig> = Object.fromEntries(
  provenance.models.flatMap((model) => "dims" in model ? [[
    `lantern:${model.path.split("/").at(-1)!.slice(0, -4)}`,
    { url: `/models/lantern-reach/${model.path}`, dims: model.dims, anchor: "origin" as const, animation: "none" as const },
  ]] : []),
);
