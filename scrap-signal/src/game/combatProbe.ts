import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { audioProbe } from "./audio/drive";
import { selectedGunId } from "./commands";
import { gunById, magLoaded, isReloading, reservePhase, effectiveMagSize, effectiveReloadMs, reloadFraction } from "./handroll";
import { handlingView } from "./combatFeel";
import { enemyById } from "./entities/enemies/catalog";
import { enemyAiWork, enemyTacticsStore } from "./entities/enemies/ai";
import { lastHit } from "./feel";
import { relayStore } from "./relay";
import { progressionStore, gunCatalogStore } from "./stores";

export function combatProbe(ctx: GameContext): Record<string, number> {
  const gun = gunById(selectedGunId(ctx) ?? "");
  const relay = relayStore.read(ctx);
  const progress = progressionStore.read(ctx);
  const player = ctx.player.userId;
  const entity = ctx.scene.entity.get(player);
  const handling = handlingView(ctx);
  const ai = enemyAiWork(ctx);
  const minds = enemyTacticsStore.read(ctx);
  const hit = lastHit();
  const attackPhase = (phase: string) => ["ready", "windup", "burst", "charge", "recover"].indexOf(phase);
  const phase = ["menu", "playing", "paused", "ended"].indexOf(gamePhase(ctx));
  const result: Record<string, number> = {
    ...audioProbe(ctx),
    nowMs: ctx.time.now() * 1000,
    phase,
    y: entity?.position[1] ?? 0,
    yaw: entity?.rotationY ?? 0,
    aiming: Number(handling.aiming),
    crouching: Number(handling.crouching),
    sprinting: Number(handling.sprinting),
    bloom: handling.bloom,
    climbDeg: handling.climbDeg,
    hitAgeMs: Number.isFinite(hit.atMs) ? ctx.time.now() * 1000 - hit.atMs : -1,
    hitKill: Number(hit.kill),
    hitCritical: Number(hit.crit),
    hitShieldBreak: Number(hit.shieldBreak === true),
    health: ctx.scene.entity.stats.get(player, "health")?.current ?? 0,
    shield: ctx.scene.entity.stats.get(player, "shield")?.current ?? 0,
    shieldMax: ctx.scene.entity.stats.get(player, "shield")?.max ?? 0,
    magazine: gun === undefined ? -1 : magLoaded(ctx, gun),
    magazineMax: gun === undefined ? 0 : effectiveMagSize(gun),
    reloadRemainingMs: gun === undefined || !isReloading(ctx, gun) ? 0 : (1 - reloadFraction(ctx, gun)) * effectiveReloadMs(gun),
    reloading: gun !== undefined && isReloading(ctx, gun) ? 1 : 0,
    reserve: gun === undefined ? 0 : ctx.scene.entity.stats.get(player, `ammo_${gun.ammo}`)?.current ?? 0,
    downed: reservePhase(ctx) === "up" ? 0 : 1,
    wave: relay.wave,
    hostiles: relay.enemies.length,
    relayPhase: ["idle", "defend", "upload", "won", "lost"].indexOf(relay.phase),
    carrierSeconds: relay.remaining,
    uploadSeconds: relay.upload,
    cash: ctx.game.economy.balance(player, "cash"),
    cores: ctx.game.economy.balance(player, "cores"),
    gunCatalogCount: Object.keys(gunCatalogStore.read(ctx)).length,
    contractGun: progress.contractGun === null ? 0 : 1,
    shieldProfile: ["balanced", "skirmish", "bulwark"].indexOf(progress.shieldProfile),
    aiActive: ai.active,
    aiIdle: ai.idle,
    aiDormant: ai.dormant,
    aiRaycasts: ai.raycasts,
    aiGroundQueries: ai.groundQueries,
  };
  if (entity !== null) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const enemy of ctx.scene.entity.list()) {
      if (enemyById(enemy.name) === undefined) continue;
      const distance = Math.hypot(enemy.position[0] - entity.position[0], enemy.position[2] - entity.position[2]);
      if (distance >= nearest) continue;
      nearest = distance;
      result.enemyX = enemy.position[0];
      result.enemyY = enemy.position[1];
      result.enemyZ = enemy.position[2];
      result.enemyHealth = ctx.scene.entity.stats.get(enemy.id, "health")?.current ?? 0;
      result.enemyDistance = distance;
      const mind = minds[enemy.id];
      if (mind !== undefined) {
        result.enemyAttackPhase = attackPhase(mind.phase);
        result.enemyUntilMs = mind.untilMs;
        result.enemyTargetX = mind.target[0];
        result.enemyTargetZ = mind.target[2];
      }
    }
  }
  for (const id of relay.enemies) {
    const enemy = ctx.scene.entity.get(id);
    if (enemy === null) continue;
    result[`${id}.x`] = enemy.position[0];
    result[`${id}.z`] = enemy.position[2];
    result[`${id}.health`] = ctx.scene.entity.stats.get(id, "health")?.current ?? 0;
    const mind = minds[id];
    if (mind !== undefined) {
      result[`${id}.phase`] = attackPhase(mind.phase);
      result[`${id}.untilMs`] = mind.untilMs;
      result[`${id}.targetX`] = mind.target[0];
      result[`${id}.targetZ`] = mind.target[2];
    }
  }
  return result;
}

export function installCombatProbe(ctx: GameContext): void {
  if (typeof window === "undefined" || (!import.meta.env.DEV && new URLSearchParams(window.location.search).get("capture") !== "1")) return;
  (window as Window & { __jgProbe?: () => Record<string, number> }).__jgProbe = () => combatProbe(ctx);
}
