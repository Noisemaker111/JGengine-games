import type { ShopStockSnapshot } from "@jgengine/core/economy/shopStock";
import { CARD_CATALOG } from "./cards";

export type RoadNodeKind = "combat" | "shop" | "rest" | "event";
export interface RouteNode {
  id: string;
  kind: RoadNodeKind;
  title: string;
  text: string;
  stage: number;
  next: readonly string[];
  encounterIndex?: number;
  bounty?: number;
}

export const ROAD_NODES: Readonly<Record<string, RouteNode>> = {
  low_road: { id: "low_road", kind: "combat", title: "Pitch beside the road", text: "The Pitch Ooze blocks the first mile. Clear it to earn 12 road coins.", stage: 0, next: ["tollhouse", "stranded_porter"], encounterIndex: 0, bounty: 12 },
  tollhouse: { id: "tollhouse", kind: "shop", title: "The old tollhouse", text: "A trader shelters beneath the broken toll bell. Spend coins on a card, a tonic, or a lighter pack.", stage: 1, next: ["cairn_pass", "borer_track"] },
  stranded_porter: { id: "stranded_porter", kind: "event", title: "A stranded porter", text: "A porter has dropped a crate into the scree. Recovering it will cost skin; sharing supplies may ease the next mile.", stage: 1, next: ["cairn_pass", "borer_track"] },
  cairn_pass: { id: "cairn_pass", kind: "combat", title: "The cairn path", text: "Face the Cairn Whisperer for 12 coins. Its opening chant builds Strength: finish it before the road wears you down.", stage: 2, next: ["dry_shelter", "weathered_cairn"], encounterIndex: 1, bounty: 12 },
  borer_track: { id: "borer_track", kind: "combat", title: "The broken ridge", text: "Face the Ridge Borer for 18 coins. Its heavy strikes arrive early; carry enough guard for the climb.", stage: 2, next: ["dry_shelter", "weathered_cairn"], encounterIndex: 2, bounty: 18 },
  dry_shelter: { id: "dry_shelter", kind: "rest", title: "A dry stone shelter", text: "There is daylight for one task: recover up to 18 HP, or practice and upgrade one card. Then face the Iron Sentry.", stage: 3, next: ["iron_gate"] },
  weathered_cairn: { id: "weathered_cairn", kind: "event", title: "An oath at the cairn", text: "Old travelers left a fire oath beneath the stones. Take its lesson at a cost, or rest briefly in its lee.", stage: 3, next: ["iron_gate"] },
  iron_gate: { id: "iron_gate", kind: "combat", title: "The iron checkpoint", text: "The Iron Sentry guards the upper road. Vulnerable makes its paired strikes dangerous. Defeat it for 24 coins.", stage: 4, next: ["gate_trader", "gate_fire"], encounterIndex: 3, bounty: 24 },
  gate_trader: { id: "gate_trader", kind: "shop", title: "The last road trader", text: "Spend what remains before the gate. Buy a final card, heal with a tonic, or remove a card from your pack.", stage: 5, next: ["final_gate"] },
  gate_fire: { id: "gate_fire", kind: "rest", title: "The gateward fire", text: "The last sheltered fire offers one choice: recover up to 18 HP, or upgrade a card for the Gate Colossus.", stage: 5, next: ["final_gate"] },
  final_gate: { id: "final_gate", kind: "combat", title: "Beyond the ridge", text: "The Gate Colossus keeps the crossing. Bring the deck and health your choices have earned.", stage: 6, next: [], encounterIndex: 4, bounty: 0 },
};
export const COMBAT_NODE_IDS = ["low_road", "cairn_pass", "borer_track", "iron_gate", "final_gate"] as const;
export const ROAD_CURRENCY = "road_coins";
export const SHOP_PRICES = { card: 20, tonic: 12, prune: 14 } as const;
export interface RouteState {
  nodeId: string;
  path: string[];
  coins: number;
  battlesWon: number;
  boonBlock: number;
  serviceUsed: boolean;
  eventChoice: string | null;
  journal: string[];
  shop: ShopStockSnapshot;
  legacy: boolean;
}
export function freshRouteState(): RouteState {
  return { nodeId: "low_road", path: ["low_road"], coins: 18, battlesWon: 0, boonBlock: 0, serviceUsed: false, eventChoice: null, journal: ["The gate lies beyond the ridge. Each wound and each card travels with you."], shop: { entries: [] }, legacy: false };
}
export function legacyRouteState(encounterIndex: number): RouteState {
  return { ...freshRouteState(), legacy: true, nodeId: COMBAT_NODE_IDS[encounterIndex]!, path: COMBAT_NODE_IDS.slice(0, encounterIndex + 1), battlesWon: encounterIndex, coins: 0, journal: ["Your saved crossing follows the original five encounters."] };
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;

export function validRouteState(value: unknown): value is RouteState {
  if (!object(value) || typeof value.nodeId !== "string" || !Object.hasOwn(ROAD_NODES, value.nodeId) || typeof value.legacy !== "boolean") return false;
  if (!Array.isArray(value.path) || value.path.length < 1 || value.path.length > 7 || value.path[0] !== "low_road" || value.path.at(-1) !== value.nodeId || new Set(value.path).size !== value.path.length) return false;
  for (let i = 0; i < value.path.length; i++) {
    const id = value.path[i];
    if (typeof id !== "string" || !Object.hasOwn(ROAD_NODES, id)) return false;
    if (value.legacy ? id !== COMBAT_NODE_IDS[i] : i > 0 && !ROAD_NODES[value.path[i - 1] as string]!.next.includes(id)) return false;
  }
  if (!integer(value.coins, 200) || !integer(value.battlesWon, value.legacy ? 5 : 4) || ![0, 6].includes(value.boonBlock as number) || typeof value.serviceUsed !== "boolean") return false;
  if (value.eventChoice !== null && !["salvage", "share", "oath", "shelter", "leave"].includes(value.eventChoice as string)) return false;
  if (!Array.isArray(value.journal) || value.journal.length > 24 || value.journal.some(line => typeof line !== "string" || line.length > 240)) return false;
  if (!object(value.shop) || !Array.isArray(value.shop.entries) || ![0, 5].includes(value.shop.entries.length)) return false;
  const ids = new Set<string>();
  let cards = 0;
  for (const entry of value.shop.entries) {
    if (!object(entry) || typeof entry.id !== "string" || ids.has(entry.id) || ![0, 1].includes(entry.qty as number) || !object(entry.price) || entry.price.currency !== ROAD_CURRENCY || entry.sellPrice !== undefined) return false;
    ids.add(entry.id);
    if (entry.id.startsWith("card:")) {
      const type = entry.id.slice(5);
      if (!Object.hasOwn(CARD_CATALOG, type) || CARD_CATALOG[type]!.upgraded || entry.kind !== "card" || entry.price.amount !== SHOP_PRICES.card) return false;
      cards++;
    } else if (entry.id === "tonic") {
      if (entry.kind !== "heal" || entry.price.amount !== SHOP_PRICES.tonic) return false;
    } else if (entry.id === "prune") {
      if (entry.kind !== "prune" || entry.price.amount !== SHOP_PRICES.prune) return false;
    } else return false;
  }
  return value.shop.entries.length === 0 || (cards === 3 && ids.has("tonic") && ids.has("prune"));
}
