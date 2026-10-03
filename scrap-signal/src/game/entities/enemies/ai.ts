import { aimToPoint } from "@jgengine/core/input/pointer";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { createPerception, type PerceptionSnapshot } from "@jgengine/core/sensor/perception";
import { defineStore } from "@jgengine/core/store/defineStore";
import { pointInTelegraph, type TelegraphConfig } from "@jgengine/core/combat/telegraph";
import { cameraShake } from "@jgengine/shell/camera";
import { reservePhase } from "../../handroll";
import { zoneLevelAt } from "../../world/zones";
import { enemyById, enemyWeapons, levelDamageMult, type EnemyDef } from "./catalog";
import { createBossAuraField, reconcileBossAuras, type BossSample } from "./hazardAura";
import { enemyTactics, type EnemyTactics } from "./tactics";

const bossAuraFieldOf = perContext(() => createBossAuraField());
const perceptionOf = perContext(() => createPerception({ sightRange: 50, sightConeDeg: 360, hearingRange: 0, memorySeconds: 3.5 }));
const visualsOf = perContext(() => new Map<string, () => void>());
export const ENEMY_AI_WORK = { activeRadius: 48, activeIntervalMs: 50, idleIntervalMs: 500, maxActivePerTick: 24, maxIdlePerTick: 4 } as const;
export interface EnemyAiWork { active: number; idle: number; dormant: number; raycasts: number; groundQueries: number }
const workOf = perContext(() => ({ cursor: 0, work: { active: 0, idle: 0, dormant: 0, raycasts: 0, groundQueries: 0 } as EnemyAiWork }));
export function enemyAiWork(ctx: GameContext): EnemyAiWork { return { ...workOf(ctx).work }; }
export const LEASH_RADIUS = 46;
export const RUSK_NOVA = { intervalMs: 7000, windupMs: 1500, radius: 4.2, damage: 40 };

export interface EnemyMind {
  home: EntityPosition;
  level: number;
  engaged: boolean;
  phase: "ready" | "windup" | "burst" | "charge" | "recover";
  untilMs: number;
  target: EntityPosition;
  origin: EntityPosition;
  healthAtCommit: number;
  shieldAtCommit: number;
  shots: number;
  hit: boolean;
  nextNovaMs: number;
  novaUntilMs?: number;
  novaTarget?: EntityPosition;
  perception?: PerceptionSnapshot;
  nextSenseMs?: number;
  nextThinkMs?: number;
  lastThinkMs?: number;
  steeringSide?: number;
  detour?: { target: EntityPosition; goal: EntityPosition; untilMs: number };
}
export const enemyTacticsStore = defineStore<Record<string, EnemyMind>>("scrap.enemyTactics", () => ({}));

export function rememberHome(ctx: GameContext, id: string, position: EntityPosition, level = zoneLevelAt(position[0], position[2])): void {
  const state = enemyTacticsStore.read(ctx);
  const home: EntityPosition = [...position];
  enemyTacticsStore.write(ctx, { ...state, [id]: {
    home, level, engaged: false, phase: "ready", untilMs: 0, target: [...position], origin: [...position],
    healthAtCommit: 0, shieldAtCommit: 0, shots: 0, hit: false, nextNovaMs: 0,
  } });
}

function idHash(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return hash;
}
function distance2d(a: EntityPosition, b: EntityPosition): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function clearVisual(ctx: GameContext, id: string): void {
  visualsOf(ctx).get(id)?.();
  visualsOf(ctx).delete(id);
}

export function enemyLineOfSight(ctx: GameContext, from: EntityPosition, to: EntityPosition, eyeHeight = 1.1): boolean {
  const origin: EntityPosition = [from[0], from[1] + eyeHeight, from[2]];
  const delta: EntityPosition = [to[0] - from[0], to[1] + 1.1 - origin[1], to[2] - from[2]];
  const length = Math.hypot(...delta);
  if (length < 0.01) return true;
  workOf(ctx).work.raycasts += 1;
  return ctx.scene.raycast({ origin, direction: delta, maxDistance: length,
    filter: { entities: false }, accept: (hit) => hit.blocks,
  }) === null;
}

