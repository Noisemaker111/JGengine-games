import { ITEMS, newHome, type Home, type Item } from "./state";

export const SAVE_KEY = "deepward.marrow.v1";
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function validItem(value: unknown): value is Item {
  if (!record(value) || typeof value.uid !== "string" || value.level !== 1 || typeof value.kind !== "string" || !Object.hasOwn(ITEMS, value.kind)) return false;
  const match = /^(?:purchase-([1-9]\d*)|([1-9]\d*)):(wire|polymer|cells|ink|fitter)$/.exec(value.uid);
  if (match === null) return false;
  const kind = match[3];
  return kind === "fitter" ? value.kind === "service-rifle" : match[2] !== undefined ? kind === value.kind : true;
}
/** A counter purchase is stamped with the revision it was bought in, so it can never collide with a dive's haul. */
const purchasedUid = (uid: string): boolean => uid.startsWith("purchase-");
const bankAmount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
function validBank(value: unknown): boolean {
  return record(value) && bankAmount(value.banked) && bankAmount(value.haul) && bankAmount(value.deposited)
    && bankAmount(value.lost) && bankAmount(value.bestHaul) && natural(value.runs);
}
function validStanding(value: unknown): boolean {
  if (!record(value) || !record(value.records)) return false;
  return Object.values(value.records).every(row => record(row) && Object.entries(row).every(([track, score]) => track === "marrow" && typeof score === "number" && Number.isFinite(score)));
}
/** Reject malformed and future versions without overwriting the saved record. */
function validBase(value: unknown): value is Record<string, unknown> {
  if (!record(value) || !([1, 2, 3].includes(value.version as number)) || !natural(value.revision) || !natural(value.nextDive) || value.nextDive < 1 || !natural(value.life) || value.life < 1 || !natural(value.extractions) || !natural(value.deaths)) return false;
  if (value.life !== value.deaths + 1 || value.nextDive !== value.extractions + value.deaths + 1 + (value.activeDive === null ? 0 : 1)) return false;
  if (value.activeDive !== null && (!natural(value.activeDive) || value.activeDive !== value.nextDive - 1)) return false;
  const nextDive = value.nextDive, activeDive = value.activeDive, version = value.version as number;
  if (!Array.isArray(value.stash) || !value.stash.every(validItem) || new Set(value.stash.map(i => i.uid)).size !== value.stash.length) return false;
  if (value.stash.some(i => !purchasedUid(i.uid) && Number(i.uid.split(":")[0]) >= (activeDive ?? nextDive))) return false;
  if (value.last === null) return value.extractions === 0 && value.deaths === 0 && value.stash.every(i => purchasedUid(i.uid));
  const last = value.last;
  return record(last) && (last.kind === "extracted" || last.kind === "lost") && natural(last.dive) && last.dive > 0 && last.dive < (activeDive ?? nextDive) && (natural(last.count) || (version >= 2 && last.kind === "lost" && last.count === null)) && typeof last.reason === "string"
    && (last.scrip === undefined || bankAmount(last.scrip));
}
export function validHome(value: unknown): value is Home {
  return validBase(value) && value.version === 3 && Array.isArray(value.refits)
    && value.refits.every(id => id === "tank" || id === "reserve") && new Set(value.refits).size === value.refits.length
    && typeof value.reprintPending === "boolean"
    && validBank(value.bank) && validStanding(value.standing)
    && (!value.reprintPending || (value.activeDive === null && record(value.last) && value.last.kind === "lost"));
}
/** Read legacy bytes without writing; the next acknowledged transition migrates atomically. */
function readHome(value: unknown): Home | null {
  if (validHome(value)) return value;
  if (!validBase(value) || (value.version !== 1 && value.version !== 2)) return null;
  const refitted = { ...value, version: 2, refits: value.version === 1 ? [] : value.refits, reprintPending: value.version === 1 ? record(value.last) && value.last.kind === "lost" && value.activeDive === null : value.reprintPending } as unknown as Home;
  const blank = newHome();
  return { ...refitted, version: 3, bank: blank.bank, standing: blank.standing };
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
