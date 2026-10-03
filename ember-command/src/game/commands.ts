import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { activeJobs, queuedJobs, enqueue } from "@jgengine/core/gameplay";
import {
  assignFormationSlots,
  boxFormation,
  facingYaw,
  placeFormation,
  type Vec2,
} from "@jgengine/core/movement/formation";

import { BARRACKS_UNITS, BUILDINGS, combatantDef, COMBATANTS, TRAINABLE } from "./catalog";
import { BUILD_CONFIG } from "./building";
import { TRAINING_CONFIG } from "./production";
import { FORMATION_SPACING, NODE_ORDER_RADIUS, ORDER_TARGET_RADIUS } from "./tuning";
import { matchRunning, reservedSupply, livingUnits, session, usedSupply, type NodeInfo, type UnitRuntime } from "./session";
import { pendingRanks, RESEARCH_CONFIG, UPGRADES, upgradeRank } from "./upgrades";
import { castThunderClap } from "./hero";
import { hudStore } from "./hudStore";

export interface OrderInput {
  selection: readonly string[];
  point: EntityPosition;
}

function distToPoint(p: EntityPosition, x: number, z: number): number {
  return Math.hypot(p[0] - x, p[2] - z);
}

/** Nearest living hostile-to-the-player combatant near a clicked point (buildings get a wider grab). */
function enemyNear(ctx: GameContext, x: number, z: number): string | null {
  let bestId: string | null = null;
  let best = Infinity;
  for (const u of session.units.values()) {
    if (u.faction !== "enemy") continue;
    const ent = ctx.scene.entity.get(u.id);
    if (ent === null) continue;
    const threshold = ORDER_TARGET_RADIUS + (u.kind === "building" ? 4 : 0);
    const d = distToPoint(ent.position, x, z);
    if (d <= threshold && d < best) {
      best = d;
      bestId = u.id;
    }
  }
  return bestId;
}

