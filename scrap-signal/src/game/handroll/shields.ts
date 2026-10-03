import { createRegenShield, type RegenShield } from "@jgengine/core/combat/regenShield";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { bonus } from "../characters";
import { SHIELD_PROFILES, shieldProfileById, type ShieldProfileId } from "../progression";
import { shieldRecoveryStore, type ShieldRecoveryState } from "../stores";

/** Core owns pool regeneration; the saved observation mirror bridges its published closure clock. */
const shieldsOf = perContext(() => new Map<string, { pool: RegenShield; max: number; recovery?: ShieldRecoveryState }>());
const playerHurtOf = perContext(() => ({ atMs: 0 }));

export const SHIELD_REGEN_DELAY_MS = 5000;

const MAX_QUIET_MS = Math.max(SHIELD_REGEN_DELAY_MS, ...SHIELD_PROFILES.map((profile) => profile.delayMs));

export function playerLastHurtAtMs(ctx: GameContext): number {
  return playerHurtOf(ctx).atMs;
}

function shieldFor(ctx: GameContext, entityId: string, max: number, delayMs: number, quietMs: number, previous: ShieldRecoveryState | undefined): { pool: RegenShield; created: boolean } {
  const shields = shieldsOf(ctx);
  const existing = shields.get(entityId);
  if (existing !== undefined && existing.max === max && existing.recovery === previous) return { pool: existing.pool, created: false };
  const created = createRegenShield({
    // The entity stat owns the value and the bounds; `max`/`current` here are unused placeholders.
    max: 0,
    // Rate and delay are supplied per tick instead — talents change them mid-run.
    regenPerSecond: 0,
    regenDelayMs: delayMs,
    pool: {
      current: () => ctx.scene.entity.stats.get(entityId, "shield")?.current ?? 0,
      max: () => ctx.scene.entity.stats.get(entityId, "shield")?.max ?? 0,
      set: (value) => {
        const live = ctx.scene.entity.stats.get(entityId, "shield")?.current ?? 0;
        const delta = value - live;
        if (delta !== 0) ctx.scene.entity.stats.delta(entityId, "shield", delta);
      },
    },
  });
  // Published 0.18.x has no timer snapshot. Seed its public clock without refilling the saved pool.
  created.noteDamage();
  created.tick(quietMs / 1000, { regenPerSecond: 0, regenDelayMs: delayMs });
  shields.set(entityId, { pool: created, max });
  return { pool: created, created: true };
}

export function tickShields(ctx: GameContext, nowMs: number, dt: number, regenBonus = 1, profileId: ShieldProfileId = "balanced"): void {
  if (dt <= 0) return;
  const saved = shieldRecoveryStore.read(ctx);
  const next: Record<string, ShieldRecoveryState> = {};
  for (const entity of ctx.scene.entity.list()) {
    const shield = ctx.scene.entity.stats.get(entity.id, "shield");
    if (shield === null || shield.max <= 0) continue;
    const isLocalPlayer = entity.id === ctx.player.userId;
    const profile = shieldProfileById(isLocalPlayer ? profileId : "balanced")!;
    const delayMs = isLocalPlayer
      ? profile.delayMs * (1 - Math.min(0.6, bonus("shieldDelay")))
      : SHIELD_REGEN_DELAY_MS;
    const previous = saved[entity.id];
    const previousQuiet = previous !== undefined && Number.isFinite(previous.quietMs)
      ? Math.max(0, Math.min(MAX_QUIET_MS, previous.quietMs))
      : shield.current < shield.max ? 0 : MAX_QUIET_MS;
    const live = shieldFor(ctx, entity.id, shield.max, delayMs, previousQuiet, previous);
    const pool = live.pool;

    // A hit that lands on health (shield already down) must stall regen too — the shield cannot
    // see that one, so tell it explicitly.
    const currentHealth = ctx.scene.entity.stats.get(entity.id, "health")?.current ?? 0;
    const shieldDamage = previous !== undefined && (previous.max === shield.max
      ? shield.current < previous.shield
      : shield.current / shield.max < previous.shield / previous.max - 1e-9);
    const healthDamage = previous !== undefined && currentHealth < previous.health;
    if (healthDamage || (live.created && shieldDamage)) pool.noteDamage();

    const wasSuppressed = pool.suppressed();
    // Rate and delay are re-read every tick: both are talent-derived and change mid-run.
    pool.tick(live.created && shieldDamage ? 0 : dt, {
      regenPerSecond: Math.max(6, shield.max * profile.regenFraction) * regenBonus * (isLocalPlayer ? 1 + bonus("shieldRegen") : 1),
      regenDelayMs: delayMs,
    });
    // Shield damage is detected by the pool itself; surface the player's hits for the damage vignette.
    if (isLocalPlayer && (shieldDamage || healthDamage || (!wasSuppressed && pool.suppressed()))) playerHurtOf(ctx).atMs = nowMs;
    next[entity.id] = {
      quietMs: shieldDamage && (live.created || !healthDamage) ? 0 : Math.min(MAX_QUIET_MS, (healthDamage ? 0 : previousQuiet) + dt * 1000),
      shield: ctx.scene.entity.stats.get(entity.id, "shield")?.current ?? 0,
      health: currentHealth,
      max: shield.max,
    };
    shieldsOf(ctx).get(entity.id)!.recovery = next[entity.id];
  }
  shieldRecoveryStore.write(ctx, next);
}
