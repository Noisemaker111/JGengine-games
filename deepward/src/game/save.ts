import { ITEMS, newHome, type Home, type Item } from "./state";

export const SAVE_KEY = "deepward.marrow.v1";
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function validItem(value: unknown): value is Item {
  if (!record(value) || typeof value.uid !== "string" || value.level !== 1 || typeof value.kind !== "string" || !Object.hasOwn(ITEMS, value.kind)) return false;
  const match = /^([1-9]\d*):(wire|polymer|cells|ink|fitter)$/.exec(value.uid);
  return match !== null && Number.isSafeInteger(Number(match[1])) && (match[2] === "fitter" ? value.kind === "service-rifle" : match[2] === value.kind);
}
/** Reject malformed and future versions without overwriting the saved record. */
export function validHome(value: unknown): value is Home {
  if (!record(value) || value.version !== 1 || !natural(value.revision) || !natural(value.nextDive) || value.nextDive < 1 || !natural(value.life) || value.life < 1 || !natural(value.extractions) || !natural(value.deaths)) return false;
  if (value.life !== value.deaths + 1 || value.nextDive !== value.extractions + value.deaths + 1 + (value.activeDive === null ? 0 : 1)) return false;
  if (value.activeDive !== null && (!natural(value.activeDive) || value.activeDive !== value.nextDive - 1)) return false;
  const nextDive = value.nextDive, activeDive = value.activeDive;
  if (!Array.isArray(value.stash) || !value.stash.every(validItem) || new Set(value.stash.map(i => i.uid)).size !== value.stash.length) return false;
  if (value.stash.some(i => Number(i.uid.split(":")[0]) >= (activeDive ?? nextDive))) return false;
  if (value.last === null) return value.extractions === 0 && value.deaths === 0 && value.stash.length === 0;
  const last = value.last;
  return record(last) && (last.kind === "extracted" || last.kind === "lost") && natural(last.dive) && last.dive > 0 && last.dive < (activeDive ?? nextDive) && natural(last.count) && typeof last.reason === "string";
}
export interface SaveSession {
  home: Home;
  commit(next: Home): void;
  isCurrent(): boolean;
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
    if (!validHome(decoded)) throw new Error("Marrow's save is damaged or from another version. It has been preserved.");
    home = decoded;
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
