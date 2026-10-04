import { defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { content } from "./game/content";
import { GOLD_CURRENCY } from "./game/entities/base/catalog";
import { BUILD_PLOTS } from "./game/world/path";
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
  persist: { mode: "manual", version: 2 },
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
      "archer-opening": [
        "buildTower1",
        { name: "tower.build", input: { point: BUILD_PLOTS[0]!.position } },
        { name: "tower.build", input: { point: BUILD_PLOTS[1]!.position } },
        "buildTower1",
        "beginWave",
      ],
      "combined-opening": [
        "buildTower2",
        { name: "tower.build", input: { point: BUILD_PLOTS[0]!.position } },
        "buildTower2",
        "buildTower1",
        { name: "tower.build", input: { point: BUILD_PLOTS[1]!.position } },
        "buildTower1",
        "beginWave",
      ],
      "two-towers": [
        "buildTower1",
        { name: "tower.build", input: { point: [-12, 0, -3.2] } },
        "buildTower1",
        "buildTower2",
        { name: "tower.build", input: { point: [0, 0, 4] } },
      ],
      "cannon-plot-1": [
        "buildTower2",
        { name: "tower.build", input: { point: [-36, 0, -15.2] } },
        "buildTower2",
      ],
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
      lives: ctx.scene.entity.stats.get("keep", "lives")?.current ?? 0,
      planning: Number(session.planning),
      paused: Number(session.paused),
      reserve: session.reserve,
    }),
  },
  shadows: true,
  // Warm low sun rakes the relief so mounds, towers, and the keep cast long readable shadows; a cool
  // hemisphere fill keeps the shadow sides from going muddy black.
  lighting: {
    ambient: { color: "#9fb4cc", intensity: 0.4 },
    hemisphere: {
      skyColor: "#cfe0f2",
      groundColor: "#4a5a2e",
      intensity: 0.55,
    },
    directional: [
      {
        color: "#ffeccb",
        intensity: 1.35,
        position: [-34, 46, 22],
        castShadow: true,
        // A single board-wide shadow pass keeps the tactical view inexpensive.
        cascades: 1,
        shadowMapSize: 1024,
        shadowCameraSize: 92,
        shadowMaxFar: 120,
      },
    ],
  },
  camera: {
    rig: "topDown",
    followEntityId: null,
    topDown: {
      height: 70,
      pitch: 1.15,
      yaw: 0,
      zoom: { min: 0.6, max: 1.8 },
    },
  },
});