function routeClear(ctx: GameContext, from: EntityPosition, to: EntityPosition, step: number): boolean {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  if (length < 0.01) return true;
  const ux = dx / length;
  const uz = dz / length;
  const probe = Math.min(length, step + 0.55);
  for (const offset of [-0.4, 0, 0.4]) {
    const origin: EntityPosition = [from[0] - uz * offset, from[1] + 0.7, from[2] + ux * offset];
    workOf(ctx).work.raycasts += 1;
    if (ctx.scene.raycast({ origin, direction: [ux, 0, uz], maxDistance: probe,
      filter: { entities: false, terrain: false }, accept: (hit) => hit.blocks,
    }) !== null) return false;
  }
  workOf(ctx).work.groundQueries += 1;
  const ground = ctx.world.groundHeightAt(from[0] + ux * Math.min(step, length), from[2] + uz * Math.min(step, length));
  return Math.abs(ground - from[1]) <= 0.8;
}

function walkClear(ctx: GameContext, id: string, from: EntityPosition, to: EntityPosition, speed: number, stopDistance: number, dt: number): boolean {
  if (!routeClear(ctx, from, to, speed * dt)) return false;
  const length = distance2d(from, to);
  const step = Math.min(speed * dt, Math.max(0, length - stopDistance));
  if (step < 0.001) return true;
  const predicted = ctx.scene.entity.moveToward(id, to, { speed, stopDistance, dt });
  if (predicted === null) return false;
  const progress = ((predicted[0] - from[0]) * (to[0] - from[0]) + (predicted[2] - from[2]) * (to[2] - from[2])) / length;
  return progress >= step * 0.65;
}

function move(ctx: GameContext, id: string, target: EntityPosition, speed: number, stopDistance: number, dt: number, allowSteer = true, mind?: EnemyMind): void {
  const entity = ctx.scene.entity.get(id);
  if (entity === null || distance2d(entity.position, target) <= stopDistance) return;
  const from = entity.position;
  const nowMs = ctx.time.now() * 1000;
  if (mind?.detour !== undefined && (distance2d(from, mind.detour.target) <= 0.25 || distance2d(target, mind.detour.goal) > 5 || nowMs >= mind.detour.untilMs)) delete mind.detour;
  let destination = allowSteer && mind?.detour !== undefined ? mind.detour.target : target;
  let arrival = destination === target ? stopDistance : 0.2;
  if (!walkClear(ctx, id, from, destination, speed, arrival, dt)) {
    if (!allowSteer) return;
    const dx = target[0] - from[0];
    const dz = target[2] - from[2];
    const length = Math.hypot(dx, dz) || 1;
    const side = mind?.steeringSide ?? (idHash(id) % 2 === 0 ? 1 : -1);
    const candidates: EntityPosition[] = [
      [from[0] - dz / length * 3 * side, from[1], from[2] + dx / length * 3 * side],
      [from[0] + dz / length * 3 * side, from[1], from[2] - dx / length * 3 * side],
    ];
    const choice = candidates.findIndex((point) => walkClear(ctx, id, from, point, speed, 0.2, dt));
    if (choice < 0) return;
    destination = candidates[choice]!;
    arrival = 0.2;
    if (mind !== undefined) {
      mind.steeringSide = choice === 0 ? side : -side;
      mind.detour = { target: destination, goal: [...target], untilMs: nowMs + 3000 };
    }
  }
  ctx.scene.entity.moveTowardCommit(id, destination, { speed, stopDistance: arrival, dt, face: true });
  const moved = ctx.scene.entity.get(id);
  if (moved !== null) {
    workOf(ctx).work.groundQueries += 1;
    const ground = ctx.world.groundHeightAt(moved.position[0], moved.position[2]);
    if (Math.abs(moved.position[1] - ground) > 0.001) ctx.scene.entity.update(id, { position: [moved.position[0], ground, moved.position[2]] });
  }
}

