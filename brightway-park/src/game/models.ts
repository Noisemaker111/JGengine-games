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
// Guests never animate, so a batch reproduces them exactly at any distance: every visitor draws from
// one instance buffer per guest kind instead of one model each. The engine's default capacity (128 a
// kind, against a guest cap of 34-90) keeps the rest on their own models rather than dropping them.
const guest = (id: string): ModelConfig => ({
  ...original(id),
  lod: { crowdDistance: 0 },
});
export const entityModels = Object.fromEntries(GUEST_KINDS.map(id => [id, guest(id)]));
