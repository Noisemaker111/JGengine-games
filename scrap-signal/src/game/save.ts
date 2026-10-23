import { createGameSave, type GameSave, type GameSaveSystem } from "@jgengine/core/game/gameSave";
import { localSaveBackend, type SaveBackend } from "@jgengine/core/game/saveStore";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { activeCharacter, pickCharacter, resetCharacterState, talentTree } from "./characters";
import { ledgerState, resetLedger, restoreLedger } from "./cash";
import { combatState, resetCombat, restoreCombat } from "./combat/damage";
import {
  allGuns,
  ensureGunSerialAtLeast,
  gunSerialOf,
  magazineSave,
  registerGun,
  reserveSave,
  restoreMagazines,
  restoreReserve,
  type ReserveState,
} from "./handroll";
import { session } from "./session";
import { characterIdStore, talentRanksStore } from "./stores";

/**
 * What the live game holds outside the world snapshot: the chosen character and its talent build,
 * the selected hotbar slot, the Emergency Reserve timer, each gun's loaded rounds, and the carried
 * statuses the damage model owns. These used to be re-derived by hand on boot (`resumeBuild`,
 * `session.selectSlot`, per-session maps reset to full); the save document now snapshots each one
 * through the pair its module already exposes.
 */
export interface CharacterSave {
  id: string;
  ranks: Record<string, number>;
  points: number;
}

export interface RunSave {
  slot: number;
  reserve: ReserveState;
  magazines: { gunId: string; loaded: number }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCharacterSave(value: unknown): value is CharacterSave {
  if (!isRecord(value) || typeof value.id !== "string") return false;
  if (!isRecord(value.ranks)) return false;
  if (!Object.values(value.ranks).every((rank) => typeof rank === "number" && Number.isFinite(rank))) return false;
  return typeof value.points === "number" && Number.isFinite(value.points);
}

function isRunSave(value: unknown): value is RunSave {
  if (!isRecord(value) || typeof value.slot !== "number") return false;
  if (!isRecord(value.reserve) || typeof value.reserve.phase !== "string") return false;
  if (typeof value.reserve.downedUntilMs !== "number") return false;
  if (!Array.isArray(value.magazines)) return false;
  return value.magazines.every(
    (entry) =>
      isRecord(entry) && typeof entry.gunId === "string" && typeof entry.loaded === "number" && Number.isFinite(entry.loaded),
  );
}

function characterSystem(ctx: GameContext): GameSaveSystem<CharacterSave> {
  return {
    name: "character",
    snapshot() {
      const tree = talentTree();
      return {
        id: activeCharacter()?.id ?? "",
        ranks: tree?.snapshot().ranks ?? {},
        points: tree?.pointsAvailable() ?? 0,
      };
    },
    restore(section) {
      if (!isCharacterSave(section) || section.id === "") return;
      const picked = pickCharacter(section.id);
      const tree = talentTree();
      if (picked === null || tree === null) return;
      tree.hydrate({ points: section.points, ranks: section.ranks });
      // The HUD mirrors read the store; the singletons above stay the one owner of the build.
      characterIdStore.write(ctx, section.id);
      talentRanksStore.write(ctx, tree.snapshot().ranks);
    },
    reset() {
      resetCharacterState();
      characterIdStore.write(ctx, null);
      talentRanksStore.write(ctx, {});
    },
  };
}

function runSystem(ctx: GameContext): GameSaveSystem<RunSave> {
  return {
    name: "run",
    snapshot: () => ({
      slot: session.selectedSlot(),
      reserve: reserveSave(ctx),
      magazines: magazineSave(ctx),
    }),
    restore(section) {
      if (!isRunSave(section)) return;
      session.selectSlot(ctx, section.slot);
      restoreReserve(ctx, section.reserve);
      restoreMagazines(ctx, section.magazines);
    },
    reset() {
      session.reset(ctx);
      restoreReserve(ctx, { phase: "up", downedUntilMs: 0 });
      restoreMagazines(ctx, []);
    },
  };
}

function combatSystem(ctx: GameContext): GameSaveSystem {
  return {
    name: "combat",
    snapshot: () => combatState(ctx),
    restore(section) {
      if (!isRecord(section) || !Array.isArray(section.targets) || !isRecord(section.statuses)) return;
      restoreCombat(ctx, section as never);
    },
    reset() {
      resetCombat(ctx);
    },
  };
}

/** The journal of every scrip movement; restored after the wallet and aligned to it. */
function ledgerSystem(ctx: GameContext): GameSaveSystem {
  return {
    name: "ledger",
    snapshot: () => ledgerState(ctx),
    restore(section) {
      if (!isRecord(section) || !isRecord(section.accounts) || !Array.isArray(section.entries)) return;
      restoreLedger(ctx, section as never);
    },
    reset() {
      resetLedger(ctx);
    },
  };
}

/**
 * Every gun this run rolled. A rolled gun's definition is content the registry keeps in memory, so a
 * reload would otherwise restore a hotbar (or a chest) holding an id the new page cannot resolve.
 * Restored definitions are plain data, and the id counter is pushed past them so the next roll cannot
 * reuse one.
 */
function gunsSystem(): GameSaveSystem {
  return {
    name: "guns",
    snapshot: () => allGuns(),
    restore(section) {
      if (!Array.isArray(section)) return;
      let serial = 0;
      for (const def of section) {
        if (!isRecord(def) || typeof def.id !== "string" || !isRecord(def.weapon)) continue;
        registerGun(def as never);
        serial = Math.max(serial, gunSerialOf(def.id));
      }
      ensureGunSerialAtLeast(serial);
    },
  };
}

/** The relay's own document. Separate from the whole-world snapshot, one section per live system. */
export function createScrapSave(ctx: GameContext, options: { backend?: SaveBackend; slot?: string } = {}): GameSave {
  return createGameSave({
    backend: options.backend ?? localSaveBackend(),
    game: "scrap-signal",
    slot: options.slot ?? ctx.game.save?.slot() ?? "default",
    clock: () => ctx.time.now(),
    playtime: () => ctx.time.now(),
    systems: [characterSystem(ctx), runSystem(ctx), combatSystem(ctx), ledgerSystem(ctx), gunsSystem()],
    devtoolsName: "scrap.save",
  });
}

const boundSave = perContext(() => ({ save: null as GameSave | null }));

/** The game's save document, one per context, writing beside the world snapshot. */
export function scrapSave(ctx: GameContext): GameSave {
  const slot = boundSave(ctx);
  if (slot.save === null) slot.save = createScrapSave(ctx);
  return slot.save;
}

/**
 * Apply the document only when it holds a character section: a world snapshot written before this
 * document existed still boots through `loadSavedProgress` + `resumeBuild`, so old saves are not
 * reset by a newer build. Returns whether live state was applied.
 */
export async function loadScrapSave(ctx: GameContext): Promise<boolean> {
  const save = scrapSave(ctx);
  const document = await save.peek(save.slot());
  if (document === null || document.systems.character === undefined) return false;
  await save.load();
  return true;
}

/** Write both halves of a checkpoint: the world snapshot stays the engine's, this one adds its systems. */
export async function saveScrapState(ctx: GameContext): Promise<void> {
  await ctx.game.save?.save();
  await scrapSave(ctx).save();
}

/** A digest over the systems this document owns, for a test or a diff between builds. */
export function scrapSaveDigest(ctx: GameContext, backend?: SaveBackend): string {
  return (backend === undefined ? scrapSave(ctx) : createScrapSave(ctx, { backend })).digest();
}
