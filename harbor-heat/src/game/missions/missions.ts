/**
 * Harbor's contracts are missions. A delivery is a timed `interact` objective that fails when the
 * parcel is wrecked; a bounty is a `pursue` chase with a deadline, an escape state and a takedown.
 * The runtime owns objectives, timers and fail states; this file supplies the authored data, reports
 * what happened in the world, and hands each settlement to the contract that pays it.
 */
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
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
import { BOUNTY_SPOTS } from "../world/districts";
import { liveBountyTarget, markDistance, MARK_TAKEDOWN_RADIUS } from "../jobs/bounties";
import { courierDeadline, DELIVERY_ROUTES, DISPATCH } from "../jobs/routes";

export const COURIER_KIND = "courier";
export const BOUNTY_KIND = "bounty";
export const COURIER_ACTOR = "courier";
export const MARK_ACTOR = "mark";
export const PLAYER_ACTOR = "player";

export type CourierService = "standard" | "rush";

export function courierMissionId(routeIndex: number, service: CourierService): string {
  return `${COURIER_KIND}_${routeIndex}_${service}`;
}

export function bountyMissionId(spotId: string): string {
  return `${BOUNTY_KIND}_${spotId}`;
}

/** Drop markers, from the authored route data. */
export const MISSION_MARKERS: Readonly<Record<string, { x: number; y: number; z: number }>> = Object.fromEntries(
  DELIVERY_ROUTES.map((route, index) => [`drop_${index}`, { x: route.position[0], y: 0, z: route.position[1] }]),
);

function courierMission(routeIndex: number, service: CourierService): MissionDef {
  const route = DELIVERY_ROUTES[routeIndex]!;
  return {
    id: courierMissionId(routeIndex, service),
    title: route.label,
    description: route.hint,
    objectives: [{
      id: "deliver",
      kind: "interact",
      actor: COURIER_ACTOR,
      marker: `drop_${routeIndex}`,
      radius: 8,
      label: `Deliver to ${route.recipient}`,
      timeout: courierDeadline(route.seconds, service === "rush"),
      onTimeout: "too_slow",
      failOn: [{
        kind: "event",
        match: { kind: "deliver", target: "parcel", tags: ["lost"] },
        to: "cargo_lost",
        message: "the parcel was wrecked",
      }],
      next: "done",
    }],
    fail: [
      { id: "too_slow", message: "the window closed" },
      { id: "cargo_lost", message: "the parcel was wrecked" },
    ],
  };
}

function bountyMission(spotId: string, index: number): MissionDef {
  const spot = BOUNTY_SPOTS[index];
  return {
    id: bountyMissionId(spotId),
    title: `Bounty · ${spot?.label ?? "a marked target"}`,
    objectives: [
      {
        id: "close",
        kind: "pursue",
        actor: MARK_ACTOR,
        distance: 12,
        escapeDistance: 55,
        escapeGrace: 5,
        escapeFail: "escaped",
        timeout: 90,
        onTimeout: "escaped",
        label: "Run the mark down",
        failOn: [{
          kind: "event",
          match: { kind: "kill", target: MARK_ACTOR },
          to: "mark_dead",
          message: "the mark died instead of being taken",
        }],
        next: "take",
      },
      { id: "take", kind: "interact", actor: PLAYER_ACTOR, label: "Bring the mark in", next: "done" },
    ],
    fail: [
      { id: "escaped", message: "the mark got away" },
      { id: "mark_dead", message: "the mark died instead of being taken" },
    ],
  };
}

const ALL_MISSIONS: readonly MissionDef[] = [
  ...DELIVERY_ROUTES.flatMap((_, index) => [
    courierMission(index, "standard"),
    courierMission(index, "rush"),
  ]),
  ...BOUNTY_SPOTS.map((spot, index) => bountyMission(spot.id, index)),
];

const TIMEOUT_BY_ID: ReadonlyMap<string, number> = new Map(
  ALL_MISSIONS.map((def) => [def.id, def.objectives[0]?.timeout ?? 0]),
);

export interface MissionBoardState {
  /** Serializable run state - the save's copy of the active contract. */
  snapshot: MissionRuntimeSnapshot;
  /** Readout copied for the HUD, or null when nothing is running. */
  view: MissionView | null;
  /** The active contract id, or null. */
  active: string | null;
  /** World events reported since the last tick, consumed by the next one. */
  pending: readonly MissionWorldEvent[];
}

