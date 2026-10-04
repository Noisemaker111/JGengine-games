import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { defineStore } from "@jgengine/core/store/defineStore";
import { editorMarkerPosition, requireEditorMarker } from "@jgengine/core/editor/index";
import { placeAuthoredObjects, resolveAuthoredObjects } from "@jgengine/core/world/authoredObjects";
import { editorLayers } from "../../editorLayers";
import { handrollOf } from "../handroll";
import { grantCred } from "../progression/cred";
import { sessionStore, syncSession } from "../session";
import { vehicleById } from "../entities/vehicles/catalog";

function courierMarker(id: string): readonly [number, number] {
  const [x, , z] = editorMarkerPosition(requireEditorMarker(editorLayers, id));
  return [x, z];
}

export const DISPATCH = courierMarker("courier_dispatch");
export const DELIVERY_ROUTES = [
  { label: "Boardwalk breakfast", recipient: "Mainsail lifeguards", position: courierMarker("courier_stop_1"), seconds: 65, payout: 250, hint: "Follow the shore south. Find the coral parcel tower beside the boardwalk." },
  { label: "Plaza night shift", recipient: "Plaza radio crew", position: courierMarker("courier_stop_2"), seconds: 95, payout: 400, hint: "Head north to the cross street, then east to the teal parcel tower." },
  { label: "Sunset spare parts", recipient: "Sunset pit crew", position: courierMarker("courier_stop_3"), seconds: 110, payout: 500, hint: "Follow Mainsail south, then take the cross street east to the gold parcel tower." },
] as const;

export type CourierService = "standard" | "express";
export const COURIER_SERVICES = {
  standard: { label: "Coastal standard", timeScale: 1, payoutScale: 1, bond: 0, cred: 15, bonusPerSecond: 2, fragile: false },
  express: { label: "Fragile express", timeScale: 0.3, payoutScale: 1.8, bond: 100, cred: 30, bonusPerSecond: 3, fragile: true },
} as const;

export function courierOffer(routeIndex: number, service: CourierService = "standard") {
  const route = DELIVERY_ROUTES[routeIndex % DELIVERY_ROUTES.length]!;
  const terms = COURIER_SERVICES[service];
  return { seconds: Math.round(route.seconds * terms.timeScale), payout: Math.round(route.payout * terms.payoutScale), bond: terms.bond, cred: terms.cred };
}

export interface CourierState {
  phase: "idle" | "running" | "won" | "lost";
  route: number;
  remaining: number;
  completed: number;
  reward: number;
  distance: number;
  heading: number;
  service: CourierService;
  totalSeconds: number;
  bond: number;
  condition: number;
  failed: number;
  failureReason: "deadline" | "damage" | "recovery" | "returned" | null;
  credReward: number;
  trackedVehicleId: string | null;
  trackedVehicleHealth: number;
}
const initialCourier: CourierState = { phase: "idle", route: 0, remaining: 0, completed: 0, reward: 0, distance: 0, heading: 0,
  service: "standard", totalSeconds: DELIVERY_ROUTES[0].seconds, bond: 0, condition: 100, failed: 0, failureReason: null, credReward: 0,
  trackedVehicleId: null, trackedVehicleHealth: 0 };
export const courierStore = defineStore<CourierState>("harbor.courier", () => ({ ...initialCourier }));

export function normalizeCourier(ctx: GameContext): void {
  const current = courierStore.read(ctx);
  courierStore.write(ctx, { ...initialCourier, ...current, totalSeconds: current.totalSeconds ?? courierOffer(current.route).seconds });
}

export function courierPosition(ctx: GameContext): readonly [number, number, number] | null {
  return ctx.scene.entity.get(handrollOf(ctx).drivingVehicleId() ?? ctx.player.userId)?.position ?? null;
}

function near(ctx: GameContext, target: readonly [number, number], radius: number): boolean {
  const position = courierPosition(ctx);
  return position !== null && Math.hypot(position[0] - target[0], position[2] - target[1]) < radius && Math.abs(position[1] - ctx.world.groundHeightAt(target[0], target[1])) < 3;
}

