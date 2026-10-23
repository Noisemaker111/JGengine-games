import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { defineStore } from "@jgengine/core/store/defineStore";
import { handrollOf } from "../handroll";
import { grantCred } from "../progression/cred";
import { sessionStore, syncSession } from "../session";
import {
  courierMissionId,
  loseParcel,
  missionBoard,
  signalInteraction,
  startCourierMission,
  type MissionSettlement,
} from "../missions/missions";
import { DISPATCH, DELIVERY_ROUTES, courierDeadline } from "./routes";

export { DELIVERY_ROUTES, DISPATCH, courierDeadline };

interface CourierState {
  phase: "idle" | "running" | "won" | "lost";
  route: number;
  /** Mirror of the mission's remaining time, for the HUD. */
  remaining: number;
  completed: number;
  reward: number;
  distance: number;
  heading: number;
  service?: "standard" | "rush";
  condition?: number;
  lastHealth?: number;
}
export const RUSH_BOND = 60;

/** Cargo condition: speeding above 35 km/h or taking hits spoils a rush parcel. */
export function cargoCondition(condition: number, dt: number, speedKmh: number, healthLost: number): number {
  return Math.max(0, condition - Math.max(0, speedKmh - 35) * Math.max(0, dt) * 0.12 - Math.max(0, healthLost) * 2);
}

export const courierStore = defineStore<CourierState>("harbor.courier", () => ({ phase: "idle", route: 0, remaining: 0, completed: 0, reward: 0, distance: 0, heading: 0 }));

export function courierPosition(ctx: GameContext): readonly [number, number, number] | null {
  return ctx.scene.entity.get(handrollOf(ctx).drivingVehicleId() ?? ctx.player.userId)?.position ?? null;
}

function near(ctx: GameContext, target: readonly [number, number], radius: number): boolean {
  const position = courierPosition(ctx);
  return position !== null && Math.hypot(position[0] - target[0], position[2] - target[1]) < radius && Math.abs(position[1] - ctx.world.groundHeightAt(target[0], target[1])) < 3;
}

const COURIER_MISSION = /^courier_(\d+)_(standard|rush)$/;

/** The route and service the live mission belongs to, or null when no delivery is running. */
export function courierMissionOf(ctx: GameContext): { route: number; service: "standard" | "rush" } | null {
  const active = missionBoard.read(ctx).active;
  const match = active === null ? null : COURIER_MISSION.exec(active);
  if (match === null) return null;
  return { route: Number(match[1]), service: match[2] as "standard" | "rush" };
}

/** Pay the delivery the mission just settled: the timer and the fail states were the runtime's. */
export function settleCourier(ctx: GameContext, settlement: MissionSettlement): void {
  const mission = COURIER_MISSION.exec(settlement.missionId);
  if (mission === null) return;
  const routeIndex = Number(mission[1]);
  const rush = mission[2] === "rush";
  const route = DELIVERY_ROUTES[routeIndex % DELIVERY_ROUTES.length]!;
  const current = courierStore.read(ctx);
  const condition = current.condition ?? 100;
  const won = settlement.status === "completed";
  const reward = won
    ? rush
      ? Math.floor(route.payout * 1.8 * condition / 100) + Math.floor(Math.round(settlement.remaining) * 2) + Math.floor(RUSH_BOND * condition / 100)
      : route.payout + Math.floor(Math.round(settlement.remaining) * 2)
    : 0;
  courierStore.write(ctx, { ...current, phase: won ? "won" : "lost", reward, completed: current.completed + (won ? 1 : 0) });
  if (won) {
    ctx.game.economy.grant(ctx.player.userId, "cash", reward);
    grantCred(ctx, 15);
  }
  sessionStore.write(ctx, { ...sessionStore.read(ctx), notice: "courier" });
  ctx.game.audio.play(won ? "delivery_chime" : "delivery_fail");
  syncSession(ctx, true);
  void ctx.game.save?.checkpoint();
}

