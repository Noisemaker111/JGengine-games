import { enqueue } from "@jgengine/core/gameplay";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import {
  BASE_CATALOG_ID,
  BASE_ENTITY_ID,
  GOLD_CURRENCY,
  STARTING_GOLD,
  STARTING_LIVES,
} from "../entities/base/catalog";
import { editorLayers } from "../../editorLayers";
import { TOWER_IDS, towerDef } from "../entities/towers/catalog";
import { sellValue, upgradeCost } from "../entities/towers/progression";
import { nearestPlot, type BuildPlot } from "../world/path";
import { session, nextTowerInstanceId, type TowerRuntime } from "../session";
import { KEEP_POINT } from "../world/path";
import { beginWave } from "../waves/director";
import { resetSession } from "../session";
import { resetProjectiles } from "../combat/pendingProjectiles";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { towerBuildConfig } from "./construction";

const PLOT_CLICK_RADIUS = 4.5;

export interface BuildPlaceInput {
  point: EntityPosition;
}

/** Sell/upgrade act on `instanceId` when given, else on the inspected tower (the keybind path passes no id). */
export interface TowerTargetInput {
  branch?: "power" | "reach";
  priority?: "first" | "last" | "strongest";
  instanceId?: string;
}

function rejectBuild(
  ctx: GameContext,
  input: BuildPlaceInput,
): { reason: string } | null {
  if (session.gameOver || session.victory) return { reason: "run-ended" };
  const plot = nearestPlot(input.point, PLOT_CLICK_RADIUS);
  if (plot === null)
    return session.inspectedTowerId === null ? { reason: "no-plot" } : null;
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
  const id =
    typeof input?.instanceId === "string"
      ? input.instanceId
      : session.inspectedTowerId;
  if (id === null) return null;
  return session.towers.get(id) ?? null;
}

function rejectSell(
  _ctx: GameContext,
  input: TowerTargetInput | undefined,
): { reason: string } | null {
  if (session.gameOver || session.victory) return { reason: "run-ended" };
  return targetTower(input) === null ? { reason: "no-tower" } : null;
}

function sellTower(
  ctx: GameContext,
  input: TowerTargetInput | undefined,
): GameContext {
  const tower = targetTower(input)!;
  const def = towerDef(tower.catalogId, editorLayers);
  ctx.game.economy.grant(
    ctx.player.userId,
    GOLD_CURRENCY,
    sellValue(def, tower.level),
  );
  ctx.scene.entity.despawn(tower.instanceId);
  session.towers.delete(tower.instanceId);
  session.plotOccupant.set(tower.plotId, null);
  if (session.inspectedTowerId === tower.instanceId)
    session.inspectedTowerId = null;
  return ctx;
}

function rejectUpgrade(
  ctx: GameContext,
  input: TowerTargetInput | undefined,
): { reason: string } | null {
  const tower = targetTower(input);
  if (session.gameOver || session.victory) return { reason: "run-ended" };
  if (tower === null) return { reason: "no-tower" };
  const cost = upgradeCost(
    towerDef(tower.catalogId, editorLayers),
    tower.level,
  );
  if (cost === null) return { reason: "max-level" };
  if (ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY) < cost)
    return { reason: "insufficient-gold" };
  return null;
}

