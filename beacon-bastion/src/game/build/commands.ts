import { enqueue } from "@jgengine/core/gameplay";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { GOLD_CURRENCY } from "../entities/base/catalog";
import { editorLayers } from "../../editorLayers";
import { TOWER_IDS, towerDef } from "../entities/towers/catalog";
import { sellValue, upgradeCost } from "../entities/towers/progression";
import { nearestPlot, type BuildPlot } from "../world/path";
import { session, nextTowerInstanceId, type TowerRuntime } from "../session";
import { towerBuildConfig } from "./construction";

const PLOT_CLICK_RADIUS = 4.5;

export interface BuildPlaceInput {
  point: EntityPosition;
}

/** Sell/upgrade act on `instanceId` when given, else on the inspected tower (the keybind path passes no id). */
export interface TowerTargetInput {
  instanceId?: string;
}

function rejectBuild(ctx: GameContext, input: BuildPlaceInput): { reason: string } | null {
  const plot = nearestPlot(input.point, PLOT_CLICK_RADIUS);
  if (plot === null) return session.inspectedTowerId === null ? { reason: "no-plot" } : null;
  if (session.plotOccupant.get(plot.id) !== null) return null;
  const towerId = session.selectedTowerId;
  if (towerId === null) return { reason: "no-tower-selected" };
  const def = towerDef(towerId, editorLayers);
  if (ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY) < def.cost) {
    return { reason: "insufficient-gold" };
  }
  return null;
}

function placeTower(ctx: GameContext, plot: BuildPlot): void {
  const towerId = session.selectedTowerId!;
  const def = towerDef(towerId, editorLayers);
  const instanceId = nextTowerInstanceId();
  // Queue the construction; the completion adapter (tickConstruction) spawns the
  // tower entity. Charge gold and reserve the plot now so the cost and occupancy
  // are immediate — the construction system raises the tower (instant when
  // buildSeconds is 0, otherwise over its build time).
  const queued = enqueue(session.buildQueue, towerBuildConfig, {
    towerId,
    plotId: plot.id,
    instanceId,
    position: plot.position,
    userId: ctx.player.userId,
  });
  if (!queued.ok) return;
  session.buildQueue = queued.state;
  ctx.game.economy.charge(ctx.player.userId, GOLD_CURRENCY, def.cost);
  session.plotOccupant.set(plot.id, instanceId);
}

function clickPlot(ctx: GameContext, input: BuildPlaceInput): GameContext {
  const plot = nearestPlot(input.point, PLOT_CLICK_RADIUS);
  if (plot === null) {
    session.inspectedTowerId = null;
    return ctx;
  }
  const occupant = session.plotOccupant.get(plot.id) ?? null;
  if (occupant !== null) {
    session.inspectedTowerId = occupant;
    return ctx;
  }
  session.inspectedTowerId = null;
  placeTower(ctx, plot);
  return ctx;
}

function targetTower(input: TowerTargetInput | undefined): TowerRuntime | null {
  const id = typeof input?.instanceId === "string" ? input.instanceId : session.inspectedTowerId;
  if (id === null) return null;
  return session.towers.get(id) ?? null;
}

function rejectSell(_ctx: GameContext, input: TowerTargetInput | undefined): { reason: string } | null {
  return targetTower(input) === null ? { reason: "no-tower" } : null;
}

function sellTower(ctx: GameContext, input: TowerTargetInput | undefined): GameContext {
  const tower = targetTower(input)!;
  const def = towerDef(tower.catalogId, editorLayers);
  ctx.game.economy.grant(ctx.player.userId, GOLD_CURRENCY, sellValue(def, tower.level));
  ctx.scene.entity.despawn(tower.instanceId);
  session.towers.delete(tower.instanceId);
  session.plotOccupant.set(tower.plotId, null);
  if (session.inspectedTowerId === tower.instanceId) session.inspectedTowerId = null;
  return ctx;
}

function rejectUpgrade(ctx: GameContext, input: TowerTargetInput | undefined): { reason: string } | null {
  const tower = targetTower(input);
  if (tower === null) return { reason: "no-tower" };
  const cost = upgradeCost(towerDef(tower.catalogId, editorLayers), tower.level);
  if (cost === null) return { reason: "max-level" };
  if (ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY) < cost) return { reason: "insufficient-gold" };
  return null;
}

function upgradeTower(ctx: GameContext, input: TowerTargetInput | undefined): GameContext {
  const tower = targetTower(input)!;
  const cost = upgradeCost(towerDef(tower.catalogId, editorLayers), tower.level)!;
  ctx.game.economy.charge(ctx.player.userId, GOLD_CURRENCY, cost);
  tower.level += 1;
  return ctx;
}

function selectTowerCommand(id: string) {
  return {
    apply(state: GameContext): GameContext {
      session.selectedTowerId = session.selectedTowerId === id ? null : id;
      return state;
    },
  };
}

export function registerBuildCommands(ctx: GameContext): void {
  ctx.game.commands.define<BuildPlaceInput>("tower.build", {
    validate: rejectBuild,
    apply: clickPlot,
  });
  ctx.game.commands.define<TowerTargetInput | undefined>("sellTower", {
    validate: rejectSell,
    apply: sellTower,
  });
  ctx.game.commands.define<TowerTargetInput | undefined>("upgradeTower", {
    validate: rejectUpgrade,
    apply: upgradeTower,
  });
  TOWER_IDS.forEach((id, index) => {
    ctx.game.commands.define(`buildTower${index + 1}`, selectTowerCommand(id));
  });
}
