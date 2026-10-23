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
// Guests never animate, so a batch reproduces them exactly at any distance: 34-90 visitors draw from
// one instance buffer per guest kind instead of one rig each. Past 64 of a kind the rest draw their
// own model at their distance tier rather than vanishing.
const guest = (id: string): ModelConfig => ({
  ...original(id),
  lod: { crowdDistance: 0, crowdCapacity: 64 },
});
export const entityModels = Object.fromEntries(GUEST_KINDS.map(id => [id, guest(id)]));
