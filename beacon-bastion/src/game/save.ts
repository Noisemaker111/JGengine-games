import { createGameSave, type GameSave, type GameSaveSystem } from "@jgengine/core/game/gameSave";
import { localSaveBackend } from "@jgengine/core/game/saveStore";
import { createSaveSlots, type SaveSlots } from "@jgengine/core/game/saveSlots";
import { gameSaveSlotSource, refreshSaveSlots, type SaveSlotsRefresh } from "@jgengine/core/game/saveSlotIndex";
import type { PathFollowState } from "@jgengine/core/nav/pathFollow";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { ClockSnapshot } from "@jgengine/core/time/simClock";
import type { WorkQueueState } from "@jgengine/core/gameplay";

import { BASE_CATALOG_ID, BASE_ENTITY_ID, GOLD_CURRENCY } from "./entities/base/catalog";
import { creepDef } from "./entities/enemies/catalog";
import { resetProjectiles } from "./combat/pendingProjectiles";
import { newSpeedStats, resetSession, session, type BossRuntime } from "./session";
import { freshLegacy, legacy, validLegacy } from "./waves/legacy";
import { WARDEN_ID } from "./waves/manifest";
import type { EncounterState } from "@jgengine/core/ai/director/encounter";
import type { PressurePlan } from "@jgengine/core/ai/director/pressure";
import type { TowerBuildSpec, TowerReservation } from "./build/construction";
import { BUILD_PLOTS, KEEP_POINT } from "./world/path";

/** The keeps a player can hold. One document per keep, all inside the shared save document. */
export const KEEP_SLOTS = ["keep", "ward", "beacon"] as const;
export const KEEP_LABEL: Record<string, string> = { keep: "The Keep", ward: "The Ward", beacon: "The Beacon" };

/**
 * One defense run as the save document stores it: the run's clock, purse, keep health, wave director,
 * every raider mid-route and every raised tower. Plain JSON so a document written by one build
 * restores into the next.
 */
export interface DefenseSave {
  clock: ClockSnapshot;
  gold: number;
  lives: number;
  encounter: EncounterState;
  pressure: PressurePlan;
  boss: BossRuntime | null;
  openingComposition: string[];
  waveReady: boolean;
  waveStarted: boolean;
  lastWaveBonus: number;
  /** Kill bounties paid this run. Optional so a document from before bounties still restores. */
  bountyEarned?: number;
  /** Whether this run already banked its reward. Optional for the same reason. */
  banked?: boolean;
  gameOver: boolean;
  victory: boolean;
  creepSeq: number;
  towerSeq: number;
  creeps: { instanceId: string; catalogId: string; path: PathFollowState }[];
  towers: { instanceId: string; catalogId: string; plotId: string; level: number; cooldownSeconds: number }[];
  queue: WorkQueueState<TowerBuildSpec, TowerReservation>;
}

function balance(ctx: GameContext): number {
  return ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY);
}

export function captureDefense(ctx: GameContext): DefenseSave {
  return {
    clock: ctx.time.snapshot(),
    gold: balance(ctx),
    lives: ctx.scene.entity.stats.get(BASE_ENTITY_ID, "lives")?.current ?? 0,
    encounter: session.encounter.snapshot(),
    pressure: { ...session.pressure },
    boss: session.boss === null ? null : { instanceId: session.boss.instanceId, unitId: session.boss.unitId, state: { ...session.boss.state }, stance: session.boss.stance },
    openingComposition: [...session.openingComposition],
    waveReady: session.waveReady,
    waveStarted: session.waveStarted,
    lastWaveBonus: session.lastWaveBonus,
    bountyEarned: session.bountyEarned,
    banked: session.banked,
    gameOver: session.gameOver,
    victory: session.victory,
    creepSeq: session.creepSeq,
    towerSeq: session.towerSeq,
    creeps: [...session.creeps.values()].map((creep) => ({
      instanceId: creep.instanceId,
      catalogId: creep.catalogId,
      path: creep.path,
    })),
    towers: [...session.towers.values()].map((tower) => ({ ...tower })),
    queue: session.buildQueue,
  };
}

/**
 * Put a stored run back on the live world: the same raiders on the same stretch of route, the same
 * towers and purses. Active frost slows ride on a 1.6 s stat modifier, so they restart from clean.
 */
