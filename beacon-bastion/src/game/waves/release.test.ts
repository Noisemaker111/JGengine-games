import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { expandWave } from "@jgengine/core/ai/director/encounter";
import { content } from "../content";
import { BASE_CATALOG_ID, BASE_ENTITY_ID, GOLD_CURRENCY, STARTING_GOLD, STARTING_LIVES } from "../entities/base/catalog";
import { resetSession, session } from "../session";
import { setupWorld } from "../world/setup";
import { readPressure, tickWaves, waveOverlapBonus } from "./director";
import { legacy, openingGold, openingLives } from "./legacy";
import { DIRECTOR_SEED, AUTHORED_WAVES, ENCOUNTER, PRESSURE_RULE, TOTAL_WAVES, WARDEN_ID, bossProfile } from "./manifest";

const wardenProfile = bossProfile(WARDEN_ID)!;

let runner: HeadlessRunner;
const gold = () => runner.ctx.game.economy.balance(runner.ctx.player.userId, GOLD_CURRENCY);
beforeEach(() => {
  resetSession();
  runner = createHeadlessRunner({ definition: defineGameDefinition({ name: "Beacon release", multiplayer: "off" }), content, loop: { onInit: setupWorld, onNewPlayer() {} } });
});

const waveDuration = (index: number) => ENCOUNTER.waves[index]!.durationSeconds ?? 20;

function finishRelease(wave = 0): void {
  runner.ui.invoke("wave.send", {});
  for (let elapsed = 0; elapsed < waveDuration(wave); elapsed += 0.5) tickWaves(runner.ctx, 0.5);
  expect(session.waveReady).toBe(true);
}

/** Reach the Warden's authored wave without playing five releases. */
function reachWarden(): void {
  session.encounter.openWave(AUTHORED_WAVES.length - 1, session.pressure);
  session.waveReady = false;
  tickWaves(runner.ctx, 10.5);
}

function warden() {
  for (const creep of session.creeps.values()) if (creep.catalogId === "raider_warden") return creep;
  return null;
}

describe("player released assaults", () => {
  test("preparation can last indefinitely and the next assault waits for a command", () => {
    tickWaves(runner.ctx, 120);
    expect(session.creeps.size).toBe(0);
    expect(session.encounter.view().emitted).toBe(0);
    finishRelease();
    expect(session.encounter.view().wave).toBe(1);
    expect(session.creeps.size).toBeGreaterThan(0);
  });

  test("an assault trickles in over its release window instead of dumping", () => {
    runner.ui.invoke("wave.send", {});
    tickWaves(runner.ctx, 0.5);
    const early = session.creeps.size;
    for (let elapsed = 0; elapsed < 8; elapsed += 0.5) tickWaves(runner.ctx, 0.5);
    expect(early).toBeLessThan(session.creeps.size);
    expect(session.encounter.view().ready).toBe(false);
  });

  test("overlapping a live assault pays a bounded bounty once, waiting for clearance pays none", () => {
    finishRelease();
    const bonus = waveOverlapBonus();
    expect(bonus).toBeGreaterThan(0);
    expect(bonus).toBeLessThanOrEqual(20);
    const before = gold();
    runner.ui.invoke("wave.send", {});
    expect(session.encounter.view().wave).toBe(2);
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
    // Models perfect kills to exercise the release sequence, not tower balance.
    for (let wave = 0; wave < TOTAL_WAVES; wave += 1) {
      runner.ui.invoke("wave.send", {});
      for (let elapsed = 0; elapsed < waveDuration(wave); elapsed += 0.5) {
        tickWaves(runner.ctx, 0.5);
        for (const id of [...session.creeps.keys()]) {
          runner.ctx.scene.entity.effect({ from: BASE_ENTITY_ID, to: id, effect: "damage", via: { amount: 5000 } });
        }
      }
    }
    tickWaves(runner.ctx, 0.1);
    expect(session.victory).toBe(true);
    expect(gamePhase(runner.ctx)).toBe("ended");
    const banked = legacy.read(runner.ctx);
    expect(banked.run.completed).toBe(1);
    expect(banked.bankedGold).toBeGreaterThan(0);
    expect(banked.offer).toHaveLength(3);
    runner.ui.invoke("defense.restart", {});
    expect(session.victory).toBe(false);
    expect(session.encounter.view().done).toBe(false);
    expect(session.waveReady).toBe(true);
    // The next defense opens on the bank the last one left, not the flat starting purse.
    expect(gold()).toBe(openingGold(banked));
    expect(gold()).toBeGreaterThan(STARTING_GOLD);
  });

  test("defeat retry restores lives, purse and preparation, without duplicating kill rewards", () => {
    runner.ctx.game.economy.charge(runner.ctx.player.userId, GOLD_CURRENCY, 30);
    runner.ctx.game.events.emit("entity.died", { instanceId: BASE_ENTITY_ID, catalogId: BASE_CATALOG_ID, reason: { kind: "environment", source: "test" }, position: [0, 0, 0] });
    expect(gamePhase(runner.ctx)).toBe("ended");
    runner.ui.invoke("defense.restart", {});
    expect(gamePhase(runner.ctx)).toBe("playing");
    expect(session.waveReady).toBe(true);
    expect(session.gameOver).toBe(false);
    expect(session.encounter.view().wave).toBe(1);
    expect(gold()).toBe(openingGold(legacy.read(runner.ctx)));
    expect(runner.ctx.scene.entity.stats.get(BASE_ENTITY_ID, "lives")?.current).toBe(openingLives(legacy.read(runner.ctx)));
    expect(runner.ctx.scene.entity.stats.get(BASE_ENTITY_ID, "lives")?.current).toBeGreaterThanOrEqual(STARTING_LIVES);
    const before = gold();
    runner.ctx.game.events.emit("entity.died", { instanceId: "one-scout", catalogId: "raider_scout", reason: { kind: "environment", source: "test" }, position: [0, 0, 0] });
    expect(gold() - before).toBe(4);
    expect(runner.ui.tryInvoke("defense.restart", {}).status).toBe("rejected");
  });
});

