import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import {
  advanceSpawnDirector,
  createSpawnDirectorState,
} from "@jgengine/core/ai/spawnDirector";
import {
  advancePathFollow,
  createPathFollow,
} from "@jgengine/core/nav/pathFollow";

import { BASE_ENTITY_ID, GOLD_CURRENCY } from "../entities/base/catalog";
import { creepDef } from "../entities/enemies/catalog";
import {
  gameClockMs,
  session,
  nextCreepInstanceId,
  newSpeedStats,
} from "../session";
import { SPAWN_DIRECTOR_CONFIG, TOTAL_WAVES } from "./manifest";
import { PATH_WAYPOINTS } from "../world/path";

const LEAK_EFFECT = "leak";

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

function leakCreep(
  ctx: GameContext,
  instanceId: string,
  catalogId: string,
): void {
  const def = creepDef(catalogId);
  session.leaksThisWave += def.leak;
  ctx.scene.entity.effect({
    from: instanceId,
    to: BASE_ENTITY_ID,
    effect: LEAK_EFFECT,
    via: { amount: def.leak },
  });
  ctx.scene.entity.despawn(instanceId);
  session.creeps.delete(instanceId);
}

export function tickWaves(ctx: GameContext, dt: number): void {
  if (session.gameOver || session.planning || session.paused) return;
  session.combatSeconds += dt;
  session.rallySeconds = Math.max(0, session.rallySeconds - dt);
  session.rallyCooldown = Math.max(0, session.rallyCooldown - dt);

  const step = advanceSpawnDirector(
    waveConfig(session.waveIndex),
    session.director,
    dt,
    {
      alive: session.creeps.size,
      players: 1,
    },
  );
  session.director = step.state;
  for (const spawn of step.spawns) spawnCreep(ctx, spawn.entryId);

  const nowMs = gameClockMs(ctx);
  for (const creep of Array.from(session.creeps.values())) {
    if (session.gameOver) break;
    const speed = creep.speedStats.get("speed", nowMs);
    const next = advancePathFollow(
      { waypoints: PATH_WAYPOINTS, speed },
      creep.path,
      dt,
    );
    creep.path = next;
    ctx.scene.entity.setPose(creep.instanceId, {
      position: next.position,
      rotationY: next.heading,
      dt,
    });
    if (next.done) leakCreep(ctx, creep.instanceId, creep.catalogId);
  }

  if (
    session.director.done &&
    session.creeps.size === 0 &&
    !session.victory &&
    !session.gameOver
  ) {
    const held = ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY);
    const interest = Math.min(25, Math.floor(held * 0.1));
    const wage = 18 + currentWaveReward() * 6;
    ctx.game.economy.grant(ctx.player.userId, GOLD_CURRENCY, wage + interest);
    if (session.leaksThisWave === 0)
      session.reserve = Math.min(100, session.reserve + 10);
    session.lastReport = `Wave ${session.waveIndex + 1}: +${wage} wages, +${interest} interest. ${session.leaksThisWave === 0 ? "Perfect defense: +10 reserve." : `${session.leaksThisWave} lives lost; repair before advancing.`}`;
    if (session.waveIndex === TOTAL_WAVES - 1) {
      session.victory = true;
      setGamePhase(ctx, "ended");
    } else {
      session.waveIndex += 1;
      session.planning = true;
      session.rallySeconds = 0;
      session.rallyCooldown = 0;
    }
    ctx.touch();
  }
}

function currentWaveReward(): number {
  return session.waveIndex + 1;
}

export function waveConfig(index: number) {
  const wave = SPAWN_DIRECTOR_CONFIG.waves[index]!;
  return {
    ...SPAWN_DIRECTOR_CONFIG,
    seed: 1337 + index * 71,
    waves: [
      {
        ...wave,
        entries: wave.entries.map((entry) => ({ ...entry, minWave: 0 })),
      },
    ],
  };
}

export function beginWave(ctx: GameContext): void {
  session.director = createSpawnDirectorState(waveConfig(session.waveIndex));
  session.planning = false;
  session.leaksThisWave = 0;
  session.lastReport =
    "Raiders approaching. Save reserve for the dangerous crossing.";
  ctx.touch();
}
