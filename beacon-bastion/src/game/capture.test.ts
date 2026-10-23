import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { content } from "./content";
import { GOLD_CURRENCY } from "./entities/base/catalog";
import { resetSession, session } from "./session";
import { setupWorld } from "./world/setup";
import { stageRun, type StageMode } from "./capture";

let runner: HeadlessRunner;

function boot(): void {
  resetSession();
  runner = createHeadlessRunner({
    definition: defineGameDefinition({ name: "Beacon capture", multiplayer: "off" }),
    content,
    loop: { onInit: setupWorld, onNewPlayer() {} },
  });
}

beforeEach(boot);

/** Everything a staged state has to reproduce: the field, the towers, the till and the run's end. */
function fingerprint(ctx: HeadlessRunner["ctx"]): string {
  const creeps = [...session.creeps.values()]
    .map((creep) => `${creep.catalogId}@${creep.path.position.map((n) => n.toFixed(2)).join(",")}`)
    .sort();
  const towers = [...session.towers.values()].map((tower) => `${tower.catalogId}:${tower.level}`).sort();
  return JSON.stringify({
    wave: session.encounter.view().wave,
    creeps,
    towers,
    boss: session.boss === null ? null : `${session.boss.unitId}:${session.boss.stance}`,
    gold: ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY),
    bounty: session.bountyEarned,
    victory: session.victory,
    gameOver: session.gameOver,
  });
}

describe("staged capture states", () => {
  test("mid-wave puts raiders on the approach", () => {
    stageRun(runner.ctx, "midwave");
    expect(session.creeps.size).toBeGreaterThan(0);
    expect(session.waveStarted).toBe(true);
  });

  test("boss stands the Warden on the field in its second phase", () => {
    stageRun(runner.ctx, "boss");
    expect(session.boss).not.toBeNull();
    expect(session.boss?.unitId).toBe("raider_warden");
    expect(session.boss?.stance).toBe("enraged");
  });

  test("result plays the defense out to its own ending", () => {
    stageRun(runner.ctx, "result");
    expect(session.gameOver || session.victory).toBe(true);
  });

  for (const mode of ["midwave", "boss", "result"] as const satisfies readonly StageMode[]) {
    test(`${mode} reproduces from a fresh boot`, () => {
      stageRun(runner.ctx, mode);
      const first = fingerprint(runner.ctx);
      boot();
      stageRun(runner.ctx, mode);
      expect(fingerprint(runner.ctx)).toBe(first);
    });
  }
});