const EMPTY_SNAPSHOT: MissionRuntimeSnapshot = { state: null, ticks: 0, started: 0, completed: 0, failed: 0, branches: 0, timeouts: 0 };

const EMPTY_BOARD: MissionBoardState = { snapshot: EMPTY_SNAPSHOT, view: null, active: null, pending: [] };

export const missionBoard = defineStore<MissionBoardState>("harbor.missions", () => ({ ...EMPTY_BOARD }));

/** What the contract that owns a mission does when it settles. */
export interface MissionSettlement {
  missionId: string;
  status: "completed" | "failed";
  /** Seconds left on the contract's own timer when it settled. */
  remaining: number;
  elapsed: number;
  reason: string;
}

type SettlementHandler = (settlement: MissionSettlement) => void;

const handlersOf = perContext(() => ({ handler: null as SettlementHandler | null }));

/** Wire the payout for the game's contracts. Called once per context from the loop. */
export function onMissionSettled(ctx: GameContext, handler: SettlementHandler): void {
  handlersOf(ctx).handler = handler;
}

const runtimeOf = perContext(() => createMissionRuntime({
  missions: ALL_MISSIONS,
  markers: MISSION_MARKERS,
  defaultPursuer: PLAYER_ACTOR,
  devtoolsName: "harbor.missions",
}));

/** The per-context mission runtime. */
export function harborMissions(ctx: GameContext): MissionRuntime {
  return runtimeOf(ctx);
}

function patchBoard(ctx: GameContext, patch: Partial<MissionBoardState>): void {
  missionBoard.write(ctx, { ...missionBoard.read(ctx), ...patch });
}

/** Report a world event for the next tick — the parcel being wrecked is one. */
export function reportMissionEvent(ctx: GameContext, event: MissionWorldEvent): void {
  const board = missionBoard.read(ctx);
  patchBoard(ctx, { pending: [...board.pending, event] });
}

export function isContractActive(ctx: GameContext): boolean {
  return missionBoard.read(ctx).active !== null;
}

export function activeKind(ctx: GameContext): "courier" | "bounty" | null {
  const active = missionBoard.read(ctx).active;
  if (active === null) return null;
  return active.startsWith(COURIER_KIND) ? "courier" : "bounty";
}

export function startMission(ctx: GameContext, missionId: string): void {
  const runtime = harborMissions(ctx);
  runtime.start(missionId);
  const view = runtime.view();
  patchBoard(ctx, {
    active: runtime.state() === null ? null : missionId,
    view: view === null ? null : { ...view, path: [...view.path] },
    snapshot: runtime.snapshot(),
    pending: [],
  });
}

export function startCourierMission(ctx: GameContext, routeIndex: number, service: CourierService): void {
  startMission(ctx, courierMissionId(routeIndex % DELIVERY_ROUTES.length, service));
}

export function startBountyMission(ctx: GameContext, spotId: string): void {
  if (!BOUNTY_SPOTS.some((spot) => spot.id === spotId)) return;
  startMission(ctx, bountyMissionId(spotId));
}

function markPosition(ctx: GameContext): readonly [number, number, number] | null {
  const id = liveBountyTarget(ctx);
  if (id === null) return null;
  return ctx.scene.entity.get(id)?.position ?? null;
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

function actors(ctx: GameContext): Record<string, { position?: { x: number; y: number; z: number } }> {
  const out: Record<string, { position?: { x: number; y: number; z: number } }> = {};
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player !== null) {
    const position = { x: player.position[0], y: player.position[1], z: player.position[2] };
    out[PLAYER_ACTOR] = { position };
    out[COURIER_ACTOR] = { position };
  }
  const mark = markPosition(ctx);
  if (mark !== null) out[MARK_ACTOR] = { position: { x: mark[0], y: mark[1], z: mark[2] } };
  return out;
}

function settle(ctx: GameContext, missionId: string, elapsed: number, events: readonly MissionEvent[], board: MissionBoardState): MissionBoardState {
  let next = board;
  const handler = handlersOf(ctx).handler;
  for (const event of events) {
    if (event.kind !== "completed" && event.kind !== "failed") continue;
    const remaining = Math.max(0, (TIMEOUT_BY_ID.get(missionId) ?? 0) - elapsed);
    if (handler !== null) {
      handler({
        missionId,
        status: event.kind === "completed" ? "completed" : "failed",
        remaining,
        elapsed,
        reason: event.kind === "failed" ? event.reason : "",
      });
    }
    next = { ...next, active: null };
  }
  return next;
}