function upgradeTower(
  ctx: GameContext,
  input: TowerTargetInput | undefined,
): GameContext {
  const tower = targetTower(input)!;
  const cost = upgradeCost(
    towerDef(tower.catalogId, editorLayers),
    tower.level,
  )!;
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
  ctx.game.commands.define("beginWave", {
    validate: () =>
      session.gameOver || session.victory
        ? { reason: "run-ended" }
        : !session.planning
          ? { reason: "wave-active" }
          : session.paused
            ? { reason: "paused" }
            : null,
    apply: (state) => {
      beginWave(state);
      return state;
    },
  });
  ctx.game.commands.define("togglePause", {
    apply: (state) => {
      session.paused = !session.paused;
      state.touch();
      return state;
    },
  });
  ctx.game.commands.define("rally", {
    validate: () =>
      session.planning || session.paused || session.gameOver || session.victory
        ? { reason: "battle-only" }
        : session.rallyCooldown > 0
          ? { reason: "cooldown" }
          : session.reserve < 20
            ? { reason: "insufficient-reserve" }
            : null,
    apply: (state) => {
      session.reserve -= 20;
      session.rallySeconds = 6;
      session.rallyCooldown = 25;
      state.touch();
      return state;
    },
  });
  ctx.game.commands.define("repairKeep", {
    validate: (state) =>
      !session.planning || session.gameOver || session.victory
        ? { reason: "planning-only" }
        : (state.scene.entity.stats.get(BASE_ENTITY_ID, "lives")?.current ??
              20) >= STARTING_LIVES
          ? { reason: "keep-full" }
          : state.game.economy.balance(state.player.userId, GOLD_CURRENCY) < 35
            ? { reason: "insufficient-gold" }
            : null,
    apply: (state) => {
      state.game.economy.charge(state.player.userId, GOLD_CURRENCY, 35);
      state.scene.entity.stats.delta(BASE_ENTITY_ID, "lives", 4);
      return state;
    },
  });
  ctx.game.commands.define<TowerTargetInput>("specializeTower", {
    validate: (_state, input) => {
      const tower = targetTower(input);
      if (!tower || tower.level < 2) return { reason: "upgrade-first" };
      if (tower.branch) return { reason: "already-specialized" };
      return input.branch === "power" || input.branch === "reach"
        ? null
        : { reason: "invalid-branch" };
    },
    apply: (state, input) => {
      targetTower(input)!.branch = input.branch;
      state.touch();
      return state;
    },
  });
  ctx.game.commands.define<TowerTargetInput>("setTargetPriority", {
    validate: (_state, input) =>
      !targetTower(input)
        ? { reason: "no-tower" }
        : input.priority === "first" ||
            input.priority === "last" ||
            input.priority === "strongest"
          ? null
          : { reason: "invalid-priority" },
    apply: (state, input) => {
      targetTower(input)!.priority = input.priority;
      state.touch();
      return state;
    },
  });
  ctx.game.commands.define("saveRun", {
    apply: (state) => {
      session.savedMessage = "Saving…";
      void state.game.save?.save().then(() => {
        session.savedMessage =
          state.game.save?.status() === "error"
            ? "Save failed."
            : "Saved to this device.";
        state.touch();
      });
      state.touch();
      return state;
    },
  });
  ctx.game.commands.define("loadRun", {
    apply: (state) => {
      session.savedMessage = "Loading…";
      session.paused = true;
      void state.game.save?.load().then((loaded) => {
        resetProjectiles();
        session.savedMessage = loaded
          ? "Loaded. Resume when ready."
          : "No saved run on this device.";
        state.touch();
      });
      state.touch();
      return state;
    },
  });
  ctx.game.commands.define("restartRun", {
    apply: (state) => {
      for (const tower of session.towers.values())
        state.scene.entity.despawn(tower.instanceId);
      for (const creep of session.creeps.values())
        state.scene.entity.despawn(creep.instanceId);
      resetSession();
      resetProjectiles();
      const gold = state.game.economy.balance(
        state.player.userId,
        GOLD_CURRENCY,
      );
      state.game.economy.charge(state.player.userId, GOLD_CURRENCY, gold);
      state.game.economy.grant(
        state.player.userId,
        GOLD_CURRENCY,
        STARTING_GOLD,
      );
      state.scene.entity.spawn(BASE_CATALOG_ID, {
        id: BASE_ENTITY_ID,
        position: KEEP_POINT,
        role: "prop",
        onExisting: "replace",
      });
      state.scene.entity.stats.set(BASE_ENTITY_ID, "lives", {
        current: STARTING_LIVES,
      });
      setGamePhase(state, "playing");
      state.touch();
      return state;
    },
  });
  TOWER_IDS.forEach((id, index) => {
    ctx.game.commands.define(`buildTower${index + 1}`, selectTowerCommand(id));
  });
}
