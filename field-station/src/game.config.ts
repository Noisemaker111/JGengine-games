import { STUDIO_STAGE_POST } from "@jgengine/core/render/postProcessing";
import { createElement } from "react";
import { defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";
import { expeditionLifecycle } from "./game/expedition";
import { FieldEquipment, Surveyor } from "./game/FieldEquipment";

export const game = defineGame({
  name: "Field Station",
  lifecycle: expeditionLifecycle,
  world,
  physics,
  input: keybinds,
  server: "persistent",
  save: "none",
  content,
  loop,
  GameUI,
  WorldOverlay: FieldEquipment,
  renderEntity: entity => createElement(Surveyor, { entity }),
  editorLayers,
  // The showcase never placed catalog-id markers into the object store (the old mount omitted
  // `placeObjects`); keep that off so nothing new pops into the world.
  scenePlacement: false,
  postProcessing: STUDIO_STAGE_POST,
  camera: { perspective: "third", initialHeight: 3.2, initialDistance: 9 },
  lighting: {
    ambient: { color: "#eee0be", intensity: 0.45 },
    hemisphere: { skyColor: "#c6e0df", groundColor: "#52623c", intensity: 0.8 },
    directional: [{ position: [-35, 55, 25], color: "#ffefd2", intensity: 2.1, castShadow: true, shadowCameraSize: 55, shadowMapSize: 2048 }],
  },
  touch: { buttons: [{ action: "interact", label: "Read", icon: false }, { action: "jump", label: "Jump" }] },
});
