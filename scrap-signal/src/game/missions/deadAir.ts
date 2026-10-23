/**
 * Dead Air is one mission: reach the copper-ring console, clear the ambush only from inside the ring,
 * then hold it for a minute. Waves, the ring and the payout stay game rules; the objectives, the
 * countdown and the fail states are the engine's mission runtime.
 */
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import {
  createMissionRuntime,
  type MissionDef,
  type MissionEvent,
  type MissionRuntime,
  type MissionRuntimeSnapshot,
  type MissionView,
  type MissionWorldEvent,
} from "@jgengine/core/gameplay";
import { RELAY } from "../relaySite";

export const DEAD_AIR = "dead_air";
export const DEAD_AIR_PLAYER = "reclaimer";
export const DEAD_AIR_HOLD_SECONDS = 60;
export const DEAD_AIR_KILLS = 3;
/** How close the player has to come before the contract is offered. */
export const DEAD_AIR_OFFER_RADIUS = 60;

export const DEAD_AIR_MARKERS = {
  relay_console: { x: RELAY.x, y: 0, z: RELAY.z },
} as const;

const MISSION: MissionDef = {
  id: DEAD_AIR,
  title: "Dead Air",
  description: "The copper-ring relay north of the crash site. Clear the ambush, then hold the ring.",
  objectives: [
    {
      id: "reach",
      kind: "reach",
      actor: DEAD_AIR_PLAYER,
      marker: "relay_console",
      radius: 4,
      label: "Reach the relay console",
      next: "clear",
    },
    {
      id: "clear",
      kind: "kill",
      count: DEAD_AIR_KILLS,
      match: { kind: "kill", by: DEAD_AIR_PLAYER, tags: ["in-ring"] },
      label: "Clear the ambush from inside the ring",
      next: "hold",
    },
    {
      id: "hold",
      kind: "survive",
      duration: DEAD_AIR_HOLD_SECONDS,
      label: `Hold the copper ring for ${DEAD_AIR_HOLD_SECONDS}s`,
      failOn: [
        {
          kind: "left-area",
          actor: DEAD_AIR_PLAYER,
          marker: "relay_console",
          radius: RELAY.radius,
          to: "left_ring",
          message: "you left the copper ring",
        },
        { kind: "actor-died", actor: DEAD_AIR_PLAYER, to: "downed", message: "your chassis went down" },
      ],
      next: "done",
    },
  ],
  fail: [
    { id: "left_ring", message: "you left the copper ring" },
    { id: "downed", message: "your chassis went down" },
  ],
};

export interface DeadAirBoardState {
  snapshot: MissionRuntimeSnapshot;
  view: MissionView | null;
  active: boolean;
  pending: readonly MissionWorldEvent[];
}

/** What the encounter does when the contract settles, so the mission never needs the relay store. */
export interface DeadAirSettlement {
  won: boolean;
  reason: string;
  /** Hold seconds still to run when it settled. */
  remaining: number;
}

const EMPTY_SNAPSHOT: MissionRuntimeSnapshot = { state: null, ticks: 0, started: 0, completed: 0, failed: 0, branches: 0, timeouts: 0 };
const EMPTY_BOARD: DeadAirBoardState = { snapshot: EMPTY_SNAPSHOT, view: null, active: false, pending: [] };

export const deadAirBoard = defineStore<DeadAirBoardState>("scrap.deadAirMissions", () => ({ ...EMPTY_BOARD }));

const runtimeOf = perContext(() => createMissionRuntime({
  missions: [MISSION],
  markers: DEAD_AIR_MARKERS,
  devtoolsName: "scrap.deadAir",
}));

const handlersOf = perContext(() => ({ settlement: null as ((settlement: DeadAirSettlement) => void) | null }));

/** Wire the encounter's result card and payout. Called once per context from the relay. */
export function onDeadAirSettled(ctx: GameContext, handler: (settlement: DeadAirSettlement) => void): void {
  handlersOf(ctx).settlement = handler;
}

