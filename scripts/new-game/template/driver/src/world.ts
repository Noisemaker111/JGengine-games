import { environmentContentFromDocument } from "@jgengine/core/editor/environment";
import { environment, road, sky, terrain } from "@jgengine/core/world/features";

import { editorLayers } from "./editorLayers";
import { circuit } from "./game/race";
import { idea } from "./game/idea";

// The hills, footprint and sky live in editor.scene.json, and so does the circuit (a "track" path):
// reshape either in the editor (F2+E). The road is drawn along the circuit's own line.
const authored = environmentContentFromDocument(editorLayers, { minBounds: { w: 520, d: 520 } });
const loop = [...circuit.line, circuit.line[0]!];

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
  roads: [road({ path: loop, width: circuit.width, markings: true, sidewalk: { width: 3 } })],
});
