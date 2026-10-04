import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { content } from "../../content";
import { reserveStore } from "../../stores";
import { ENEMY_AI_WORK, enemyAiWork, enemyLineOfSight, enemyTacticsStore, rememberHome, tickEnemies } from "./ai";
import { enemyById } from "./catalog";
import { enemyTactics } from "./tactics";

function boot(backend = memorySaveBackend(), height = 0) {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "enemy-tactics", assets: createAssetCatalog(), multiplayer: "off", persist: true }),
    content: { ...content, objectById: (id) => id === "wall" ? { halfExtents: [1, 4, 12] } : id === "cover" || id === "thin_cover" ? { halfExtents: [id === "cover" ? 1 : 0.2, 4, 1] } : content.objectById?.(id) ?? null },
    player: { userId: "player", isNew: true }, save: { backend, key: "enemy-tactics", mode: "manual" },
  });
  ctx.world.groundHeightAt = () => height;
  ctx.scene.entity.spawn("reactor_hunter", { id: "player", position: [0, height, 0] });
  return ctx;
}
function spawn(ctx: ReturnType<typeof boot>, catalogId: string, x: number, y = 0, z = 0) {
  ctx.scene.entity.spawn(catalogId, { id: "enemy", position: [x, y, z] });
  rememberHome(ctx, "enemy", [x, y, z], 1);
}
function step(ctx: ReturnType<typeof boot>, seconds: number) {
  ctx.time.advance(seconds);
  tickEnemies(ctx, seconds);
}
function shield(ctx: ReturnType<typeof boot>) { return ctx.scene.entity.stats.get("player", "shield")!.current; }

