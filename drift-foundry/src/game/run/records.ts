export interface RunRecords {
  attempts: number;
  escapes: number;
  bestTime: number | null;
  farthest: number;
}

export const RECORDS_KEY = "drift-foundry.records.v1";
export const EMPTY_RECORDS: RunRecords = { attempts: 0, escapes: 0, bestTime: null, farthest: 0 };
export interface RecordStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function readRecords(storage?: RecordStorage): RunRecords {
  try {
    const data = JSON.parse(storage?.getItem(RECORDS_KEY) ?? "null");
    if (!data || typeof data !== "object") return { ...EMPTY_RECORDS };
    const nonnegative = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
    return {
      attempts: nonnegative(data.attempts) ? Math.floor(data.attempts) : 0,
      escapes: nonnegative(data.escapes) ? Math.floor(data.escapes) : 0,
      bestTime: nonnegative(data.bestTime) && data.bestTime > 0 ? data.bestTime : null,
      farthest: nonnegative(data.farthest) ? data.farthest : 0,
    };
  } catch { return { ...EMPTY_RECORDS }; }
}

export function saveRecords(records: RunRecords, storage?: RecordStorage): boolean {
  if (!storage) return false;
  try { storage.setItem(RECORDS_KEY, JSON.stringify(records)); return true; }
  catch { return false; }
}

export function browserRecordStorage(): RecordStorage | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; }
  catch { return undefined; }
}
