import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { advanceSpawnDirector, advanceWave } from "@jgengine/core/ai/spawnDirector";
import { advancePathFollow, createPathFollow } from "@jgengine/core/nav/pathFollow";

import { BASE_ENTITY_ID, GOLD_CURRENCY } from "../entities/base/catalog";
import { creepDef } from "../entities/enemies/catalog";
import { gameClockMs, session, nextCreepInstanceId, newSpeedStats } from "../session";
import { SPAWN_DIRECTOR_CONFIG } from "./manifest";
import { KEEP_POINT, PATH_WAYPOINTS } from "../world/path";

const LEAK_EFFECT = "leak";

// Keep the public director's selection, budget, seed and caps. This game's player owns
// wave release, so duration is a release window rather than automatic advancement.
const RELEASE_CONFIG = {
  ...SPAWN_DIRECTOR_CONFIG,
  waves: SPAWN_DIRECTOR_CONFIG.waves.map(({ duration: _duration, ...wave }) => wave),
};

export function waveOverlapBonus(): number {
  return session.waveStarted && session.waveReady && !session.director.done
    ? Math.min(20, session.creeps.size * 2) : 0;
}

export function sendWave(ctx: GameContext): void {
  if (!session.waveReady || session.gameOver || session.victory || session.director.done) return;
  const bonus = waveOverlapBonus();
  if (session.waveStarted) session.director = advanceWave(RELEASE_CONFIG, session.director);
  session.waveStarted = true;
  session.waveReady = false;
  session.lastWaveBonus = bonus;
  if (bonus > 0) ctx.game.economy.grant(ctx.player.userId, GOLD_CURRENCY, bonus);
  ctx.game.audio.play("wave");
}

export function registerWaveCommands(ctx: GameContext): void {
  ctx.game.commands.define("wave.send", {
    validate: () => session.waveReady && !session.director.done && !session.gameOver && !session.victory
      ? null : { reason: "wave-not-ready" },
    apply: state => { sendWave(state); return state; },
  });
}

function spawnCreep(ctx: GameContext, catalogId: string): void {
  const def = creepDef(catalogId);
  const instanceId = nextCreepInstanceId();
  ctx.scene.entity.spawn(catalogId, {
    id: instanceId,
    position: PATH_WAYPOINTS[0]!,
    role: "npc",
  });
  session.creeps.set(instanceId, {
    instanceId,
    catalogId,
    path: createPathFollow({ waypoints: PATH_WAYPOINTS, speed: def.speed }),
    speedStats: newSpeedStats(def.speed),
  });
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
  ctx.game.audio.play("leak", KEEP_POINT);
}

export function tickWaves(ctx: GameContext, dt: number): void {
  if (session.gameOver) return;

  if (!session.waveReady && !session.director.done) {
    const duration = SPAWN_DIRECTOR_CONFIG.waves[session.director.wave]!.duration!;
    const spawnDt = Math.min(dt, Math.max(0, duration - session.director.waveElapsed));
    const step = advanceSpawnDirector(RELEASE_CONFIG, session.director, spawnDt, {
      alive: session.creeps.size,
      players: 1,
    });
    session.director = step.state;
    for (const spawn of step.spawns) spawnCreep(ctx, spawn.entryId);
    if (session.director.waveElapsed >= duration) {
      session.waveReady = true;
      if (session.director.wave === RELEASE_CONFIG.waves.length - 1) {
        session.director = advanceWave(RELEASE_CONFIG, session.director);
      }
    }
  }

  const nowMs = gameClockMs(ctx);
  for (const creep of Array.from(session.creeps.values())) {
    const speed = creep.speedStats.get("speed", nowMs);
    const next = advancePathFollow({ waypoints: PATH_WAYPOINTS, speed }, creep.path, dt);
    creep.path = next;
    ctx.scene.entity.setPose(creep.instanceId, { position: next.position, rotationY: next.heading, dt });
    if (next.done) leakCreep(ctx, creep.instanceId, creep.catalogId);
  }

  if (session.director.done && session.creeps.size === 0 && !session.victory && !session.gameOver) {
    session.victory = true;
    setGamePhase(ctx, "ended");
    ctx.game.audio.play("victory");
  }
}
