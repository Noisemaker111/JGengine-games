import { cloneEditorDocument } from "@jgengine/core/editor/document";
import { createCreatorDocumentStorage, type CreatorConfig, type CreatorPolicy } from "@jgengine/core/editor/creatorStorage";
import type { PlayableGame } from "@jgengine/shell/registry";

import { createCoursePlayable } from "../game.config";
import { editorLayers } from "../editorLayers";
import { COURSE_OBJECTS } from "./course/catalog";

export const creatorPolicy: CreatorPolicy = {
  maxDocuments: 12,
  maxBytes: 96_000,
  maxObjects: 48,
  maxPathPoints: 0,
  maxGridCells: 0,
  maxTerrainVertices: 0,
  allowedKinds: ["player_spawn", "prop", "soil"],
  allowedAssets: COURSE_OBJECTS,
  allowedCatalogIds: COURSE_OBJECTS,
  validate(document) {
    if (document.markers.filter(marker => marker.kind === "player_spawn").length !== 1) throw new Error("Keep exactly one player spawn.");
    if (!document.markers.some(marker => marker.catalogId === "course_finish")) throw new Error("Keep at least one finish pad.");
    for (const volume of document.volumes) {
      const extents = volume.halfExtents;
      if (extents === undefined || extents.x > 100 || extents.z > 100 || extents.y > 1 || Math.abs(volume.center.x) > 100 || Math.abs(volume.center.z) > 100 || Math.abs(volume.center.y) > 20) throw new Error("Landing fields must fit within 200 m, stay shallow, and remain within 20 m of ground.");
    }
    for (const marker of document.markers) {
      if (Math.abs(marker.position.x) > 100 || Math.abs(marker.position.z) > 100 || marker.position.y < 0 || marker.position.y > 20) throw new Error("Course objects must stay within 100 m of the start and below 20 m.");
      const height = marker.meta?.verticalOffset;
      if (height !== undefined && (typeof height !== "number" || height < 0 || height > 20)) throw new Error("Platform height must be between 0 and 20 m.");
    }
  },
};

export function createCourseCreator(storage: Storage): CreatorConfig<PlayableGame> {
  return {
    policy: creatorPolicy,
    storage: createCreatorDocumentStorage({ storage, key: "cloud-course:creations:v1", policy: creatorPolicy }),
    initialDocument: () => cloneEditorDocument(editorLayers),
    createPlayable: document => createCoursePlayable(document, { startInMenu: false }),
  };
}
