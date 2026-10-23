import { defineGame } from "@jgengine/shell/gameKit";
import { HUD_THEME_PRESETS } from "@jgengine/react/hudTheme";

import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { BEACON_SOUNDS } from "./game/audio";
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
  // A refused build/upgrade reaches the player as a deny notice; its cue is the keep's own "denied" knock.
  audio: { sounds: BEACON_SOUNDS, uiCues: { deny: BEACON_SOUNDS.denied! } },
  notices: { cap: 3 },
  hudTheme: HUD_THEME_PRESETS.fieldkit,
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
    play: ["run.begin"],
    // Every state starts from the boot title, so each one opens the run first - without that the builds
    // land behind the title and the shot is the menu, not the state.
    states: {
      title: [],
      pause: ["run.begin", "run.pause"],
      "two-towers": [
        "run.begin",
        "buildTower1",
        { name: "tower.build", input: { point: [-12, 0, -3.2] } },
        "buildTower1",
        "buildTower2",
        { name: "tower.build", input: { point: [0, 0, 4] } },
      ],
      "cannon-plot-1": ["run.begin", "buildTower2", { name: "tower.build", input: { point: [-36, 0, -15.2] } }, "buildTower2"],
      "inspect-tower": [
        "run.begin",
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
    // The arena is 60x48 world units and the rig's 45-degree azimuth projects that diagonal
    // vertically, so the default height has to clear both ends of the raider route plus the
    // bottom build bar; the offset centres the route in the band the HUD leaves free.
    topDown: {
      height: 70,
      pitch: 1.08,
      yaw: Math.PI / 4,
      targetOffset: { x: -16, z: -6 },
      zoom: { min: 0.6, max: 1.8 },
    },
  },
});