export function finishCourier(ctx: GameContext, won: boolean, failureReason: CourierState["failureReason"] = "deadline"): void {
  const current = courierStore.read(ctx);
  if (current.phase !== "running") return;
  const route = DELIVERY_ROUTES[current.route % DELIVERY_ROUTES.length]!;
  const terms = COURIER_SERVICES[current.service];
  const offer = courierOffer(current.route, current.service);
  const quality = terms.fragile ? current.condition / 100 : 1;
  const reward = won ? Math.floor(offer.payout * (terms.fragile ? 0.5 + quality / 2 : 1)) + Math.floor(current.remaining * terms.bonusPerSecond * quality) : 0;
  const returned = !won && failureReason === "returned";
  courierStore.write(ctx, { ...current, phase: won ? "won" : "lost", reward, credReward: won ? terms.cred : 0,
    failureReason: won ? null : failureReason, completed: current.completed + (won ? 1 : 0), failed: current.failed + (!won && !returned ? 1 : 0) });
  if ((won || returned) && current.bond > 0) ctx.game.economy.grant(ctx.player.userId, "cash", current.bond);
  if (won) {
    ctx.game.economy.grant(ctx.player.userId, "cash", reward);
    grantCred(ctx, terms.cred);
  }
  sessionStore.write(ctx, { ...sessionStore.read(ctx), notice: "courier" });
  syncSession(ctx, true);
  const reason = returned ? `Parcel returned at dispatch.${current.bond ? " Bond refunded." : " No cash lost."}` : failureReason === "damage" ? "Fragile parcel destroyed." : failureReason === "recovery" ? "Delivery ended during recovery." : "Delivery deadline missed.";
  ctx.game.feed.push("harbor.log", { text: won ? `Parcel delivered to ${route.recipient}. $${reward} paid${current.bond ? `; $${current.bond} bond refunded` : ""}.` : `${reason}${returned ? "" : current.bond ? ` $${current.bond} bond forfeited. Standard deliveries remain free.` : " No cash lost."}` });
  void ctx.game.save?.checkpoint();
}

export function registerCourier(ctx: GameContext): void {
  ctx.game.commands.define("courier.accept", { apply(state, input) {
    normalizeCourier(state);
    const current = courierStore.read(state);
    if (current.phase === "running" || !near(state, DISPATCH, 9)) return;
    const routeIndex = current.completed % DELIVERY_ROUTES.length;
    const serviceInput = (input as { service?: unknown } | undefined)?.service;
    if (serviceInput !== undefined && serviceInput !== "standard" && serviceInput !== "express") return;
    const service = serviceInput ?? "standard";
    const route = DELIVERY_ROUTES[routeIndex]!;
    const offer = courierOffer(routeIndex, service);
    const vehicleId = handrollOf(state).drivingVehicleId();
    const vehicle = vehicleId === null ? null : state.scene.entity.get(vehicleId);
    const vehicleHealth = vehicleId === null ? 0 : state.scene.entity.stats.get(vehicleId, "health")?.current ?? 0;
    if (service === "express" && (vehicle === null || vehicleById(vehicle.name)?.dynamics.type !== "ground" || vehicleHealth <= 0)) {
      state.scene.entity.floatText({ instanceId: state.player.userId, text: "EXPRESS NEEDS A GROUND VEHICLE", kind: "warn" });
      return;
    }
    if (offer.bond && state.game.economy.charge(state.player.userId, "cash", offer.bond) !== null) {
      state.scene.entity.floatText({ instanceId: state.player.userId, text: "NEEDS $100 BOND — STANDARD IS FREE", kind: "warn" });
      return;
    }
    const position = courierPosition(state)!;
    courierStore.write(state, { ...current, phase: "running", route: routeIndex, service, remaining: offer.seconds, totalSeconds: offer.seconds,
      reward: 0, credReward: 0, bond: offer.bond, condition: 100, failureReason: null,
      trackedVehicleId: vehicleId, trackedVehicleHealth: vehicleHealth,
      distance: Math.round(Math.hypot(position[0] - route.position[0], position[2] - route.position[1])) });
    void state.game.save?.checkpoint();
  } });
  ctx.game.commands.define("courier.return", { apply(state) {
    if (!near(state, DISPATCH, 9)) return;
    tickCourier(state, 0);
    finishCourier(state, false, "returned");
  } });
  ctx.game.commands.define("courier.deliver", { apply(state) {
    tickCourier(state, 0);
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
  const vehicleId = handrollOf(ctx).drivingVehicleId();
  const trackedHealth = current.trackedVehicleId === null ? 0 : ctx.scene.entity.stats.get(current.trackedVehicleId, "health")?.current ?? 0;
  const damage = COURIER_SERVICES[current.service].fragile ? Math.max(0, current.trackedVehicleHealth - trackedHealth) : 0;
  const condition = Math.max(0, current.condition - damage);
  const dx = route.position[0] - (position?.[0] ?? DISPATCH[0]);
  const dz = route.position[1] - (position?.[2] ?? DISPATCH[1]);
  courierStore.write(ctx, { ...current, remaining, condition, trackedVehicleId: vehicleId,
    trackedVehicleHealth: vehicleId === null ? 0 : ctx.scene.entity.stats.get(vehicleId, "health")?.current ?? 0,
    distance: Math.round(Math.hypot(dx, dz)), heading: Math.atan2(dx, dz) });
  if (condition <= 0) finishCourier(ctx, false, "damage");
  else if (remaining <= 0) finishCourier(ctx, false);
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
  const existing = new Set(ctx.scene.object.list().map((object) => object.catalogId));
  const objects = resolveAuthoredObjects({ markers: editorLayers.markers.filter((marker) => marker.kind === "courier_landmark") })
    .filter((object) => !existing.has(object.catalogId));
  placeAuthoredObjects(ctx.scene.object, objects, (x, z) => ctx.world.groundHeightAt(x, z), { onExisting: "keep" });
}
