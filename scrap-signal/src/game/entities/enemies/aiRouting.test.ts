import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { solidObstaclesNear } from "@jgengine/core/movement/solidObstacles";
import type { CollisionObstacle } from "@jgengine/core/movement/movementModel";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { assets } from "../../assets";
import { content } from "../../content";
import { AUTHORED_PIECES, DEAD_AIR_SPAWNS, DEAD_AIR_SITE } from "../../world/level";
import { entityModels, objectModels } from "../../world/models";
import { setupWorld } from "../../world/setup";
import { world, physics } from "../../../world";
import { enemyAiWork, enemyTacticsStore, rememberHome, tickEnemies } from "./ai";

function boot(target: { x: number; z: number }, startPoint?: { x: number; z: number }, backend = memorySaveBackend()) {
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "scrap-routing", assets, world, physics, multiplayer: "off", persist: true }), content,
    save: { backend, key: "scrap-routing", mode: "manual" },
    models: { entity: (id) => entityModels[id], object: (id) => objectModels[id] }, player: { userId: "player", isNew: true },
  });
  setupWorld(ctx);
  for (const entity of ctx.scene.entity.list()) ctx.scene.entity.despawn(entity.id);
  ctx.scene.entity.spawn("reactor_hunter", { id: "player", position: [target.x, ctx.world.groundHeightAt(target.x, target.z), target.z] });
  const marker = DEAD_AIR_SPAWNS.find((spawn) => spawn.id === "dead_air_spawn_1_0")!;
  const origin = startPoint ?? marker;
  const start: EntityPosition = [origin.x, ctx.world.groundHeightAt(origin.x, origin.z), origin.z];
  ctx.scene.entity.spawn(marker.catalogId, { id: marker.id, position: start });
  rememberHome(ctx, marker.id, start, 1);
  return { ctx, id: marker.id, start };
}

function intersects(position: EntityPosition, obstacle: CollisionObstacle): boolean {
  const half = obstacle.halfExtents ?? [0.5, 0.5, 0.5];
  const offset = obstacle.offset ?? [0, 0, 0];
  const boxes = obstacle.boxes ?? [{
    min: [offset[0] - half[0], offset[1] - half[1], offset[2] - half[2]],
    max: [offset[0] + half[0], offset[1] + half[1], offset[2] + half[2]],
  }];
  return boxes.some((box) => {
    const [x, y, z] = obstacle.position;
    if (y + box.max[1] <= position[1] || y + box.min[1] >= position[1] + 1.8) return false;
    return position[0] > x + box.min[0] - 0.3 + 1e-6 && position[0] < x + box.max[0] + 0.3 - 1e-6 &&
      position[2] > z + box.min[2] - 0.3 + 1e-6 && position[2] < z + box.max[2] + 0.3 - 1e-6;
  });
}

function step(fixture: ReturnType<typeof boot>) {
  const { ctx, id } = fixture;
  ctx.time.advance(0.05);
  tickEnemies(ctx, 0.05);
  const position = ctx.scene.entity.get(id)!.position;
  expect(solidObstaclesNear(ctx, position, 0.3, 0.3).some((obstacle) => intersects(position, obstacle))).toBe(false);
  expect(enemyAiWork(ctx).raycasts).toBeLessThanOrEqual(13);
}

test("the authored north rusher reaches both relay and observed native player around the scene's real solids", () => {
  for (const target of [{ x: DEAD_AIR_SITE.x, z: DEAD_AIR_SITE.z }, { x: -499.59, z: 567.02 }]) {
    const fixture = boot(target);
    let detours = 0;
    for (let i = 0; i < 200; i++) {
      step(fixture);
      if (enemyTacticsStore.read(fixture.ctx)[fixture.id]!.detour !== undefined) detours++;
    }
    const end = fixture.ctx.scene.entity.get(fixture.id)!.position;
    expect(Math.hypot(end[0] - target.x, end[2] - target.z)).toBeLessThan(1.9);
    expect(Math.hypot(end[0] - fixture.start[0], end[2] - fixture.start[2])).toBeGreaterThan(8);
    if (target.x === -499.59) expect(detours).toBeGreaterThan(0);
  }
});

test("a saved detour preserves its side, target, and exact next steps after checkpoint/reload", async () => {
  const target = { x: -499.59, z: 567.02 };
  const backend = memorySaveBackend();
  const fixture = boot(target, undefined, backend);
  for (let i = 0; i < 100 && enemyTacticsStore.read(fixture.ctx)[fixture.id]!.detour === undefined; i++) step(fixture);
  const mind = enemyTacticsStore.read(fixture.ctx)[fixture.id]!;
  expect(mind.detour).toBeDefined();
  await fixture.ctx.game.save!.checkpoint();
  const restored = boot(target, undefined, backend);
  expect(await restored.ctx.game.save!.load()).toBe(true);
  expect(restored.ctx.time.now()).toBe(fixture.ctx.time.now());
  expect(enemyTacticsStore.read(restored.ctx)[restored.id]!.detour).toEqual(mind.detour);
  expect(enemyTacticsStore.read(restored.ctx)[restored.id]!.steeringSide).toBe(mind.steeringSide);
  for (let i = 0; i < 25; i++) {
    step(fixture); step(restored);
    expect(restored.ctx.scene.entity.get(restored.id)!.position).toEqual(fixture.ctx.scene.entity.get(fixture.id)!.position);
  }
});


test("a remembered threat across the authored roadside barrel commits a detour and reaches claw range", () => {
  const barrel = AUTHORED_PIECES.find((piece) => piece.instanceId === "barrel_0_3")!;
  const target = { x: barrel.x + 2, z: barrel.z };
  const fixture = boot(target, { x: barrel.x - 5, z: barrel.z });
  const state = enemyTacticsStore.read(fixture.ctx);
  const position = fixture.ctx.scene.entity.get("player")!.position;
  enemyTacticsStore.write(fixture.ctx, { ...state, [fixture.id]: { ...state[fixture.id]!, engaged: true, perception: {
    nowMs: 0, stimuli: [], memories: [{ observerId: fixture.id, memory: { targetId: "player", lastSeenAt: 0, lastKnownPos: position, confidence: 1 } }],
  } } });
  let detours = 0;
  for (let i = 0; i < 200; i++) {
    step(fixture);
    if (enemyTacticsStore.read(fixture.ctx)[fixture.id]!.detour !== undefined) detours++;
  }
  const end = fixture.ctx.scene.entity.get(fixture.id)!.position;
  expect(detours).toBeGreaterThan(0);
  expect(Math.hypot(end[0] - target.x, end[2] - target.z)).toBeLessThan(1.9);
});
