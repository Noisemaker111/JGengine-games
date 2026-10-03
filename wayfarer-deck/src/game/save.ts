import { createKeyValueStore, defaultKeyValueStorage, type KeyValueStorage } from "@jgengine/core/game/keyValueStore";
import { CARD_CATALOG, cardTypeOf } from "./cards";
import type { CombatSave } from "./combat";
import { ENCOUNTERS } from "./enemy";
import { COMBAT_NODE_IDS, ROAD_NODES, legacyRouteState, validRouteState, type RouteState } from "./route";

export const SAVE_KEY = "wayfarer-deck.road-save.v1";
const SAVE_LIMIT = 128 * 1024;
export type SavedRunPhase = "combat" | "reward" | "route" | "shop" | "rest" | "event" | "victory" | "defeat";
export interface RoadSave {
  version: 2;
  phase: SavedRunPhase;
  encounterIndex: number;
  rewardSeed: number;
  rewards: string[];
  combat: CombatSave;
  route: RouteState;
}
export interface LegacyRoadSave {
  version: 1;
  phase: "combat" | "reward" | "victory" | "defeat";
  encounterIndex: number;
  rewardSeed: number;
  rewards: string[];
  combat: CombatSave;
}
export type PersistedRoadSave = RoadSave | LegacyRoadSave;
const integer = (value: unknown, max = 1_000_000): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const knownCard = (value: unknown): value is string => typeof value === "string" && value.length <= 80 && Object.hasOwn(CARD_CATALOG, value);
const cardId = (value: unknown): value is string => typeof value === "string" && value.length <= 100 && /^[a-z_]+\+?#(?:[0-9]+|reward[0-9]+)$/.test(value) && knownCard(cardTypeOf(value));

/** Validate the complete payload before spawning entities or replacing a stored save. */
export function validRoadSave(value: unknown): value is PersistedRoadSave {
  if (!object(value) || ![1, 2].includes(value.version)) return false;
  const phases = value.version === 1 ? ["combat", "reward", "victory", "defeat"] : ["combat", "reward", "route", "shop", "rest", "event", "victory", "defeat"];
  if (!phases.includes(value.phase) || !integer(value.encounterIndex, ENCOUNTERS.length - 1) || !integer(value.rewardSeed, 0xffffffff)) return false;
  if (value.version === 2) {
    if (!validRouteState(value.route)) return false;
    const route = value.route;
    const node = ROAD_NODES[route.nodeId]!;
    if (route.legacy && (route.nodeId !== COMBAT_NODE_IDS[value.encounterIndex] || ["shop", "rest", "event"].includes(value.phase))) return false;
    if (["combat", "reward", "victory", "defeat"].includes(value.phase) && node.encounterIndex !== value.encounterIndex) return false;
    if (["shop", "rest", "event"].includes(value.phase) && node.kind !== value.phase) return false;
    if (value.phase === "victory" && value.encounterIndex !== ENCOUNTERS.length - 1) return false;
    const fought = route.path.filter(id => ROAD_NODES[id]!.kind === "combat");
    const won = fought.length - (value.phase === "combat" || value.phase === "defeat" ? 1 : 0);
    if (route.battlesWon !== won) return false;
    const visitedShop = route.path.some(id => ROAD_NODES[id]!.kind === "shop");
    if ((route.shop.entries.length === 5) !== visitedShop) return false;
  }
  if (!Array.isArray(value.rewards) || value.rewards.length > 3 || value.rewards.some((type: unknown) => !knownCard(type) || (value.version === 2 && (type as string).endsWith("+")))) return false;
  if (value.phase === "reward" && (value.rewards.length !== 3 || new Set(value.rewards).size !== 3 || value.encounterIndex === ENCOUNTERS.length - 1)) return false;
  if (value.phase !== "reward" && value.rewards.length !== 0) return false;
  const c = value.combat;
  if (!object(c) || c.enemyId !== ENCOUNTERS[value.encounterIndex]!.id || !integer(c.enemyTurns) || !integer(c.seed, 0xffffffff) || !integer(c.rewardSerial)) return false;
  if (c.phase !== (value.phase === "combat" ? "player" : value.phase === "defeat" ? "lost" : "won")) return false;
  if (!Array.isArray(c.log) || c.log.length > 24 || c.log.some((line: unknown) => typeof line !== "string" || line.length > 240)) return false;
  for (const view of [c.hero, c.enemy]) {
    if (!object(view) || !["hp", "maxHp", "block", "strength", "weak", "vulnerable"].every((stat) => integer(view[stat]))) return false;
    if (view.hp > view.maxHp || view.maxHp === 0 || view.block > 999 || view.strength > 99 || view.weak > 20 || view.vulnerable > 20) return false;
  }
  if (c.hero.maxHp !== 72 || c.enemy.maxHp !== ENCOUNTERS[value.encounterIndex]!.maxHp) return false;
  if ((value.phase === "defeat") !== (c.hero.hp === 0) || (value.phase !== "combat") !== (c.enemy.hp === 0 || c.hero.hp === 0)) return false;
  if (!object(c.zones) || Object.keys(c.zones).length !== 4 || !["deck", "hand", "discard", "exhaust"].every((zone) => Array.isArray(c.zones[zone]) && c.zones[zone].length <= 24)) return false;
  const cards: unknown[] = [c.zones.deck, c.zones.hand, c.zones.discard, c.zones.exhaust].flat();
  const min = value.version === 1 ? 13 : 8;
  const max = value.version === 1 ? 13 + value.encounterIndex : 24;
  if (c.zones.hand.length > 10 || cards.length < min || cards.length > max || new Set(cards).size !== cards.length || cards.some((id) => !cardId(id))) return false;
  const t = c.turn;
  if (!object(t) || !integer(t.round) || t.round < 1 || ![0, 1].includes(t.activeIndex) || (value.phase === "combat" && t.activeIndex !== 0) || t.phaseIndex !== 0 || !Array.isArray(t.order) || t.order.length !== 2 || t.order[0] !== "hero" || t.order[1] !== "enemy") return false;
  return object(t.pools) && Object.keys(t.pools).length === 2 && ["hero", "enemy"].every((id) => object(t.pools[id]) && Object.keys(t.pools[id]).length === 1 && integer(t.pools[id].energy, 3));
}

