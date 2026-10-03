import { describe, expect, test } from "bun:test";
import { CHECKPOINT_KEY, readCheckpoint, writeCheckpoint } from "./persistence";

describe("checkpoint frontier", () => {
  test("replay preserves unlocked frontier and completed campaign through reload", () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    } });
    try {
      expect(writeCheckpoint({ version: 1, roomIndex: 3, complete: false })).toBe(true);
      expect(writeCheckpoint({ version: 1, roomIndex: 0, complete: false })).toBe(true);
      expect(readCheckpoint()).toEqual({ version: 1, roomIndex: 3, complete: false });
      expect(writeCheckpoint({ version: 1, roomIndex: 3, complete: true })).toBe(true);
      expect(writeCheckpoint({ version: 1, roomIndex: 1, complete: false })).toBe(true);
      expect(readCheckpoint()).toEqual({ version: 1, roomIndex: 3, complete: true });
      storage.set(CHECKPOINT_KEY, "broken");
      expect(writeCheckpoint({ version: 1, roomIndex: 1, complete: false })).toBe(true);
      expect(readCheckpoint()?.roomIndex).toBe(1);
    } finally {
      if (previous) Object.defineProperty(globalThis, "localStorage", previous);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });
});
