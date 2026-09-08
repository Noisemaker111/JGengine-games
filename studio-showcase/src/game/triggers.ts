import { createToastQueue, type ToastQueue } from "@jgengine/core/game/toasts";
import {
  createAuthoredTriggerRuntime,
  getTriggerAction,
  listTriggerActions,
  registerBuiltinTriggerActions,
  registerTriggerAction,
  type AuthoredTriggerRuntime,
  type TriggerDispatchEvent,
} from "@jgengine/core/scene/authoredTriggers";
import { collectAuthoredTriggers, type GameContext } from "@jgengine/shell/gameKit";

import { editorLayers } from "../editorLayers";

// First adopter of the shared primitive: the `announce` action (plus `win`/`advance`) is engine-owned
// now, so the showcase just registers the built-ins and supplies a handler — no bespoke action schema.
registerBuiltinTriggerActions();

/** Game-declared trigger action: a zone that drains the entering actor's health until it leaves. */
export const HAZARD_ACTION = "hazard";

registerTriggerAction({
  id: HAZARD_ACTION,
  label: "Hazard (drain health)",
  schema: {
    fields: [
      { type: "number", key: "damagePerSecond", label: "Damage per second", default: 10, min: 0, step: 1 },
      { type: "text", key: "message", label: "Message", default: "Hazard — health draining" },
    ],
  },
  targets: ["volume"],
  events: ["enter"],
});

export type Announcement = {
  message: string;
  tone: string;
  at: number;
};

export interface ActiveHazard {
  /** Volume id the actor entered; `tickHealth` keeps draining while the actor is still inside it. */
  sourceId: string;
  damagePerSecond: number;
}

// Single-slot announcement store on top of the shared toast-feed primitive. `cap: 1` gives the same
// replace-on-next-announce behavior the hand-rolled `lastAnnouncement` variable had; unlike a HUD toast,
// an announcement never self-expires here (no `prune()` call anywhere), so pushes use an infinite TTL.
const announcementQueue: ToastQueue<Announcement> = createToastQueue<Announcement>({ cap: 1 });

let runtime: AuthoredTriggerRuntime | null = null;
let activeHazard: ActiveHazard | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Replace the HUD banner text; `tone` is one of the announce action's `info`/`warn`/`good`. */
export function announce(message: string, tone: string): void {
  const at = Date.now();
  announcementQueue.push({ message, tone, at }, at, Number.POSITIVE_INFINITY);
  notify();
}

function ensureRuntime(): AuthoredTriggerRuntime {
  if (runtime !== null) return runtime;
  const triggers = collectAuthoredTriggers(editorLayers).filter((trigger) => getTriggerAction(trigger.action) !== undefined);
  if (listTriggerActions().length === 0 && triggers.length > 0) {
    // registration should already have run; empty list means the game forgot to declare actions
  }
  runtime = createAuthoredTriggerRuntime({
    document: editorLayers,
    triggers,
    handlers: {
      announce: (event: TriggerDispatchEvent) => {
        announce(String(event.params.message ?? "Entered zone"), String(event.params.tone ?? "info"));
      },
      [HAZARD_ACTION]: (event: TriggerDispatchEvent) => {
        activeHazard = { sourceId: event.sourceId, damagePerSecond: Number(event.params.damagePerSecond ?? 10) };
        announce(String(event.params.message ?? "Hazard — health draining"), "warn");
      },
    },
  });
  return runtime;
}

/** Latest announce dispatch for the HUD readout. */
export function currentAnnouncement(): Announcement | null {
  return announcementQueue.list()[0]?.body ?? null;
}

/** Subscribe to announcement changes — use with `useSyncExternalStore`. */
export function subscribeAnnouncement(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The hazard zone the player most recently entered, until `clearHazard` runs. */
export function currentHazard(): ActiveHazard | null {
  return activeHazard;
}

export function clearHazard(): void {
  activeHazard = null;
}

/** Watch authored triggers against the local player; call from onTick. */
export function tickAuthoredTriggers(ctx: GameContext): void {
  const entity = ctx.scene.entity.get(ctx.player.userId);
  if (entity === null) return;
  const interact = ctx.input.justPressed("interact") ? [ctx.player.userId] : [];
  ensureRuntime().step({
    actors: [{ id: ctx.player.userId, position: entity.position }],
    interact,
  });
}