export function restoreDefense(ctx: GameContext, save: DefenseSave): void {
  ctx.time.hydrate(save.clock);
  for (const id of [...session.creeps.keys(), ...session.towers.keys(), BASE_ENTITY_ID]) ctx.scene.entity.despawn(id);
  resetSession();
  resetProjectiles();

  session.encounter.restore(save.encounter);
  session.pressure = { ...save.pressure };
  session.boss = save.boss === null ? null : {
    instanceId: save.boss.instanceId,
    unitId: save.boss.unitId ?? WARDEN_ID,
    state: { ...save.boss.state },
    stance: save.boss.stance,
  };
  session.openingComposition = [...save.openingComposition];
  session.waveReady = save.waveReady;
  session.waveStarted = save.waveStarted;
  session.lastWaveBonus = save.lastWaveBonus;
  session.bountyEarned = typeof save.bountyEarned === "number" ? save.bountyEarned : 0;
  session.banked = save.banked === true;
  session.gameOver = save.gameOver;
  session.victory = save.victory;
  session.creepSeq = save.creepSeq;
  session.towerSeq = save.towerSeq;
  session.buildQueue = save.queue;

  ctx.scene.entity.spawn(BASE_CATALOG_ID, { id: BASE_ENTITY_ID, position: KEEP_POINT, role: "prop" });
  ctx.scene.entity.stats.set(BASE_ENTITY_ID, "lives", { current: save.lives });

  for (const tower of save.towers) {
    const plot = BUILD_PLOTS.find((candidate) => candidate.id === tower.plotId);
    if (plot === undefined) continue;
    ctx.scene.entity.spawn(tower.catalogId, { id: tower.instanceId, position: plot.position, role: "prop" });
    session.towers.set(tower.instanceId, { ...tower });
    session.plotOccupant.set(tower.plotId, tower.instanceId);
  }

  for (const creep of save.creeps) {
    const def = creepDef(creep.catalogId);
    ctx.scene.entity.spawn(creep.catalogId, { id: creep.instanceId, position: creep.path.position, role: "npc" });
    ctx.scene.entity.setPose(creep.instanceId, { position: creep.path.position, rotationY: creep.path.heading });
    session.creeps.set(creep.instanceId, {
      instanceId: creep.instanceId,
      catalogId: creep.catalogId,
      path: { ...creep.path },
      speedStats: newSpeedStats(def.speed),
    });
  }

  const held = balance(ctx);
  if (held > 0) ctx.game.economy.charge(ctx.player.userId, GOLD_CURRENCY, held);
  if (save.gold > 0) ctx.game.economy.grant(ctx.player.userId, GOLD_CURRENCY, save.gold);
}

const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const waypoint = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 3 && value.every(number);

/** A document this build can actually restore, rather than a half-applied world. */
export function validDefenseSave(value: unknown): value is DefenseSave {
  if (typeof value !== "object" || value === null) return false;
  const save = value as DefenseSave;
  return (
    typeof save.clock === "object" && save.clock !== null && number(save.clock.now) &&
    number(save.gold) && number(save.lives) &&
    typeof save.encounter === "object" && save.encounter !== null && Number.isSafeInteger(save.encounter.wave) &&
    typeof save.pressure === "object" && save.pressure !== null && Number.isSafeInteger(save.pressure.tier) &&
    Array.isArray(save.openingComposition) &&
    typeof save.waveReady === "boolean" && typeof save.waveStarted === "boolean" &&
    number(save.lastWaveBonus) && typeof save.gameOver === "boolean" && typeof save.victory === "boolean" &&
    Number.isSafeInteger(save.creepSeq) && Number.isSafeInteger(save.towerSeq) &&
    Array.isArray(save.creeps) && save.creeps.every((creep) =>
      typeof creep?.instanceId === "string" && typeof creep.catalogId === "string" &&
      typeof creep.path === "object" && creep.path !== null && waypoint(creep.path.position) && number(creep.path.target) &&
      number(creep.path.heading) && typeof creep.path.done === "boolean" && number(creep.path.distanceTravelled)) &&
    Array.isArray(save.towers) && save.towers.every((tower) =>
      typeof tower?.instanceId === "string" && typeof tower.catalogId === "string" &&
      typeof tower.plotId === "string" && Number.isSafeInteger(tower.level) && number(tower.cooldownSeconds)) &&
    typeof save.queue === "object" && save.queue !== null && Array.isArray(save.queue.jobs)
  );
}

