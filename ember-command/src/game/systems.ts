import { defineSystem, type SystemDefinition } from "@jgengine/core/game/defineSystem";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { pauseJob, resumeJob } from "@jgengine/core/work/jobQueue";
import { activeJobs, jobProgress, queuedJobs, tick as tickQueue } from "@jgengine/core/gameplay";

import { tickUnits } from "./ai/units";
import { tickTowers } from "./ai/towers";
import { nextWaveEta, tickEnemyWaves, wavePlan } from "./ai/director";
import { heroLevel, tickHero, thunderClapReady } from "./hero";
import { BUILDINGS, combatantDef } from "./catalog";
import { BUILD_CONFIG, type BuildSpec } from "./building";
import { hudStore } from "./hudStore";
import { TRAINING_CONFIG } from "./production";
import { GOLD, INCOME_TRICKLE, LUMBER } from "./tuning";
import { matchRunning, reservedSupply, livingUnits, session, usedSupply, type UnitRuntime } from "./session";
import { grantResearch, RESEARCH_CONFIG, upgradeHave, upgradeRank, doctrine } from "./upgrades";

function keepStat(ctx: GameContext, faction: "player" | "enemy"): { current: number; max: number } {
  const keep = livingUnits(faction, "building").find((u) => u.catalogId === `keep_${faction}`);
  if (keep === undefined) return { current: 0, max: 1 };
  const stat = ctx.scene.entity.stats.get(keep.id, "health");
  return stat === null ? { current: 0, max: 1 } : { current: Math.max(0, Math.round(stat.current)), max: stat.max };
}

/** Spawn a freshly-trained unit at the Town Hall's muster point and walk it onto the field. */
function spawnTrained(ctx: GameContext, unitId: string): void {
  const keepUnit = livingUnits("player", "building")[0];
  if (keepUnit === undefined) return;
  const keep = ctx.scene.entity.get(keepUnit.id);
  if (keep === null) return;
  const def = combatantDef(unitId);
  if (def === null) return;
  session.trainSeq += 1;
  const id = `${unitId}_t${session.trainSeq}`;
  const lane = ((session.trainSeq % 5) - 2) * 1.8;
  const ex = keep.position[0] + lane;
  const ez = keep.position[2] - 8;
  ctx.scene.entity.spawn(unitId, { id, position: [ex, 0, ez], role: "npc" });
  const unit: UnitRuntime = {
    id,
    catalogId: unitId,
    faction: "player",
    kind: "unit",
    command: { kind: "move", x: session.rallyPoint?.x ?? ex, z: session.rallyPoint?.z ?? ez - 3 },
    guardPoint: { x: session.rallyPoint?.x ?? ex, z: session.rallyPoint?.z ?? ez - 3 },
    leash: 14,
    attackCooldown: 0,
  };
  session.units.set(id, unit);
}

/** The RTS heartbeat: unit orders + auto-combat resolve every frame. */
const aiSystem: SystemDefinition = defineSystem({
  id: "ember-command.ai",
  tick: { type: "frame", stage: "ai" },
  update(ctx, dt) {
    if (matchRunning()) { session.elapsed += dt; tickUnits(ctx, dt); }
  },
});

/** The Marauder AI director: musters escalating reinforcement waves from the enemy Warcamp. */
const enemyAiSystem: SystemDefinition = defineSystem({
  id: "ember-command.enemyAi",
  tick: { type: "frame", stage: "ai" },
  update(ctx, dt) {
    if (matchRunning()) tickEnemyWaves(ctx, dt);
  },
});

/** Hero upkeep: mana regen + ability cooldown. */
const heroSystem: SystemDefinition = defineSystem({
  id: "ember-command.hero",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    if (matchRunning()) tickHero(ctx, dt);
  },
});

