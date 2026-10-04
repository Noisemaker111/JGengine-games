import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { memorySaveBackend, type SaveBackend } from "@jgengine/core/game/saveStore";
import { activeJobs, queuedJobs } from "@jgengine/core/gameplay";
import { installSystems } from "@jgengine/core/game/systemRuntime";
import { hudStore } from "./hudStore";
import { content } from "./content";
import { setupSkirmish } from "./world/scene";
import { session, playerDepot, reservedSupply } from "./session";
import { systems } from "./systems";
import { battleSave } from "./persistence";
import { canResearch, orderSelection } from "./commands";
import { movementSpeed, matchupDamage } from "./upgrades";

function boot(backend?: SaveBackend) {
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "EmberLogistics", multiplayer: "off", persist: false }), content, player: { userId: "commander", isNew: true } });
  const save = battleSave(ctx, backend ?? memorySaveBackend());
  setupSkirmish(ctx);
  ctx.game.commands.run("match.start", {});
  const installed = installSystems(ctx, systems);
  const step = (seconds: number) => { for (let n = 0; n < seconds * 20; n++) installed.tick(ctx, 0.05); };
  return { ctx, save, step };
}

describe("logistics and recovery", () => {
  test("a fresh runtime reload restores the paid queue and wallet from persistent storage", async () => {
    const backend = memorySaveBackend();
    const original = boot(backend);
    original.ctx.game.commands.run("train.peasant", {});
    original.step(2);
    await original.save.save();
    const checkpoint = session.elapsed;
    const fresh = boot(backend);
    expect(session.elapsed).toBe(0);
    expect(fresh.ctx.game.economy.balance("commander", "gold")).toBe(250);
    expect(await fresh.save.load()).toBe(true);
    expect(session.elapsed).toBe(checkpoint);
    expect(session.production.jobs.length).toBe(1);
    expect(fresh.ctx.game.economy.balance("commander", "gold")).toBe(197);
    fresh.step(7);
    expect(session.production.jobs.length).toBe(0);
    expect([...session.units.values()].filter((u) => u.id.startsWith("peasant_t")).length).toBe(1);
  });

  test("returning to title preserves the available checkpoint and resets the active battle", async () => {
    const { ctx, save } = boot();
    ctx.game.commands.run("train.peasant", {});
    await save.save();
    hudStore.set({ savedBattle: true });
    ctx.game.commands.run("match.title", {});
    expect(hudStore.get().phase).toBe("ready");
    expect(hudStore.get().savedBattle).toBe(true);
    expect(session.production.jobs.length).toBe(0);
    await save.load();
    expect(session.production.jobs.length).toBe(1);
    expect(ctx.game.economy.balance("commander", "gold")).toBe(195);
  });

  test("forward Barracks shorten cargo routes; safe recovery costs lumber and stops under threat", () => {
    const { ctx, step } = boot();
    ctx.scene.entity.spawn("barracks", { id: "forward", position: [15, 0, 10] });
    session.units.set("forward", { id: "forward", catalogId: "barracks", faction: "player", kind: "building", guardPoint: { x: 15, z: 10 }, leash: 0, attackCooldown: 0, command: { kind: "idle" } });
    expect(playerDepot({ x: 17, z: 10 })?.id).toBe("forward");
    ctx.scene.entity.setPose("hero", { position: [15, 0, 12] });
    ctx.scene.entity.stats.delta("hero", "health", -100);
    const lumber = ctx.game.economy.balance("commander", "lumber");
    step(1);
    expect(ctx.scene.entity.stats.get("hero", "health")!.current).toBe(286);
    expect(ctx.game.economy.balance("commander", "lumber")).toBe(lumber - 1);
    const enemy = [...session.units.values()].find((u) => u.faction === "enemy" && u.kind === "unit")!;
    ctx.scene.entity.setPose(enemy.id, { position: [15, 0, 18] });
    const recovery = systems.find((s) => s.id === "ember-command.recovery")!;
    recovery.update!(ctx, 1);
    expect(ctx.scene.entity.stats.get("hero", "health")!.current).toBe(286);
  });

  test("losing the Barracks pauses soldiers without blocking replacement workers or releasing their supply", () => {
    const { ctx, step } = boot();
    ctx.game.economy.grant("commander", "gold", 500);
    ctx.scene.entity.spawn("barracks", { id: "rax", position: [15, 0, 10] });
    const rax = { id: "rax", catalogId: "barracks", faction: "player" as const, kind: "building" as const, leash: 0, attackCooldown: 0, command: { kind: "idle" as const } };
    session.units.set("rax", rax);
    ctx.game.commands.run("train.footman", {});
    step(1);
    session.units.delete("rax");
    ctx.scene.entity.despawn("rax");
    ctx.game.commands.run("train.peasant", {});
    step(9);
    expect(session.production.jobs[0]?.status).toBe("paused");
    expect(reservedSupply()).toBe(2);
    expect([...session.units.values()].filter((u) => u.id.startsWith("peasant_t")).length).toBe(1);
    ctx.scene.entity.spawn("barracks", { id: "rax", position: [15, 0, 10] });
    session.units.set("rax", rax);
    step(15);
    expect(session.production.jobs.length).toBe(0);
    expect([...session.units.values()].filter((u) => u.id.startsWith("footman_t")).length).toBe(1);
  });

  test("doctrine choice commits at queue time; both specializations have costs and counters", () => {
    const { ctx } = boot();
    ctx.game.economy.grant("commander", "gold", 500);
    ctx.scene.entity.spawn("barracks", { id: "rax", position: [15, 0, 10] });
    session.units.set("rax", { id: "rax", catalogId: "barracks", faction: "player", kind: "building", leash: 0, attackCooldown: 0, command: { kind: "idle" } });
    ctx.game.commands.run("research.weapons", {});
    expect(canResearch(ctx, "armor")).toBe(false);
    session.research.ranks.weapons = 3;
    expect(movementSpeed(4, "player")).toBeCloseTo(3.4);
    expect(matchupDamage(14, "rifleman", "reaver")).toBe(21);
    expect(matchupDamage(17, "reaver", "guard_tower")).toBe(34);
  });

  test("hero death is recoverable with time and gold, and loses earned levels", () => {
    const { ctx, step } = boot();
    ctx.scene.entity.effect({ from: "keep_enemy", to: "hero", effect: "damage", via: { amount: 10000 } });
    expect(session.units.has("hero")).toBe(false);
    ctx.game.commands.run("match.recover", {});
    expect(session.units.has("hero")).toBe(false);
    step(21);
    const gold = ctx.game.economy.balance("commander", "gold");
    ctx.game.commands.run("match.recover", {});
    expect(session.units.has("hero")).toBe(true);
    expect(ctx.game.economy.balance("commander", "gold")).toBe(gold - 100);
    expect(ctx.scene.entity.stats.get("hero", "level")?.current).toBe(1);
  });

  test("restoring a fallen hero clears the published combat death latch for a second death", async () => {
    const { ctx, save } = boot();
    await save.save();
    const kill = () => ctx.scene.entity.effect({ from: "keep_enemy", to: "hero", effect: "damage", via: { amount: 10000 } });
    kill();
    expect(session.units.has("hero")).toBe(false);
    await save.load();
    expect(session.units.has("hero")).toBe(true);
    expect(ctx.scene.entity.stats.get("hero", "health")!.current).toBe(380);
    kill();
    expect(session.units.has("hero")).toBe(false);
    expect(session.heroState.recoveryIn).toBe(20);
  });

  test("JSON battle checkpoint restores cargo, depletion, queues, economy, stats and clocks without duplication", async () => {
    const { ctx, save, step } = boot();
    const worker = [...session.units.values()].find((u) => u.catalogId === "peasant")!;
    const node = [...session.nodes.values()].find((n) => n.resource === "gold")!;
    orderSelection(ctx, { selection: [worker.id], point: [node.x, 0, node.z] });
    ctx.game.commands.run("train.peasant", {});
    step(3);
    const units = session.units.size;
    const gold = ctx.game.economy.balance("commander", "gold");
    const queued = activeJobs(session.production).length + queuedJobs(session.production).length;
    const elapsed = session.elapsed;
    const resources = session.resourceField!.snapshot();
    await save.save();
    step(20);
    await save.load();
    expect(session.units.size).toBe(units);
    expect(ctx.game.economy.balance("commander", "gold")).toBe(gold);
    expect(activeJobs(session.production).length + queuedJobs(session.production).length).toBe(queued);
    expect(session.elapsed).toBe(elapsed);
    expect(session.resourceField!.snapshot()).toEqual(resources);
    expect(session.units.get(worker.id)!.command.kind).toBe("gather");
    step(8);
    expect(session.units.size).toBe(units + 1);
    await save.load();
    step(8);
    expect(session.units.size).toBe(units + 1);
  });
});
