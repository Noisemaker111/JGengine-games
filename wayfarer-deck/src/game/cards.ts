export type CardKind = "attack" | "skill" | "power";
export type CardArt = "sword" | "shield" | "mace" | "dagger" | "flame" | "brace" | "wave" | "axe";
export type CardBuild = "guard" | "strength" | "tempo";

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
  blockDamage?: boolean;
  consumeBlock?: boolean;
  cleanse?: boolean;
}

export interface CardData {
  type: string;
  name: string;
  kind: CardKind;
  build: CardBuild;
  cost: number;
  text: string;
  art: CardArt;
  effects: CardEffects;
  upgraded?: boolean;
}

export const CARD_CATALOG: Record<string, CardData> = {
  trail_cut: { type: "trail_cut", name: "Trail Cut", kind: "attack", build: "tempo", cost: 1, text: "Deal 6 damage.", art: "sword", effects: { damage: 6 } },
  pack_guard: { type: "pack_guard", name: "Pack Guard", kind: "skill", build: "guard", cost: 1, text: "Gain 5 Block.", art: "shield", effects: { block: 5 } },
  doorbreaker: { type: "doorbreaker", name: "Doorbreaker", kind: "attack", build: "tempo", cost: 2, text: "Deal 15 damage.", art: "mace", effects: { damage: 15 } },
  hilt_check: { type: "hilt_check", name: "Hilt Check", kind: "attack", build: "tempo", cost: 1, text: "Deal 7 damage. Draw 1 card.", art: "dagger", effects: { damage: 7, draw: 1 } },
  campfire_oath: { type: "campfire_oath", name: "Campfire Oath", kind: "power", build: "strength", cost: 1, text: "Gain 2 Strength this battle. Exhaust.", art: "flame", effects: { strength: 2, exhaust: true } },
  weather_the_road: { type: "weather_the_road", name: "Weather the Road", kind: "skill", build: "guard", cost: 1, text: "Gain 8 Block. Draw 1 card.", art: "brace", effects: { block: 8, draw: 1 } },
  sweeping_guard: { type: "sweeping_guard", name: "Sweeping Guard", kind: "attack", build: "guard", cost: 1, text: "Deal 5 damage. Gain 5 Block.", art: "wave", effects: { damage: 5, block: 5 } },
  wide_swing: { type: "wide_swing", name: "Wide Swing", kind: "attack", build: "tempo", cost: 1, text: "Deal 8 damage.", art: "axe", effects: { damage: 8 } },
  paired_cuts: { type: "paired_cuts", name: "Paired Cuts", kind: "attack", build: "strength", cost: 1, text: "Deal 4 damage twice.", art: "dagger", effects: { damage: 4, hits: 2 } },
  rising_hilt: { type: "rising_hilt", name: "Rising Hilt", kind: "attack", build: "tempo", cost: 2, text: "Deal 8 damage. Apply 2 Weak and 2 Vulnerable.", art: "mace", effects: { damage: 8, weak: 2, vulnerable: 2 } },
  trailbreaker: { type: "trailbreaker", name: "Trailbreaker", kind: "attack", build: "tempo", cost: 2, text: "Deal 12 damage. Apply 2 Weak.", art: "axe", effects: { damage: 12, weak: 2 } },
  route_reading: { type: "route_reading", name: "Route Reading", kind: "skill", build: "tempo", cost: 0, text: "Draw 3 cards. Exhaust.", art: "brace", effects: { draw: 3, exhaust: true } },
  stone_shelter: { type: "stone_shelter", name: "Stone Shelter", kind: "skill", build: "guard", cost: 2, text: "Gain 18 Block. Exhaust.", art: "shield", effects: { block: 18, exhaust: true } },
  quickening_draught: { type: "quickening_draught", name: "Quickening Draught", kind: "skill", build: "tempo", cost: 0, text: "Gain 1 Energy (up to 3). Draw 1 card. Exhaust.", art: "flame", effects: { energy: 1, draw: 1, exhaust: true } },
  switchback_reversal: { type: "switchback_reversal", name: "Switchback Reversal", kind: "attack", build: "guard", cost: 1, text: "Deal 4 damage plus your Block. Lose all Block.", art: "wave", effects: { damage: 4, blockDamage: true, consumeBlock: true } },
  ridge_footing: { type: "ridge_footing", name: "Ridge Footing", kind: "skill", build: "guard", cost: 1, text: "Gain 7 Block. Remove your Weak and Vulnerable.", art: "brace", effects: { block: 7, cleanse: true } },
  return_cut: { type: "return_cut", name: "Return Cut", kind: "attack", build: "guard", cost: 1, text: "Deal 4 damage. Gain 4 Block. Apply 1 Weak.", art: "sword", effects: { damage: 4, block: 4, weak: 1 } },
  scree_volley: { type: "scree_volley", name: "Scree Volley", kind: "attack", build: "strength", cost: 2, text: "Deal 4 damage three times.", art: "dagger", effects: { damage: 4, hits: 3 } },
  cairn_mark: { type: "cairn_mark", name: "Cairn Mark", kind: "skill", build: "strength", cost: 0, text: "Apply 2 Vulnerable. Draw 1 card. Exhaust.", art: "mace", effects: { vulnerable: 2, draw: 1, exhaust: true } },
};

