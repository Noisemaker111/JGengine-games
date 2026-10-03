import { expect, test } from "bun:test";
import { cloneEditorDocument } from "@jgengine/core/editor/document";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { editorLayers } from "../editorLayers";
import { game } from "../game.config";
import { PLAYER_SPAWN } from "./world/zones";
import { CLASS_ENTITY_ID } from "./model";
import { deadStore } from "./session/stores";
import { setupEnvironment, travellerSurfaceId } from "./environment";

function boot(cosmetics = true) {
  const document = cloneEditorDocument(editorLayers);
  if (!cosmetics && document.simulation !== undefined) document.simulation.emitters = [];
  let dispose = () => {};
  const runner = createHeadlessRunner({
    definition: { ...game.game, authoredDocument: document, simulation: { hz: 60 } },
    content: game.content, now: () => 0, playerMovement: true,
    loop: {
      onInit(ctx) { dispose = setupEnvironment(ctx); setGamePhase(ctx, "playing"); },
      onNewPlayer(ctx) {
        const [x, z] = PLAYER_SPAWN;
        ctx.scene.entity.spawn(CLASS_ENTITY_ID, { id: ctx.player.userId, position: [x, ctx.world.groundHeightAt(x, z), z] });
      },
    },
  });
  return { runner, dispose };
}

test("Lantern's travellers feel authored wind, stay dry under a real roof and retain accumulation across pause/restore", () => {
  const { runner } = boot();
  const { ctx, userId } = runner;
  for (let i = 0; i < 180; i++) runner.step(1 / 60);
  expect(ctx.environment.surfaces.sample(travellerSurfaceId(userId))!.wetness).toBeGreaterThan(0.08);
  expect(ctx.scene.entity.get(userId)!.position[0]).toBeGreaterThan(0);
  expect(ctx.environment.fire("watchhall-torch")!.burning).toBe(1);
  expect(ctx.environment.fire("provision-torch")!.burning).toBe(0);
  expect(ctx.particles.emitters().find(emitter => emitter.id === "authored:watchhall-torch-flame")!.active).toBe(true);
  expect(ctx.particles.emitters().find(emitter => emitter.id === "authored:provision-torch-flame")!.active).toBe(false);
  const roof = editorLayers.volumes.find(volume => volume.id === "shelter:watchhall")!;
  ctx.scene.entity.setPose(userId, { position: [roof.center.x, ctx.world.groundHeightAt(roof.center.x, roof.center.z), roof.center.z] });
  for (let i = 0; i < 180; i++) runner.step(1 / 60);
  const covered = ctx.environment.surfaces.sample(travellerSurfaceId(userId))!;
  expect(covered.exposure).toBe(0);
  expect(covered.wetness).toBeLessThan(0.1);
  ctx.time.pause();
  const paused = runner.snapshot();
  for (let i = 0; i < 120; i++) runner.step(1 / 60, { held: ["moveForward"] });
  expect(ctx.environment.snapshot()).toEqual(paused.environment);
  const pose = [...ctx.scene.entity.get(userId)!.position];
  ctx.time.play();
  for (let i = 0; i < 30; i++) runner.step(1 / 60, { held: ["moveForward"] });
  runner.restore(paused);
  expect(ctx.environment.snapshot()).toEqual(paused.environment);
  expect(ctx.scene.entity.get(userId)!.position).toEqual(pose);
});

test("cosmetic emission cannot change authoritative travel, hits, wetness or fire fuel", () => {
  const visible = boot(true).runner;
  const hidden = boot(false).runner;
  for (let i = 0; i < 300; i++) {
    visible.step(1 / 60, { held: ["moveForward"] });
    hidden.step(1 / 60, { held: ["moveForward"] });
  }
  expect(visible.ctx.scene.entity.get(visible.userId)).toEqual(hidden.ctx.scene.entity.get(hidden.userId));
  expect(visible.ctx.environment.snapshot()).toEqual(hidden.ctx.environment.snapshot());
  expect(visible.ctx.scene.entity.stats.get(visible.userId, "health")).toEqual(hidden.ctx.scene.entity.stats.get(hidden.userId, "health"));
});

test("dead travellers and disposed worlds release their watched surfaces and motion stages", () => {
  const { runner, dispose } = boot();
  runner.step(1 / 60);
  expect(runner.ctx.environment.surfaces.sample(travellerSurfaceId(runner.userId))).not.toBeNull();
  deadStore.write(runner.ctx, runner.userId, true);
  runner.step(1 / 60);
  expect(runner.ctx.environment.surfaces.sample(travellerSurfaceId(runner.userId))).toBeNull();
  deadStore.write(runner.ctx, runner.userId, false);
  runner.step(1 / 60);
  dispose();
  dispose();
  runner.step(1 / 60);
  expect(runner.ctx.environment.surfaces.sample(travellerSurfaceId(runner.userId))).toBeNull();
  expect(runner.ctx.player.motionFor(runner.userId).takePending()).toBeNull();
});
