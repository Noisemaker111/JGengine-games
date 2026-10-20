import { defineGame } from "@jgengine/shell/defineGame";

import { assets } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { objectModels } from "./game/models";
import { renderEntity } from "./game/render/renderEntity";
import { CaptureReadiness } from "./game/render/CaptureReadiness";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { editorLayers } from "./editorLayers";
import { DAY_LENGTH, physics, terrainField, world } from "./world";

export const game = defineGame({
  name: "Odd Orbit",
  world,
  physics,
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  time: { scale: 1, dayLength: DAY_LENGTH, start: DAY_LENGTH * (9 / 24), speeds: [1, 2, 4] },
  content,
  loop,
  GameUI,
  assets,
  editorLayers,
  scenePlacement: false,
  objectModels,
  renderEntity,
  WorldOverlay: CaptureReadiness,
  pointer: { moveCommand: "world.pointer" },
  touch: { buttons: [] },
  hudFit: { mobile: { designSize: { width: 390, height: 844 }, minScale: 1, maxScale: 1 } },
  lighting: {
    ambient: { color: "#c3b0e0", intensity: 0.75 },
    hemisphere: { skyColor: "#c9a6e0", groundColor: "#4a3f66", intensity: 0.7 },
    directional: [{ color: "#ffe6b0", intensity: 1.35, position: [30, 48, 24], castShadow: true }],
  },
  // Dusk-moon presentation: the world owns its sky, so "cinematic" only fills the unset post stack
  // (IBL + tone-map/bloom/AO/grade). Lighting above is authored explicitly and wins.
  look: "cinematic",
  postProcessing: {
    toneMapping: "aces",
    exposure: 0.9,
    aa: "smaa",
    // Soft glow on the luminous green gardens and amber Yield console without bleeding the lilac stone.
    bloom: { strength: 0.3, radius: 0.6, threshold: 0.92 },
    // Contact creases under furniture and beside the habitat walls, kept modest for the draw budget.
    ao: { radius: 1.2, intensity: 1.6, distanceFalloff: 2.6 },
    grade: {
      lift: [0.02, 0.012, 0.03],
      gain: [1.04, 1.0, 1.02],
      gamma: 0.97,
      saturation: 1.12,
      vignette: 0.26,
      grain: 0.008,
    },
  },
  camera: {
    rig: "rts",
    followEntityId: null,
    frustum: { far: 1200 },
    rts: {
      start: { x: 0, z: 0 },
      height: 19,
      pitch: 1.0,
      yaw: 0,
      targetOffset: { y: terrainField.sampleHeight(0, 0) },
      panSpeed: 30,
      edgeScroll: true,
      rotateSpeed: 1.1,
      bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
      zoom: { min: 0.55, max: 2.2, speed: 1 },
    },
  },
});