describe("Scrap Signal committed enemy attacks", () => {
  test("rushers commit real grounded movement and their claw windup can be dodged", () => {
    const ctx = boot(); spawn(ctx, "husk", 6);
    step(ctx, 0.1);
    expect(ctx.scene.entity.get("enemy")!.position[0]).toBeLessThan(6);
    ctx.scene.entity.update("enemy", { position: [1.5, 0, 0] });
    step(ctx, 0.06);
    expect(enemyTacticsStore.read(ctx).enemy!.phase).toBe("windup");
    expect(shield(ctx)).toBe(60);
    ctx.scene.entity.update("player", { position: [0, 0, 3] });
    step(ctx, 0.59);
    expect(shield(ctx)).toBe(60);
    expect(enemyTacticsStore.read(ctx).enemy!.phase).toBe("recover");
    ctx.scene.entity.update("player", { position: [0, 0, 0] });
    step(ctx, 0.2);
    expect(shield(ctx)).toBe(60);
  });

  test("staying in the locked claw marker takes one hit and no contact damage during recovery", () => {
    const ctx = boot(); spawn(ctx, "husk", 1.5);
    step(ctx, 0.01); step(ctx, 0.59);
    expect(shield(ctx)).toBe(48);
    step(ctx, 0.4);
    expect(shield(ctx)).toBe(48);
  });

  test("rifle skirmishers retreat when rushed and preserve their old aim through windup", () => {
    const ctx = boot(); spawn(ctx, "marauder", 4);
    step(ctx, 0.1);
    expect(ctx.scene.entity.get("enemy")!.position[0]).toBeGreaterThan(4);
    const locked = enemyTacticsStore.read(ctx).enemy!.target;
    ctx.scene.entity.update("player", { position: [0, 0, 4] });
    step(ctx, 0.2);
    expect(enemyTacticsStore.read(ctx).enemy!.target).toEqual(locked);
    expect(enemyTacticsStore.read(ctx).enemy!.phase).toBe("windup");
  });

  test("a suppressor fires three committed rounds, then exposes a long cooldown", () => {
    const ctx = boot(); spawn(ctx, "loader", 10);
    const shots: unknown[] = [];
    const fire = ctx.scene.entity.fireProjectile;
    ctx.scene.entity.fireProjectile = (input) => { shots.push(input); return fire(input); };
    step(ctx, 0.01); step(ctx, 1.06);
    step(ctx, 0.23); step(ctx, 0.23);
    expect(shots.length).toBe(3);
    expect(enemyTacticsStore.read(ctx).enemy!.phase).toBe("recover");
    step(ctx, 1);
    expect(shots.length).toBe(3);
  });

  test("breaking a suppressor shield cancels its windup and exposes a counter window", () => {
    const ctx = boot(); spawn(ctx, "loader", 10);
    let shots = 0;
    const fire = ctx.scene.entity.fireProjectile;
    ctx.scene.entity.fireProjectile = (input) => { shots++; return fire(input); };
    step(ctx, 0.01);
    ctx.scene.entity.effect({ from: "player", to: "enemy", effect: "damage", via: { amount: 40 } });
    step(ctx, 0.1);
    expect(enemyTacticsStore.read(ctx).enemy!.phase).toBe("recover");
    step(ctx, 1.1);
    expect(shots).toBe(0);
  });

  test("cover blocks new shots at elevated terrain heights, and committed melee cannot hit through it", () => {
    const ctx = boot(undefined, 25); spawn(ctx, "husk", 1.5, 25);
    step(ctx, 0.01);
    ctx.scene.object.place("thin_cover", 0.75, 25, 0, { instanceId: "blocker" });
    expect(enemyLineOfSight(ctx, [1.5, 25, 0], [0, 25, 0])).toBe(false);
    step(ctx, 0.59);
    expect(shield(ctx)).toBe(60);
  });

  test("obstacle steering commits beside cover without passing through its body", () => {
    const ctx = boot(); spawn(ctx, "husk", 6);
    ctx.scene.object.place("cover", 4, 0, 0, { instanceId: "blocker" });
    const states = enemyTacticsStore.read(ctx);
    enemyTacticsStore.write(ctx, { ...states, enemy: { ...states.enemy!, engaged: true } });
    for (let i = 0; i < 30; i++) {
      step(ctx, 0.1);
      const p = ctx.scene.entity.get("enemy")!.position;
      expect(Math.abs(p[0] - 4) < 1 && Math.abs(p[2]) < 1).toBe(false);
    }
  });

  test("telegraph target and attack recovery survive whole-world checkpoint/reload", async () => {
    const backend = memorySaveBackend();
    const ctx = boot(backend); spawn(ctx, "husk", 1.5);
    step(ctx, 0.01);
    await ctx.game.save!.checkpoint();
    const resumed = boot(backend);
    expect(await resumed.game.save!.load()).toBe(true);
    expect(enemyTacticsStore.read(resumed).enemy!.phase).toBe("windup");
    expect(enemyTacticsStore.read(resumed).enemy!.target).toEqual([0, 0, 0]);
    resumed.scene.entity.update("player", { position: [0, 0, 3] });
    step(resumed, 0.59);
    expect(shield(resumed)).toBe(60);
    expect(enemyTacticsStore.read(resumed).enemy!.phase).toBe("recover");
  });

  test("a downed player cancels the windup and a dead enemy cannot resolve it", () => {
    const ctx = boot(); spawn(ctx, "husk", 1.5);
    step(ctx, 0.01);
    reserveStore.write(ctx, { phase: "downed", untilMs: 99999 });
    step(ctx, 0.59);
    expect(shield(ctx)).toBe(60);
    expect(enemyTacticsStore.read(ctx).enemy!.phase).toBe("ready");
    ctx.scene.entity.despawn("enemy");
    step(ctx, 1);
    expect(enemyTacticsStore.read(ctx).enemy).toBeUndefined();
  });


  test("a heavy charge locks a lane, misses a sidestep, and stalls after its lunge", () => {
    const ctx = boot(); spawn(ctx, "elite_husk", 5);
    step(ctx, 0.01);
    expect(enemyTacticsStore.read(ctx).enemy!.phase).toBe("windup");
    ctx.scene.entity.update("player", { position: [0, 0, 4] });
    step(ctx, 0.96);
    expect(enemyTacticsStore.read(ctx).enemy!.phase).toBe("charge");
    for (let i = 0; i < 8; i++) step(ctx, 0.1);
    expect(shield(ctx)).toBe(60);
    expect(enemyTacticsStore.read(ctx).enemy!.phase).toBe("recover");
    expect(ctx.scene.entity.get("enemy")!.position[0]).toBeLessThan(1);
  });

  test("siege blasts are committed to a ground marker and damage only the player", () => {
    const ctx = boot(); spawn(ctx, "loader_war", 10);
    ctx.scene.entity.spawn("bolt", { id: "ally", position: [0, 0, 0] });
    const allyHealth = ctx.scene.entity.stats.get("ally", "health")!.current;
    step(ctx, 0.01);
    step(ctx, 1.51);
    expect(shield(ctx)).toBe(40);
    expect(ctx.scene.entity.stats.get("ally", "health")!.current).toBe(allyHealth);
    expect(enemyTacticsStore.read(ctx).enemy!.phase).toBe("recover");
  });

  test("enemies search the last sighted position behind cover and abandon an expired memory", () => {
    const ctx = boot(); spawn(ctx, "husk", 8);
    step(ctx, 0.01);
    const lastKnown = enemyTacticsStore.read(ctx).enemy!.perception!.memories[0]!.memory.lastKnownPos;
    ctx.scene.object.place("wall", 3, 0, 0);
    ctx.scene.entity.update("player", { position: [-1, 0, 3] });
    step(ctx, 0.3);
    expect(enemyTacticsStore.read(ctx).enemy!.perception!.memories[0]!.memory.lastKnownPos).toEqual(lastKnown);
    step(ctx, 3.6);
    expect(enemyTacticsStore.read(ctx).enemy!.engaged).toBe(false);
  });


  test("distant enemies are dormant before any stat, terrain, or collider query", () => {
    const ctx = boot();
    for (let i = 0; i < 120; i++) ctx.scene.entity.spawn("husk", { id: `far-${i}`, position: [100 + i, 0, 0] });
    let statQueries = 0;
    const getStat = ctx.scene.entity.stats.get;
    ctx.scene.entity.stats.get = (...args) => { statQueries++; return getStat(...args); };
    step(ctx, 0.016);
    expect(enemyAiWork(ctx)).toEqual({ active: 0, idle: 0, dormant: 120, raycasts: 0, groundQueries: 0 });
    expect(statQueries).toBe(0);
  });

  test("dense nearby groups have a bounded fair work budget and 20 Hz combat cadence", () => {
    const ctx = boot();
    for (let i = 0; i < 80; i++) ctx.scene.entity.spawn("husk", { id: `near-${i}`, position: [5 + i / 100, 0, 0] });
    for (let i = 0; i < 4; i++) {
      step(ctx, 0.016);
      const work = enemyAiWork(ctx);
      expect(work.active).toBeLessThanOrEqual(ENEMY_AI_WORK.maxActivePerTick);
      expect(work.raycasts).toBeLessThanOrEqual(ENEMY_AI_WORK.maxActivePerTick * 13);
    }
    expect(Object.keys(enemyTacticsStore.read(ctx)).length).toBe(80);
    const mind = enemyTacticsStore.read(ctx)["near-0"]!;
    const position = [...ctx.scene.entity.get("near-0")!.position];
    step(ctx, 0.001);
    expect(enemyTacticsStore.read(ctx)["near-0"]!.lastThinkMs).toBe(mind.lastThinkMs);
    expect(ctx.scene.entity.get("near-0")!.position).toEqual(position);
  });


  test("boss aura cadence continues on frames where the tactical scheduler skips thinking", () => {
    const ctx = boot(); spawn(ctx, "wreck_maw", 1.5);
    for (let i = 0; i < 40; i++) step(ctx, 0.02);
    expect(shield(ctx)).toBe(54);
    expect(enemyTacticsStore.read(ctx).enemy!.phase).toBe("windup");
  });

  test("the first contract has different rush, rifle, and suppression counter rules", () => {
    expect(["husk", "marauder", "loader"].map((id) => enemyTactics(enemyById(id)! ).role)).toEqual(["rush", "skirmish", "suppress"]);
  });
});
