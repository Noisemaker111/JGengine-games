import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameSave } from "@jgengine/core/game/gameSave";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { createBossState } from "@jgengine/core/ai/director/boss";

import { content } from "./content";
import { BASE_ENTITY_ID, GOLD_CURRENCY } from "./entities/base/catalog";
import { resetSession, session } from "./session";
import { setupWorld } from "./world/setup";
import {
  captureDefense,
  defenseSystem,
  legacySystem,
  restoreDefense,
  validDefenseSave,
} from "./save";
import { drawBoons, freshLegacy, legacy, validLegacy, writeLegacy } from "./waves/legacy";
import { WARDEN_ID, bossProfile } from "./waves/manifest";

let runner: HeadlessRunner;
beforeEach(() => {
  resetSession();
  runner = createHeadlessRunner({
    definition: defineGameDefinition({ name: "Beacon keep", multiplayer: "off" }),
    content,
    loop: { onInit: setupWorld, onNewPlayer() {} },
  });
});

/** A run with something to save on every section: purse, wave, lives, a boss and banked progress. */
function playedIntoWave(): void {
  for (let wave = 0; wave < 6; wave += 1) {
    session.encounter.openWave();
    session.encounter.completeWave();
  }
  runner.ctx.game.economy.grant(runner.ctx.player.userId, GOLD_CURRENCY, 77);
  runner.ctx.scene.entity.stats.set(BASE_ENTITY_ID, "lives", { current: 11, max: 20, min: 0 });
  session.bountyEarned = 133;
  session.boss = {
    instanceId: "warden-1",
    unitId: WARDEN_ID,
    state: createBossState(bossProfile(WARDEN_ID)!.phases),
    stance: "opening",
  };
}

describe("the defense document", () => {
  test("a captured run restores into a world with the same purse, wave, lives and bounty", () => {
    playedIntoWave();
    const snapshot = JSON.parse(JSON.stringify(captureDefense(runner.ctx)));
    expect(validDefenseSave(snapshot)).toBe(true);

    resetSession();
    restoreDefense(runner.ctx, snapshot);

    expect(session.encounter.view().wave).toBe(7);
    expect(session.bountyEarned).toBe(133);
    expect(session.boss?.unitId).toBe(WARDEN_ID);
    expect(runner.ctx.game.economy.balance(runner.ctx.player.userId, GOLD_CURRENCY)).toBe(captureDefense(runner.ctx).gold);
    expect(runner.ctx.scene.entity.stats.get(BASE_ENTITY_ID, "lives")?.current).toBe(11);
  });

  test("a document from before bounties still restores, with the new sections at their defaults", () => {
    const snapshot: Record<string, unknown> = JSON.parse(JSON.stringify(captureDefense(runner.ctx)));
    delete snapshot.bountyEarned;
    delete snapshot.banked;
    expect(validDefenseSave(snapshot)).toBe(true);

    resetSession();
    restoreDefense(runner.ctx, snapshot as never);
    expect(session.bountyEarned).toBe(0);
    expect(session.banked).toBe(false);
  });

  test("the bank is its own section, so a new run does not clear it", async () => {
    playedIntoWave();
    const banked = {
      standing: 18,
      runs: 2,
      bankedGold: 120,
      boonId: "gate",
      offer: drawBoons(5),
    };
    writeLegacy(runner.ctx, banked);
    expect(captureDefense(runner.ctx).banked).toBe(false);

    const save = createGameSave({
      backend: memorySaveBackend(),
      game: "beacon-bastion-test",
      systems: [defenseSystem(runner.ctx), legacySystem(runner.ctx)],
    });
    await save.save();

    // A fresh defense, as a reload would build it, then the document read back.
    resetSession();
    writeLegacy(runner.ctx, freshLegacy());
    await save.load();

    expect(legacy.read(runner.ctx)).toEqual(banked);
    expect(session.encounter.view().wave).toBe(7);
  });

  test("an unreadable bank section is refused rather than half applied", async () => {
    expect(validLegacy({ standing: -1, runs: 0, bankedGold: 0, boonId: null, offer: [] })).toBe(false);
    expect(validLegacy({ standing: 1, runs: 0 })).toBe(false);
    expect(validLegacy(freshLegacy())).toBe(true);

    const save = createGameSave({
      backend: memorySaveBackend(),
      game: "beacon-bastion-test",
      systems: [legacySystem(runner.ctx)],
    });
    await save.save();
    writeLegacy(runner.ctx, { ...freshLegacy(), standing: 99 });
    await save.load();
    expect(legacy.read(runner.ctx).standing).toBe(0);
  });
});
