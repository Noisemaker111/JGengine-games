import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { authoredModels } from "./authoredModels";

// Ember Command's own stone-and-copper miniature set; bundled through Vite so both
// the standalone game and consuming engine hosts load the same reviewed models.
const heights: Record<keyof typeof authoredModels, number> = {
  peasant: 2, footman: 2.3, rifleman: 2.2, hero: 2.65,
  grunt: 2.3, reaver: 2.65, keep_player: 7, keep_enemy: 7,
  barracks: 5, farm: 3.6, guard_tower: 6.5,
  banner_blue: 2.6, banner_red: 2.6, torch: 1.8, barrel: 1.2,
  goldmine: 2.6, woods: 4.6,
};
const warriors = new Set(["peasant", "footman", "rifleman", "hero", "grunt", "reaver"]);
export const entityModels: Record<string, ModelConfig> = Object.fromEntries(
  Object.entries(authoredModels).map(([id, url]) => [id, {
    url, targetHeight: heights[id as keyof typeof heights],
    ...(warriors.has(id) ? { animation: { states: { idle: "Idle", walk: "Walking_A", walkSpeed: .1 } } } : {}),
  }]),
);
// The authored forest ring uses the SDK's instanced vegetation meshes.
export const scatterModels: Record<string, string> = {};