function attackZone(def: EnemyDef, tactics: EnemyTactics, mind: EnemyMind): TelegraphConfig {
  if (tactics.role === "charge") return {
    shape: { kind: "line", width: 2.2, length: distance2d(mind.origin, mind.target) + 1.5 },
    at: mind.origin, dir: Math.atan2(mind.target[0] - mind.origin[0], mind.target[2] - mind.origin[2]),
  };
  return { shape: { kind: "circle", radius: tactics.role === "siege" ? 2.4 : def.attack.kind === "melee" ? def.attack.reach * 0.7 : 0.65 }, at: mind.target };
}

function showWindup(ctx: GameContext, id: string, def: EnemyDef, tactics: EnemyTactics, mind: EnemyMind, nowMs: number): void {
  if (visualsOf(ctx).has(id)) return;
  const zone = attackZone(def, tactics, mind);
  visualsOf(ctx).set(id, ctx.scene.entity.telegraph({ from: id, shape: zone.shape,
    at: [...zone.at], ...(zone.dir === undefined ? {} : { dir: zone.dir }), windupMs: Math.max(1, mind.untilMs - nowMs),
  }));
}

function recover(ctx: GameContext, id: string, mind: EnemyMind, nowMs: number, durationMs: number): void {
  clearVisual(ctx, id);
  mind.phase = "recover";
  mind.untilMs = nowMs + durationMs;
}

function tickBossNova(ctx: GameContext, def: EnemyDef, id: string, from: EntityPosition, player: EntityPosition, mind: EnemyMind, nowMs: number): void {
  if (def.family !== "boss" || def.attack.kind !== "ranged") return;
  if (mind.novaUntilMs !== undefined && mind.novaTarget !== undefined) {
    const visualId = `${id}:nova`;
    if (!visualsOf(ctx).has(visualId)) visualsOf(ctx).set(visualId, ctx.scene.entity.telegraph({
      from: id, shape: { kind: "circle", radius: RUSK_NOVA.radius }, at: [...mind.novaTarget],
      windupMs: Math.max(1, mind.novaUntilMs - nowMs),
    }));
    if (nowMs < mind.novaUntilMs) return;
    clearVisual(ctx, visualId);
    if (distance2d(player, mind.novaTarget) <= RUSK_NOVA.radius && enemyLineOfSight(ctx, from, player, def.attack.eyeHeight)) {
      damagePlayer(ctx, def, id, from, RUSK_NOVA.damage, mind.level);
    }
    ctx.scene.entity.vfx({ kind: "nova", color: 0xff8844, from: mind.novaTarget, radius: RUSK_NOVA.radius, durationMs: 520 });
    delete mind.novaUntilMs;
    delete mind.novaTarget;
    return;
  }
  if (mind.nextNovaMs === 0) mind.nextNovaMs = nowMs + RUSK_NOVA.intervalMs * 0.6;
  if (nowMs < mind.nextNovaMs) return;
  mind.nextNovaMs = nowMs + RUSK_NOVA.intervalMs;
  mind.novaUntilMs = nowMs + RUSK_NOVA.windupMs;
  mind.novaTarget = [...player];
}

function damagePlayer(ctx: GameContext, def: EnemyDef, id: string, position: EntityPosition, amount?: number, level = zoneLevelAt(position[0], position[2])): void {
  const base = amount ?? (def.attack.kind === "melee" ? def.attack.damage : enemyWeapons.find((weapon) => def.attack.kind === "ranged" && weapon.id === def.attack.itemId)?.weapon.damage ?? 16);
  const damage = Math.round(base * levelDamageMult(level));
  ctx.scene.entity.effect({ from: id, to: ctx.player.userId, effect: "damage", via: { amount: damage } });
  cameraShake(Math.min(0.5, damage / 60));
}

