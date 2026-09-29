import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { content } from "../content";
import { GOLD_CURRENCY, STARTING_GOLD } from "../entities/base/catalog";
import { TOWER_CATALOG } from "../entities/towers/catalog";
import { sellValue, upgradeCost } from "../entities/towers/progression";
import { session } from "../session";
import { setupWorld } from "../world/setup";
import { BUILD_PLOTS } from "../world/path";
import { physics, world } from "../../world";
import { tickConstruction } from "./construction";

const archer = TOWER_CATALOG.tower_archer!;
const cannon = TOWER_CATALOG.tower_cannon!;

let runner: HeadlessRunner;

function gold(): number {
  return runner.ctx.game.economy.balance(runner.ctx.player.userId, GOLD_CURRENCY);
}

function plotPoint(index: number): readonly [number, number, number] {
  return BUILD_PLOTS[index]!.position;
}

function build(slot: 1 | 2 | 3, plotIndex: number): string {
  runner.ui.invoke(`buildTower${slot}`, {});
  runner.ui.invoke("tower.build", { point: plotPoint(plotIndex) });
  runner.ui.invoke(`buildTower${slot}`, {});
  tickConstruction(runner.ctx, 1 / 60);
  return session.plotOccupant.get(BUILD_PLOTS[plotIndex]!.id)!;
}

beforeEach(() => {
  runner = createHeadlessRunner({
    definition: defineGameDefinition({ name: "Beacon Bastion (test)", world, physics }),
    content,
    loop: { onInit: setupWorld, onNewPlayer() {} },
  });
});

describe("tower.build on plots", () => {
  test("placing spawns the tower entity and reserves the plot", () => {
    const id = build(1, 0);
    expect(runner.ctx.scene.entity.get(id)).not.toBeNull();
    expect(session.towers.get(id)?.level).toBe(1);
    expect(gold()).toBe(STARTING_GOLD - archer.cost);
  });

  test("clicking an occupied plot inspects its tower instead of rejecting", () => {
    const id = build(1, 0);
    runner.ui.invoke("buildTower2", {});
    const result = runner.ui.tryInvoke("tower.build", { point: plotPoint(0) });
    expect(result.status).toBe("applied");
    expect(session.inspectedTowerId).toBe(id);
    expect(gold()).toBe(STARTING_GOLD - archer.cost);
  });

  test("clicking open ground closes the inspect panel", () => {
    build(1, 0);
    runner.ui.invoke("tower.build", { point: plotPoint(0) });
    expect(session.inspectedTowerId).not.toBeNull();
    runner.ui.invoke("tower.build", { point: [500, 0, 500] });
    expect(session.inspectedTowerId).toBeNull();
  });

  test("an empty plot with nothing selected still rejects", () => {
    expect(runner.ui.tryInvoke("tower.build", { point: plotPoint(1) })).toEqual({ status: "rejected", reason: "no-tower-selected" });
  });
});

describe("sellTower", () => {
  test("refunds the sell value, despawns the tower, and frees the plot", () => {
    const id = build(2, 0);
    const before = gold();
    runner.ui.invoke("sellTower", { instanceId: id });
    expect(gold()).toBe(before + sellValue(cannon, 1));
    expect(runner.ctx.scene.entity.get(id)).toBeNull();
    expect(session.towers.has(id)).toBe(false);
    expect(session.plotOccupant.get(BUILD_PLOTS[0]!.id)).toBeNull();
  });

  test("acts on the inspected tower when no id is given (keybind path)", () => {
    const id = build(1, 0);
    runner.ui.invoke("tower.build", { point: plotPoint(0) });
    runner.ui.invoke("sellTower", { yaw: 0, pitch: 0 });
    expect(session.towers.has(id)).toBe(false);
    expect(session.inspectedTowerId).toBeNull();
  });

  test("rejects when nothing is inspected", () => {
    expect(runner.ui.tryInvoke("sellTower", {})).toEqual({ status: "rejected", reason: "no-tower" });
  });

  test("a freed plot accepts a new tower", () => {
    const first = build(1, 0);
    runner.ui.invoke("sellTower", { instanceId: first });
    const second = build(3, 0);
    expect(second).not.toBe(first);
    expect(session.towers.get(second)?.catalogId).toBe("tower_frost");
  });
});

describe("upgradeTower", () => {
  test("charges the upgrade cost and raises the level", () => {
    const id = build(1, 0);
    const before = gold();
    runner.ui.invoke("upgradeTower", { instanceId: id });
    expect(session.towers.get(id)?.level).toBe(2);
    expect(gold()).toBe(before - upgradeCost(archer, 1)!);
  });

  test("rejects without enough gold and at max level", () => {
    const id = build(2, 0);
    expect(runner.ui.tryInvoke("upgradeTower", { instanceId: id })).toEqual({ status: "rejected", reason: "insufficient-gold" });
    runner.ctx.game.economy.grant(runner.ctx.player.userId, GOLD_CURRENCY, 10_000);
    runner.ui.invoke("upgradeTower", { instanceId: id });
    runner.ui.invoke("upgradeTower", { instanceId: id });
    expect(session.towers.get(id)?.level).toBe(3);
    expect(runner.ui.tryInvoke("upgradeTower", { instanceId: id })).toEqual({ status: "rejected", reason: "max-level" });
  });

  test("selling an upgraded tower refunds against everything invested", () => {
    const id = build(1, 0);
    runner.ui.invoke("upgradeTower", { instanceId: id });
    const before = gold();
    runner.ui.invoke("sellTower", { instanceId: id });
    expect(gold()).toBe(before + sellValue(archer, 2));
  });
});
