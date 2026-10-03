import { activeJobs, queuedJobs, type WorkQueueConfig } from "@jgengine/core/gameplay";

import { session } from "./session";
import type { Faction } from "./tuning";

/**
 * Player research. A Barracks funds permanent, ranked upgrades over the shared work-queue: Iron
 * Weapons adds melee/ranged damage, Iron Armor shaves incoming damage. Ranks live on the serializable
 * `session.research` clock; combat reads their effect through {@link resolveDamage}, the single site
 * every swing routes through. The enemy does not research in this slice — the bonuses are player-only.
 */

export interface UpgradeDef {
  id: string;
  label: string;
  /** Short command-card blurb. */
  blurb: string;
  maxRank: number;
  /** Building the player must own to research (by catalog id). */
  requires: string;
  /** Cost to advance from `have` ranks to `have + 1`. */
  cost: (have: number) => Record<string, number>;
  /** Seconds to research the `have → have + 1` rank. */
  researchSeconds: (have: number) => number;
}

/** Damage added per Iron Weapons rank; damage removed per Iron Armor rank. */
export const WEAPON_DMG_PER_RANK = 3;
export const ARMOR_REDUCE_PER_RANK = 2;

export const UPGRADES: Record<string, UpgradeDef> = {
  weapons: {
    id: "weapons",
    label: "Assault Doctrine",
    blurb: `+${WEAPON_DMG_PER_RANK} dmg, −5% speed/rank`,
    maxRank: 3,
    requires: "barracks",
    cost: (have) => ({ gold: 90 + have * 70, lumber: 40 + have * 30 }),
    researchSeconds: (have) => 18 + have * 8,
  },
  armor: {
    id: "armor",
    label: "Bulwark Doctrine",
    blurb: `−${ARMOR_REDUCE_PER_RANK} incoming, −1 outgoing/rank`,
    maxRank: 3,
    requires: "barracks",
    cost: (have) => ({ gold: 80 + have * 70, lumber: 50 + have * 30 }),
    researchSeconds: (have) => 18 + have * 8,
  },
};

/** What a completed research job grants: one rank of one upgrade. */
export interface ResearchSpec {
  upgradeId: string;
  toRank: number;
}

/** The research queue config — duration is the per-rank research time; completion output raises the
 * upgrade's rank. A couple may research at once. */
export const RESEARCH_CONFIG: WorkQueueConfig<ResearchSpec, undefined, ResearchSpec> = {
  duration: (spec) => UPGRADES[spec.upgradeId]?.researchSeconds(spec.toRank - 1) ?? 0,
  concurrency: 2,
  output: (job) => job.spec,
};

/** Apply a finished research job to the rank table — the one place a rank ever rises. */
export function grantResearch(spec: ResearchSpec): void {
  const cur = session.research.ranks[spec.upgradeId] ?? 0;
  session.research.ranks[spec.upgradeId] = Math.max(cur, spec.toRank);
}

/** Ranks already researched for `id`. */
export function upgradeRank(id: string): number {
  return session.research.ranks[id] ?? 0;
}

/** Ranks of `id` currently in the research queue (active or waiting) but not yet finished. */
export function pendingRanks(id: string): number {
  let n = 0;
  for (const job of activeJobs(session.research.queue)) if (job.spec.upgradeId === id) n += 1;
  for (const job of queuedJobs(session.research.queue)) if (job.spec.upgradeId === id) n += 1;
  return n;
}

/** Achieved + pending ranks — the effective level for cost/gating (can't research a rank twice). */
export function upgradeHave(id: string): number {
  return upgradeRank(id) + pendingRanks(id);
}

function weaponBonus(faction: Faction): number {
  return faction === "player" ? upgradeRank("weapons") * WEAPON_DMG_PER_RANK : 0;
}

function armorReduction(faction: Faction): number {
  return faction === "player" ? upgradeRank("armor") * ARMOR_REDUCE_PER_RANK : 0;
}

/** Effective damage of a swing from `attacker` onto `defender` after both sides' upgrades. Every hit
 * chips at least 1 so armour can soften but never fully negate a blow. */
export function resolveDamage(base: number, attacker: Faction, defender: Faction): number {
  return Math.max(1, base + weaponBonus(attacker) - (attacker === "player" ? upgradeRank("armor") : 0) - armorReduction(defender));
}

export function doctrine(): string | null {
  if (upgradeHave("weapons") > 0) return "weapons";
  if (upgradeHave("armor") > 0) return "armor";
  return null;
}

export function movementSpeed(base: number, faction: Faction): number {
  return base * (faction === "player" ? 1 - upgradeRank("weapons") * 0.05 : 1);
}

export function matchupDamage(base: number, attackerId: string, defenderId: string): number {
  if (attackerId === "reaver" && (defenderId === "guard_tower" || defenderId === "barracks" || defenderId === "farm" || defenderId === "keep_player")) return base * 2;
  if (attackerId === "rifleman" && defenderId === "reaver") return base * 1.5;
  if (attackerId === "footman" && defenderId === "grunt") return base * 1.25;
  return base;
}
