import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { EncounterOrder } from "@jgengine/core/ai/director/encounter";
import { advanceBoss, createBossState } from "@jgengine/core/ai/director/boss";
import { evaluatePressure, type PressurePlan } from "@jgengine/core/ai/director/pressure";
import { advancePathFollow, createPathFollow } from "@jgengine/core/nav/pathFollow";

import { creepDef } from "../entities/enemies/catalog";
import { gameClockMs, session, nextCreepInstanceId, newSpeedStats } from "../session";
import {
  bossProfile,
  PRESSURE_RULE,
  TOTAL_WAVES,
} from "./manifest";
import { KEEP_POINT, PATH_WAYPOINTS } from "../world/path";
import { finishRun } from "./legacy";
import { keep, runEnded } from "../keep";

/** Gold an early release pays: 2 per raider still on the road, capped at 20. */
export function waveOverlapBonus(ctx: GameContext): number {
  const world = keep.of(ctx);
  const done = session.encounter.view().done;
  return world.fact("keep.wave_started") === true && world.fact("keep.wave_ready") === true && !done
    ? Math.min(20, session.creeps.size * 2) : 0;
}

/** What the director sees about the player right now: keep health, waves cleared, time on the clock. */
export function readPressure(ctx: GameContext): PressurePlan {
  const world = keep.of(ctx);
  const max = world.num("keep.lives_max");
  const health = max <= 0 ? 1 : Math.max(0, world.num("keep.lives")) / max;
  const cleared = Math.max(0, session.encounter.view().wave - 1);
  return evaluatePressure(
    { health, progress: cleared / TOTAL_WAVES, elapsed: ctx.time.now() },
    PRESSURE_RULE,
  );
}

/** Whether the player may release the next wave right now. */
export function canSendWave(ctx: GameContext): boolean {
  const world = keep.of(ctx);
  return world.fact("keep.wave_ready") === true && !runEnded(world) && !session.encounter.view().done;
}

export function sendWave(ctx: GameContext): void {
  if (!canSendWave(ctx)) return;
  const world = keep.of(ctx);
  const bonus = waveOverlapBonus(ctx);
  if (world.fact("keep.wave_started") === true) session.encounter.completeWave();
  session.pressure = readPressure(ctx);
  session.openingComposition = session.encounter
    .openWave(undefined, session.pressure)
    .map((order) => order.unit);
  world.set("keep.wave_started", true);
  world.set("keep.wave_ready", false);
  world.set("keep.wave", session.encounter.view().wave);
  world.set("keep.last_bonus", bonus);
  if (bonus > 0) keep.emit(ctx, { kind: "overlap_bonus", scale: bonus });
  ctx.game.audio.play("wave");
}

export function registerWaveCommands(ctx: GameContext): void {
  ctx.game.commands.define("wave.send", {
    validate: (state) => (canSendWave(state) ? null : { reason: "wave-not-ready" }),
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
  // A leak is a world ripple: the keep loses the raider's leak in lives, and its hook ends a fallen run.
  keep.emit(ctx, { kind: "leak", scale: creepDef(catalogId).leak });
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
  const world = keep.of(ctx);
  if (world.fact("keep.fallen") === true) return;

  const view = session.encounter.view();
  if (world.fact("keep.wave_ready") !== true && !view.done) {
    for (const order of session.encounter.update(dt)) spawnCreep(ctx, order);
    if (session.encounter.view().ready) {
      world.set("keep.wave_ready", true);
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

  if (session.encounter.view().done && session.creeps.size === 0 && !runEnded(world)) {
    world.set("keep.held", true);
    finishRun(ctx);
    setGamePhase(ctx, "ended");
    ctx.game.audio.play("victory");
  }
}
