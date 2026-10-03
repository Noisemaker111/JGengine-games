import type { ReactElement } from "react";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { ProjectileModels } from "@jgengine/shell/combat/ProjectileModels";

export const swallowModel: ModelConfig = {
  url: "/models/authored-swallow.glb", anchor: "origin",
  dims: { footprint: { w: 1.43, d: 1.003 }, center: { x: 0, z: 0.0885 }, minY: -0.105, maxY: 0.148 },
  animation: { clip: "Flight", loop: true },
};
export const arrowModel: ModelConfig = {
  url: "/models/authored-arrow.glb", anchor: "origin", animation: "none",
  dims: { footprint: { w: 0.088, d: 0.092066642 }, center: { x: 0.008, z: 0 }, minY: -0.9, maxY: 0 },
};

/** Existing model ownership renders live flight poses and removes arrows on settlement. */
export function EnvironmentModels(): ReactElement {
  return <ProjectileModels model={arrowModel} maxInstances={32} />;
}
