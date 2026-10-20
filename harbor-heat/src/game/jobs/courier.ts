import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { defineStore } from "@jgengine/core/store/defineStore";
import { handrollOf } from "../handroll";
import { grantCred } from "../progression/cred";
import { sessionStore, syncSession } from "../session";

export const DISPATCH = [-193, 44] as const;
export const DELIVERY_ROUTES = [
  { label: "Boardwalk breakfast", recipient: "Mainsail lifeguards", position: [-190, 112] as const, seconds: 65, payout: 250, hint: "Follow the shore south. Find the coral parcel tower beside the boardwalk." },
  { label: "Plaza night shift", recipient: "Plaza radio crew", position: [-68, 8] as const, seconds: 95, payout: 400, hint: "Head north to the cross street, then east to the teal parcel tower." },
  { label: "Sunset spare parts", recipient: "Sunset pit crew", position: [-68, 112] as const, seconds: 110, payout: 500, hint: "Follow Mainsail south, then take the cross street east to the gold parcel tower." },
] as const;

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
}
export const RUSH_BOND = 60;
export function courierDeadline(seconds: number, rush: boolean): number { return rush ? Math.ceil(seconds * 0.35) : seconds; }
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

export function finishCourier(ctx: GameContext, won: boolean): void {
  const current = courierStore.read(ctx);
  if (current.phase !== "running") return;
  const route = DELIVERY_ROUTES[current.route % DELIVERY_ROUTES.length]!;
  const rush = current.service === "rush";
  const condition = current.condition ?? 100;
  const reward = won ? rush ? Math.floor(route.payout * 1.8 * condition / 100) + Math.floor(current.remaining * 2) + Math.floor(RUSH_BOND * condition / 100) : route.payout + Math.floor(current.remaining * 2) : 0;
  courierStore.write(ctx, { ...current, phase: won ? "won" : "lost", reward, completed: current.completed + (won ? 1 : 0) });
  if (won) {
    ctx.game.economy.grant(ctx.player.userId, "cash", reward);
    grantCred(ctx, 15);
  }
  sessionStore.write(ctx, { ...sessionStore.read(ctx), notice: "courier" });
  ctx.game.audio.play(won ? "delivery_chime" : "delivery_fail");
  syncSession(ctx, true);
  ctx.game.feed.push("harbor.log", { text: won ? `Parcel delivered to ${route.recipient}. $${reward} paid.${rush ? ` Cargo ${Math.round(condition)}%; bond refund included.` : ""}` : rush ? "Rush expired. The $60 bond was forfeited; free standard jobs remain available." : "Delivery expired. The parcel returned to dispatch; no cash lost." });
  void ctx.game.save?.checkpoint();
}

export function registerCourier(ctx: GameContext): void {
  ctx.game.commands.define<{ service?: string }>("courier.accept", { apply(state, input) {
    const current = courierStore.read(state);
    if (current.phase === "running" || !near(state, DISPATCH, 9)) return;
    const rush = input?.service === "rush";
    if (rush && (current.completed < 1 || state.game.economy.charge(state.player.userId, "cash", RUSH_BOND) !== null)) {
      state.scene.entity.floatText({ instanceId: state.player.userId, text: current.completed < 1 ? "COMPLETE A STANDARD DELIVERY FIRST" : "RUSH NEEDS $60 BOND — STANDARD IS FREE", kind: "warn" });
      return;
    }
    const routeIndex = current.completed % DELIVERY_ROUTES.length;
    const route = DELIVERY_ROUTES[routeIndex]!;
    const position = courierPosition(state)!;
    courierStore.write(state, { ...current, phase: "running", route: routeIndex, remaining: courierDeadline(route.seconds, rush), reward: 0, service: rush ? "rush" : "standard", condition: 100, lastHealth: state.scene.entity.stats.get(state.player.userId, "health")?.current ?? 100,
      distance: Math.round(Math.hypot(position[0] - route.position[0], position[2] - route.position[1])) });
    state.game.audio.play("parcel_take");
    void state.game.save?.checkpoint();
  } });
  ctx.game.commands.define("courier.deliver", { apply(state) {
    const current = courierStore.read(state);
    if (current.phase !== "running") return;
    const route = DELIVERY_ROUTES[current.route % DELIVERY_ROUTES.length]!;
    if (!near(state, route.position, 8)) return;
    if (handrollOf(state).carSpeedKmh() > 8) {
      state.scene.entity.floatText({ instanceId: state.player.userId, text: "SLOW DOWN TO DELIVER", kind: "warn" });
      return;
    }
    finishCourier(state, current.remaining > 0);
  } });
  ctx.game.commands.define("courier.dismiss", { apply(state) {
    const current = courierStore.read(state);
    if (current.phase === "running") return;
    courierStore.write(state, { ...current, phase: "idle" });
    sessionStore.write(state, { ...sessionStore.read(state), notice: "" });
    syncSession(state, true);
  } });
}

export function tickCourier(ctx: GameContext, dt: number): void {
  const current = courierStore.read(ctx);
  if (current.phase !== "running") return;
  const route = DELIVERY_ROUTES[current.route % DELIVERY_ROUTES.length]!;
  const position = courierPosition(ctx);
  const remaining = Math.max(0, current.remaining - dt);
  const health = ctx.scene.entity.stats.get(ctx.player.userId, "health")?.current ?? 100;
  const condition = current.service === "rush" ? cargoCondition(current.condition ?? 100, dt, handrollOf(ctx).carSpeedKmh(), (current.lastHealth ?? health) - health) : 100;
  const dx = route.position[0] - (position?.[0] ?? DISPATCH[0]);
  const dz = route.position[1] - (position?.[2] ?? DISPATCH[1]);
  courierStore.write(ctx, { ...current, remaining, condition, lastHealth: health, distance: Math.round(Math.hypot(dx, dz)), heading: Math.atan2(dx, dz) });
  if (remaining <= 0) finishCourier(ctx, false);
}

export function courierPrompts(ctx: GameContext): PositionedPrompt[] {
  const current = courierStore.read(ctx);
  const delivering = current.phase === "running";
  const target = delivering ? DELIVERY_ROUTES[current.route % DELIVERY_ROUTES.length]!.position : DISPATCH;
  return [{ id: delivering ? "courier:deliver" : "courier:accept", priority: 3, position: { x: target[0], z: target[1] }, prompt: {
    radius: delivering ? 8 : 9,
    display: { kind: "keybind", actionId: "interact" },
    invoke: { name: delivering ? "courier.deliver" : "courier.accept", input: undefined },
  } }];
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
