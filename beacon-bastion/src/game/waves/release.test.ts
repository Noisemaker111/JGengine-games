import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { content } from "../content";
import { BASE_CATALOG_ID, BASE_ENTITY_ID, GOLD_CURRENCY, STARTING_GOLD, STARTING_LIVES } from "../entities/base/catalog";
import { session } from "../session";
import { setupWorld } from "../world/setup";
import { tickWaves, waveOverlapBonus } from "./director";
import { SPAWN_DIRECTOR_CONFIG } from "./manifest";

let runner: HeadlessRunner;
const gold = () => runner.ctx.game.economy.balance(runner.ctx.player.userId, GOLD_CURRENCY);
beforeEach(() => {
  runner = createHeadlessRunner({ definition: defineGameDefinition({ name: "Beacon release", multiplayer: "off" }), content, loop: { onInit: setupWorld, onNewPlayer() {} } });
});

function finishRelease(): void {
  runner.ui.invoke("wave.send", {});
  for (let i = 0; i < 40; i++) tickWaves(runner.ctx, 0.5);
  expect(session.waveReady).toBe(true);
}

describe("player released assaults", () => {
  test("preparation can last indefinitely and next assault waits for an explicit command", () => {
    tickWaves(runner.ctx, 120);
    expect(session.creeps.size).toBe(0);
    expect(session.director.waveElapsed).toBe(0);
    finishRelease();
    expect(session.director.wave).toBe(0);
    expect(session.creeps.size).toBeGreaterThan(0);
    tickWaves(runner.ctx, 0.5);
    expect(session.director.wave).toBe(0);
    expect(session.director.waveElapsed).toBe(SPAWN_DIRECTOR_CONFIG.waves[0]!.duration!);
  });

  test("overlapping a live assault pays a bounded bounty once, waiting for clearance pays none", () => {
    finishRelease();
    const bonus = waveOverlapBonus();
    expect(bonus).toBeGreaterThan(0);
    expect(bonus).toBeLessThanOrEqual(20);
    const before = gold();
    runner.ui.invoke("wave.send", {});
    expect(session.director.wave).toBe(1);
    expect(gold()).toBe(before + bonus);
    expect(runner.ui.tryInvoke("wave.send", {}).status).toBe("rejected");
    expect(gold()).toBe(before + bonus);
    session.waveReady = true;
    for (const id of session.creeps.keys()) runner.ctx.scene.entity.despawn(id);
    session.creeps.clear();
    const cleared = gold();
    runner.ui.invoke("wave.send", {});
    expect(session.lastWaveBonus).toBe(0);
    expect(gold()).toBe(cleared);
  });

  test("clearing the final assault wins, and victory retry resets the run", () => {
    // This models perfect kills to exercise the complete release sequence, not tower balance.
    for (const wave of SPAWN_DIRECTOR_CONFIG.waves) {
      runner.ui.invoke("wave.send", {});
      for (let elapsed = 0; elapsed < wave.duration!; elapsed += 0.5) {
        tickWaves(runner.ctx, 0.5);
        for (const id of [...session.creeps.keys()]) {
          runner.ctx.scene.entity.effect({ from: BASE_ENTITY_ID, to: id, effect: "damage", via: { amount: 1000 } });
        }
      }
    }
    tickWaves(runner.ctx, 0.1);
    expect(session.victory).toBe(true);
    expect(gamePhase(runner.ctx)).toBe("ended");
    runner.ui.invoke("defense.restart", {});
    expect(session.victory).toBe(false);
    expect(session.director.done).toBe(false);
    expect(session.waveReady).toBe(true);
    expect(gold()).toBe(STARTING_GOLD);
  });

  test("defeat retry restores lives, purse and preparation, without duplicating kill rewards", () => {
    runner.ctx.game.economy.charge(runner.ctx.player.userId, GOLD_CURRENCY, 30);
    runner.ctx.game.events.emit("entity.died", { instanceId: BASE_ENTITY_ID, catalogId: BASE_CATALOG_ID, reason: { kind: "environment", source: "test" }, position: [0, 0, 0] });
    expect(gamePhase(runner.ctx)).toBe("ended");
    runner.ui.invoke("defense.restart", {});
    expect(gamePhase(runner.ctx)).toBe("playing");
    expect(session.waveReady).toBe(true);
    expect(session.gameOver).toBe(false);
    expect(session.director.wave).toBe(0);
    expect(gold()).toBe(STARTING_GOLD);
    expect(runner.ctx.scene.entity.stats.get(BASE_ENTITY_ID, "lives")?.current).toBe(STARTING_LIVES);
    const before = gold();
    runner.ctx.game.events.emit("entity.died", { instanceId: "one-scout", catalogId: "raider_scout", reason: { kind: "environment", source: "test" }, position: [0, 0, 0] });
    expect(gold() - before).toBe(4);
    expect(runner.ui.tryInvoke("defense.restart", {}).status).toBe("rejected");
  });
});