function fireShot(ctx: GameContext, def: EnemyDef, id: string, from: EntityPosition, target: EntityPosition): void {
  if (def.attack.kind !== "ranged" || !enemyLineOfSight(ctx, from, target, def.attack.eyeHeight)) return;
  const origin: EntityPosition = [from[0], from[1] + def.attack.eyeHeight, from[2]];
  const shotId = ctx.scene.entity.fireProjectile({ from: id, via: { item: def.attack.itemId },
    aim: aimToPoint(origin, [target[0], target[1] + 1.1, target[2]]), effect: "damage",
  });
  ctx.time.after(Math.min(1.5, distance2d(from, target) / 26 + 0.08), () => {
    const settled = ctx.scene.entity.settleProjectile(shotId);
    if (settled.status === "settled" && settled.hits.some((hit) => hit.instanceId === ctx.player.userId)) cameraShake(0.25);
  });
}

function reposition(ctx: GameContext, def: EnemyDef, id: string, from: EntityPosition, player: EntityPosition, dt: number, tactics: EnemyTactics, mind: EnemyMind): void {
  const distance = distance2d(from, player);
  const reach = def.attack.kind === "melee" ? def.attack.reach : def.attack.preferRange;
  if (def.attack.kind === "melee") {
    const side = idHash(id) % 2 === 0 ? 1 : -1;
    const target: EntityPosition = distance > reach * 2 ? [player[0] + side * 1.1, player[1], player[2]] : player;
    move(ctx, id, target, def.walkSpeed, reach * 0.72, dt, true, mind);
  } else if (tactics.role === "skirmish" && distance < reach * 0.55) {
    const length = Math.max(0.01, distance);
    move(ctx, id, [from[0] + (from[0] - player[0]) / length * 3, from[1], from[2] + (from[2] - player[2]) / length * 3], def.walkSpeed, 0.1, dt, true, mind);
  } else if (distance > reach || !enemyLineOfSight(ctx, from, player, def.attack.eyeHeight)) {
    move(ctx, id, player, def.walkSpeed, reach * 0.75, dt, true, mind);
  }
}

