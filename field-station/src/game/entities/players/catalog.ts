import type { StatCatalog } from "@jgengine/core/scene/entityStats";

export interface PlayerDef {
  id: string;
  name: string;
  walkSpeed: number;
  /** Health restored per second while outside every hazard zone. */
  regenPerSecond: number;
  stats: StatCatalog;
}

export const player: PlayerDef = {
  id: "player",
  name: "Player",
  walkSpeed: 5.4,
  regenPerSecond: 8,
  stats: { health: { max: 100 } },
};

export const players: PlayerDef[] = [player];
