import { CARD_CATALOG, cardTypeOf } from "./cards";
import type { CombatSave } from "./combat";
import { ENCOUNTERS } from "./enemy";
import type { RunPhase } from "./run";

export const SAVE_KEY = "wayfarer-deck.road-save.v1";
export interface RoadSave {
  version: 1;
  phase: RunPhase;
  encounterIndex: number;
  rewardSeed: number;
  rewards: string[];
  combat: CombatSave;
}
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);

/** Validate before spawning entities; a damaged or newer save is never silently deleted. */
export function validRoadSave(value: unknown): value is RoadSave {
  if (!object(value) || value.version !== 1 || !["combat", "reward", "victory", "defeat"].includes(value.phase)) return false;
  if (!integer(value.encounterIndex) || !ENCOUNTERS[value.encounterIndex] || !integer(value.rewardSeed)) return false;
  if (!Array.isArray(value.rewards) || value.rewards.some((type: unknown) => typeof type !== "string" || !Object.hasOwn(CARD_CATALOG, type))) return false;
  if (value.phase === "reward" && (value.rewards.length !== 3 || new Set(value.rewards).size !== 3 || value.encounterIndex === ENCOUNTERS.length - 1)) return false;
  const c = value.combat;
  if (!object(c) || c.enemyId !== ENCOUNTERS[value.encounterIndex]!.id || !integer(c.enemyTurns) || !integer(c.seed) || !integer(c.rewardSerial)) return false;
  if (c.phase !== ({ combat: "player", reward: "won", victory: "won", defeat: "lost" } as const)[value.phase as RunPhase]) return false;
  if (!Array.isArray(c.log) || c.log.some((line: unknown) => typeof line !== "string")) return false;
  for (const view of [c.hero, c.enemy]) {
    if (!object(view) || !["hp", "maxHp", "block", "strength", "weak", "vulnerable"].every((stat) => integer(view[stat]))) return false;
    if (view.hp > view.maxHp || view.maxHp === 0 || view.block > 999 || view.strength > 99 || view.weak > 20 || view.vulnerable > 20) return false;
  }
  if (c.hero.maxHp !== 72 || c.enemy.maxHp !== ENCOUNTERS[value.encounterIndex]!.maxHp) return false;
  if ((value.phase === "defeat") !== (c.hero.hp === 0) || (value.phase !== "combat") !== (c.enemy.hp === 0 || c.hero.hp === 0)) return false;
  if (!object(c.zones) || !["deck", "hand", "discard", "exhaust"].every((zone) => Array.isArray(c.zones[zone]))) return false;
  const cards = Object.values(c.zones).flat();
  if (Object.keys(c.zones).length !== 4 || c.zones.hand.length > 10 || cards.length < 13 || cards.length > 13 + value.encounterIndex || new Set(cards).size !== cards.length) return false;
  if (cards.some((id) => typeof id !== "string" || !Object.hasOwn(CARD_CATALOG, cardTypeOf(id)))) return false;
  const t = c.turn;
  if (!object(t) || !integer(t.round) || t.round < 1 || ![0, 1].includes(t.activeIndex) || t.phaseIndex !== 0 || JSON.stringify(t.order) !== '["hero","enemy"]') return false;
  return object(t.pools) && ["hero", "enemy"].every((id) => object(t.pools[id]) && integer(t.pools[id].energy) && t.pools[id].energy <= 3);
}

export function readRoadSave(): { save: RoadSave | null; damaged: boolean } {
  try {
    if (typeof localStorage === "undefined") return { save: null, damaged: false };
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { save: null, damaged: false };
    const save: unknown = JSON.parse(raw);
    return validRoadSave(save) ? { save, damaged: false } : { save: null, damaged: true };
  } catch { return { save: null, damaged: true }; }
}

export function writeRoadSave(save: RoadSave): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch { return false; }
}
