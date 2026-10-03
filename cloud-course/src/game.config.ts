import type { EditorDocument } from "@jgengine/core/editor/types";
import { cloneEditorDocument } from "@jgengine/core/editor/document";
import { DEFAULT_WALK_CODES, defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { content } from "./game/course/catalog";
import { entityModels, objectModels } from "./game/models";
import { createCourseUi } from "./game/ui/GameUI";
import { courseRun, createCourseLoop } from "./loop";
import { world } from "./world";

export interface CourseOptions {
  startInMenu?: boolean;
  onCreate?: () => void;
}

export function createCoursePlayable(authored: EditorDocument, options: CourseOptions = {}) {
  const document = cloneEditorDocument(authored);
  return defineGame({
    name: "Cloud Course",
    simulation: { hz: 60 },
    assets,
    world,
    physics: { gravity: -24, jumpVelocity: 9 },
    input: DEFAULT_WALK_CODES,
    content,
    loop: createCourseLoop(document, options.startInMenu ?? true),
    GameUI: createCourseUi(options.onCreate),
    editorLayers: document,
    entityModels,
    objectModels,
    settings: { variant: "panel" },
    movement: { feel: { jumpBufferMs: 130, coyoteMs: 110, groundAcceleration: 18, airAcceleration: 10, groundFriction: 16 } },
    camera: { perspective: "third", initialDistance: 11, initialHeight: 3, initialYaw: Math.PI, targetHeight: 1 },
    postProcessing: { toneMapping: "aces", bloom: { strength: 0.12, radius: 0.25, threshold: 0.95 } },
    capture: { probe: ctx => {
      const run = courseRun(ctx);
      const player = ctx.scene.entity.get(ctx.player.userId);
      return { elapsed: run.elapsed, falls: run.falls, finished: run.phase === "finished" ? 1 : 0, x: player?.position[0] ?? 0, y: player?.position[1] ?? 0, z: player?.position[2] ?? 0 };
    } },
  });
}

export const game = createCoursePlayable(editorLayers);
