import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { seededRng } from "@jgengine/shell/gameKit";

import { STARTING_GOLD, STARTING_LIVES, GOLD_CURRENCY } from "../entities/base/catalog";
import { currentWaveNumber, session } from "../session";
import { DIRECTOR_SEED, TOTAL_WAVES } from "./manifest";

export interface BoonEffect {
  /** Extra gold in the next defense's opening purse. */
  gold?: number;
  /** Extra lives on the next keep. */
  lives?: number;
  /** Added to the kill-pay multiplier for the whole run, as a fraction (0.4 = +40%). */
  bounty?: number;
}

/** A relic the result card can offer: banked progress the next defense carries in. */
export interface BoonDef {
  id: string;
  label: string;
  detail: string;
  /** Relative odds in the seeded draw. */
  weight: number;
  effect: BoonEffect;
}

export const BOONS: readonly BoonDef[] = [
  { id: "spoils", label: "Spoils of the Keep", detail: "+60 gold in the opening purse", weight: 3, effect: { gold: 60 } },
  { id: "gate", label: "Reinforced Gate", detail: "+5 lives on the keep", weight: 3, effect: { lives: 5 } },
  { id: "writ", label: "Bounty Writ", detail: "Kill pay +40% for the whole run", weight: 2, effect: { bounty: 0.4 } },
  { id: "levy", label: "Warden's Levy", detail: "+35 gold and kill pay +15%", weight: 2, effect: { gold: 35, bounty: 0.15 } },
  { id: "mason", label: "Stonemason's Gift", detail: "+3 lives and +25 gold", weight: 2, effect: { lives: 3, gold: 25 } },
];

/** What a completed defense leaves behind for the next one. Persisted with its keep. */
export interface LegacyState {
  /** Waves held across every finished defense under this keep. */
  standing: number;
  /** Finished defenses: held or fallen. */
  runs: number;
  /** Gold the last defense banked for the next opening purse. */
  bankedGold: number;
  /** The relic the next defense carries, or null. */
  boonId: string | null;
  /** The relics the result card is offering right now, in draw order. */
  offer: string[];
}

/** How much of the purse is banked, and how many relics are offered. */
export const BANK_RULE = { share: 0.5, cap: 200, offerCount: 3 } as const;

export function freshLegacy(): LegacyState {
  return { standing: 0, runs: 0, bankedGold: 0, boonId: null, offer: [] };
}

/** The keep's banked progress, in the reactive store so the HUD and the save document see one value. */
export const legacy = defineStore<LegacyState>("beacon:legacy", freshLegacy);

export function boonDef(id: string | null): BoonDef | null {
  if (id === null) return null;
  return BOONS.find((boon) => boon.id === id) ?? null;
}

/**
 * Draw the relics a result card offers. Weighted, without repeats, from a seed the run supplies, so
 * the same finished run always offers the same three and the next run offers a different three.
 */
export function drawBoons(seed: number, count = BANK_RULE.offerCount): string[] {
  const rng = seededRng(`beacon-bastion:offer:${seed}`);
  const pool = [...BOONS];
  const drawn: string[] = [];
  while (drawn.length < count && pool.length > 0) {
    const total = pool.reduce((sum, boon) => sum + boon.weight, 0);
    let roll = rng() * total;
    let index = pool.length - 1;
    for (let candidate = 0; candidate < pool.length; candidate += 1) {
      roll -= pool[candidate]!.weight;
      if (roll <= 0) {
        index = candidate;
        break;
      }
    }
    drawn.push(pool[index]!.id);
    pool.splice(index, 1);
  }
  return drawn;
}

/** What a finished defense banks: half the purse up to the cap, the waves held, and three relics. */
export function bankRun(previous: LegacyState, result: { wave: number; gold: number }): LegacyState {
  const standing = previous.standing + Math.max(0, result.wave);
  const bankedGold = Math.min(BANK_RULE.cap, Math.max(0, Math.floor(result.gold * BANK_RULE.share)));
  const seed = DIRECTOR_SEED + previous.runs * 7919 + standing;
  return {
    standing,
    runs: previous.runs + 1,
    bankedGold,
    boonId: previous.boonId,
    offer: drawBoons(seed),
  };
}

/** Take one of the offered relics, or none. */
export function chooseBoon(state: LegacyState, id: string | null): LegacyState {
  if (id !== null && !state.offer.includes(id)) return state;
  return { ...state, boonId: id, offer: [] };
}

export function openingGold(state: LegacyState): number {
  const gold = boonDef(state.boonId)?.effect.gold ?? 0;
  return STARTING_GOLD + Math.min(BANK_RULE.cap, state.bankedGold) + gold;
}

export function openingLives(state: LegacyState): number {
  return STARTING_LIVES + (boonDef(state.boonId)?.effect.lives ?? 0);
}

/** The relic's multiplier on every kill bounty, on top of the wave's. */
export function relicBountyScale(state: LegacyState): number {
  return 1 + (boonDef(state.boonId)?.effect.bounty ?? 0);
}

/** Whether a stored legacy section is one this build can restore. */
export function validLegacy(value: unknown): value is LegacyState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as LegacyState;
  return (
    Number.isSafeInteger(state.standing) && state.standing >= 0 &&
    Number.isSafeInteger(state.runs) && state.runs >= 0 &&
    typeof state.bankedGold === "number" && Number.isFinite(state.bankedGold) &&
    (state.boonId === null || typeof state.boonId === "string") &&
    Array.isArray(state.offer) && state.offer.every((id) => typeof id === "string")
  );
}

export function readLegacy(ctx: GameContext): LegacyState {
  return legacy.read(ctx);
}

export function writeLegacy(ctx: GameContext, next: LegacyState): void {
  legacy.write(ctx, next);
}

/**
 * Bank a finished defense: its purse share, the waves it held, and the relics the next one may open
 * with. Guarded by `session.banked`, so a win and a death in the same frame bank once.
 */
export function finishRun(ctx: GameContext): void {
  if (session.banked) return;
  session.banked = true;
  const wave = Math.max(1, Math.min(TOTAL_WAVES, currentWaveNumber()));
  const gold = ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY);
  legacy.write(ctx, bankRun(legacy.read(ctx), { wave, gold }));
}
