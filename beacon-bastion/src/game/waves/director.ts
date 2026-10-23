import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { EncounterOrder } from "@jgengine/core/ai/director/encounter";
import { advanceBoss, createBossState } from "@jgengine/core/ai/director/boss";
import { evaluatePressure, type PressurePlan } from "@jgengine/core/ai/director/pressure";
import { advancePathFollow, createPathFollow } from "@jgengine/core/nav/pathFollow";

import { BASE_ENTITY_ID, GOLD_CURRENCY } from "../entities/base/catalog";
import { creepDef } from "../entities/enemies/catalog";
import { gameClockMs, session, nextCreepInstanceId, newSpeedStats } from "../session";
import {
  bossProfile,
  PRESSURE_RULE,
  TOTAL_WAVES,
} from "./manifest";
import { KEEP_POINT, PATH_WAYPOINTS } from "../world/path";

const LEAK_EFFECT = "leak";

export function waveOverlapBonus(): number {
  const done = session.encounter.view().done;
  return session.waveStarted && session.waveReady && !done
    ? Math.min(20, session.creeps.size * 2) : 0;
}

/** What the director sees about the player right now: keep health, waves cleared, time on the clock. */
export function readPressure(ctx: GameContext): PressurePlan {
  const lives = ctx.scene.entity.stats.get(BASE_ENTITY_ID, "lives");
  const health = lives === null || lives.max <= 0 ? 1 : Math.max(0, lives.current) / lives.max;
  const cleared = Math.max(0, session.encounter.view().wave - 1);
  return evaluatePressure(
    { health, progress: cleared / TOTAL_WAVES, elapsed: ctx.time.now() },
    PRESSURE_RULE,
  );
}

export function sendWave(ctx: GameContext): void {
  const view = session.encounter.view();
  if (!session.waveReady || session.gameOver || session.victory || view.done) return;
  const bonus = waveOverlapBonus();
  if (session.waveStarted) session.encounter.completeWave();
  session.pressure = readPressure(ctx);
  session.openingComposition = session.encounter
    .openWave(undefined, session.pressure)
    .map((order) => order.unit);
  session.waveStarted = true;
  session.waveReady = false;
  session.lastWaveBonus = bonus;
  if (bonus > 0) ctx.game.economy.grant(ctx.player.userId, GOLD_CURRENCY, bonus);
  ctx.game.audio.play("wave");
}

export function registerWaveCommands(ctx: GameContext): void {
  ctx.game.commands.define("wave.send", {
    validate: () => session.waveReady && !session.encounter.view().done && !session.gameOver && !session.victory
      ? null : { reason: "wave-not-ready" },
    apply: state => { sendWave(state); return state; },
  });
}

function spawnCreep(ctx: GameContext, order: EncounterOrder): void {
  const def = creepDef(order.unit);
  const instanceId = nextCreepInstanceId();
  ctx.scene.entity.spawn(order.unit, {
    id: instanceId,
    position: PATH_WAYPOINTS[0]!,
    role: "npc",
  });
  session.creeps.set(instanceId, {
    instanceId,
    catalogId: order.unit,
    path: createPathFollow({ waypoints: PATH_WAYPOINTS, speed: def.speed }),
    speedStats: newSpeedStats(def.speed),
  });
  const profile = bossProfile(order.unit);
  if (profile !== null) {
    session.boss = { instanceId, unitId: order.unit, state: createBossState(profile.phases), stance: "opening" };
    const tell = profile.tells["arrival"];
    if (tell !== undefined) ctx.game.notices.push({ text: tell, ttlMs: 2500 });
  }
}

function leakCreep(ctx: GameContext, instanceId: string, catalogId: string): void {
  const def = creepDef(catalogId);
  ctx.scene.entity.effect({
    from: instanceId,
    to: BASE_ENTITY_ID,
    effect: LEAK_EFFECT,
    via: { amount: def.leak },
  });
  ctx.scene.entity.despawn(instanceId);
  session.creeps.delete(instanceId);
  if (session.boss?.instanceId === instanceId) session.boss = null;
  ctx.game.audio.play("leak", KEEP_POINT);
}

/** Read the boss's health and let its phase change its stance and fire its tell. */
function tickBoss(ctx: GameContext, dt: number): void {
  const boss = session.boss;
  if (boss === null) return;
  const profile = bossProfile(boss.unitId);
  const creep = session.creeps.get(boss.instanceId);
  const health = ctx.scene.entity.stats.get(boss.instanceId, "health");
  if (profile === null || creep === undefined || health === null) {
    session.boss = null;
    return;
  }
  const fraction = health.max <= 0 ? 0 : Math.max(0, health.current) / health.max;
  const step = advanceBoss(profile.phases, boss.state, fraction, dt);
  if (step.changed) {
    const stance = profile.stance[step.phase.id];
    if (stance !== undefined) {
      creep.speedStats.removeSource("boss-phase");
      creep.speedStats.addSource("boss-phase", { speed: { multiply: stance.speedScale } });
      boss.stance = step.phase.id;
    }
    const text = step.tell === null ? undefined : profile.tells[step.tell.id];
    if (text !== undefined) ctx.game.notices.push({ text, ttlMs: Math.round((step.tell?.telegraphSeconds ?? 1.5) * 1000) });
    ctx.game.audio.play("wave");
  }
  session.boss = { ...boss, state: step.state };
}

export function tickWaves(ctx: GameContext, dt: number): void {
  if (session.gameOver) return;

  const view = session.encounter.view();
  if (!session.waveReady && !view.done) {
    for (const order of session.encounter.update(dt)) spawnCreep(ctx, order);
    if (session.encounter.view().ready) {
      session.waveReady = true;
      if (session.encounter.view().wave >= TOTAL_WAVES) session.encounter.completeWave();
    }
    tickBoss(ctx, dt);
  }

  const nowMs = gameClockMs(ctx);
  for (const creep of Array.from(session.creeps.values())) {
    const speed = creep.speedStats.get("speed", nowMs);
    const next = advancePathFollow({ waypoints: PATH_WAYPOINTS, speed }, creep.path, dt);
    creep.path = next;
    ctx.scene.entity.setPose(creep.instanceId, { position: next.position, rotationY: next.heading, dt });
    if (next.done) leakCreep(ctx, creep.instanceId, creep.catalogId);
  }

  if (session.encounter.view().done && session.creeps.size === 0 && !session.victory && !session.gameOver) {
    session.victory = true;
    setGamePhase(ctx, "ended");
    ctx.game.audio.play("victory");
  }
}
