import { STUDIO_STAGE_POST } from "@jgengine/core/render/postProcessing";
import { defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { content } from "./game/content";
import { assets } from "./game/assets";
import { surveyLifecycle, surveyProbe } from "./game/survey";
import { CaptureDiagnostics } from "./game/CaptureDiagnostics";
import { entityModels } from "./game/entities/players/models";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Field Station",
  lifecycle: surveyLifecycle,
  world,
  physics,
  input: keybinds,
  server: "persistent",
  save: "none",
  content,
  assets,
  entityModels,
  WorldOverlay: CaptureDiagnostics,
  loop,
  GameUI,
  editorLayers,
  environmentSource: editorLayers.environment?.source,
  settings: { surface: false },
  hudFit: { mobile: { designSize: { width: 390, height: 844 }, minScale: 1, maxScale: 1 } },
  touch: { buttons: [{ action: "interact", label: "Observe" }, { action: "jump", label: "Jump" }, { action: "sprint", label: "Run" }] },
  // The showcase never placed catalog-id markers into the object store (the old mount omitted
  // `placeObjects`); keep that off so nothing new pops into the world.
  scenePlacement: false,
  postProcessing: STUDIO_STAGE_POST,
  camera: { perspective: "third", initialHeight: 2.4, initialDistance: 12 },
  capture: {
    play: ["start"],
    probe: surveyProbe,
  },
});