function advance(ctx: GameContext, dt: number, input: { interact?: readonly string[] }): readonly MissionEvent[] {
  const board = missionBoard.read(ctx);
  if (board.active === null) return [];
  const missionId = board.active;
  const runtime = harborMissions(ctx);
  const events = runtime.tick(dt, { actors: actors(ctx), events: board.pending, interact: input.interact });
  let next: MissionBoardState = { ...board, pending: [] };
  const view = runtime.view();
  if (!sameView(board.view, view)) {
    next = { ...next, view: view === null ? null : { ...view, path: [...view.path] }, snapshot: runtime.snapshot() };
  }
  next = settle(ctx, missionId, runtime.state()?.elapsed ?? 0, events, next);
  if (next.active === null) {
    runtime.abandon();
    next = { ...next, snapshot: runtime.snapshot() };
  }
  missionBoard.write(ctx, next);
  return events;
}

/** Advance the active contract against this frame's world state. */
export function tickHarborMissions(ctx: GameContext, dt: number): void {
  advance(ctx, dt, {});
}

/** Complete the active objective — the interact prompt's effect. */
export function signalInteraction(ctx: GameContext, actor: string): readonly MissionEvent[] {
  return advance(ctx, 0, { interact: [actor] });
}

/** Bring the mark in — the takedown prompt's effect. */
export function takeMark(ctx: GameContext): boolean {
  if (activeKind(ctx) !== "bounty") return false;
  const distance = markDistance(ctx);
  if (distance === null || distance > MARK_TAKEDOWN_RADIUS) return false;
  return signalInteraction(ctx, PLAYER_ACTOR).some((event) => event.kind === "completed");
}

/** The parcel is lost: condition gone, a wrecked car, wasted courier or an arrest. */
export function loseParcel(ctx: GameContext): void {
  if (activeKind(ctx) !== "courier") return;
  reportMissionEvent(ctx, { kind: "deliver", target: "parcel", tags: ["lost"] });
}

/** The live mark died instead of being taken. */
export function reportMarkKilled(ctx: GameContext): void {
  if (activeKind(ctx) !== "bounty") return;
  reportMissionEvent(ctx, { kind: "kill", target: MARK_ACTOR, by: PLAYER_ACTOR });
}

export function bountyPrompt(ctx: GameContext): PositionedPrompt | null {
  if (activeKind(ctx) !== "bounty") return null;
  const id = liveBountyTarget(ctx);
  if (id === null) return null;
  const mark = ctx.scene.entity.get(id);
  if (mark === null) return null;
  if (missionBoard.read(ctx).view?.objectiveId !== "take") return null;
  return {
    id: "bounty:take",
    priority: 4,
    position: { x: mark.position[0], z: mark.position[2] },
    prompt: {
      radius: MARK_TAKEDOWN_RADIUS,
      display: { kind: "keybind", actionId: "interact" },
      invoke: { name: "bounty.take", input: undefined },
    },
  };
}

export function registerMissionCommands(ctx: GameContext): void {
  ctx.game.commands.define("bounty.take", { apply(state) { takeMark(state); } });
}

/** Restore the saved contract after a whole-world load. */
export function restoreHarborMissions(ctx: GameContext): void {
  const board = missionBoard.read(ctx);
  const runtime = harborMissions(ctx);
  runtime.restore(board.snapshot);
  const view = runtime.view();
  const state = runtime.state();
  patchBoard(ctx, {
    active: state !== null && state.status === "active" ? state.missionId : null,
    view: view === null ? null : { ...view, path: [...view.path] },
    pending: [],
  });
}

/** A fresh run starts with no contract, whether or not an old save had one. */
export function resetHarborMissions(ctx: GameContext): void {
  missionBoard.write(ctx, { ...EMPTY_BOARD });
  harborMissions(ctx).restore(EMPTY_SNAPSHOT);
}

/** Dispatch booth position, for prompts that sit away from a route marker. */
export const MISSION_DISPATCH = DISPATCH;
