import { findEditorMarker } from "@jgengine/core/editor/index";
import {
  applyMissionRewards,
  createMissionRuntime,
  type MissionDef,
  type MissionEvent,
  type MissionRuntimeSnapshot,
  type MissionStatus,
} from "@jgengine/core/mission/mission";
import { missionMarkers } from "@jgengine/core/mission/triggers";
import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { editorLayers } from "../../editorLayers";
import { handrollOf } from "../handroll";
import { bankContraband, failContraband, loadContraband } from "../items/cargoHaul";
import { grantCred } from "../progression/cred";
import { earn, spend } from "../cash";
import { sessionStore, syncSession } from "../session";

/** Authored site positions; the dispatch booth and parcel towers live in `editor.scene.json`. */
function site(id: string): readonly [number, number] {
  const marker = findEditorMarker(editorLayers, id);
  if (marker === undefined) throw new Error(`harbor-heat scene is missing marker "${id}"`);
  return [marker.position.x, marker.position.z];
}

export const DISPATCH = site("courier_dispatch");
export const DELIVERY_ROUTES = [
  { label: "Boardwalk breakfast", recipient: "Mainsail lifeguards", position: site("courier_drop_0"), seconds: 65, payout: 250, hint: "Follow the shore south. Find the coral parcel tower beside the boardwalk." },
  { label: "Plaza night shift", recipient: "Plaza radio crew", position: site("courier_drop_1"), seconds: 95, payout: 400, hint: "Head north to the cross street, then east to the teal parcel tower." },
  { label: "Sunset spare parts", recipient: "Sunset pit crew", position: site("courier_drop_2"), seconds: 110, payout: 500, hint: "Follow Mainsail south, then take the cross street east to the gold parcel tower." },
] as const;

/** The pursuer and the runner the mission tracks by id, whichever body the player is in. */
const PLAYER_ACTOR = "harbor_player";
const THIEF = "parcel_thief";
/** HHPD tier at which a live courier run is swept: officers working the block, 2 pips. */
export const COURIER_HEAT_TIER = 2;
/** The world fact the mission machine reads for that sweep; the heat slice owns the number. */
const POLICE_TIER_FACT = "police_tier";

function heatSweep() {
  return [{ kind: "fact" as const, fact: POLICE_TIER_FACT, atLeast: COURIER_HEAT_TIER, to: "heat_sweep", message: "HHPD swept the drop while you were hot — the parcel went back to dispatch." }];
}

interface CourierState {
  phase: "idle" | "running" | "won" | "lost";
  route: number;
  remaining: number;
  completed: number;
  reward: number;
  distance: number;
  heading: number;
  service?: "standard" | "rush";
  condition?: number;
  lastHealth?: number;
  /** One-line failure reason from the mission machine; the receipt shows its own wording. */
  reason?: string;
}
export const RUSH_BOND = 60;
export function courierDeadline(seconds: number, rush: boolean): number { return rush ? Math.ceil(seconds * 0.35) : seconds; }
export function cargoCondition(condition: number, dt: number, speedKmh: number, healthLost: number): number {
  return Math.max(0, condition - Math.max(0, speedKmh - 35) * Math.max(0, dt) * 0.12 - Math.max(0, healthLost) * 2);
}
export const courierStore = defineStore<CourierState>("harbor.courier", () => ({ phase: "idle", route: 0, remaining: 0, completed: 0, reward: 0, distance: 0, heading: 0 }));

/** Plain read-model for the HUD — the objective, its timer and its counter, copied off the runtime view. */
export interface CourierObjective {
  title: string;
  label: string;
  remaining: number | null;
  counted: number;
  count: number;
  step: number;
  steps: number;
  status: MissionStatus;
  outcome: string | null;
  reason: string | null;
}
export const courierObjectiveStore = defineStore<CourierObjective | null>("harbor.courier.objective", null);
export const courierMissionStore = defineStore<MissionRuntimeSnapshot | null>("harbor.courier.mission", null);

