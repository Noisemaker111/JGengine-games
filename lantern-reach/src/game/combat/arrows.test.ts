import { expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../../game.config";
import { spawnMobAt, armorOfMob } from "../ai/mobs";
import { mobById } from "../entities/enemies/catalog";
import { mitigate } from "../math/combat";
import { CLASS_ENTITY_ID } from "../model";
import { launchHunterArrow } from "./arrows";
import { setupHunterArrows } from "./engine";

function range() {
  const runner = createHeadlessRunner({
    definition: { ...game.game, world: undefined, authoredDocument: undefined, simulation: { hz: 60 } },
    content: game.content,
    loop: {
      onInit: setupHunterArrows,
      onNewPlayer(ctx) { ctx.scene.entity.spawn(CLASS_ENTITY_ID, { id: ctx.player.userId, position: [0, 0, 0] }); },
    },
  });
  const wolf = mobById("forest_wolf")!;
  const target = spawnMobAt(runner.ctx, wolf, [0, 20], 1);
  const hp = (id: string) => runner.ctx.scene.entity.stats.get(id, "health")!.current;
  const tick = (seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) runner.step(1 / 60); };
  return { runner, target, hp, tick, wolf };
}

test("a hunter arrow damages the actual armored interceptor after flight exactly once", () => {
  const { runner, target, hp, tick, wolf } = range();
  const interceptor = spawnMobAt(runner.ctx, wolf, [0, 10], 12);
  const beforeTarget = hp(target), beforeInterceptor = hp(interceptor);
  expect(launchHunterArrow(runner.ctx, runner.userId, target, 24, false)).toBe(true);
  expect(hp(interceptor)).toBe(beforeInterceptor);
  tick(0.1);
  expect(hp(interceptor)).toBe(beforeInterceptor);
  tick(0.4);
  expect(hp(interceptor)).toBe(beforeInterceptor - mitigate(24, armorOfMob(runner.ctx, interceptor), 1));
  expect(hp(target)).toBe(beforeTarget);
  const settled = hp(interceptor);
  tick(2);
  expect(hp(interceptor)).toBe(settled);
  expect(runner.ctx.scene.entity.activeProjectiles()).toHaveLength(0);
});

test("moving away causes a miss and expiry without damage or repeated consequences", () => {
  const { runner, target, hp, tick } = range();
  const before = hp(target);
  launchHunterArrow(runner.ctx, runner.userId, target, 24, true);
  runner.ctx.scene.entity.setPose(target, { position: [20, 0, 20] });
  tick(2);
  expect(hp(target)).toBe(before);
  expect(runner.ctx.scene.entity.activeProjectiles()).toHaveLength(0);
  tick(2);
  expect(hp(target)).toBe(before);
});

test("pause and restore retain the serialized shot policy and settle once on replay", () => {
  const { runner, target, hp, tick } = range();
  launchHunterArrow(runner.ctx, runner.userId, target, 24, false);
  tick(0.2);
  runner.ctx.time.pause();
  const paused = runner.snapshot(), before = hp(target);
  tick(1);
  expect(hp(target)).toBe(before);
  expect(runner.ctx.scene.entity.activeProjectiles()).toHaveLength(1);
  runner.ctx.time.play();
  tick(1);
  const after = hp(target);
  expect(after).toBeLessThan(before);
  runner.restore(paused);
  expect(hp(target)).toBe(before);
  runner.ctx.time.play();
  tick(1);
  expect(hp(target)).toBe(after);
  tick(2);
  expect(hp(target)).toBe(after);
});
