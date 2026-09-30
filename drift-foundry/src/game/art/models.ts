import type { ModelConfig } from "@jgengine/core/game/playableGame";

// Module URLs survive both the standalone build and the engine's configured /play host.
export const buggyModel: ModelConfig = { url: new URL("./row-six-buggy.glb", import.meta.url).href, anchor: "origin" };
export const jumpBarrierModel: ModelConfig = { url: new URL("./jump-barrier.glb", import.meta.url).href, anchor: "origin" };
export const jumpCueModel: ModelConfig = { url: new URL("./jump-cue.glb", import.meta.url).href, anchor: "origin", shadows: "none" };
export const stationModels: Record<string, ModelConfig> = {
  pickup_engine: { url: new URL("./pickup-engine.glb", import.meta.url).href, anchor: "origin" },
  pickup_front: { url: new URL("./pickup-front.glb", import.meta.url).href, anchor: "origin" },
  pickup_wheels: { url: new URL("./pickup-wheels.glb", import.meta.url).href, anchor: "origin" },
  pickup_frame: { url: new URL("./pickup-frame.glb", import.meta.url).href, anchor: "origin" },
};