/** Advance the Town Hall training queue; each completed job spawns and musters a unit. */
const productionSystem: SystemDefinition = defineSystem({
  id: "ember-command.production",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    if (!matchRunning()) return;
    const barracks = livingUnits("player", "building").some((u) => u.catalogId === "barracks");
    for (const job of session.production.jobs) {
      if (job.spec.unitId === "peasant") continue;
      if (!barracks && job.status !== "paused") session.production = pauseJob(session.production, job.id);
      else if (barracks && job.status === "paused") session.production = resumeJob(session.production, job.id);
    }
    const result = tickQueue(session.production, TRAINING_CONFIG, dt);
    session.production = result.state;
    for (const event of result.events) {
      if (event.type === "completed") spawnTrained(ctx, event.output.unitId);
    }
  },
});

/** Raise a finished building at its placed spot; a Farm lifts the supply cap. */
function raiseBuilding(ctx: GameContext, spec: BuildSpec): void {
  const def = combatantDef(spec.type);
  if (def === null) return;
  session.trainSeq += 1;
  const id = `${spec.type}_b${session.trainSeq}`;
  ctx.scene.entity.spawn(spec.type, { id, position: [spec.x, 0, spec.z], role: "npc" });
  session.units.set(id, {
    id,
    catalogId: spec.type,
    faction: "player",
    kind: "building",
    command: { kind: "idle" },
    guardPoint: { x: spec.x, z: spec.z },
    leash: 0,
    attackCooldown: 0,
  });
  const supply = BUILDINGS[spec.type]?.supply;
  if (supply !== undefined) session.supplyCap += supply;
}

/** Advance construction; each finished job raises its building. */
const constructionSystem: SystemDefinition = defineSystem({
  id: "ember-command.construction",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    if (!matchRunning()) return;
    const result = tickQueue(session.buildQueue, BUILD_CONFIG, dt);
    session.buildQueue = result.state;
    for (const event of result.events) {
      if (event.type === "completed") raiseBuilding(ctx, event.output);
    }
  },
});

/** Advance the research queue; each finished job raises its upgrade's rank permanently. */
const researchSystem: SystemDefinition = defineSystem({
  id: "ember-command.research",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    if (!matchRunning()) return;
    if (!livingUnits("player", "building").some((u) => u.catalogId === "barracks")) return;
    const result = tickQueue(session.research.queue, RESEARCH_CONFIG, dt);
    session.research.queue = result.state;
    for (const event of result.events) {
      if (event.type === "completed") grantResearch(event.output);
    }
  },
});

/** Guard Towers auto-fire at the nearest hostile within range (shared pursuit + auto-target). */
const towerSystem: SystemDefinition = defineSystem({
  id: "ember-command.towers",
  tick: { type: "frame", stage: "combat" },
  update(ctx, dt) {
    if (matchRunning()) tickTowers(ctx, dt);
  },
});

/** A slow gold trickle so a stalled economy can still recover a little. */
const incomeSystem: SystemDefinition = defineSystem({
  id: "ember-command.income",
  tick: { type: "interval", every: 1 },
  update(ctx) {
    if (!matchRunning()) return;
    ctx.game.economy.grant(ctx.player.userId, GOLD, INCOME_TRICKLE);
  },
});

