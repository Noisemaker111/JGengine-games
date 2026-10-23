import { ITEMS, itemIssues, rollItem, type Item, type ItemKind } from "./items";
import { newHome, type Home } from "./state";

export const SAVE_KEY = "deepward.marrow.v1";
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const bankAmount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const KINDS: readonly string[] = Object.keys(ITEMS);

/** A stash instance's id names where it came from; the id is the only ownership record there is. */
function validId(item: Item): boolean {
  const purchase = /^purchase-([1-9]\d*):([a-z-]+)$/.exec(item.id);
  if (purchase !== null) return KINDS.includes(purchase[2]!);
  const haul = /^([1-9]\d*):([a-z-]+)$/.exec(item.id);
  if (haul === null) return false;
  const source = haul[2]!;
  if (source === "fitter") return item.baseId === "service-rifle";
  return source === item.baseId;
}

/** A saved instance must satisfy the same catalog that rolled it, not a hand-copied shape. */
function validItem(value: unknown): value is Item {
  if (!record(value) || typeof value.id !== "string") return false;
  const item = value as unknown as Item;
  if (itemIssues(item).length > 0) return false;
  if (!Number.isInteger(item.level) || item.level < 1 || item.level > 12) return false;
  if (!Array.isArray(item.affixes) || !Array.isArray(item.parts)) return false;
  return validId(item);
}

const purchased = (id: string): boolean => id.startsWith("purchase-");

function validLedger(value: unknown, stash: readonly Item[]): boolean {
  if (!record(value)) return false;
  const ids = new Set(stash.map(item => item.id));
  return Object.entries(value).every(([id, outcome]) => (outcome === "salvaged" || outcome === "sold") && !ids.has(id));
}
function validBank(value: unknown): boolean {
  return record(value) && bankAmount(value.banked) && bankAmount(value.haul) && bankAmount(value.deposited)
    && bankAmount(value.lost) && bankAmount(value.bestHaul) && natural(value.runs);
}
function validStanding(value: unknown): boolean {
  if (!record(value) || !record(value.records)) return false;
  return Object.values(value.records).every(row => record(row) && Object.entries(row).every(([track, score]) => track === "marrow" && typeof score === "number" && Number.isFinite(score)));
}

/** The shared fields of every schema version, checked before the version-specific parts. */
function validShared(value: unknown, versions: readonly number[]): value is Record<string, unknown> {
  if (!record(value) || !versions.includes(value.version as number) || !natural(value.revision) || !natural(value.nextDive) || value.nextDive < 1 || !natural(value.life) || value.life < 1 || !natural(value.extractions) || !natural(value.deaths)) return false;
  if (value.life !== value.deaths + 1 || value.nextDive !== value.extractions + value.deaths + 1 + (value.activeDive === null ? 0 : 1)) return false;
  if (value.activeDive !== null && (!natural(value.activeDive) || value.activeDive !== value.nextDive - 1)) return false;
  if (value.last === null) return value.extractions === 0 && value.deaths === 0;
  const last = value.last, version = value.version as number;
  return record(last) && (last.kind === "extracted" || last.kind === "lost") && natural(last.dive) && last.dive > 0 && last.dive < (value.activeDive ?? value.nextDive) && (natural(last.count) || (version >= 2 && last.kind === "lost" && last.count === null)) && typeof last.reason === "string"
    && (last.scrip === undefined || bankAmount(last.scrip));
}
/** A haul id names the dive it came from, so an item can never appear before the Life that found it. */
function ownedBefore(ids: readonly string[], dive: number): boolean {
  return ids.every(id => purchased(id) || Number(id.split(":")[0]) < dive);
}
function currentStash(value: Record<string, unknown>): value is Record<string, unknown> & { stash: Item[] } {
  const stash = value.stash;
  if (!Array.isArray(stash) || !stash.every(validItem) || new Set(stash.map(i => i.id)).size !== stash.length) return false;
  if (!ownedBefore(stash.map(i => i.id), (value.activeDive ?? value.nextDive) as number)) return false;
  if (value.last === null && !stash.every(i => purchased(i.id))) return false;
  return true;
}
export function validHome(value: unknown): value is Home {
  return validHomeShape(value);
}
function validHomeShape(value: unknown): value is Home {
  if (!validShared(value, [4]) || value.version !== 4) return false;
  if (!currentStash(value)) return false;
  if (!Array.isArray(value.refits)) return false;
  if (!value.refits.every(id => id === "tank" || id === "reserve") || new Set(value.refits).size !== value.refits.length) return false;
  if (typeof value.reprintPending !== "boolean") return false;
  if (!validBank(value.bank) || !validStanding(value.standing)) return false;
  if (!validLedger(value.ledger, value.stash)) return false;
  return !value.reprintPending || (value.activeDive === null && record(value.last) && value.last.kind === "lost");
}

