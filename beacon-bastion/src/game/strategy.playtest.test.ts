import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import {
  createHeadlessRunner,
  type HeadlessRunner,
} from "@jgengine/core/runtime/headlessRunner";
import { loop } from "../loop";
import { content } from "./content";
import { systems } from "./systems";
import { session, snapshotSession } from "./session";
import { BUILD_PLOTS } from "./world/path";

function boot(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Independent Beacon strategy",
    multiplayer: "off",
    systems,
    loop,
    persist: { mode: "manual", storage: "memory", version: 2 },
  });
  return createHeadlessRunner({
    definition,
    content,
    loop: definition.loop,
    maxStepSeconds: 0.1,
  });
}
function step(runner: HeadlessRunner, seconds: number): void {
  for (let i = 0; i < seconds * 10; i++) runner.step(0.1);
}
function build(runner: HeadlessRunner, type: string, index: number): void {
  runner.ui.tryInvoke(type);
  runner.ui.tryInvoke("tower.build", { point: BUILD_PLOTS[index]!.position });
  step(runner, 1);
}
function fight(runner: HeadlessRunner): void {
  runner.ui.invoke("beginWave");
  for (
    let i = 0;
    i < 3000 && !session.planning && !session.gameOver && !session.victory;
    i++
  ) {
    if (session.creeps.size >= 4) runner.ui.tryInvoke("rally");
    runner.step(0.1);
  }
  expect(session.planning || session.gameOver || session.victory).toBe(true);
}
function campaign(mixed: boolean) {
  const runner = boot();
  const order = mixed
    ? ["buildTower2", "buildTower1", "buildTower3"]
    : ["buildTower1"];
  const reports: string[] = [];
  for (let wave = 0; wave < 6 && !session.gameOver; wave++) {
    for (let i = 0; i < BUILD_PLOTS.length; i++)
      if (session.plotOccupant.get(BUILD_PLOTS[i]!.id) === null)
        build(runner, order[i % order.length]!, i);
    for (const tower of session.towers.values()) {
      runner.ui.tryInvoke("upgradeTower", { instanceId: tower.instanceId });
      runner.ui.tryInvoke("specializeTower", {
        instanceId: tower.instanceId,
        branch: mixed ? "power" : "reach",
      });
      runner.ui.tryInvoke("setTargetPriority", {
        instanceId: tower.instanceId,
        priority: mixed ? "strongest" : "first",
      });
    }
    runner.ui.tryInvoke("repairKeep");
    fight(runner);
    reports.push(session.lastReport);
  }
  return {
    runner,
    victory: session.victory,
    lives: runner.ctx.scene.entity.stats.get("keep", "lives")!.current,
    gold: runner.ctx.game.economy.balance(runner.userId, "gold"),
    types: [
      ...new Set([...session.towers.values()].map((tower) => tower.catalogId)),
    ],
    reports,
  };
}

