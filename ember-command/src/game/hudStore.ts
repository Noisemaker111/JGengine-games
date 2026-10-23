/** A tiny external store the HUD subscribes to via `useSyncExternalStore`. Systems snapshot live
 * counts into it a few times a second; the death handler stamps the final outcome. Kept separate
 * from `session` so React reads an immutable snapshot and only re-renders when a field changes. */

import type { CampaignReadout } from "./campaign";

export type MatchPhase = "ready" | "playing" | "paused" | "won" | "lost";

/** One live entry in the army row: a player combat unit with its current health. */
export interface ArmyUnit {
  id: string;
  kind: string;
  hp: number;
  max: number;
}

export interface HudSnapshot {
  elapsed: number;
  foodReserved: number;
  rallyArmed: boolean;
  phase: MatchPhase;
  gold: number;
  lumber: number;
  foodUsed: number;
  foodCap: number;
  playerUnits: number;
  enemyUnits: number;
  enemyKeepHp: number;
  enemyKeepMax: number;
  playerKeepHp: number;
  playerKeepMax: number;
  attackMoveArmed: boolean;
  /** Marauder reinforcement pressure: waves mustered so far, and whole seconds to the next one. */
  wavesSent: number;
  nextWaveIn: number;
  /** What the Marauder plan is doing: scouting, expanding or attacking. */
  marauderPhase: string;
  /** The pressure tier the Marauder waves are sized at, 0..2. */
  marauderTier: number;
  /** Units currently queued/training at the Town Hall, and the active job's 0..1 progress. */
  producing: number;
  trainProgress: number;
  /** A Barracks exists (unlocks Footman/Rifleman), and any building armed for placement. */
  hasBarracks: boolean;
  buildArmed: string | null;
  building: number;
  /** Research: achieved rank and achieved+pending "have" per upgrade, plus jobs in the queue. */
  weaponsRank: number;
  weaponsHave: number;
  armorRank: number;
  armorHave: number;
  researching: number;
  /** Hero: current level, whether Thunder Clap can fire, and whole seconds left on its cooldown. */
  heroLevel: number;
  abilityReady: boolean;
  abilityCd: number;
  /** Live roster of the player's fielded combat units (for the army row). */
  army: ArmyUnit[];
  /** The vale campaign: the objective card's mission, its clock and the field desk's offer. */
  campaign: CampaignReadout | null;
}

const initial: HudSnapshot = {
  elapsed: 0,
  foodReserved: 0,
  rallyArmed: false,
  phase: "playing",
  gold: 0,
  lumber: 0,
  foodUsed: 0,
  foodCap: 0,
  playerUnits: 0,
  enemyUnits: 0,
  enemyKeepHp: 0,
  enemyKeepMax: 1,
  playerKeepHp: 0,
  playerKeepMax: 1,
  attackMoveArmed: false,
  wavesSent: 0,
  nextWaveIn: 0,
  marauderPhase: "scouting",
  marauderTier: 0,
  producing: 0,
  trainProgress: 0,
  hasBarracks: false,
  buildArmed: null,
  building: 0,
  weaponsRank: 0,
  weaponsHave: 0,
  armorRank: 0,
  armorHave: 0,
  researching: 0,
  heroLevel: 1,
  abilityReady: false,
  abilityCd: 0,
  army: [],
  campaign: null,
};

/** Army rows churn every frame as HP ticks; compare on id/kind and integer HP to bound re-renders. */
function armyChanged(a: ArmyUnit[], b: ArmyUnit[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]!.id !== b[i]!.id || a[i]!.kind !== b[i]!.kind || Math.round(a[i]!.hp) !== Math.round(b[i]!.hp)) return true;
  }
  return false;
}

/** The campaign card only changes on a mission beat, so compare its readable fields only. */
function campaignChanged(a: CampaignReadout | null, b: CampaignReadout | null): boolean {
  if (a === b) return false;
  if (a === null || b === null) return true;
  return (
    a.phase !== b.phase ||
    a.missionId !== b.missionId ||
    a.objective !== b.objective ||
    a.remaining !== b.remaining ||
    a.counted !== b.counted ||
    a.count !== b.count ||
    a.step !== b.step ||
    a.steps !== b.steps ||
    a.outcome !== b.outcome ||
    a.reason !== b.reason ||
    a.index !== b.index ||
    a.stores.gold !== b.stores.gold ||
    a.stores.lumber !== b.stores.lumber
  );
}

let snapshot: HudSnapshot = initial;
const listeners = new Set<() => void>();

function changed(next: HudSnapshot): boolean {
  const p = snapshot;
  return (
    p.elapsed !== next.elapsed ||
    p.foodReserved !== next.foodReserved ||
    p.rallyArmed !== next.rallyArmed ||
    p.phase !== next.phase ||
    p.gold !== next.gold ||
    p.lumber !== next.lumber ||
    p.foodUsed !== next.foodUsed ||
    p.foodCap !== next.foodCap ||
    p.playerUnits !== next.playerUnits ||
    p.enemyUnits !== next.enemyUnits ||
    p.enemyKeepHp !== next.enemyKeepHp ||
    p.playerKeepHp !== next.playerKeepHp ||
    p.attackMoveArmed !== next.attackMoveArmed ||
    p.wavesSent !== next.wavesSent ||
    p.nextWaveIn !== next.nextWaveIn ||
    p.marauderPhase !== next.marauderPhase ||
    p.marauderTier !== next.marauderTier ||
    p.producing !== next.producing ||
    Math.abs(p.trainProgress - next.trainProgress) > 0.02 ||
    p.hasBarracks !== next.hasBarracks ||
    p.buildArmed !== next.buildArmed ||
    p.building !== next.building ||
    p.weaponsRank !== next.weaponsRank ||
    p.weaponsHave !== next.weaponsHave ||
    p.armorRank !== next.armorRank ||
    p.armorHave !== next.armorHave ||
    p.researching !== next.researching ||
    p.heroLevel !== next.heroLevel ||
    p.abilityReady !== next.abilityReady ||
    p.abilityCd !== next.abilityCd ||
    armyChanged(p.army, next.army) ||
    campaignChanged(p.campaign, next.campaign)
  );
}

export const hudStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get(): HudSnapshot {
    return snapshot;
  },
  set(patch: Partial<HudSnapshot>): void {
    const next = { ...snapshot, ...patch };
    if (!changed(next)) return;
    snapshot = next;
    for (const listener of listeners) listener();
  },
  reset(): void {
    snapshot = initial;
    for (const listener of listeners) listener();
  },
};
