import { createFireCadence, type FireCadence } from "@jgengine/core/combat";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { bonus } from "./characters";
import { equippedGun } from "./feel";
import { gunById, isReloading, reservePhase, type GunDef, type GunFamily } from "./handroll";
import { player } from "./entities/players/catalog";

/** Ferralon gun handling: precise surveys require bracing; rapid salvage fire builds climb. */
export const HANDLING: Record<GunFamily, { aim: number; kick: number; settleMs: number; bloom: number }> = {
  pistol: { aim: 0.42, kick: 0.8, settleMs: 440, bloom: 0.55 },
  smg: { aim: 0.58, kick: 0.32, settleMs: 650, bloom: 0.68 },
  shotgun: { aim: 0.78, kick: 1.65, settleMs: 700, bloom: 0.28 },
  rifle: { aim: 0.35, kick: 0.55, settleMs: 650, bloom: 0.7 },
  sniper: { aim: 0.18, kick: 1.95, settleMs: 1050, bloom: 1.1 },
  launcher: { aim: 0.65, kick: 2.25, settleMs: 1100, bloom: 0.3 },
};
export interface HandlingView { aiming: boolean; crouching: boolean; moving: boolean; sprinting: boolean; bloom: number; climbDeg: number }
interface HandlingState {
  view: HandlingView;
  triggerSpent: boolean;
  active: string | null;
  switchUntilMs: number;
  gates: Map<string, { gate: FireCadence; intervalMs: number; atMs: number }>;
}
const handlingOf = perContext<HandlingState>(() => ({
  view: { aiming: false, crouching: false, moving: false, sprinting: false, bloom: 0, climbDeg: 0 },
  triggerSpent: false, active: null, switchUntilMs: 0, gates: new Map(),
}));
export function handlingView(ctx: GameContext): HandlingView { return handlingOf(ctx).view; }
export function resetWeaponHandling(ctx: GameContext): void { handlingOf(ctx).gates.clear(); const state = handlingOf(ctx); state.triggerSpent = false; state.active = null; state.switchUntilMs = 0; state.view = { aiming: false, crouching: false, moving: false, sprinting: false, bloom: 0, climbDeg: 0 }; }
export function switchWeapon(ctx: GameContext, gun: GunDef | null): void {
  const state = handlingOf(ctx);
  if (state.active === gun?.id) return;
  const firstEquip = state.active === null;
  state.active = gun?.id ?? null;
  state.view.bloom = 0;
  state.view.climbDeg = 0;
  state.switchUntilMs = ctx.time.now() * 1000 + (firstEquip ? 0 : gun?.family === "launcher" || gun?.family === "sniper" ? 420 : 230);
}
export function tickWeaponHandling(ctx: GameContext, dt: number): void {
  const state = handlingOf(ctx);
  const gun = gunById(equippedGun() ?? "");
  if (state.active !== (gun?.id ?? null)) switchWeapon(ctx, gun ?? null);
  const moving = ["moveForward", "moveBack", "moveLeft", "moveRight"].some((action) => ctx.input.isDown(action));
  const crouching = ctx.input.isDown("crouch");
  const aiming = ctx.input.isDown("aim") && !ctx.input.isDown("sprint") && !(gun && isReloading(ctx, gun));
  const sprinting = moving && ctx.input.isDown("sprint");
  if (!ctx.input.isDown("fire")) state.triggerSpent = false;
  const recover = Math.max(0, dt) * 1000 / (gun ? HANDLING[gun.family].settleMs : 650);
  state.view = { aiming, crouching, moving, sprinting, bloom: Math.max(0, state.view.bloom - recover * 3), climbDeg: Math.max(0, state.view.climbDeg - recover * 3) };
  const entity = ctx.scene.entity.get(ctx.player.userId);
  const speed = reservePhase(ctx) === "downed" ? 1.6 : player.walkSpeed * (1 + bonus("moveSpeed")) * (aiming ? 0.62 : gun && isReloading(ctx, gun) ? 0.82 : 1);
  if (entity && Math.abs((entity.movement.walkSpeed ?? 0) - speed) > 0.01) ctx.scene.entity.update(ctx.player.userId, { movement: { ...entity.movement, walkSpeed: speed } });
}
export function shotSpreadDeg(gun: GunDef, view: HandlingView): number {
  const movement = view.sprinting ? 2.7 : view.moving ? 1.55 : 1;
  const brace = view.crouching ? 0.7 : 1;
  return gun.weapon.spread * movement * brace * (view.aiming ? HANDLING[gun.family].aim : 1) + view.bloom;
}
/** Sample this game's aim policy before passing a real direction to the published projectile resolver. */
export function handledAim(gun: GunDef, view: HandlingView, aim: { yaw: number; pitch: number }, rng: () => number): { yaw: number; pitch: number; spread: number } {
  const spread = shotSpreadDeg(gun, view);
  const radius = Math.sqrt(rng()) * spread * Math.PI / 180;
  const angle = rng() * Math.PI * 2;
  return { yaw: aim.yaw + Math.cos(angle) * radius, pitch: Math.max(-1.45, Math.min(1.45, aim.pitch + Math.sin(angle) * radius + view.climbDeg * Math.PI / 180)), spread };
}
/** Gate successful shots with the published FireCadence; rejects holding semi-auto triggers and sprint fire. */
export function canTrigger(ctx: GameContext, gun: GunDef): boolean {
  const state = handlingOf(ctx);
  if (state.view.sprinting || (ctx.input.isDown("sprint") && ["moveForward", "moveBack", "moveLeft", "moveRight"].some((action) => ctx.input.isDown(action))) || ctx.time.now() * 1000 < state.switchUntilMs) return false;
  return gun.auto || !state.triggerSpent || !ctx.input.isDown("fire");
}
export function spendShotCadence(ctx: GameContext, gun: GunDef): boolean {
  const state = handlingOf(ctx);
  const nowMs = ctx.time.now() * 1000;
  const intervalMs = Math.round(gun.weapon.fireIntervalMs / (1 + bonus("fireRate")));
  let entry = state.gates.get(gun.id);
  if (!entry || entry.intervalMs !== intervalMs) {
    const remaining = entry?.gate.remainingMs() ?? 0;
    entry = { gate: createFireCadence({ intervalMs }), intervalMs, atMs: nowMs };
    if (remaining > 0) entry.gate.restore(Math.max(0, intervalMs - remaining));
    state.gates.set(gun.id, entry);
  }
  entry.gate.tick(Math.max(0, nowMs - entry.atMs) / 1000);
  entry.atMs = nowMs;
  return entry.gate.fire();
}
export function noteHandledShot(ctx: GameContext, gun: GunDef): void {
  const state = handlingOf(ctx);
  state.triggerSpent = true;
  const brace = state.view.crouching ? 0.65 : 1;
  state.view.climbDeg = Math.min(4.5, state.view.climbDeg + HANDLING[gun.family].kick * brace * (state.view.aiming ? 0.65 : 1));
  state.view.bloom = Math.min(4, state.view.bloom + HANDLING[gun.family].bloom * brace);
}
