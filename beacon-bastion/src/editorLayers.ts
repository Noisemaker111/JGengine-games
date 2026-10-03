import { editorMarkerXZ, seedEditorCatalogs, type EditorLayersInput } from "@jgengine/core/editor/index";
import { normalizeEditorLayers, type EditorDocument } from "@jgengine/shell/gameKit";
import type { AvoidZone } from "@jgengine/core/world/geometry";
import { clearanceZonesFrom } from "@jgengine/core/world/scatterRegion";
import { migrateTerrainSnapshot, type TerraformSnapshot } from "@jgengine/core/world/terraform";

import { editorCatalogs } from "./editorCatalogs";
import sceneJson from "./editor.scene.json";

type Vec2 = readonly [number, number];

/**
 * The game's scene — the `editor.scene.json` authored in the 3D editor (creep path, build plots,
 * spawn/keep, arena foliage) plus the sculpted terrain. Everything downstream (enemy pathing, plot
 * placement, path + foliage rendering) reads from this one document; nothing is hardcoded in game
 * code. Open F2+E to edit it live and Ctrl+S to save it back.
 */
/** The sculpted heightfield layered into the runtime ground via `environment({ sculpt })`. */
export const TERRAIN_SCULPT: TerraformSnapshot = migrateTerrainSnapshot(sceneJson.terrain);

export const editorLayers: EditorDocument = seedEditorCatalogs(
  {
    ...normalizeEditorLayers(sceneJson as unknown as EditorLayersInput),
    terrain: TERRAIN_SCULPT,
  },
  editorCatalogs,
);

/** Clearance discs derived from the authored gameplay spots — flattened into the runtime ground. */
export const CLEARINGS: readonly AvoidZone[] = clearanceZonesFrom(editorLayers);

/** The creep-path polyline (XZ), read from the authored document — the single source for enemy nav. */
export const PATH_WAYPOINTS_XZ: readonly Vec2[] = (
  editorLayers.paths.find((path) => path.id === "creep-path")?.points ?? []
).map((point) => [point.x, point.z] as const);

/** Build-plot centers (XZ), read from the authored plot markers — the single source for tower placement. */
export const BUILD_PLOT_XZ: readonly { id: string; xz: Vec2 }[] = editorLayers.markers
  .filter((marker) => marker.id.startsWith("plot-"))
  .map((marker) => ({ id: marker.id, xz: editorMarkerXZ(marker) }));
