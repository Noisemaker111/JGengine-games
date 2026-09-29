import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { bonus } from "../characters";
import { reserveStore } from "../stores";

export type ReservePhase = "up" | "downed" | "dead";

export interface ReserveState {
  phase: ReservePhase;
  downedUntilMs: number;
}

/** Per-session Emergency Reserve state — reclaimed with the context (#632). */
const reserveOf = perContext(() => ({ phase: "up" as ReservePhase, downedUntilMs: 0 }));

export const RESERVE_WINDOW_MS = 12000;
export const POWER_SURGE_HEALTH_FRACTION = 0.4;
export const RESPAWN_CASH_FRACTION = 0.07;

export function reservePhase(ctx: GameContext): ReservePhase {
  return reserveOf(ctx).phase;
}

export function enterDowned(ctx: GameContext, nowMs: number): void {
  const reserve = reserveOf(ctx);
  reserve.phase = "downed";
  reserve.downedUntilMs = nowMs + RESERVE_WINDOW_MS * (1 + bonus("reserveTime"));
  reserveStore.write(ctx, { phase: "downed", untilMs: reserve.downedUntilMs });
}

export function powerSurge(ctx: GameContext): void {
  const userId = ctx.player.userId;
  reserveOf(ctx).phase = "up";
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
  const reserve = reserveOf(ctx);
  return reserve.phase === "downed" && nowMs >= reserve.downedUntilMs;
}

export function markRespawned(ctx: GameContext): void {
  reserveOf(ctx).phase = "up";
  reserveStore.write(ctx, { phase: "up", untilMs: 0 });
}