describe("independent full campaign playtests", () => {
  test("earned-income reach archers and power combined arms both clear all six waves", async () => {
    const archers = campaign(false);
    const mixed = campaign(true);
    expect(archers.victory).toBe(true);
    expect(mixed.victory).toBe(true);
    expect(archers.reports).toHaveLength(6);
    expect(mixed.reports).toHaveLength(6);
    expect(archers.lives).toBeGreaterThan(0);
    expect(mixed.lives).toBeGreaterThan(0);
    expect(archers.types).toEqual(["tower_archer"]);
    expect(mixed.types).toContain("tower_cannon");
    expect(mixed.types).toContain("tower_frost");
    expect(archers.gold).not.toBe(mixed.gold);
    const won = snapshotSession();
    const specialized = [...session.towers.values()].filter(
      (tower) => tower.branch !== undefined,
    );
    expect(specialized.length).toBeGreaterThan(0);
    expect(
      specialized.every(
        (tower) => tower.branch === "power" && tower.priority === "strongest",
      ),
    ).toBe(true);
    await mixed.runner.ctx.game.save!.save();
    mixed.runner.ui.invoke("restartRun");
    expect(session.victory).toBe(false);
    expect(await mixed.runner.ctx.game.save!.load()).toBe(true);
    expect(session.victory).toBe(true);
    expect(session.gameOver).toBe(false);
    expect({ ...snapshotSession(), savedMessage: won.savedMessage }).toEqual({
      ...won,
      paused: true,
    });
  });
  test("neglect leaks lives; planning repairs and a rebuilt defense recover", () => {
    const runner = boot();
    fight(runner);
    const damaged = runner.ctx.scene.entity.stats.get("keep", "lives")!.current;
    expect(damaged).toBeLessThan(20);
    expect(session.gameOver).toBe(false);
    runner.ui.invoke("repairKeep");
    expect(
      runner.ctx.scene.entity.stats.get("keep", "lives")!.current,
    ).toBeGreaterThan(damaged);
    build(runner, "buildTower2", 0);
    build(runner, "buildTower1", 1);
    fight(runner);
    expect(session.gameOver).toBe(false);
    expect(session.lastReport).toContain("Wave 2");
  });
  test("a sparse opening without reinvestment fails under escalation", () => {
    const runner = boot();
    build(runner, "buildTower1", 0);
    for (let wave = 0; wave < 6 && !session.gameOver; wave++) fight(runner);
    expect(session.gameOver).toBe(true);
    expect(session.victory).toBe(false);
    expect(session.waveIndex).toBeGreaterThan(0);
  });
  test("restored previously killed enemies and keep can die again", async () => {
    const runner = boot();
    runner.ui.invoke("beginWave");
    step(runner, 3);
    const creep = [...session.creeps.values()][0]!;
    expect(creep).toBeDefined();
    await runner.ctx.game.save!.save();
    runner.ctx.scene.entity.effect({
      from: "keep",
      to: creep.instanceId,
      effect: "damage",
      via: { amount: 9999 },
    });
    expect(runner.ctx.scene.entity.get(creep.instanceId)).toBeNull();
    expect(await runner.ctx.game.save!.load()).toBe(true);
    expect(runner.ctx.scene.entity.get(creep.instanceId)).not.toBeNull();
    runner.ctx.scene.entity.effect({
      from: "keep",
      to: creep.instanceId,
      effect: "damage",
      via: { amount: 9999 },
    });
    expect(runner.ctx.scene.entity.get(creep.instanceId)).toBeNull();
    runner.ctx.scene.entity.effect({
      from: creep.instanceId,
      to: "keep",
      effect: "leak",
      via: { amount: 9999 },
    });
    expect(session.gameOver).toBe(true);
    expect(await runner.ctx.game.save!.load()).toBe(true);
    expect(session.gameOver).toBe(false);
    runner.ctx.scene.entity.effect({
      from: creep.instanceId,
      to: "keep",
      effect: "leak",
      via: { amount: 9999 },
    });
    expect(session.gameOver).toBe(true);
  });
  test("pause freezes active combat and a real save/load restores paths, resources and upgrades", async () => {
    const runner = boot();
    build(runner, "buildTower3", 0);
    runner.ui.invoke("beginWave");
    step(runner, 3);
    runner.ui.invoke("togglePause");
    const frozen = snapshotSession();
    step(runner, 2);
    expect(snapshotSession()).toEqual(frozen);
    expect(runner.ctx.game.save).toBeDefined();
    await runner.ctx.game.save!.save();
    runner.ui.invoke("togglePause");
    step(runner, 10);
    expect(session.combatSeconds).toBeGreaterThan(frozen.combatSeconds);
    expect(await runner.ctx.game.save!.load()).toBe(true);
    expect({ ...snapshotSession(), savedMessage: frozen.savedMessage }).toEqual(
      frozen,
    );
    expect(session.paused).toBe(true);
  });
});