const boundSave = perContext(() => ({ save: null as GameSave | null }));

/** The run itself, as one save section: field, purse, director and the Warden. */
export function defenseSystem(ctx: GameContext): GameSaveSystem {
  return {
    name: "defense",
    snapshot: () => captureDefense(ctx),
    restore: (section) => {
      if (validDefenseSave(section)) restoreDefense(ctx, section);
    },
    reset: () => {
      for (const id of [...session.creeps.keys(), ...session.towers.keys()]) ctx.scene.entity.despawn(id);
      resetSession();
      resetProjectiles();
    },
  };
}

/**
 * What the keep has banked, as its own section: a new defense clears the field but not what the last
 * one left behind, and an empty keep resets it to nothing banked.
 */
export function legacySystem(ctx: GameContext): GameSaveSystem {
  return {
    name: "legacy",
    snapshot: () => legacy.read(ctx),
    restore: (section) => {
      if (validLegacy(section)) legacy.write(ctx, section);
    },
    reset: () => legacy.write(ctx, freshLegacy()),
  };
}

/** The one save document for this run's world; the store keys it by context. */
export function beaconSave(ctx: GameContext): GameSave {
  const slot = boundSave(ctx);
  if (slot.save !== null) return slot.save;
  const save = createGameSave({
    backend: localSaveBackend(),
    game: "beacon-bastion",
    slot: KEEP_SLOTS[0],
    clock: () => ctx.time.now(),
    playtime: () => ctx.time.now(),
    systems: [defenseSystem(ctx), legacySystem(ctx)],
  });
  slot.save = save;
  return save;
}

/** The save-select index the menus render — filled from the documents, never from a flag. */
export const beaconSlots: SaveSlots = createSaveSlots({
  capacity: KEEP_SLOTS.length,
  slots: KEEP_SLOTS.map((id) => ({ id, empty: true, meta: {} })),
});

/** Re-read every keep's document into the menu index. `savedAt` and playtime come from the document. */
export function refreshBeaconSlots(ctx: GameContext): Promise<SaveSlotsRefresh> {
  return refreshSaveSlots(gameSaveSlotSource(beaconSave(ctx)), beaconSlots, {
    nameOf: (slot, document) => {
      const defense = document.systems.defense;
      const wave = validDefenseSave(defense) ? defense.encounter.wave + 1 : 1;
      return `${KEEP_LABEL[slot] ?? slot} · wave ${wave}`;
    },
    metaOf: (_slot, document): Record<string, string | number> => {
      const defense = document.systems.defense;
      if (!validDefenseSave(defense)) return {};
      return { gold: defense.gold, lives: defense.lives, wave: defense.encounter.wave + 1 };
    },
  });
}

/** Keep a run under a specific keep: switch the document to it, then write the live state. */
export async function saveToSlot(ctx: GameContext, slot: string): Promise<void> {
  const save = beaconSave(ctx);
  if (save.slot() !== slot) await save.switchSlot(slot);
  await save.save();
  await refreshBeaconSlots(ctx);
}

/** Read a keep back into the live world without saving over it first. */
export async function loadSlot(ctx: GameContext, slot: string): Promise<void> {
  const save = beaconSave(ctx);
  if (save.slot() === slot) {
    await save.load();
  } else {
    await save.switchSlot(slot);
  }
}

export function firstEmptyKeep(): string | null {
  const empty = beaconSlots.list().find((slot) => slot.empty);
  return empty?.id ?? null;
}

/** Where a new defense goes: an empty keep, or the oldest one when every keep is already held. */
export function keepForNewRun(): string | null {
  const empty = firstEmptyKeep();
  if (empty !== null) return empty;
  const held = beaconSlots.list()
    .filter((slot) => !slot.empty)
    .sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
  return held[0]?.id ?? null;
}

/** The keep `Continue` resumes — the newest document, not a remembered flag. */
export function newestKeep(): string | null {
  return beaconSlots.mostRecent()?.id ?? null;
}

/** Draft a fresh run into a keep: the run that follows is saved under that keep. */
export async function prepareKeep(ctx: GameContext, slot: string): Promise<void> {
  const save = beaconSave(ctx);
  // Switching only loads documents; a fresh run overwrites nothing until it saves.
  if (save.slot() !== slot) await save.switchSlot(slot);
}
