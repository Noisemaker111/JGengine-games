import { defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { content } from "./game/content";
import { GOLD_CURRENCY } from "./game/entities/base/catalog";
import { currentWaveNumber, session } from "./game/session";
import { keybinds } from "./game/keybinds";
import { entityModels, scatterModels } from "./game/models";
import { systems } from "./game/systems";
import { GameUI } from "./game/ui/GameUI";
import { BeaconBastionWorldOverlay } from "./game/world/WorldOverlay";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Beacon Bastion",
  assets,
  world,
  physics,
  input: keybinds,
  server: { mode: "defense" },
  content,
  systems,
  loop,
  GameUI,
  settings: {
    variant: "panel",
  },
  entityModels,
  // Draped creep path + instanced foliage render from the document; towers/creeps/props spawn as
  // entities in the loop, so object placement stays off — no double render.
  editorLayers,
  scenePlacement: false,
  sceneScatterModels: scatterModels,
  WorldOverlay: BeaconBastionWorldOverlay,
  worldHealthBars: { statId: "health" },
  pointer: { moveCommand: "tower.build" },
  capture: {
    states: {
      "two-towers": [
        "buildTower1",
        { name: "tower.build", input: { point: [-12, 0, -3.2] } },
        "buildTower1",
        "buildTower2",
        { name: "tower.build", input: { point: [0, 0, 4] } },
      ],
      "cannon-plot-1": ["buildTower2", { name: "tower.build", input: { point: [-36, 0, -15.2] } }, "buildTower2"],
      "inspect-tower": [
        "buildTower2",
        { name: "tower.build", input: { point: [0, 0, 4] } },
        "buildTower2",
        { name: "tower.build", input: { point: [0, 0, 4] } },
      ],
    },
    probe: (ctx) => ({
      gold: ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY),
      towers: session.towers.size,
      creeps: session.creeps.size,
      wave: currentWaveNumber(),
    }),
  },
  shadows: true,
  // Graded post stack without the cinematic preset's image-based light, which washed the slopes
  // blue under this world's own golden-hour sky.
  postProcessing: {
    toneMapping: "aces",
    exposure: 0.95,
    bloom: { strength: 0.16, radius: 0.5, threshold: 0.95 },
    ao: { intensity: 1.3, radius: 1.4 },
    grade: { saturation: 1.12, gain: [1.05, 1.02, 0.95], vignette: 0.22 },
  },
  // Warm low sun rakes the relief so mounds, towers, and the keep cast long readable shadows; a cool
  // hemisphere fill keeps the shadow sides from going muddy black.
  lighting: {
    ambient: { color: "#9fb4cc", intensity: 0.4 },
    hemisphere: { skyColor: "#cfe0f2", groundColor: "#4a5a2e", intensity: 0.55 },
    directional: [
      {
        color: "#ffeccb",
        intensity: 1.35,
        position: [-34, 46, 22],
        castShadow: true,
        // Cascaded shadows — outdoor arena keeps contact shadows past a single ortho frustum (#1545).
        cascades: 3,
        shadowMapSize: 1024,
        shadowCameraSize: 58,
        shadowMaxFar: 120,
      },
    ],
  },
  camera: {
    rig: "topDown",
    followEntityId: null,
    topDown: { height: 38, pitch: 1.08, yaw: Math.PI / 4, zoom: { min: 0.6, max: 1.8 } },
  },
});