function nodeNear(x: number, z: number): NodeInfo | null {
  let best: NodeInfo | null = null;
  let bestDist = NODE_ORDER_RADIUS;
  for (const node of session.nodes.values()) {
    const d = Math.hypot(node.x - x, node.z - z);
    if (d <= bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

function selectedPlayerUnits(selection: readonly string[]): UnitRuntime[] {
  const out: UnitRuntime[] = [];
  for (const id of selection) {
    const u = session.units.get(id);
    if (u !== undefined && u.faction === "player" && u.kind === "unit") out.push(u);
  }
  return out;
}

function assignMoveFormation(ctx: GameContext, units: UnitRuntime[], x: number, z: number, attackMove: boolean): void {
  const members: Vec2[] = units.map((u) => {
    const ent = ctx.scene.entity.get(u.id);
    return ent === null ? ([x, z] as Vec2) : ([ent.position[0], ent.position[2]] as Vec2);
  });
  const cx = members.reduce((s, m) => s + m[0], 0) / members.length;
  const cz = members.reduce((s, m) => s + m[1], 0) / members.length;
  const facing = facingYaw([cx, cz], [x, z]);
  const slots = placeFormation([x, z], facing, units.length, boxFormation({ spacing: FORMATION_SPACING }));
  const assignment = assignFormationSlots(members, slots);
  units.forEach((u, i) => {
    const slot = slots[assignment[i] ?? i] ?? ([x, z] as Vec2);
    u.guardPoint = { x: slot[0], z: slot[1] };
    u.command = attackMove ? { kind: "attackMove", x: slot[0], z: slot[1] } : { kind: "move", x: slot[0], z: slot[1] };
  });
}

export function canAffordBuilding(ctx: GameContext, type: string): boolean {
  const def = BUILDINGS[type];
  if (def === undefined || !matchRunning()) return false;
  for (const [currency, amount] of Object.entries(def.cost)) {
    if (ctx.game.economy.balance(ctx.player.userId, currency) < amount) return false;
  }
  return true;
}

/** A building may go on the player's half of the field, clear of gold/lumber nodes and other
 * buildings. Deliberately generous — this is a skirmish, not a city planner. */
function canPlaceAt(ctx: GameContext, x: number, z: number): boolean {
  if (z < -6 || z > 44 || Math.abs(x) > 44) return false;
  for (const node of session.nodes.values()) {
    if (Math.hypot(node.x - x, node.z - z) < 5) return false;
  }
  for (const job of [...activeJobs(session.buildQueue), ...queuedJobs(session.buildQueue)]) {
    if (Math.hypot(job.spec.x - x, job.spec.z - z) < 7) return false;
  }
  for (const u of session.units.values()) {
    if (u.kind !== "building") continue;
    const ent = ctx.scene.entity.get(u.id);
    if (ent !== null && Math.hypot(ent.position[0] - x, ent.position[2] - z) < 7) return false;
  }
  return true;
}

function placeBuilding(ctx: GameContext, type: string, x: number, z: number): boolean {
  if (!canAffordBuilding(ctx, type) || !canPlaceAt(ctx, x, z)) {
    hudStore.set({ notice: "Choose clear ground on your half of the vale, away from buildings and resource nodes." });
    return false;
  }
  const result = enqueue(session.buildQueue, BUILD_CONFIG, { type, x, z });
  if (!result.ok) return false;
  session.buildQueue = result.state;
  for (const [currency, amount] of Object.entries(BUILDINGS[type]!.cost)) {
    ctx.game.economy.charge(ctx.player.userId, currency, amount);
  }
  hudStore.set({ notice: `Raising ${type.replaceAll("_", " ")} — construction is underway.` });
  return true;
}

/** Right-click order: drop an armed building, else attack a hostile / send peasants to a node / move
 * the group into a box formation. */
export function orderSelection(ctx: GameContext, input: OrderInput): GameContext {
  if (!matchRunning()) return ctx;

  const x = input.point[0];
  const z = input.point[2];

  if (session.buildArmed !== null) {
    if (placeBuilding(ctx, session.buildArmed, x, z)) session.buildArmed = null;
    return ctx;
  }

  if (session.rallyArmed) {
    session.rallyPoint = { x, z };
    session.rallyArmed = false;
    hudStore.set({ notice: "Rally set. New recruits will march to this point." });
    return ctx;
  }
  const units = selectedPlayerUnits(input.selection);
  if (units.length === 0) { hudStore.set({ notice: "Select your troops first: click a unit or drag a box around the formation." }); return ctx; }
  const armed = session.attackMoveArmed;
  session.attackMoveArmed = false;

  const targetId = enemyNear(ctx, x, z);
  if (targetId !== null) {
    hudStore.set({ notice: `Attack ordered: ${units.length} troops.` });
    for (const u of units) {
      u.guardPoint = { x, z };
      u.command = { kind: "attack", targetId };
    }
    return ctx;
  }

  const node = nodeNear(x, z);
  if (node !== null) {
    const workers = units.filter((u) => combatantDef(u.catalogId)?.worker === true);
    const rest = units.filter((u) => combatantDef(u.catalogId)?.worker !== true);
    hudStore.set({ notice: `Gathering ${node.resource}: ${workers.length} workers assigned.` });
    for (const u of workers) {
      // Repeating this order keeps harvest progress and the load already removed from the node.
      if (u.command.kind === "gather" && u.command.nodeId === node.id && u.command.resource === node.resource) continue;
      u.command = { kind: "gather", nodeId: node.id, resource: node.resource, phase: "toNode", carried: 0, timer: 0 };
    }
    if (rest.length > 0) assignMoveFormation(ctx, rest, x, z, armed);
    return ctx;
  }

  hudStore.set({ notice: `${armed ? "Advance and engage" : "Move ordered"}: ${units.length} troops.` });
  assignMoveFormation(ctx, units, x, z, armed);
  return ctx;
}

function armAttackMove(ctx: GameContext): GameContext {
  if (matchRunning()) { session.attackMoveArmed = true; session.buildArmed = null; session.rallyArmed = false; }
  return ctx;
}

/** Can the player afford `unitId` and does supply allow it? Shared by the command and the HUD gate. */
export function canTrain(ctx: GameContext, unitId: string): boolean {
  if (!matchRunning()) return false;
  if (livingUnits("player", "building").length === 0) return false;
  const def = TRAINABLE[unitId];
  if (def === undefined) return false;
  if (BARRACKS_UNITS.has(unitId) && !livingUnits("player", "building").some((u) => u.catalogId === "barracks")) return false;
  for (const [currency, amount] of Object.entries(def.cost)) {
    if (ctx.game.economy.balance(ctx.player.userId, currency) < amount) return false;
  }
  const food = COMBATANTS[unitId]?.food ?? 0;
  return usedSupply() + reservedSupply() + food <= session.supplyCap;
}

function trainUnit(ctx: GameContext, unitId: string): GameContext {
  if (!canTrain(ctx, unitId)) return ctx;
  const result = enqueue(session.production, TRAINING_CONFIG, { unitId });
  if (!result.ok) return ctx;
  session.production = result.state;
  for (const [currency, amount] of Object.entries(TRAINABLE[unitId]!.cost)) {
    ctx.game.economy.charge(ctx.player.userId, currency, amount);
  }
  return ctx;
}

function armBuild(ctx: GameContext, type: string): GameContext {
  if (matchRunning() && canAffordBuilding(ctx, type))  { session.buildArmed = type; session.rallyArmed = false; session.attackMoveArmed = false; }
  return ctx;
}

/** Can the player start the next rank of `upgradeId`? One rank of an upgrade researches at a time;
 * it needs the building, an unmet rank cap, and the gold/lumber for the next rank. Shared by the
 * command and the HUD gate. */
export function canResearch(ctx: GameContext, upgradeId: string): boolean {
  if (!matchRunning()) return false;
  const up = UPGRADES[upgradeId];
  if (up === undefined) return false;
  if (pendingRanks(upgradeId) > 0) return false; // already researching this upgrade
  const rank = upgradeRank(upgradeId);
  if (rank >= up.maxRank) return false;
  if (!livingUnits("player", "building").some((u) => u.catalogId === up.requires)) return false;
  for (const [currency, amount] of Object.entries(up.cost(rank))) {
    if (ctx.game.economy.balance(ctx.player.userId, currency) < amount) return false;
  }
  return true;
}

function research(ctx: GameContext, upgradeId: string): GameContext {
  if (!canResearch(ctx, upgradeId)) return ctx;
  const up = UPGRADES[upgradeId]!;
  const rank = upgradeRank(upgradeId);
  const result = enqueue(session.research.queue, RESEARCH_CONFIG, { upgradeId, toRank: rank + 1 });
  if (!result.ok) return ctx;
  session.research.queue = result.state;
  for (const [currency, amount] of Object.entries(up.cost(rank))) {
    ctx.game.economy.charge(ctx.player.userId, currency, amount);
  }
  return ctx;
}

export function registerCommands(ctx: GameContext): void {
  ctx.game.commands.define("unit.rally", { apply: (state) => {
    if (matchRunning()) { session.rallyArmed = true; session.buildArmed = null; session.attackMoveArmed = false; }
    return state;
  } });
  ctx.game.commands.define("unit.hold", { apply: (state) => {
    if (matchRunning()) {
      for (const u of livingUnits("player", "unit")) {
        if (combatantDef(u.catalogId)?.worker || u.command.kind === "gather") continue;
        u.command = { kind: "hold" };
      }
      hudStore.set({ notice: "Army holding position. Troops attack only enemies within weapon reach." });
    }
    return state;
  } });
  ctx.game.commands.define("unit.cancel", { apply: (state) => {
    session.buildArmed = null; session.attackMoveArmed = false; session.rallyArmed = false;
    hudStore.set({ notice: "Order canceled." });
    return state;
  } });
  ctx.game.commands.define<OrderInput>("unit.order", { apply: orderSelection });
  ctx.game.commands.define("unit.attackMove", { apply: armAttackMove });
  ctx.game.commands.define("train.peasant", { apply: (state) => trainUnit(state, "peasant") });
  ctx.game.commands.define("train.footman", { apply: (state) => trainUnit(state, "footman") });
  ctx.game.commands.define("train.rifleman", { apply: (state) => trainUnit(state, "rifleman") });
  ctx.game.commands.define<{ type: string }>("build.arm", { apply: (state, input) => armBuild(state, input.type) });
  ctx.game.commands.define("research.weapons", { apply: (state) => research(state, "weapons") });
  ctx.game.commands.define("research.armor", { apply: (state) => research(state, "armor") });
  ctx.game.commands.define("hero.ability", {
    apply: (state) => {
      if (matchRunning()) castThunderClap(state);
      return state;
    },
  });
}