export function courierMissionId(routeIndex: number, rush: boolean): string {
  return rush ? `courier_${routeIndex}_rush` : `courier_${routeIndex}`;
}

/**
 * One route's contract as mission data: hand the parcel over before the deadline, then run down the
 * runner who grabs it at the drop. The timer, the escape and the cargo-loss fail are the shared
 * mission machine's; only the parcel, the runner and the payout are Harbor Heat's.
 */
function routeMission(route: (typeof DELIVERY_ROUTES)[number], index: number, rush: boolean): MissionDef {
  const failLate = rush ? "cargo_late_rush" : "cargo_late";
  return {
    id: courierMissionId(index, rush),
    title: rush ? `${route.label} — fragile rush` : route.label,
    description: route.hint,
    start: "deliver",
    objectives: [
      {
        id: "deliver",
        kind: "interact",
        actor: PLAYER_ACTOR,
        marker: `courier_drop_${index}`,
        radius: 8,
        label: `Hand the parcel to ${route.recipient}`,
        timeout: courierDeadline(route.seconds, rush),
        onTimeout: failLate,
        failOn: [
          ...heatSweep(),
          ...(rush
            ? [{ kind: "fact" as const, fact: "cargo_condition", atMost: 0, to: "cargo_lost", message: "Rough driving spoiled the cargo." }]
            : []),
        ],
        next: "recover",
      },
      {
        id: "recover",
        kind: "pursue",
        actor: THIEF,
        pursuer: PLAYER_ACTOR,
        distance: 3.5,
        escapeDistance: 26,
        escapeGrace: 4,
        escapeFail: "cargo_lost",
        label: "Catch the runner who grabbed the parcel — alive",
        timeout: 60,
        onTimeout: "cargo_lost",
        failOn: [
          ...heatSweep(),
          { kind: "actor-died", actor: THIEF, to: "cargo_lost", message: "The runner went down and the parcel burned with them." },
        ],
        next: "done",
      },
    ],
    fail: [
      { id: failLate, message: rush ? "The rush deadline expired and the $60 bond is forfeited." : "The deadline expired and the parcel went back to dispatch." },
      { id: "cargo_lost", message: "The parcel is gone." },
      { id: "heat_sweep", message: "HHPD swept the drop while you were hot. The parcel went back to dispatch." },
    ],
    rewards: { economy: { cash: route.payout } },
  };
}

export const COURIER_JOBS: readonly MissionDef[] = DELIVERY_ROUTES.flatMap((route, index) => [
  routeMission(route, index, false),
  routeMission(route, index, true),
]);

/** Markers are authored at y=0; the machine measures proximity in 3D, so each one is lifted to the live ground it sits on. */
function groundedMarkers(ctx: GameContext): Record<string, { x: number; y: number; z: number }> {
  const out = missionMarkers(editorLayers);
  for (const marker of Object.values(out)) marker.y = ctx.world.groundHeightAt(marker.x, marker.z);
  return out;
}

const runtimes = perContext((ctx: GameContext) =>
  createMissionRuntime({
    missions: COURIER_JOBS,
    markers: groundedMarkers(ctx),
    defaultPursuer: PLAYER_ACTOR,
    devtoolsName: "harbor-heat courier",
  }),
);

export function courierRuntime(ctx: GameContext) {
  return runtimes(ctx);
}

function syncObjective(ctx: GameContext): void {
  const view = courierRuntime(ctx).view();
  courierObjectiveStore.write(
    ctx,
    view === null
      ? null
      : {
          title: view.title,
          label: view.label,
          remaining: view.remaining,
          counted: view.counted,
          count: view.count,
          step: view.step,
          steps: view.steps,
          status: view.status,
          outcome: view.outcome,
          reason: view.reason,
        },
  );
}

function commit(ctx: GameContext): void {
  courierMissionStore.write(ctx, courierRuntime(ctx).snapshot());
  syncObjective(ctx);
}

