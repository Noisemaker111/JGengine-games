import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { bonus } from "../characters";
import { reserveStore } from "../stores";

export type ReservePhase = "up" | "downed" | "dead";

export interface ReserveState {
  phase: ReservePhase;
  downedUntilMs: number;
}

export const RESERVE_WINDOW_MS = 12000;
export const POWER_SURGE_HEALTH_FRACTION = 0.4;
export const RESPAWN_CASH_FRACTION = 0.07;

export function reservePhase(ctx: GameContext): ReservePhase {
  return reserveStore.read(ctx).phase;
}

export function enterDowned(ctx: GameContext, nowMs: number): void {
  reserveStore.write(ctx, { phase: "downed", untilMs: nowMs + RESERVE_WINDOW_MS * (1 + bonus("reserveTime")) });
}

export function powerSurge(ctx: GameContext): void {
  const userId = ctx.player.userId;
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health !== null) {
    const fraction = POWER_SURGE_HEALTH_FRACTION * (1 + bonus("powerSurgeHeal"));
    ctx.scene.entity.stats.delta(userId, "health", Math.round(health.max * fraction));
  }
  const shield = ctx.scene.entity.stats.get(userId, "shield");
  if (shield !== null) ctx.scene.entity.stats.delta(userId, "shield", Math.round(shield.max * 0.5));
  reserveStore.write(ctx, { phase: "up", untilMs: 0 });
}

export function reserveExpired(ctx: GameContext, nowMs: number): boolean {
  const reserve = reserveStore.read(ctx);
  return reserve.phase === "downed" && nowMs >= reserve.untilMs;
}

export function markRespawned(ctx: GameContext): void {
  reserveStore.write(ctx, { phase: "up", untilMs: 0 });
}
