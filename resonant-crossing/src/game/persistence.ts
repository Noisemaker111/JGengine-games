import { ROOM_COUNT } from "./rooms/catalog";

export interface Preferences { reducedMotion: boolean; showHints: boolean }
export interface Checkpoint { version: 1; roomIndex: number; complete: boolean }
export const CHECKPOINT_KEY = "resonant-crossing.checkpoint.v1";
export const PREFERENCES_KEY = "resonant-crossing.preferences.v1";

export function parseCheckpoint(raw: string | null): Checkpoint | null {
  try {
    const value = JSON.parse(raw ?? "null");
    return value?.version === 1 && Number.isInteger(value.roomIndex) && value.roomIndex >= 0 && value.roomIndex < ROOM_COUNT
      && typeof value.complete === "boolean" ? value : null;
  } catch { return null; }
}
export function readCheckpoint(): Checkpoint | null {
  try { return parseCheckpoint(localStorage.getItem(CHECKPOINT_KEY)); } catch { return null; }
}
export function readPreferences(): Preferences {
  const defaults = { reducedMotion: typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches, showHints: true };
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null");
    return { reducedMotion: typeof value?.reducedMotion === "boolean" ? value.reducedMotion : defaults.reducedMotion,
      showHints: typeof value?.showHints === "boolean" ? value.showHints : true };
  } catch { return defaults; }
}
export function writeLocal(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function writeCheckpoint(next: Checkpoint): boolean {
  const previous = readCheckpoint();
  const checkpoint: Checkpoint = { version: 1, roomIndex: Math.max(previous?.roomIndex ?? 0, next.roomIndex),
    complete: previous?.complete === true || next.complete };
  return writeLocal(CHECKPOINT_KEY, checkpoint);
}