export function courierPosition(ctx: GameContext): readonly [number, number, number] | null {
  return ctx.scene.entity.get(handrollOf(ctx).drivingVehicleId() ?? ctx.player.userId)?.position ?? null;
}

function near(ctx: GameContext, target: readonly [number, number], radius: number): boolean {
  const position = courierPosition(ctx);
  return position !== null && Math.hypot(position[0] - target[0], position[2] - target[1]) < radius && Math.abs(position[1] - ctx.world.groundHeightAt(target[0], target[1])) < 3;
}

function routeOf(state: CourierState) {
  return DELIVERY_ROUTES[state.route % DELIVERY_ROUTES.length]!;
}

export function finishCourier(ctx: GameContext, won: boolean, reason?: string): void {
  const current = courierStore.read(ctx);
  if (current.phase !== "running") return;
  const route = routeOf(current);
  const rush = current.service === "rush";
  const condition = current.condition ?? 100;
  const remaining = Math.max(0, current.remaining);
  // The contract's base payout is mission data; the time, condition and bond extras stay Harbor Heat's.
  const bonus = won
    ? Math.floor(remaining * 2) + (rush ? Math.floor(route.payout * 0.8 * condition / 100) + Math.floor(RUSH_BOND * condition / 100) : 0)
    : 0;
  // The receipt shows everything that landed: the contract's payout plus the extras granted here.
  courierStore.write(ctx, { ...current, phase: won ? "won" : "lost", reward: won ? route.payout + bonus : 0, reason: won ? undefined : reason, completed: current.completed + (won ? 1 : 0), remaining });
  if (bonus > 0) earn(ctx, bonus, "courier-bonus", route.label);
  if (won) {
    grantCred(ctx, 15);
    bankContraband(ctx);
  } else {
    failContraband(ctx);
  }
  sessionStore.write(ctx, { ...sessionStore.read(ctx), notice: "courier" });
  // The engine answers the moment: objective for a clean delivery, deny for a swept or spoiled one.
  if (won) ctx.game.feedback.cue("objective", `Delivered to ${route.recipient} — $${route.payout + bonus}.`);
  else ctx.game.feedback.cue("deny", reason ?? "The parcel is gone.");
  syncSession(ctx, true);
  void ctx.game.save?.checkpoint();
}

function spawnThief(ctx: GameContext): void {
  if (ctx.scene.entity.get(THIEF) !== null) return;
  const position = courierPosition(ctx);
  if (position === null) return;
  const route = routeOf(courierStore.read(ctx));
  let dx = position[0] - route.position[0];
  let dz = position[2] - route.position[1];
  const length = Math.hypot(dx, dz);
  if (length < 0.1) {
    dx = 1;
    dz = 0;
  } else {
    dx /= length;
    dz /= length;
  }
  const x = position[0] + dx * 8;
  const z = position[2] + dz * 8;
  ctx.scene.entity.spawn("ganger_dock", { id: THIEF, position: [x, ctx.world.groundHeightAt(x, z), z], role: "npc" });
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "PARCEL SNATCHED — CATCH THE RUNNER", kind: "warn" });
}

/** The runner flees from the player on foot; the pursuit itself is the mission's `pursue` objective. */
function moveThief(ctx: GameContext, dt: number): void {
  if (courierRuntime(ctx).view()?.objectiveId !== "recover") return;
  const thief = ctx.scene.entity.get(THIEF);
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (thief === null || player === null) return;
  const dx = thief.position[0] - player.position[0];
  const dz = thief.position[2] - player.position[2];
  const length = Math.hypot(dx, dz);
  if (length < 0.1) return;
  const away: readonly [number, number, number] = [thief.position[0] + (dx / length) * 10, thief.position[1], thief.position[2] + (dz / length) * 10];
  ctx.scene.entity.moveToward(THIEF, away, { speed: 5.4, dt });
}