export function deadAirRuntime(ctx: GameContext): MissionRuntime {
  return runtimeOf(ctx);
}

function patch(ctx: GameContext, next: Partial<DeadAirBoardState>): void {
  deadAirBoard.write(ctx, { ...deadAirBoard.read(ctx), ...next });
}

export function isDeadAirRunning(ctx: GameContext): boolean {
  return deadAirBoard.read(ctx).active;
}

/** Report a world event for the next tick — a kill inside the ring is one. */
export function reportDeadAirEvent(ctx: GameContext, event: MissionWorldEvent): void {
  const board = deadAirBoard.read(ctx);
  patch(ctx, { pending: [...board.pending, event] });
}

export function startDeadAir(ctx: GameContext): void {
  const runtime = deadAirRuntime(ctx);
  runtime.start(DEAD_AIR);
  const view = runtime.view();
  patch(ctx, {
    active: true,
    view: view === null ? null : { ...view, path: [...view.path] },
    snapshot: runtime.snapshot(),
    pending: [],
  });
}

function sameView(a: MissionView | null, b: MissionView | null): boolean {
  if (a === null || b === null) return a === b;
  return a.status === b.status
    && a.objectiveId === b.objectiveId
    && a.counted === b.counted
    && a.step === b.step
    && a.outcome === b.outcome
    && Math.ceil(a.remaining ?? -1) === Math.ceil(b.remaining ?? -1);
}

function settle(ctx: GameContext, events: readonly MissionEvent[], elapsed: number): void {
  const won = events.some((event) => event.kind === "completed");
  const failed = events.find((event) => event.kind === "failed");
  if (!won && failed === undefined) return;
  patch(ctx, { active: false });
  deadAirRuntime(ctx).abandon();
  handlersOf(ctx).settlement?.({
    won,
    reason: won ? "The carrier is back on the air." : (failed?.kind === "failed" ? failed.reason : "The contract was lost."),
    remaining: Math.max(0, DEAD_AIR_HOLD_SECONDS - elapsed),
  });
}

/** Advance the contract against the world. `alive` false fails the hold through `actor-died`. */
export function tickDeadAir(ctx: GameContext, dt: number, alive = true): void {
  const board = deadAirBoard.read(ctx);
  if (!board.active) return;
  const player = ctx.scene.entity.get(ctx.player.userId);
  const position = player === null ? {} : { position: { x: player.position[0], y: player.position[1], z: player.position[2] } };
  const runtime = deadAirRuntime(ctx);
  const events = runtime.tick(dt, {
    actors: { [DEAD_AIR_PLAYER]: { ...position, alive } },
    events: board.pending,
  });
  const view = runtime.view();
  if (!sameView(board.view, view)) {
    patch(ctx, { pending: [], view: view === null ? null : { ...view, path: [...view.path] }, snapshot: runtime.snapshot() });
  } else {
    patch(ctx, { pending: [] });
  }
  settle(ctx, events, runtime.state()?.elapsed ?? 0);
}

/** True when the player is close enough for the contract to be offered. */
export function nearRelay(ctx: GameContext): boolean {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return false;
  return Math.hypot(player.position[0] - RELAY.x, player.position[2] - RELAY.z) <= DEAD_AIR_OFFER_RADIUS;
}

/** Restore a saved contract after a whole-world load. */
export function restoreDeadAir(ctx: GameContext): void {
  const board = deadAirBoard.read(ctx);
  const runtime = deadAirRuntime(ctx);
  runtime.restore(board.snapshot);
  const state = runtime.state();
  const view = runtime.view();
  patch(ctx, {
    active: state !== null && state.status === "active",
    view: view === null ? null : { ...view, path: [...view.path] },
    pending: [],
  });
}

export function resetDeadAir(ctx: GameContext): void {
  deadAirBoard.write(ctx, { ...EMPTY_BOARD });
  deadAirRuntime(ctx).restore(EMPTY_SNAPSHOT);
}