export function tickEnemies(ctx: GameContext, dt: number): void {
  if (dt <= 0 || ctx.time.isPaused()) return;
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  const nowMs = ctx.time.now() * 1000;
  const downed = reservePhase(ctx) === "downed";
  const states = { ...enemyTacticsStore.read(ctx) };
  let changed = false;
  const scheduler = workOf(ctx);
  const work = scheduler.work = { active: 0, idle: 0, dormant: 0, raycasts: 0, groundQueries: 0 };
  const entities = ctx.scene.entity.list();
  const start = scheduler.cursor % Math.max(1, entities.length);
  let nextCursor = start;
  const live = new Set<string>();
  const bosses: BossSample[] = [];
  for (let offset = 0; offset < entities.length; offset++) {
    const index = (start + offset) % entities.length;
    const entity = entities[index]!;
    const def = enemyById(entity.name);
    if (def === undefined) continue;
    live.add(entity.id);
    const dx = entity.position[0] - player.position[0];
    const dz = entity.position[2] - player.position[2];
    const distanceSquared = dx * dx + dz * dz;
    const previous = states[entity.id];
    if (distanceSquared > ENEMY_AI_WORK.activeRadius ** 2) {
      work.dormant += 1;
      if (previous !== undefined && (previous.engaged || previous.phase !== "ready" || previous.novaUntilMs !== undefined)) {
        clearVisual(ctx, entity.id);
        clearVisual(ctx, `${entity.id}:nova`);
        const reset = { ...previous, engaged: false, phase: "ready" as const, untilMs: nowMs + 250, nextThinkMs: nowMs };
        delete reset.novaUntilMs;
        delete reset.novaTarget;
        states[entity.id] = reset;
        changed = true;
      }
      continue;
    }
    if (def.family === "boss") bosses.push({ id: entity.id, position: entity.position, level: previous?.level ?? zoneLevelAt(entity.position[0], entity.position[2]) });
    if (previous?.lastThinkMs !== undefined && nowMs >= previous.lastThinkMs && nowMs < (previous.nextThinkMs ?? 0)) continue;
    const active = previous?.engaged === true || (previous !== undefined && previous.phase !== "ready") || distanceSquared <= def.aggroRadius ** 2;
    if (active ? work.active >= ENEMY_AI_WORK.maxActivePerTick : work.idle >= ENEMY_AI_WORK.maxIdlePerTick) continue;
    if (active) work.active += 1; else work.idle += 1;
    nextCursor = index + 1;
    if ((ctx.scene.entity.stats.get(entity.id, "health")?.current ?? 0) <= 0) { live.delete(entity.id); continue; }
    if (states[entity.id] === undefined) {
      rememberHome(ctx, entity.id, entity.position);
      states[entity.id] = enemyTacticsStore.read(ctx)[entity.id]!;
    }
    const mind: EnemyMind = { ...states[entity.id]! };
    states[entity.id] = mind;
    changed = true;
    const aiDt = mind.lastThinkMs === undefined || nowMs < mind.lastThinkMs ? dt : Math.min(0.1, (nowMs - mind.lastThinkMs) / 1000);
    mind.lastThinkMs = nowMs;
    mind.nextThinkMs = nowMs + (active ? ENEMY_AI_WORK.activeIntervalMs : ENEMY_AI_WORK.idleIntervalMs);
    const health = ctx.scene.entity.stats.get(entity.id, "health")!;
    const shield = ctx.scene.entity.stats.get(entity.id, "shield")?.current ?? 0;
    const tactics = enemyTactics(def);
    const distance = Math.sqrt(distanceSquared);
    const leashed = distance2d(entity.position, mind.home) > LEASH_RADIUS;
    const visible = enemyLineOfSight(ctx, entity.position, player.position, def.attack.kind === "ranged" ? def.attack.eyeHeight : 1.1);
    if (nowMs >= (mind.nextSenseMs ?? 0)) {
      const perception = perceptionOf(ctx);
      perception.restore(mind.perception ?? { memories: [], stimuli: [], nowMs });
      perception.retune({ sightRange: def.aggroRadius });
      perception.observe({ id: entity.id, position: entity.position, yaw: entity.rotationY }, visible ? [{ id: player.id, position: player.position }] : [], nowMs);
      mind.perception = perception.snapshot();
      mind.nextSenseMs = nowMs + 250;
    }
    const memory = mind.perception?.memories[0]?.memory;
    const remembers = memory !== undefined && nowMs - memory.lastSeenAt < 3500;
    const knownPosition: EntityPosition = visible ? player.position : memory === undefined ? mind.home : [...memory.lastKnownPos];
    const engaged = !downed && !leashed && distance <= def.aggroRadius && (visible || remembers);
    if (engaged && !mind.engaged) ctx.game.audio.play("bark_alert", entity.position);
    mind.engaged = engaged;
    if (!engaged) {
      clearVisual(ctx, entity.id);
      clearVisual(ctx, `${entity.id}:nova`);
      delete mind.novaUntilMs;
      delete mind.novaTarget;
      mind.phase = "ready";
      mind.untilMs = nowMs + 250;
      if (leashed) move(ctx, entity.id, mind.home, def.walkSpeed, 1.5, aiDt, true, mind);
      else {
        const angle = idHash(`${entity.id}:${Math.floor(nowMs / 5000)}`) / 100;
        move(ctx, entity.id, [mind.home[0] + Math.cos(angle) * 4, mind.home[1], mind.home[2] + Math.sin(angle) * 4], def.walkSpeed * 0.4, 0.6, aiDt, true, mind);
      }
      continue;
    }
    tickBossNova(ctx, def, entity.id, entity.position, player.position, mind, nowMs);
    const committed = mind.phase === "windup" || mind.phase === "burst" || mind.phase === "charge";
    if (committed && ((mind.shieldAtCommit > 0 && shield === 0) || mind.healthAtCommit - health.current >= health.max * 0.2)) {
      recover(ctx, entity.id, mind, nowMs, tactics.recoveryMs);
      ctx.scene.entity.floatText({ instanceId: entity.id, text: "STAGGERED", kind: "info" });
      continue;
    }
    if (mind.phase === "recover") {
      if (nowMs < mind.untilMs) continue;
      mind.phase = "ready";
    }
    if (mind.phase === "charge") {
      move(ctx, entity.id, mind.target, def.walkSpeed * 3.1, 0.1, aiDt, false);
      const position = ctx.scene.entity.get(entity.id)!.position;
      if (!mind.hit && distance2d(position, player.position) <= (def.attack.kind === "melee" ? def.attack.reach * 0.65 : 1.5) && pointInTelegraph(attackZone(def, tactics, mind), player.position) && enemyLineOfSight(ctx, position, player.position)) {
        damagePlayer(ctx, def, entity.id, position, undefined, mind.level);
        mind.hit = true;
      }
      if (nowMs >= mind.untilMs || distance2d(position, mind.target) < 0.3) recover(ctx, entity.id, mind, nowMs, tactics.recoveryMs);
      continue;
    }
    if (mind.phase === "windup") {
      showWindup(ctx, entity.id, def, tactics, mind, nowMs);
      if (nowMs < mind.untilMs) continue;
      clearVisual(ctx, entity.id);
      ctx.game.playEntityAnimation(entity.id, "attack");
      if (tactics.role === "charge") {
        mind.phase = "charge";
        mind.untilMs = nowMs + 650;
        continue;
      }
      if (def.attack.kind === "melee" || tactics.role === "siege") {
        if (pointInTelegraph(attackZone(def, tactics, mind), player.position) && visible) damagePlayer(ctx, def, entity.id, entity.position, undefined, mind.level);
        if (tactics.role === "siege") ctx.scene.entity.vfx({ kind: "nova", color: 0xff8844, from: mind.target, radius: 2.4, durationMs: 420 });
        recover(ctx, entity.id, mind, nowMs, tactics.recoveryMs);
        continue;
      }
      mind.phase = "burst";
      mind.shots = tactics.burst;
      mind.untilMs = nowMs;
    }
    if (mind.phase === "burst") {
      if (nowMs < mind.untilMs) continue;
      fireShot(ctx, def, entity.id, entity.position, mind.target);
      mind.shots -= 1;
      mind.untilMs = nowMs + tactics.burstGapMs;
      if (mind.shots <= 0) recover(ctx, entity.id, mind, nowMs, tactics.recoveryMs);
      continue;
    }
    reposition(ctx, def, entity.id, entity.position, knownPosition, aiDt, tactics, mind);
    const startRange = def.attack.kind === "melee" ? tactics.role === "charge" ? 7 : def.attack.reach : def.attack.preferRange * 1.25;
    if (nowMs < mind.untilMs || distance > startRange || !visible) continue;
    delete mind.detour;
    mind.phase = "windup";
    mind.untilMs = nowMs + tactics.windupMs;
    mind.target = [...player.position];
    mind.origin = [...ctx.scene.entity.get(entity.id)!.position];
    mind.healthAtCommit = health.current;
    mind.shieldAtCommit = shield;
    mind.hit = false;
    showWindup(ctx, entity.id, def, tactics, mind, nowMs);
  }
  for (const id of Object.keys(states)) if (!live.has(id)) { clearVisual(ctx, id); clearVisual(ctx, `${id}:nova`); delete states[id]; changed = true; }
  scheduler.cursor = nextCursor;
  if (changed) enemyTacticsStore.write(ctx, states);
  for (const hit of reconcileBossAuras(bossAuraFieldOf(ctx), bosses, downed ? null : { id: player.id, position: player.position }, dt * 1000, levelDamageMult)) {
    ctx.scene.entity.effect({ from: hit.bossId, to: player.id, effect: "damage", via: { amount: hit.amount } });
  }
}
