import { defineGame } from "@jgengine/shell/defineGame";

import { assets } from "./game/assets";
import { DAY_LENGTH } from "./game/catalog";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { entityModels, objectModels } from "./game/models";
import { BrightwayParkWorldOverlay } from "./game/render/WorldOverlay";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";
import { editorLayers } from "./editorLayers";
import { session } from "./game/session";

export const game = defineGame({
  name: "Brightway Park",
  world,
  editorLayers,
  scenePlacement: false,
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
  capture: {
    play: ["park.start"], states: { paused: ["park.start", "pauseToggle"] },
    probe: ctx => ({ cash: session.cash, day: session.day, rating: session.rating,
      guests: session.guests.size, revenue: session.revenueToday, litter: session.litter,
      wear: [...session.placed.values()].reduce((n, p) => n + (p.wear ?? 0), 0),
      paused: Number(ctx.time.isPaused()), festival: Number(session.marketing === "festival"),
      closed: [...session.placed.values()].filter(p => p.closed).length,
      upgraded: [...session.placed.values()].filter(p => p.upgrade).length,
      stock: [...session.placed.values()].reduce((n, p) => n + p.stock, 0) }),
  },
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