function handleMissionEvents(ctx: GameContext, events: readonly MissionEvent[]): void {
  for (const event of events) {
    if (event.kind === "objective") {
      if (event.objectiveId === "recover") {
        spawnThief(ctx);
        ctx.game.feedback.cue("objective", "Parcel handed over — catch the runner.");
      }
    } else if (event.kind === "reward") {
      applyMissionRewards(event.rewards, {
        grantEconomy: (currencyId, amount) => {
      if (currencyId === "cash") earn(ctx, amount, "courier-payout");
      else ctx.game.economy.grant(ctx.player.userId, currencyId, amount);
    },
      });
    } else if (event.kind === "completed") {
      ctx.scene.entity.despawn(THIEF);
      finishCourier(ctx, true);
    } else if (event.kind === "failed") {
      ctx.scene.entity.despawn(THIEF);
      finishCourier(ctx, false, event.reason);
    }
  }
}

export function registerCourier(ctx: GameContext): void {
  ctx.game.commands.define<{ service?: string }>("courier.accept", {
    // Refusals are the command's own answer, so the shell shows them once and plays the deny cue.
    validate(state, input) {
      const current = courierStore.read(state);
      if (current.phase === "running" || courierRuntime(state).state()?.status === "active") {
        return { reason: "already-running", message: "Finish the parcel you are already carrying." };
      }
      if (!near(state, DISPATCH, 9)) return { reason: "not-at-dispatch", message: "Take a parcel from the dispatch booth." };
      if (input?.service !== "rush") return null;
      if (current.completed < 1) return { reason: "rush-locked", message: "Complete a standard delivery first." };
      if (state.game.economy.balance(state.player.userId, "cash") < RUSH_BOND) {
        return { reason: "no-bond", message: `Fragile rush needs a $${RUSH_BOND} bond.` };
      }
      return null;
    },
    apply(state, input) {
    const current = courierStore.read(state);
    const rush = input?.service === "rush";
    if (rush) spend(state, RUSH_BOND, "courier-bond");
    const routeIndex = current.completed % DELIVERY_ROUTES.length;
    const route = DELIVERY_ROUTES[routeIndex]!;
    const position = courierPosition(state)!;
    courierRuntime(state).start(courierMissionId(routeIndex, rush));
    courierStore.write(state, { ...current, phase: "running", route: routeIndex, remaining: courierDeadline(route.seconds, rush), reward: 0, service: rush ? "rush" : "standard", condition: 100, lastHealth: state.scene.entity.stats.get(state.player.userId, "health")?.current ?? 100,
      distance: Math.round(Math.hypot(position[0] - route.position[0], position[2] - route.position[1])) });
    syncObjective(state);
    commit(state);
    loadContraband(state);
    state.game.feedback.cue("pickup", `Parcel taken — ${route.label}, $${route.payout}.`);
    void state.game.save?.checkpoint();
  } });
  ctx.game.commands.define("courier.deliver", {
    validate(state) {
      const current = courierStore.read(state);
      if (current.phase !== "running") return { reason: "no-parcel", message: "You are not carrying a parcel." };
      const mission = courierRuntime(state).state();
      if (mission === null || mission.objective !== "deliver") return { reason: "no-handoff", message: "Nothing to hand over yet." };
      if (!near(state, routeOf(current).position, 8)) return { reason: "not-at-drop", message: "Take the parcel to the drop." };
      if (handrollOf(state).carSpeedKmh() > 8) return { reason: "moving", message: "Slow down to deliver." };
      return null;
    },
    apply(state) {
      const mission = courierRuntime(state).state()!;
      handleMissionEvents(state, courierRuntime(state).signal(mission.missionId, "deliver"));
      commit(state);
      void state.game.save?.checkpoint();
    },
  });
  ctx.game.commands.define("courier.dismiss", { apply(state) {
    const current = courierStore.read(state);
    if (current.phase === "running") return;
    courierRuntime(state).abandon();
    courierStore.write(state, { ...current, phase: "idle" });
    commit(state);
    sessionStore.write(state, { ...sessionStore.read(state), notice: "" });
    syncSession(state, true);
  } });
}

