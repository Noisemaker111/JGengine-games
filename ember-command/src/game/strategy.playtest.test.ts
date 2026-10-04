import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { onInit, onNewPlayer, onTick } from "../loop";
import { content } from "./content";
import { systems } from "./systems";
import { livingUnits, session, snapshotSession } from "./session";
import { battleSave } from "./persistence";
import { GOLD, LUMBER } from "./tuning";

function boot(): HeadlessRunner {
  const definition = defineGameDefinition({ name: "Independent Ember strategy", multiplayer: "off", systems, loop: { onInit(ctx) { battleSave(ctx, memorySaveBackend()); onInit(ctx); }, onNewPlayer, onTick } });
  return createHeadlessRunner({ definition, content, loop: definition.loop, maxStepSeconds: .1 });
}
function step(runner: HeadlessRunner, seconds: number): void { for (let i = 0; i < seconds * 10; i++) runner.step(.1); }
function build(runner: HeadlessRunner, type: string, dx: number): void {
  const keep = livingUnits("player", "building").find(unit => unit.catalogId === "keep_player")!;
  const position = runner.ctx.scene.entity.get(keep.id)!.position;
  runner.ui.invoke("build.arm", { type });
  runner.ui.invoke("unit.order", { selection: [], point: [position[0] + dx, 0, position[2]] });
}
function campaign(armor: boolean) {
  const runner = boot();
  runner.ui.invoke("match.start");
  const workers = livingUnits("player", "unit").filter(unit => unit.catalogId === "peasant");
  const nodes = [...session.nodes.values()];
  for (let i = 0; i < workers.length; i++) {
    const node = nodes.filter(node => node.resource === (i === 0 ? LUMBER : GOLD)).sort((a, b) => Math.hypot(a.x, a.z - 30) - Math.hypot(b.x, b.z - 30))[0]!;
    runner.ui.invoke("unit.order", { selection: [workers[i]!.id], point: [node.x, 0, node.z] });
  }
  build(runner, "barracks", 10);
  for (let seconds = 0; seconds < 600 && !session.over; seconds++) {
    if (seconds >= 40 && seconds % 20 === 0) {
      runner.ui.tryInvoke("train.footman");
      runner.ui.tryInvoke("train.rifleman");
      runner.ui.tryInvoke("hero.ability");
    }
    if (seconds === 55) build(runner, "farm", -10);
    if (seconds === 21) runner.ui.invoke(armor ? "research.armor" : "research.weapons");
    if (seconds === 45) build(runner, "guard_tower", 0);
    if (seconds >= (armor ? 100 : 60) && seconds % 20 === 0) {
      const enemy = livingUnits("enemy", "building").find(unit => unit.catalogId === "keep_enemy");
      if (enemy) {
        runner.ui.invoke("unit.attackMove");
        const ep = runner.ctx.scene.entity.get(enemy.id)!.position;
        runner.ui.invoke("unit.order", { selection: livingUnits("player", "unit").filter(unit => unit.catalogId !== "peasant").map(unit => unit.id), point: [ep[0], ep[1], ep[2] + 10] });
      }
    }
    step(runner, 1);
  }
  return { victory: session.victory, elapsed: session.elapsed, research: structuredClone(session.research.ranks), waves: session.enemyWave.sent, gold: runner.ctx.game.economy.balance(runner.userId, GOLD) };
}

describe("independent full skirmish playtests", () => {
  test("gathering funds construction, mixed troops, and either offensive or defensive doctrine victory", () => {
    const offense = campaign(false);
    const defense = campaign(true);
    expect(offense.victory).toBe(true);
    expect(defense.victory).toBe(true);
    expect(offense.research.weapons).toBe(1);
    expect(offense.research.armor ?? 0).toBe(0);
    expect(defense.research.armor).toBe(1);
    expect(defense.research.weapons ?? 0).toBe(0);
    expect(defense.elapsed).toBeGreaterThan(offense.elapsed);
    expect(offense.waves).toBeGreaterThan(2);
    expect(defense.gold).not.toBe(offense.gold);
  });
  test("idle economy and army eventually lose to escalating raids", () => {
    const runner = boot();
    runner.ui.invoke("match.start");
    for (let seconds = 0; seconds < 600 && !session.over; seconds++) step(runner, 1);
    expect(session.over).toBe(true);
    expect(session.victory).toBe(false);
    expect(session.enemyWave.sent).toBeGreaterThan(2);
  });
  test("a downed hero waits, costs recovery gold, and returns at level one", () => {
    const runner = boot();
    runner.ui.invoke("match.start");
    runner.ctx.scene.entity.effect({ from: "grunt", to: "hero", effect: "damage", via: { amount: 9999 } });
    expect(session.units.has("hero")).toBe(false);
    runner.ui.invoke("match.recover");
    expect(session.units.has("hero")).toBe(false);
    step(runner, 21);
    const gold = runner.ctx.game.economy.balance(runner.userId, GOLD);
    runner.ui.invoke("match.recover");
    expect(session.units.has("hero")).toBe(true);
    expect(runner.ctx.game.economy.balance(runner.userId, GOLD)).toBe(gold - 100);
    expect(runner.ctx.scene.entity.stats.get("hero", "health")!.current).toBeGreaterThan(0);
  });
  test("pause and real save/load restore an active gathering and construction plan", async () => {
    const runner = boot();
    runner.ui.invoke("match.start");
    build(runner, "barracks", 10);
    step(runner, 2);
    runner.ui.invoke("match.pause");
    const frozen = snapshotSession();
    step(runner, 3);
    expect(snapshotSession()).toEqual(frozen);
    const save = battleSave(runner.ctx);
    await save.save();
    runner.ui.invoke("match.resume");
    step(runner, 20);
    expect(session.elapsed).toBeGreaterThan(frozen.elapsed);
    expect(await save.load()).toBe(true);
    expect(snapshotSession()).toEqual(frozen);
    expect(session.paused).toBe(true);
  });
});
