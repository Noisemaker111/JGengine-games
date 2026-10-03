import { createToastQueue, type ToastQueue } from "@jgengine/core/game/toasts";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";

import type { HeroId, V2 } from "./types";
import type { Latch } from "./rooms/engine";

export type RunStatus = "ready" | "paused" | "playing" | "solved" | "complete";
export const CALLOUTS = { ready: "Ready at my station.", hold: "Hold the circuit — I am crossing.", go: "The path is clear. Go!", recover: "Recovering — keep your device planted." } as const;
export type CalloutId = keyof typeof CALLOUTS;

export interface DuetState {
  roomIndex: number;
  status: RunStatus;
  active: HeroId;
  latch: Latch;
  /** Ticks left on the "room solved" celebration before advancing. */
  solveTimer: number;
  /** Derived signals mirrored for the HUD each frame. */
  pressedPlates: readonly string[];
  poweredReceivers: readonly string[];
  openGates: readonly string[];
  activeSpikes: readonly string[];
  exits: readonly HeroId[];
  reducedMotion: boolean;
  /** Toast text pushed by abilities/hazards, mirrored from `toastQueue`'s single live slot. */
  toast: string | null;
  safeCells: Record<HeroId, V2 | null>;
  recoveries: number;
  callout: { hero: HeroId; id: CalloutId; sequence: number } | null;
}

export function freshRoom(index: number): Pick<DuetState, "latch" | "solveTimer" | "toast" | "status" | "safeCells" | "recoveries" | "callout"> & { roomIndex: number } {
  return {
    roomIndex: index,
    latch: { anchorCell: null, prism: null },
    solveTimer: 0,
    toast: null,
    status: "playing",
    safeCells: { lumen: null, anchor: null },
    recoveries: 0,
    callout: null,
  };
}

export const duetStore = defineStore<DuetState>("resonant-crossing", () => ({
  roomIndex: 0,
  status: "ready",
  active: "lumen",
  latch: { anchorCell: null, prism: null },
  solveTimer: 0,
  pressedPlates: [],
  poweredReceivers: [],
  openGates: [],
  activeSpikes: [],
  exits: [],
  reducedMotion: false,
  toast: null,
  safeCells: { lumen: null, anchor: null },
  recoveries: 0,
  callout: null,
}));

/** Seconds a toast stays on screen before it self-expires — matches the previous hand-rolled `TOAST_TICKS`/hazard hold. */
const TOAST_TTL_SECONDS = 2.2;

/** Single-slot self-expiring toast queue backing `DuetState.toast`; one instance per running world. */
const toastQueue = perContext<ToastQueue<string>>(() =>
  createToastQueue<string>({ cap: 1, ttlSeconds: TOAST_TTL_SECONDS }),
);

function syncToast(ctx: GameContext): void {
  const body = toastQueue(ctx).list()[0]?.body ?? null;
  duetStore.update(ctx, (state) => (state.toast === body ? state : { ...state, toast: body }));
}

/** Raise a toast, replacing whatever is currently shown. */
export function raiseToast(ctx: GameContext, body: string): void {
  toastQueue(ctx).push(body, ctx.time.now());
  syncToast(ctx);
}

/** Evict the current toast once its TTL has elapsed; call once per tick. */
export function pruneToast(ctx: GameContext): void {
  toastQueue(ctx).prune(ctx.time.now());
  syncToast(ctx);
}

/** Drop the current toast immediately (room transitions shouldn't carry a stale message forward). */
export function clearToast(ctx: GameContext): void {
  toastQueue(ctx).clear();
  syncToast(ctx);
}

export function withAnchor(latch: Latch, anchorCell: V2 | null): Latch {
  return { ...latch, anchorCell };
}

export function withPrism(latch: Latch, prism: Latch["prism"]): Latch {
  return { ...latch, prism };
}