export function tickCourier(ctx: GameContext, dt: number): void {
  const runtime = courierRuntime(ctx);
  const mission = runtime.state();
  if (mission === null || mission.status !== "active") return;
  const current = courierStore.read(ctx);
  const route = routeOf(current);
  const position = courierPosition(ctx);
  const health = ctx.scene.entity.stats.get(ctx.player.userId, "health")?.current ?? 100;
  const condition = current.service === "rush" ? cargoCondition(current.condition ?? 100, dt, handrollOf(ctx).carSpeedKmh(), (current.lastHealth ?? health) - health) : 100;
  const dx = route.position[0] - (position?.[0] ?? DISPATCH[0]);
  const dz = route.position[1] - (position?.[2] ?? DISPATCH[1]);
  moveThief(ctx, dt);
  const thief = ctx.scene.entity.get(THIEF);
  const thiefFact = thief !== null
    ? { position: { x: thief.position[0], y: thief.position[1], z: thief.position[2] } }
    : runtime.view()?.objectiveId === "recover" ? { alive: false } : {};
  const events = runtime.tick(dt, {
    actors: {
      [PLAYER_ACTOR]: position === null ? {} : { position: { x: position[0], y: position[1], z: position[2] } },
      [THIEF]: thiefFact,
    },
    facts: { cargo_condition: condition, [POLICE_TIER_FACT]: handrollOf(ctx).wanted().stars },
  });
  courierStore.write(ctx, {
    ...current,
    condition,
    lastHealth: health,
    distance: Math.round(Math.hypot(dx, dz)),
    heading: Math.atan2(dx, dz),
    remaining: runtime.view()?.remaining ?? Math.max(0, current.remaining - dt),
  });
  handleMissionEvents(ctx, events);
  commit(ctx);
}

export function courierPrompts(ctx: GameContext): PositionedPrompt[] {
  const mission = courierRuntime(ctx).state();
  const delivering = mission?.status === "active" && mission.objective === "deliver";
  if (mission?.status === "active" && !delivering) return [];
  const current = courierStore.read(ctx);
  const target = delivering ? routeOf(current).position : DISPATCH;
  return [{ id: delivering ? "courier:deliver" : "courier:accept", priority: 3, position: { x: target[0], z: target[1] }, prompt: {
    radius: delivering ? 8 : 9,
    display: { kind: "keybind", actionId: "interact" },
    invoke: { name: delivering ? "courier.deliver" : "courier.accept", input: undefined },
  } }];
}

/** Restore the mission machine over a loaded save, then mirror its state into the courier stores. */
export function restoreCourier(ctx: GameContext): void {
  const snapshot = courierMissionStore.read(ctx);
  if (snapshot !== null) courierRuntime(ctx).restore(snapshot);
  syncObjective(ctx);
  const mission = courierRuntime(ctx).state();
  const current = courierStore.read(ctx);
  if (current.phase === "running" && (mission === null || mission.status !== "active")) {
    courierStore.write(ctx, { ...current, phase: mission === null ? "idle" : mission.status === "failed" ? "lost" : "won" });
  }
}

/** Old saves gain the authored landmarks once; newer saves keep their placements. */
export function setupCourierLandmarks(ctx: GameContext): void {
  const points = [DISPATCH, ...DELIVERY_ROUTES.map((route) => route.position)];
  points.forEach(([x, z], i) => {
    const catalog = i === 0 ? "obj_dispatch" : `obj_delivery_${i}`;
    // Object placement persists in the whole-world snapshot.
    if (ctx.scene.object.list().some((object) => object.catalogId === catalog)) return;
    ctx.scene.object.place(catalog, i === 0 ? x - 3 : x, ctx.world.groundHeightAt(x, z), z);
  });
}

