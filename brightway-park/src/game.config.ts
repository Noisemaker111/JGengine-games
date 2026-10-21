import { defineGame } from "@jgengine/shell/defineGame";

import { BRIGHTWAY_SOUNDS } from "./game/audio";
import { assets } from "./game/assets";
import { DAY_LENGTH } from "./game/catalog";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { entityModels, objectModels } from "./game/models";
import { BrightwayParkWorldOverlay } from "./game/render/WorldOverlay";
import { GameUI } from "./game/ui/GameUI";
import { parkTheme } from "./game/ui/theme";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Brightway Park",
  world,
  physics,
  assets,
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  features: { unlocks: true },
  time: { scale: 1, dayLength: DAY_LENGTH, start: DAY_LENGTH * (9 / 24), speeds: [1, 2, 4], startPaused: true },
  content,
  loop,
  GameUI,
  entityModels,
  objectModels,
  WorldOverlay: BrightwayParkWorldOverlay,
  worldHealthBars: false,
  // A refused build is a deny notice; its cue is the park's own "denied" chime.
  audio: { sounds: BRIGHTWAY_SOUNDS, uiCues: { deny: BRIGHTWAY_SOUNDS.denied! } },
  // Park news lingers like the old ticker: up to six lines, seven seconds each.
  notices: { cap: 6, ttlMs: 7000 },
  hudTheme: parkTheme,
  look: "cinematic",
  postProcessing: {
    toneMapping: "aces",
    bloom: { strength: 0.22, radius: 0.5, threshold: 0.95 },
    ao: { intensity: 1.1, radius: 1.6 },
    grade: { saturation: 1.18, gamma: 0.98, vignette: 0.12, grain: 0 },
  },
  capture: { play: ["park.start"], states: { paused: ["park.start", "pauseToggle"] } },
  pointer: { moveCommand: "park.pointer", secondaryCommand: "build.clear" },
  camera: {
    rig: "rts",
    followEntityId: null,
    frustum: { far: 1200 },
    rts: {
      start: { x: 0, z: 16 },
      height: 52,
      pitch: 0.86,
      yaw: Math.PI / 4,
      panSpeed: 55,
      edgeScroll: false,
      rotateSpeed: 1.1,
      bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 },
      zoom: { min: 0.5, max: 2.4, speed: 1 },
    },
  },
});