export function registerCourier(ctx: GameContext): void {
  ctx.game.commands.define<{ service?: string }>("courier.accept", { apply(state, input) {
    const current = courierStore.read(state);
    if (current.phase === "running" || courierMissionOf(state) !== null || !near(state, DISPATCH, 9)) return;
    const rush = input?.service === "rush";
    if (rush && (current.completed < 1 || state.game.economy.charge(state.player.userId, "cash", RUSH_BOND) !== null)) {
      state.game.notices.push({ text: current.completed < 1 ? "Complete a standard delivery first." : "Fragile rush needs a $60 bond. Standard parcels are free.", tone: "deny" });
      return;
    }
    const routeIndex = current.completed % DELIVERY_ROUTES.length;
    const route = DELIVERY_ROUTES[routeIndex]!;
    const position = courierPosition(state)!;
    courierStore.write(state, { ...current, phase: "running", route: routeIndex, remaining: courierDeadline(route.seconds, rush), reward: 0,
      service: rush ? "rush" : "standard", condition: 100, lastHealth: state.scene.entity.stats.get(state.player.userId, "health")?.current ?? 100,
      distance: Math.round(Math.hypot(position[0] - route.position[0], position[2] - route.position[1])) });
    startCourierMission(state, routeIndex, rush ? "rush" : "standard");
    state.game.audio.play("parcel_take");
    void state.game.save?.checkpoint();
  } });
  ctx.game.commands.define("courier.deliver", { apply(state) {
    if (courierMissionOf(state) === null) return;
    const routeIndex = courierMissionOf(state)!.route;
    const route = DELIVERY_ROUTES[routeIndex % DELIVERY_ROUTES.length]!;
    if (!near(state, route.position, 8)) return;
    if (handrollOf(state).carSpeedKmh() > 8) {
      state.game.notices.push({ text: "Slow down to deliver.", tone: "deny" });
      return;
    }
    signalInteraction(state, "courier");
  } });
  ctx.game.commands.define("courier.dismiss", { apply(state) {
    const current = courierStore.read(state);
    if (current.phase === "running") return;
    courierStore.write(state, { ...current, phase: "idle" });
    sessionStore.write(state, { ...sessionStore.read(state), notice: "" });
    syncSession(state, true);
  } });
}

/** Cargo rules and the HUD mirror. The mission owns the countdown. */
export function tickCourier(ctx: GameContext, dt: number): void {
  const current = courierStore.read(ctx);
  const mission = courierMissionOf(ctx);
  if (mission === null) return;
  const routeIndex = mission.route;
  const route = DELIVERY_ROUTES[routeIndex % DELIVERY_ROUTES.length]!;
  const position = courierPosition(ctx);
  const health = ctx.scene.entity.stats.get(ctx.player.userId, "health")?.current ?? 100;
  const condition = mission.service === "rush" ? cargoCondition(current.condition ?? 100, dt, handrollOf(ctx).carSpeedKmh(), (current.lastHealth ?? health) - health) : 100;
  const dx = route.position[0] - (position?.[0] ?? DISPATCH[0]);
  const dz = route.position[1] - (position?.[2] ?? DISPATCH[1]);
  const remaining = missionBoard.read(ctx).view?.remaining ?? current.remaining;
  courierStore.write(ctx, { ...current, phase: "running", route: routeIndex, remaining, condition, lastHealth: health,
    distance: Math.round(Math.hypot(dx, dz)), heading: Math.atan2(dx, dz) });
  if (mission.service === "rush" && condition <= 0) loseParcel(ctx);
}

export function courierPrompts(ctx: GameContext): PositionedPrompt[] {
  const mission = courierMissionOf(ctx);
  const delivering = mission !== null;
  const offered = courierStore.read(ctx).completed % DELIVERY_ROUTES.length;
  const target = delivering ? DELIVERY_ROUTES[mission.route % DELIVERY_ROUTES.length]!.position : DISPATCH;
  return [{ id: delivering ? "courier:deliver" : "courier:accept", priority: 3, position: { x: target[0], z: target[1] }, prompt: {
    radius: delivering ? 8 : 9,
    display: { kind: "keybind", actionId: "interact" },
    invoke: { name: delivering ? "courier.deliver" : "courier.accept", input: undefined },
  } }];
}

/** The parcel is lost with the courier: a wreck, a clinic visit or an arrest. */
export function courierCargoLost(ctx: GameContext): void {
  loseParcel(ctx);
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
