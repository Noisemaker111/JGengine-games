export type CardKind = "attack" | "skill" | "power";
export type CardArt = "sword" | "shield" | "mace" | "dagger" | "flame" | "brace" | "wave" | "axe";

export interface CardEffects {
  damage?: number;
  hits?: number;
  block?: number;
  strength?: number;
  draw?: number;
  weak?: number;
  vulnerable?: number;
  energy?: number;
  exhaust?: boolean;
}

export interface CardData {
  type: string;
  name: string;
  kind: CardKind;
  cost: number;
  text: string;
  art: CardArt;
  effects: CardEffects;
}

export const CARD_CATALOG: Record<string, CardData> = {
  trail_cut: { type: "trail_cut", name: "Trail Cut", kind: "attack", cost: 1, text: "Deal 6 damage.", art: "sword", effects: { damage: 6 } },
  pack_guard: { type: "pack_guard", name: "Pack Guard", kind: "skill", cost: 1, text: "Gain 5 Block.", art: "shield", effects: { block: 5 } },
  doorbreaker: { type: "doorbreaker", name: "Doorbreaker", kind: "attack", cost: 2, text: "Deal 10 damage.", art: "mace", effects: { damage: 10 } },
  hilt_check: { type: "hilt_check", name: "Hilt Check", kind: "attack", cost: 1, text: "Deal 7 damage. Draw 1 card.", art: "dagger", effects: { damage: 7, draw: 1 } },
  campfire_oath: { type: "campfire_oath", name: "Campfire Oath", kind: "power", cost: 1, text: "Gain 2 Strength.", art: "flame", effects: { strength: 2 } },
  weather_the_road: { type: "weather_the_road", name: "Weather the Road", kind: "skill", cost: 1, text: "Gain 8 Block. Draw 1 card.", art: "brace", effects: { block: 8, draw: 1 } },
  sweeping_guard: { type: "sweeping_guard", name: "Sweeping Guard", kind: "attack", cost: 1, text: "Deal 5 damage. Gain 5 Block.", art: "wave", effects: { damage: 5, block: 5 } },
  wide_swing: { type: "wide_swing", name: "Wide Swing", kind: "attack", cost: 1, text: "Deal 8 damage.", art: "axe", effects: { damage: 8 } },
  paired_cuts: { type: "paired_cuts", name: "Paired Cuts", kind: "attack", cost: 1, text: "Deal 4 damage twice.", art: "dagger", effects: { damage: 4, hits: 2 } },
  rising_hilt: { type: "rising_hilt", name: "Rising Hilt", kind: "attack", cost: 2, text: "Deal 8 damage. Apply 2 Weak and 2 Vulnerable.", art: "mace", effects: { damage: 8, weak: 2, vulnerable: 2 } },
  trailbreaker: { type: "trailbreaker", name: "Trailbreaker", kind: "attack", cost: 2, text: "Deal 12 damage. Apply 2 Weak.", art: "axe", effects: { damage: 12, weak: 2 } },
  route_reading: { type: "route_reading", name: "Route Reading", kind: "skill", cost: 0, text: "Draw 3 cards. Exhaust.", art: "brace", effects: { draw: 3, exhaust: true } },
  stone_shelter: { type: "stone_shelter", name: "Stone Shelter", kind: "skill", cost: 2, text: "Gain 15 Block. Exhaust.", art: "shield", effects: { block: 15, exhaust: true } },
  quickening_draught: { type: "quickening_draught", name: "Quickening Draught", kind: "skill", cost: 0, text: "Gain 1 Energy. Draw 1 card. Exhaust.", art: "flame", effects: { energy: 1, draw: 1, exhaust: true } },
};

const DECK_RECIPE: readonly [string, number][] = [
  ["trail_cut", 4],
  ["pack_guard", 3],
  ["doorbreaker", 1],
  ["hilt_check", 1],
  ["campfire_oath", 1],
  ["weather_the_road", 1],
  ["sweeping_guard", 1],
  ["wide_swing", 1],
];

export function buildStartingDeck(): string[] {
  const deck: string[] = [];
  let serial = 0;
  for (const [type, count] of DECK_RECIPE) {
    for (let i = 0; i < count; i += 1) {
      deck.push(`${type}#${serial}`);
      serial += 1;
    }
  }
  return deck;
}

export function cardTypeOf(cardId: string): string {
  const hash = cardId.indexOf("#");
  return hash === -1 ? cardId : cardId.slice(0, hash);
}

export function cardOf(cardId: string): CardData {
  const data = CARD_CATALOG[cardTypeOf(cardId)];
  if (data === undefined) throw new Error(`unknown card: ${cardId}`);
  return data;
}