export const BUILD_FOUNDATIONS: Readonly<Record<CardBuild, string>> = { guard: "switchback_reversal", strength: "paired_cuts", tempo: "route_reading" };

const UPGRADES: Record<string, Pick<CardData, "text" | "effects">> = {
  trail_cut: { text: "Deal 9 damage.", effects: { damage: 9 } },
  pack_guard: { text: "Gain 8 Block.", effects: { block: 8 } },
  doorbreaker: { text: "Deal 20 damage.", effects: { damage: 20 } },
  hilt_check: { text: "Deal 10 damage. Draw 1 card.", effects: { damage: 10, draw: 1 } },
  campfire_oath: { text: "Gain 3 Strength this battle. Exhaust.", effects: { strength: 3, exhaust: true } },
  weather_the_road: { text: "Gain 11 Block. Draw 1 card.", effects: { block: 11, draw: 1 } },
  sweeping_guard: { text: "Deal 7 damage. Gain 7 Block.", effects: { damage: 7, block: 7 } },
  wide_swing: { text: "Deal 12 damage.", effects: { damage: 12 } },
  paired_cuts: { text: "Deal 6 damage twice.", effects: { damage: 6, hits: 2 } },
  rising_hilt: { text: "Deal 11 damage. Apply 3 Weak and 3 Vulnerable.", effects: { damage: 11, weak: 3, vulnerable: 3 } },
  trailbreaker: { text: "Deal 16 damage. Apply 3 Weak.", effects: { damage: 16, weak: 3 } },
  route_reading: { text: "Draw 4 cards. Exhaust.", effects: { draw: 4, exhaust: true } },
  stone_shelter: { text: "Gain 24 Block. Exhaust.", effects: { block: 24, exhaust: true } },
  quickening_draught: { text: "Gain 1 Energy (up to 3). Draw 2 cards. Exhaust.", effects: { energy: 1, draw: 2, exhaust: true } },
  switchback_reversal: { text: "Deal 8 damage plus your Block. Lose all Block.", effects: { damage: 8, blockDamage: true, consumeBlock: true } },
  ridge_footing: { text: "Gain 10 Block. Remove your Weak and Vulnerable.", effects: { block: 10, cleanse: true } },
  return_cut: { text: "Deal 6 damage. Gain 6 Block. Apply 2 Weak.", effects: { damage: 6, block: 6, weak: 2 } },
  scree_volley: { text: "Deal 6 damage three times.", effects: { damage: 6, hits: 3 } },
  cairn_mark: { text: "Apply 3 Vulnerable. Draw 2 cards. Exhaust.", effects: { vulnerable: 3, draw: 2, exhaust: true } },
};

for (const [type, upgrade] of Object.entries(UPGRADES)) {
  const base = CARD_CATALOG[type]!;
  CARD_CATALOG[`${type}+`] = { ...base, ...upgrade, type: `${type}+`, name: `${base.name}+`, upgraded: true };
}

export function upgradeCardType(type: string): string | null {
  return Object.hasOwn(UPGRADES, type) ? `${type}+` : null;
}

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
  if (data === undefined || !Object.hasOwn(CARD_CATALOG, cardTypeOf(cardId))) throw new Error(`unknown card: ${cardId}`);
  return data;
}
