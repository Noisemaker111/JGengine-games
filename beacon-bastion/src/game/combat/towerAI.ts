import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import {
  selectAutoTarget,
  type AutoTargetPolicy,
} from "@jgengine/core/scene/autoTarget";
import {
  advancePursuit,
  armPursuit,
  type PursuitState,
} from "@jgengine/core/ai/pursuit";
import { distance } from "@jgengine/core/world/vec3";

import { editorLayers } from "../../editorLayers";
import { towerDef, type TowerDef } from "../entities/towers/catalog";
import {
  towerStats,
  type TowerCombatStats,
} from "../entities/towers/progression";
import { gameClockMs, session } from "../session";
import { pushProjectile } from "./pendingProjectiles";

const TOWER_ID = "__tower__";

export interface TargetCandidate {
  id: string;
  position: EntityPosition;
  progress: number;
  strength?: number;
}

export function chooseTarget(
  policy: AutoTargetPolicy,
  towerPosition: EntityPosition,
  range: number,
  candidates: readonly TargetCandidate[],
): string | null {
  const inRange = candidates.filter(
    (candidate) => distance(towerPosition, candidate.position) <= range,
  );
  if (inRange.length === 0) return null;
  const byId = new Map(inRange.map((candidate) => [candidate.id, candidate]));
  return selectAutoTarget(policy, TOWER_ID, {
    candidates: () => inRange.map((candidate) => candidate.id),
    distance: (_from, toId) => {
      const candidate = byId.get(toId);
      return candidate === undefined
        ? null
        : distance(towerPosition, candidate.position);
    },
    strength: (toId) => byId.get(toId)?.strength ?? 0,
    progress: (toId) => byId.get(toId)?.progress ?? 0,
  });
}

export function counterMultiplier(towerId: string, creepId: string): number {
  if (creepId === "raider_brute")
    return towerId === "tower_archer"
      ? 0.45
      : towerId === "tower_cannon"
        ? 1.35
        : 1;
  return 1;
}

function applyDamage(
  ctx: GameContext,
  stats: TowerCombatStats,
  towerId: string,
  targetId: string,
  catalogId: string,
): void {
  const target = ctx.scene.entity.get(targetId);
  ctx.scene.entity.effect({
    from: towerId,
    to: targetId,
    effect: "damage",
    via: {
      amount:
        stats.damage *
        counterMultiplier(
          catalogId,
          session.creeps.get(targetId)?.catalogId ?? "",
        ),
    },
  });
  if (stats.splashRadius <= 0) return;
  if (target === null) return;
  const splashTargets = ctx.scene.entity.inRadius(
    target.position,
    stats.splashRadius,
    (id) => id !== targetId,
  );
  for (const id of splashTargets) {
    if (!session.creeps.has(id)) continue;
    ctx.scene.entity.effect({
      from: towerId,
      to: id,
      effect: "damage",
      via: {
        amount:
          stats.damage *
          0.5 *
          counterMultiplier(catalogId, session.creeps.get(id)!.catalogId),
      },
    });
  }
}

function applySlow(def: TowerDef, targetId: string, nowMs: number): void {
  if (def.slow === undefined) return;
  const creep = session.creeps.get(targetId);
  if (creep === undefined) return;
  creep.speedStats.addSource(
    `slow:${def.id}`,
    {
      speed: {
        multiply: creep.catalogId === "raider_scout" ? 0.8 : def.slow.factor,
      },
    },
    {
      expiresAtMs: nowMs + def.slow.durationMs,
    },
  );
}

export function tickTowers(ctx: GameContext, dt: number): void {
  const now = ctx.time.now();
  const nowMs = gameClockMs(ctx);
  const candidates: TargetCandidate[] = [];
  for (const creep of session.creeps.values()) {
    const entity = ctx.scene.entity.get(creep.instanceId);
    if (entity === null) continue;
    candidates.push({
      id: creep.instanceId,
      position: entity.position,
      progress: creep.path.distanceTravelled,
      strength:
        ctx.scene.entity.stats.get(creep.instanceId, "health")?.current ?? 0,
    });
  }

  // A stationary turret is the degenerate pursuit case: no chase, no leash — just the shared
  // cooldown-gated attack. `stopDistance` is infinite so an acquired target is always "in reach";
  // `scratch` mirrors each tower's serializable `cooldownSeconds` so the loop allocates nothing.
  const scratch: PursuitState = { attackCooldown: 0 };
  for (const tower of session.towers.values()) {
    const def = towerDef(tower.catalogId, editorLayers);
    const stats = towerStats(def, tower.level, tower.branch);
    const entity = ctx.scene.entity.get(tower.instanceId);
    const targetId =
      entity === null
        ? null
        : chooseTarget(
            tower.priority ?? def.targeting,
            entity.position,
            stats.range,
            candidates.filter((candidate) => session.creeps.has(candidate.id)),
          );

    scratch.attackCooldown = tower.cooldownSeconds;
    const action = advancePursuit(
      scratch,
      dt,
      targetId === null ? null : 0,
      Number.POSITIVE_INFINITY,
      "always",
    );
    tower.cooldownSeconds = scratch.attackCooldown;
    if (action !== "attack" || entity === null || targetId === null) continue;

    const target = ctx.scene.entity.get(targetId);
    if (target === null) continue;

    applyDamage(ctx, stats, tower.instanceId, targetId, tower.catalogId);
    applySlow(def, targetId, nowMs);
    pushProjectile(
      entity.position,
      target.position,
      def.boltColor,
      stats.splashRadius,
      now,
    );
    armPursuit(
      scratch,
      1 / (stats.fireRateHz * (session.rallySeconds > 0 ? 1.6 : 1)),
    );
    tower.cooldownSeconds = scratch.attackCooldown;
  }
}