export function parseRoadSave(value: unknown): RoadSave | null {
  if (!validRoadSave(value)) return null;
  if (value.version === 2) return value;
  const route = legacyRouteState(value.encounterIndex);
  route.battlesWon = value.encounterIndex + (value.phase === "reward" || value.phase === "victory" ? 1 : 0);
  return { ...value, version: 2, route };
}

export function readRoadSave(storage: KeyValueStorage | null = defaultKeyValueStorage()): { save: RoadSave | null; damaged: boolean; unavailable: boolean } {
  if (storage === null) return { save: null, damaged: false, unavailable: true };
  let damaged = false;
  let unavailable = false;
  const cell = createKeyValueStore<RoadSave | null>({
    key: SAVE_KEY, initial: null,
    storage: { getItem(key) { try { return storage.getItem(key); } catch { unavailable = true; return null; } }, setItem: (key, raw) => storage.setItem(key, raw), removeItem: (key) => storage.removeItem(key) },
    deserialize(raw) {
      if (raw.length > SAVE_LIMIT) { damaged = true; return null; }
      try { const save = parseRoadSave(JSON.parse(raw)); damaged = save === null; return save; }
      catch { damaged = true; return null; }
    },
  });
  return { save: cell.get(), damaged, unavailable };
}

export function writeRoadSave(save: PersistedRoadSave, storage: KeyValueStorage | null = defaultKeyValueStorage()): boolean {
  if (storage === null || !validRoadSave(save)) return false;
  let written = false;
  createKeyValueStore<PersistedRoadSave | null>({
    key: SAVE_KEY, initial: null,
    storage: { getItem: () => null, removeItem: (key) => storage.removeItem(key), setItem(key, raw) { if (raw.length <= SAVE_LIMIT) { storage.setItem(key, raw); written = true; } } },
  }).set(save);
  return written;
}
