import { environmentContentFromDocument } from "@jgengine/core/editor/environment";
import { environment, sky, terrain } from "@jgengine/core/world/features";

import { editorLayers } from "./editorLayers";
import { idea } from "./game/idea";

// The hills, footprint, clearings and sky live in editor.scene.json - reshape them in the editor
// (F2+E). This file only picks the ground palette, which comes from idea.ts.
const authored = environmentContentFromDocument(editorLayers, { minBounds: { w: 480, d: 480 } });

export const world = environment({
  terrain: terrain({
    bounds: authored.bounds,
    segments: 160,
    material: idea.ground.material,
    colors: { low: idea.ground.low, high: idea.ground.high },
    waterLevel: -40,
    detail: {},
  }),
  sky: sky(authored.sky ?? {}),
  ...(authored.sculpt === undefined ? {} : { sculpt: authored.sculpt }),
  clearings: authored.clearings,
});
