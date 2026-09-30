import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { BUILD_IDS } from "./objects/catalog";
import { GUEST_KINDS } from "./entities/guests/catalog";

// Original geometry uses world units and a deliberately authored ground origin.
const original = (id: string): ModelConfig => ({
  url: new URL(`../../public/art/models/${id}.glb`, import.meta.url).href,
  scale: 1,
  anchor: "origin",
});
export const objectModels = Object.fromEntries(BUILD_IDS.map(id => [id, original(id)]));
export const entityModels = Object.fromEntries(GUEST_KINDS.map(id => [id, original(id)]));
