import { DEFAULT_WALK_CODES, defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { content } from "./game/content";
import { flowSystem } from "./game/flow";
import { idea } from "./game/idea";
import { entityModels, objectModels } from "./game/models";
import { prompts } from "./game/prompts";
import { camp } from "./game/spec";
import { GameUI } from "./game/ui/GameUI";
import { onNewPlayer, systems } from "./loop";
import { world } from "./world";

export const game = defineGame({
  name: idea.name,
  world,
  // Binding the movement actions makes the shell drive the walk controller.
  input: {
    ...DEFAULT_WALK_CODES,
    sprint: ["ShiftLeft"],
    interact: ["KeyE"],
    attack: ["mouse0", "KeyF"],
    pause: ["Escape", "KeyP"],
    callWave: ["KeyN"],
    ...Object.fromEntries(idea.structures.map((_, index) => [`build${index + 1}`, [`Digit${index + 1}`]])),
  },
  systems: [flowSystem, ...systems],
  loop: { onNewPlayer },
  content,
  GameUI,
  prompts,
  editorLayers,
  entityModels,
  objectModels,
  worldHealthBars: { statId: "health" },
  look: idea.look,
  mood: idea.mood,
  uiKit: idea.kit,
  persist: { mode: "manual" },
  camera: { rig: "orbit", minDistance: 4, maxDistance: 16 },
  capture: {
    play: [{ name: "start", input: {} }],
    states: { wave: [{ name: "start", input: {} }, { name: "callWave", input: {} }] },
    probe: (ctx) => {
      const world = camp.of(ctx);
      return {
        wave: world.num(`camp.wave`),
        held: world.num(`camp.held`),
        built: world.num(`camp.built`),
        alive: world.num(`camp.alive`),
        tamed: world.num(`camp.tamed`),
        ...Object.fromEntries(idea.resources.map((resource) => [resource.id, Math.floor(world.num(`camp.${resource.id}`))])),
      };
    },
  },
});
