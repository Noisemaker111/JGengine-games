import { pileRng, shuffleWithRng } from "@jgengine/core/cards/cardPile";
import { setGamePhase, type GamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";

import { CARD_CATALOG, type CardData } from "./cards";
import { createCombatStore, type CombatSnapshot, type CombatStore } from "./combat";
import { ENCOUNTERS, type EnemyDef } from "./enemy";
import { readRoadSave, writeRoadSave } from "./save";

export type RunPhase = "combat" | "reward" | "victory" | "defeat";

export interface RunSnapshot {
  screen: "menu" | "paused" | null;
  canContinue: boolean;
  saveStatus: "ready" | "saved" | "unavailable" | "damaged";
  phase: RunPhase;
  encounterIndex: number;
  encounterCount: number;
  rewardOptions: readonly CardData[];
  combat: CombatSnapshot;
}

const STARTER_TYPES = new Set(["trail_cut", "pack_guard"]);
const REWARD_POOL = Object.keys(CARD_CATALOG).filter((type) => !STARTER_TYPES.has(type));

export interface RunStore {
  prepare(ctx: GameContext): void;
  pause(ctx: GameContext): void;
  resume(ctx: GameContext): void;
  recover(ctx: GameContext): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): RunSnapshot;
  start(ctx: GameContext): void;
  canPlay(cardId: string): string | null;
  playCard(ctx: GameContext, cardId: string): void;
  endTurn(ctx: GameContext): void;
  canChooseReward(cardType: string): boolean;
  chooseReward(ctx: GameContext, cardType: string): void;
  skipReward(ctx: GameContext): void;
}

/** Menus and pause gate play separately; victory/defeat are terminal run phases. */
function enginePhaseFor(runPhase: RunPhase): GamePhase {
  return runPhase === "victory" || runPhase === "defeat" ? "ended" : "playing";
}

export function createRunStore(combat: CombatStore): RunStore {
  const listeners = new Set<() => void>();
  let phase: RunPhase = "combat";
  let screen: RunSnapshot["screen"] = null;
  let canContinue = false;
  let saveStatus: RunSnapshot["saveStatus"] = "ready";
  let preparing = false;
  let encounterIndex = 0;
  // The last ctx to drive a run mutation; combat's async win/lose settle fires inside
  // `combat.subscribe` without a ctx of its own, so we publish the engine phase from here.
  let ctxRef: GameContext | null = null;
  let lastEnginePhase: GamePhase | null = null;
  let rewardSeed = 0;
  let rewardOptions: CardData[] = [];
  let snapshot: RunSnapshot = {
    screen, canContinue, saveStatus,
    phase,
    encounterIndex,
    encounterCount: ENCOUNTERS.length,
    rewardOptions,
    combat: combat.getSnapshot(),
  };

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function currentEnemy(): EnemyDef {
    return ENCOUNTERS[encounterIndex]!;
  }

  function rollRewards(): CardData[] {
    rewardSeed += 1;
    const shuffled = shuffleWithRng(REWARD_POOL, pileRng(rewardSeed));
    return shuffled.slice(0, 3).map((type) => CARD_CATALOG[type]!);
  }

  function syncEnginePhase(): void {
    if (ctxRef === null) return;
    const desired = screen ?? enginePhaseFor(phase);
    if (desired === lastEnginePhase) return;
    lastEnginePhase = desired;
    setGamePhase(ctxRef, desired);
  }

  function sync(): void {
    const captured = combat.capture();
    if (!preparing && screen !== "menu" && captured !== null) {
      if (ctxRef?.player.userId !== "ui-preview") {
        saveStatus = writeRoadSave({ version: 1, phase, encounterIndex, rewardSeed, rewards: rewardOptions.map((card) => card.type), combat: captured }) ? "saved" : "unavailable";
      }
      canContinue = true;
    }
    snapshot = {
      screen, canContinue, saveStatus,
      phase,
      encounterIndex,
      encounterCount: ENCOUNTERS.length,
      rewardOptions,
      combat: combat.getSnapshot(),
    };
    syncEnginePhase();
    notify();
  }

  function advance(ctx: GameContext): void {
    ctxRef = ctx;
    encounterIndex += 1;
    phase = "combat";
    rewardOptions = [];
    combat.start(ctx, currentEnemy());
    sync();
  }

  combat.subscribe(() => {
    if (phase === "combat") {
      const combatPhase = combat.getSnapshot().phase;
      if (combatPhase === "won") {
        phase = encounterIndex >= ENCOUNTERS.length - 1 ? "victory" : "reward";
        if (phase === "reward") rewardOptions = rollRewards();
      } else if (combatPhase === "lost") {
        phase = "defeat";
      }
    }
    sync();
  });

  return {
    prepare(ctx) {
      ctxRef = ctx;
      preparing = true;
      // The published shell uses this reserved player for gallery/UI previews.
      // Preview scenarios must never read or replace a real player's crossing.
      const loaded = ctx.player.userId === "ui-preview" ? { save: null, damaged: false } : readRoadSave();
      screen = "menu";
      if (loaded.save) {
        const saved = loaded.save;
        phase = saved.phase;
        encounterIndex = saved.encounterIndex;
        rewardSeed = saved.rewardSeed;
        rewardOptions = saved.rewards.map((type) => CARD_CATALOG[type]!);
        combat.restore(ctx, saved.combat);
        canContinue = true;
        saveStatus = "saved";
      } else {
        phase = "combat";
        encounterIndex = 0;
        rewardSeed = 0;
        rewardOptions = [];
        canContinue = false;
        combat.start(ctx, currentEnemy(), { freshDeck: true });
        saveStatus = loaded.damaged ? "damaged" : "ready";
      }
      preparing = false;
      sync();
    },
    pause(ctx) { if (screen !== null || phase === "victory" || phase === "defeat") return; ctxRef = ctx; screen = "paused"; sync(); },
    resume(ctx) { if (!canContinue) return; ctxRef = ctx; screen = null; sync(); },
    recover(ctx) {
      if (screen !== null || phase !== "reward") return;
      ctx.scene.entity.stats.delta(ctx.player.userId, "health", 12);
      advance(ctx);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    start(ctx) {
      screen = null;
      ctxRef = ctx;
      encounterIndex = 0;
      phase = "combat";
      rewardOptions = [];
      combat.start(ctx, currentEnemy(), { freshDeck: true });
      sync();
    },
    canPlay(cardId) {
      if (screen !== null || phase !== "combat") return "run is not active";
      return combat.canPlay(cardId);
    },
    playCard(ctx, cardId) {
      if (this.canPlay(cardId) !== null) return;
      ctxRef = ctx;
      combat.playCard(ctx, cardId);
    },
    endTurn(ctx) {
      if (screen !== null || phase !== "combat") return;
      ctxRef = ctx;
      combat.endTurn(ctx);
    },
    canChooseReward(cardType) {
      return screen === null && phase === "reward" && rewardOptions.some((card) => card.type === cardType);
    },
    chooseReward(ctx, cardType) {
      if (!this.canChooseReward(cardType)) return;
      combat.addReward(ctx, cardType);
      advance(ctx);
    },
    skipReward(ctx) {
      if (screen !== null || phase !== "reward") return;
      advance(ctx);
    },
  };
}

export const runHandle = defineStore<RunStore>("wayfarer.run", () => createRunStore(createCombatStore()));