describe("authored encounters on the field", () => {
  test("the authored act ends on the Warden and elites walk from the second wave", () => {
    expect(AUTHORED_WAVES.length).toBe(6);
    const elites = AUTHORED_WAVES.map((wave) => wave.groups.some((group) => group.unit === "raider_elite"));
    expect(elites[1]).toBe(true);
    expect(AUTHORED_WAVES[AUTHORED_WAVES.length - 1]!.groups.filter((group) => group.unit === WARDEN_ID)).toHaveLength(1);
    for (let wave = 0; wave < AUTHORED_WAVES.length - 1; wave += 1) {
      expect(AUTHORED_WAVES[wave]!.groups.some((group) => group.unit === WARDEN_ID)).toBe(false);
    }
  });

  test("the opening wave is authored and the director leans only as the run goes on", () => {
    expect(session.pressure.tier).toBe(0);
    expect(PRESSURE_RULE.maxTier).toBe(2);
    session.encounter.openWave(TOTAL_WAVES - 1);
    const full = readPressure(runner.ctx);
    runner.ctx.scene.entity.stats.set(BASE_ENTITY_ID, "lives", { current: 2, max: STARTING_LIVES, min: 0 });
    const hurt = readPressure(runner.ctx);
    expect(full.tier).toBeGreaterThan(0);
    expect(hurt.tier).toBeLessThan(full.tier);
  });

  test("the wave the director sends is the composition the pressure asked for", () => {
    for (let wave = 0; wave < TOTAL_WAVES - 1; wave += 1) {
      session.encounter.openWave();
      session.encounter.completeWave();
    }
    runner.ui.invoke("wave.send", {});
    expect(session.pressure.tier).toBeGreaterThan(0);
    const expected = expandWave({ definition: ENCOUNTER, seed: DIRECTOR_SEED }, TOTAL_WAVES - 1, session.pressure);
    expect(expected.length).toBeGreaterThan(expandWave({ definition: ENCOUNTER, seed: DIRECTOR_SEED }, TOTAL_WAVES - 1).length);
    expect(session.openingComposition).toEqual(expected.map((order) => order.unit));
  });

  test("the same seed sends the same host", () => {
    const a = expandWave({ definition: ENCOUNTER, seed: DIRECTOR_SEED }, 4, { countBonus: 1 });
    const b = expandWave({ definition: ENCOUNTER, seed: DIRECTOR_SEED }, 4, { countBonus: 1 });
    expect(a).toEqual(b);
  });
});

describe("the Warden's phases", () => {
  test("it opens on the approach, then speeds up when its health crosses a threshold", () => {
    reachWarden();
    const boss = warden();
    expect(boss).not.toBeNull();
    expect(session.boss?.state.phaseId).toBe("opening");
    expect(boss!.speedStats.get("speed")).toBeCloseTo(1.1, 5);

    runner.ctx.scene.entity.effect({ from: BASE_ENTITY_ID, to: boss!.instanceId, effect: "damage", via: { amount: 700 } });
    tickWaves(runner.ctx, 0.1);
    expect(session.boss?.state.phaseId).toBe("enraged");
    expect(session.boss?.stance).toBe("enraged");
    expect(boss!.speedStats.get("speed")).toBeCloseTo(1.1 * wardenProfile.stance.enraged!.speedScale, 5);

    runner.ctx.scene.entity.effect({ from: BASE_ENTITY_ID, to: boss!.instanceId, effect: "damage", via: { amount: 450 } });
    tickWaves(runner.ctx, 0.1);
    expect(session.boss?.state.phaseId).toBe("last-stand");
    expect(boss!.speedStats.get("speed")).toBeCloseTo(1.1 * wardenProfile.stance["last-stand"]!.speedScale, 5);
  });

  test("a heal does not rewind the phase, and the tell clears", () => {
    reachWarden();
    const boss = warden()!;
    runner.ctx.scene.entity.effect({ from: BASE_ENTITY_ID, to: boss.instanceId, effect: "damage", via: { amount: 700 } });
    tickWaves(runner.ctx, 0.1);
    expect(session.boss?.state.phaseId).toBe("enraged");
    const health = runner.ctx.scene.entity.stats.get(boss.instanceId, "health")!;
    runner.ctx.scene.entity.stats.set(boss.instanceId, "health", { current: health.max, max: health.max, min: 0 });
    tickWaves(runner.ctx, 0.1);
    expect(session.boss?.state.phaseId).toBe("enraged");
    tickWaves(runner.ctx, 3);
    expect(session.boss?.state.tellId).toBeNull();
  });

  test("the phases are authored high to low and the opening starts at full health", () => {
    expect(wardenProfile.phases[0]!.atHealth).toBe(1);
    for (let index = 1; index < wardenProfile.phases.length; index += 1) {
      expect(wardenProfile.phases[index]!.atHealth).toBeLessThan(wardenProfile.phases[index - 1]!.atHealth);
    }
    expect(Object.keys(wardenProfile.stance)).toEqual(wardenProfile.phases.map((phase) => phase.id));
  });
});
