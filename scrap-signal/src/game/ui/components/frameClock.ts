import type { StoreHandle } from "@jgengine/core/store/defineStore";
import { useGameStore } from "@jgengine/react/hooks";

/**
 * Whether a timed HUD element is still inside its window. The frame clock is read inside the
 * selector, so the part re-renders when the window opens or closes rather than on every frame.
 */
export function useTimedWindow<T extends { atMs: number }>(handle: StoreHandle<T | null>, windowMs: number): boolean {
  return useGameStore((ctx) => {
    const slot = handle.read(ctx);
    return slot !== null && ctx.time.now() * 1000 - slot.atMs <= windowMs;
  });
}