/** The player's fielded combat units (non-hero, non-building), with live health, for the army row. */
function armyRoster(ctx: GameContext): { id: string; kind: string; hp: number; max: number }[] {
  const out: { id: string; kind: string; hp: number; max: number }[] = [];
  for (const u of session.units.values()) {
    if (u.faction !== "player" || u.kind !== "unit" || u.catalogId === "hero") continue;
    const stat = ctx.scene.entity.stats.get(u.id, "health");
    if (stat === null) continue;
    out.push({ id: u.id, kind: u.catalogId, hp: Math.max(0, stat.current), max: stat.max });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/** Snapshot live economy + counts for the HUD a few times a second. */
export function publishHud(ctx: GameContext): void {
    const enemyKeep = keepStat(ctx, "enemy");
    const playerKeep = keepStat(ctx, "player");
    const active = activeJobs(session.production);
    hudStore.set({
      elapsed: Math.floor(session.elapsed),
      doctrine: doctrine(),
      nextWavePlan: wavePlan(),
      depotCount: livingUnits("player", "building").filter((u) => u.catalogId === "keep_player" || u.catalogId === "barracks").length,
      recovery: !session.units.has("hero"),
      recoveryIn: Math.ceil(session.heroState.recoveryIn),
      foodReserved: reservedSupply(),
      rallyArmed: session.rallyArmed,
      gold: Math.floor(ctx.game.economy.balance(ctx.player.userId, GOLD)),
      lumber: Math.floor(ctx.game.economy.balance(ctx.player.userId, LUMBER)),
      foodUsed: usedSupply(),
      foodCap: session.supplyCap,
      playerUnits: livingUnits("player", "unit").length,
      enemyUnits: livingUnits("enemy", "unit").length,
      enemyKeepHp: enemyKeep.current,
      enemyKeepMax: enemyKeep.max,
      playerKeepHp: playerKeep.current,
      playerKeepMax: playerKeep.max,
      attackMoveArmed: session.attackMoveArmed,
      wavesSent: session.enemyWave.sent,
      nextWaveIn: Math.max(0, Math.ceil(nextWaveEta())),
      producing: session.production.jobs.length,
      trainProgress: active.length > 0 ? jobProgress(active[0]!) : 0,
      hasBarracks: livingUnits("player", "building").some((u) => u.catalogId === "barracks"),
      buildArmed: session.buildArmed,
      building: activeJobs(session.buildQueue).length + queuedJobs(session.buildQueue).length,
      weaponsRank: upgradeRank("weapons"),
      weaponsHave: upgradeHave("weapons"),
      armorRank: upgradeRank("armor"),
      armorHave: upgradeHave("armor"),
      researching: activeJobs(session.research.queue).length + queuedJobs(session.research.queue).length,
      heroLevel: heroLevel(ctx),
      abilityReady: thunderClapReady(ctx),
      abilityCd: Math.max(0, Math.ceil(session.heroState.abilityCooldown)),
      army: armyRoster(ctx),
    });
}

const hudSystem = defineSystem({ id: "ember-command.hud", tick: { type: "interval", every: 0.2 }, update: publishHud });

const recoverySystem = defineSystem({
  id: "ember-command.recovery",
  tick: { type: "interval", every: 1 },
  update(ctx) {
    if (!matchRunning()) return;
    session.heroState.recoveryIn = Math.max(0, session.heroState.recoveryIn - 1);
    for (const u of livingUnits("player")) {
      const ent = ctx.scene.entity.get(u.id);
      const hp = ctx.scene.entity.stats.get(u.id, "health");
      if (!ent || !hp || hp.current >= hp.max) continue;
      const threatened = livingUnits("enemy", "unit").some((e) => { const p = ctx.scene.entity.get(e.id)?.position; return p && Math.hypot(p[0] - ent.position[0], p[2] - ent.position[2]) < 10; });
      if (threatened) continue;
      const depots = livingUnits("player", "building").filter((d) => d.catalogId === "keep_player" || d.catalogId === "barracks");
      if (!depots.some((d) => d.guardPoint && Math.hypot(d.guardPoint.x - ent.position[0], d.guardPoint.z - ent.position[2]) < 9)) continue;
      if (ctx.game.economy.balance(ctx.player.userId, LUMBER) < 1) continue;
      ctx.game.economy.charge(ctx.player.userId, LUMBER, 1);
      ctx.scene.entity.stats.delta(u.id, "health", 6);
    }
  },
});

export const systems: readonly SystemDefinition[] = [
  aiSystem,
  enemyAiSystem,
  heroSystem,
  productionSystem,
  constructionSystem,
  researchSystem,
  towerSystem,
  incomeSystem,
  recoverySystem,
  hudSystem,
];