interface LegacyItem { uid: string; kind: ItemKind; level: number }
/** v1-v3 stored an item as kind + level only; migrating rolls the instance the catalog would have. */
function legacyItem(value: unknown): value is LegacyItem {
  return record(value) && typeof value.uid === "string" && typeof value.kind === "string" && KINDS.includes(value.kind) && value.level === 1;
}
/** Read legacy bytes without writing; the next acknowledged transition migrates atomically. */
function readHome(value: unknown): Home | null {
  if (validHomeShape(value)) return value;
  if (!validShared(value, [1, 2, 3])) return null;
  const stash = value.stash;
  if (!Array.isArray(stash) || !stash.every(legacyItem)) return null;
  if (!ownedBefore(stash.map(i => i.uid), (value.activeDive ?? value.nextDive) as number)) return null;
  if (value.last === null && !stash.every(i => purchased(i.uid))) return null;
  return migrate(value, value.version as number, stash);
}
function migrate(value: Record<string, unknown>, version: number, stash: readonly LegacyItem[]): Home {
  const blank = newHome();
  const refitted = {
    ...value,
    refits: version === 1 ? [] : value.refits,
    reprintPending: version === 1 ? record(value.last) && value.last.kind === "lost" && value.activeDive === null : value.reprintPending,
  };
  const items = stash.map(entry => rollItem(entry.kind, 1, `deepward:legacy:${entry.uid}`, entry.uid));
  return { ...(refitted as unknown as Home), version: 4, bank: blank.bank, standing: blank.standing, ledger: {}, stash: items };
}
export interface SaveSession {
  home: Home;
  commit(next: Home): void;
  isCurrent(): boolean;
}

/** Whether a Marrow record is actually on disk - the title's Continue gate, not a remembered flag. */
export function storedMarrow(storage: StoragePort): boolean {
  return storage.getItem(SAVE_KEY) !== null;
}
/**
 * A single durable JSON boundary: no per-frame save, wall-clock catch-up, or half-written haul.
 * Compare the exact loaded bytes to reject stale tabs; verify the saved bytes before acknowledging.
 * The storage event stops another live tab immediately. This is local single-writer play.
 */
export function openSave(storage: StoragePort): SaveSession {
  let raw = storage.getItem(SAVE_KEY);
  let home = newHome();
  if (raw !== null) {
    let decoded: unknown;
    try { decoded = JSON.parse(raw); } catch { throw new Error("Marrow's save is unreadable. It has been preserved; restore it before diving."); }
    const loaded = readHome(decoded);
    if (loaded === null) throw new Error("Marrow's save is damaged or from another version. It has been preserved.");
    home = loaded;
  }
  return {
    get home() { return home; },
    isCurrent() { return storage.getItem(SAVE_KEY) === raw; },
    commit(next) {
      if (!validHome(next) || next.revision !== home.revision + 1) throw new Error("Invalid Marrow save transition");
      if (storage.getItem(SAVE_KEY) !== raw) throw new Error("Marrow changed in another window. Reload before continuing.");
      const bytes = JSON.stringify(next);
      storage.setItem(SAVE_KEY, bytes);
      if (storage.getItem(SAVE_KEY) !== bytes) throw new Error("Marrow could not verify the written save. Reload before continuing.");
      raw = bytes;
      home = next;
    },
  };
}
