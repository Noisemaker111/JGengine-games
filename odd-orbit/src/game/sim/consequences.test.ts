import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { DAY_LENGTH } from "../../world";
import { game } from "../../game.config";
import { registerCommands } from "../commands";
import { content } from "../content";
import { householdStore } from "../session/store";
import { pairKey, type Lifestyle } from "../session/types";
import { nextBill } from "./economy";
import { setupWorld } from "./setup";
import { simulateHousehold, startConversation } from "./simulate";

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "orbit-policy-test", isNew: true } });
  setupWorld(ctx);
  registerCommands(ctx);
  ctx.game.commands.define("orbit.checkpoint", { apply() {} });
  setGamePhase(ctx, "playing");
  return ctx;
}

function advance(ctx: GameContext, seconds: number, step = 0.25): void {
  let remaining = seconds;
  while (remaining > 1e-8) {
    const dt = Math.min(remaining, step);
    simulateHousehold(ctx, ctx.time.advance(dt));
    remaining -= dt;
  }
}

function build(ctx: GameContext, toolId: string, x: number, z: number): void {
  ctx.game.commands.run("build.tool", { toolId });
  ctx.game.commands.run("world.pointer", { point: { x, y: 0, z }, entity: null, object: null });
}

function lifestyle(ctx: GameContext, style: Lifestyle): void {
  for (const id of householdStore.read(ctx).order) ctx.game.commands.run("member.lifestyle", { id, lifestyle: style });
}

function runDays(ctx: GameContext, days: number, buyFood: boolean, frameSeconds = 0.5): void {
  const end = DAY_LENGTH * days;
  while (ctx.time.now() < end) {
    const state = householdStore.read(ctx);
    if (buyFood && state.pantry <= 4 && state.credits >= 36) ctx.game.commands.run("household.rations", {});
    const remaining = end - ctx.time.now();
    simulateHousehold(ctx, ctx.time.advance(Math.min(frameSeconds, remaining)));
  }
}

describe("chosen daily rhythms", () => {
  test("career and garden households pay three nightly bills with distinct food and savings decisions", () => {
    const career = boot();
    lifestyle(career, "yield");
    build(career, "work_console", 4, 1);
    const garden = boot();
    lifestyle(garden, "bloom");
    build(garden, "bloom_planter", -4, -2);
    runDays(career, 3, true);
    runDays(garden, 3, false);
    const c = householdStore.read(career);
    const g = householdStore.read(garden);
    expect(c.debt).toBe(0);
    expect(g.debt).toBe(0);
    expect(c.economy.cursors.upkeep!.fired).toBe(3);
    expect(g.economy.cursors.upkeep!.fired).toBe(3);
    expect(c.lastDay!.income).toBeGreaterThan(g.lastDay!.income);
    expect(g.lastDay!.harvest).toBeGreaterThanOrEqual(8);
    expect(c.lastDay!.harvest).toBe(0);
    expect(c.credits).toBeGreaterThan(420);
    expect(g.credits).toBeGreaterThan(570);
    for (const state of [c, g]) {
      expect(state.pantry).toBeGreaterThan(0);
      for (const id of state.order) {
        expect(state.members[id]!.recovering).toBe(false);
        expect(state.members[id]!.needs.hunger).toBeGreaterThan(20);
        expect(state.members[id]!.needs.energy).toBeGreaterThan(20);
        expect(state.members[id]!.completedShifts).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test("a late Yield order closes without endless earnings; three completed days unlock flex scheduling", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    const member = state.members[state.order[0]!]!;
    const snapshot = ctx.time.snapshot();
    ctx.time.hydrate({ ...snapshot, now: DAY_LENGTH * 14 / 24 });
    member.action = { kind: "use", goal: "work", objId: "starter:work_console" };
    member.assignedByPlayer = true;
    const before = state.credits;
    advance(ctx, 1);
    expect(householdStore.read(ctx).credits).toBe(before);
    expect(member.missedShifts).toBe(1);
    expect(member.workToday).toBe(0);
    member.completedShifts = 3;
    member.needs = { hunger: 90, energy: 90, social: 90, fun: 90 };
    member.action = { kind: "use", goal: "work", objId: "starter:work_console" };
    member.assignedByPlayer = true;
    advance(ctx, 1);
    expect(householdStore.read(ctx).credits).toBeGreaterThan(before);
  });

  test("one console cannot serve two simultaneous shifts", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    const a = state.members[state.order[0]!]!;
    const b = state.members[state.order[2]!]!;
    for (const m of [a, b]) {
      m.needs = { hunger: 90, energy: 90, social: 90, fun: 90 };
      m.action = { kind: "use", goal: "work", objId: "starter:work_console" };
      m.assignedByPlayer = true;
      m.actionUntil = ctx.time.now() + 12;
    }
    const before = state.credits;
    advance(ctx, 1);
    expect(householdStore.read(ctx).credits - before).toBeLessThanOrEqual(5);
    expect(a.workToday + b.workToday).toBe(1);
  });
});

describe("failure and recovery", () => {
  test("empty pantry and overload stop work; relief has debt and rest restores agency", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    const member = state.members[state.order[0]!]!;
    state.credits = 0;
    state.pantry = 0;
    member.needs = { hunger: 10, energy: 10, social: 60, fun: 60 };
    member.stress = 79;
    member.action = { kind: "use", goal: "work", objId: "starter:work_console" };
    member.assignedByPlayer = true;
    advance(ctx, 2);
    expect(member.recovering).toBe(true);
    expect(member.workToday).toBe(0);
    ctx.game.commands.run("household.relief", {});
    expect(householdStore.read(ctx).pantry).toBe(4);
    expect(householdStore.read(ctx).debt).toBe(40);
    ctx.game.commands.run("household.relief", {});
    expect(householdStore.read(ctx).debt).toBe(40);
    advance(ctx, 85);
    expect(member.recovering).toBe(false);
    expect(member.stress).toBeLessThan(35);
    expect(member.needs.energy).toBeGreaterThan(50);
    expect(member.needs.hunger).toBeGreaterThan(35);
    expect(householdStore.read(ctx).events.some(e => e.text.includes("recovered"))).toBe(true);
    expect(nextBill(householdStore.read(ctx), ctx.scene.object.list())).toBeGreaterThan(100);
  });
});

describe("reciprocal trust", () => {
  test("both conversational partners recover needs; interrupting one ends the exchange", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    const a = state.members[state.order[0]!]!;
    const b = state.members[state.order[1]!]!;
    for (const m of [a,b]) { m.needs = { hunger: 90, energy: 90, social: 40, fun: 40 }; ctx.scene.entity.setPose(m.id, { position: [0, 0, 0] }); }
    startConversation(state, a, b, ctx.time.now());
    const before = state.relationships[pairKey(a.id, b.id)]!;
    advance(ctx, 2);
    expect(a.needs.social).toBeGreaterThan(50);
    expect(b.needs.social).toBeGreaterThan(50);
    expect(householdStore.read(ctx).relationships[pairKey(a.id,b.id)]!).toBeGreaterThan(before);
    ctx.game.commands.run("member.release", { id: b.id });
    advance(ctx, 0.25);
    expect(a.action.kind).not.toBe("social");
  });

  test("two stressed beings clash instead of farming friendship", () => {
    const ctx = boot();
    const state = householdStore.read(ctx);
    const a = state.members[state.order[0]!]!;
    const b = state.members[state.order[1]!]!;
    for (const m of [a,b]) { m.stress = 72; m.needs = { hunger: 90, energy: 90, social: 40, fun: 40 }; ctx.scene.entity.setPose(m.id, { position: [0, 0, 0] }); }
    startConversation(state, a, b, ctx.time.now());
    const before = state.relationships[pairKey(a.id,b.id)]!;
    advance(ctx, 2);
    expect(householdStore.read(ctx).relationships[pairKey(a.id,b.id)]!).toBeLessThan(before);
    expect(a.concern).toContain("clashed");
    expect(b.concern).toContain("clashed");
  });
});

test("paid time uses fractional progress without frame rounding loss or overtime", () => {
  for (const step of [0.25, 1 / 60]) {
    const ctx = boot();
    const state = householdStore.read(ctx);
    for (const id of state.order) state.members[id]!.lifestyle = "bloom";
    const worker = state.members[state.order[0]!]!;
    worker.lifestyle = "yield";
    worker.needs = { hunger: 95, energy: 95, social: 95, fun: 95 };
    worker.action = { kind: "use", goal: "work", objId: "starter:work_console" };
    worker.assignedByPlayer = true;
    const before = state.credits;
    advance(ctx, 20, step);
    expect(householdStore.read(ctx).credits - before).toBe(100);
    expect(worker.workToday).toBe(20);
    expect(worker.completedShifts).toBe(1);
    ctx.game.commands.run("member.lifestyle", { id: worker.id, lifestyle: "bloom" });
    expect(worker.lifestyle).toBe("yield");
    worker.action = { kind: "use", goal: "work", objId: "starter:work_console" };
    advance(ctx, 1, step);
    expect(householdStore.read(ctx).credits - before).toBe(100);
  }
});

test("earned friendship changes the payoff of tending together for both beings", () => {
  const ctx = boot();
  const state = householdStore.read(ctx);
  const a = state.members[state.order[0]!]!;
  const b = state.members[state.order[1]!]!;
  ctx.time.hydrate({ ...ctx.time.snapshot(), now: DAY_LENGTH * 14 / 24 });
  state.relationships[pairKey(a.id, b.id)] = 70;
  const planter = ctx.scene.object.get("starter:bloom_planter")!;
  for (const m of [a,b]) {
    m.lifestyle = "bloom";
    m.needs = { hunger: 95, energy: 95, social: 95, fun: 70 };
    m.action = { kind: "use", goal: "fun", objId: planter.instanceId };
    m.assignedByPlayer = true;
    ctx.scene.entity.setPose(m.id, { position: [...planter.position] });
  }
  advance(ctx, 20);
  expect(a.harvestToday).toBe(5);
  expect(b.harvestToday).toBe(5);
  expect(householdStore.read(ctx).dayHarvest).toBe(10);
  expect(householdStore.read(ctx).dayIncome).toBe(120);
});

test("slow rendered frames preserve three days of shifts, food and nightly settlement", () => {
  const results = [10, 2.5, 0.25, 1 / 60].map(frame => {
    const ctx = boot();
    lifestyle(ctx, "bloom");
    build(ctx, "bloom_planter", -4, -2);
    runDays(ctx, 3, false, frame);
    const state = householdStore.read(ctx);
    return { credits: state.credits, pantry: state.pantry, debt: state.debt, bill: state.lastDay!.bill, income: state.lastDay!.income, harvest: state.lastDay!.harvest, completed: state.order.map(id => state.members[id]!.completedShifts), recovering: state.order.map(id => state.members[id]!.recovering) };
  });
  for (const result of results) {
    expect(result.debt).toBe(0);
    expect(result.bill).toBe(results[1]!.bill);
    expect(Math.abs(result.income - results[1]!.income)).toBeLessThanOrEqual(24);
    expect(Math.abs(result.harvest - results[1]!.harvest)).toBeLessThanOrEqual(2);
    expect(result.completed).toEqual(results[1]!.completed);
    expect(result.recovering).toEqual([false, false, false, false]);
    expect(Math.abs(result.credits - results[1]!.credits)).toBeLessThanOrEqual(24);
    expect(Math.abs(result.pantry - results[1]!.pantry)).toBeLessThanOrEqual(2);
  }
}, 30000);

test("an unattended gap skips paid activity while preserving bills and need consequences", () => {
  const ctx = boot();
  const before = householdStore.read(ctx).credits;
  simulateHousehold(ctx, ctx.time.advance(DAY_LENGTH * 2));
  const state = householdStore.read(ctx);
  expect(state.day).toBe(2);
  expect(state.economy.cursors.upkeep!.fired).toBe(2);
  expect(state.credits).toBe(before - 194);
  expect(state.dayIncome).toBe(0);
  expect(state.order.every(id => state.members[id]!.recovering)).toBe(true);
  expect(state.events.some(event => event.text.includes("unattended interval"))).toBe(true);
});

test("unpaid upkeep becomes debt without deleting the household; later savings repay it", () => {
  const ctx = boot();
  const state = householdStore.read(ctx);
  state.credits = 0;
  state.debt = 40;
  const furniture = ctx.scene.object.list().length;
  simulateHousehold(ctx, ctx.time.advance(DAY_LENGTH - ctx.time.now()));
  const insolvent = householdStore.read(ctx);
  expect(insolvent.credits).toBe(0);
  expect(insolvent.debt).toBe(137);
  expect(insolvent.order).toHaveLength(4);
  expect(ctx.scene.object.list()).toHaveLength(furniture);
  insolvent.credits = 200;
  simulateHousehold(ctx, ctx.time.advance(DAY_LENGTH));
  const recovering = householdStore.read(ctx);
  expect(recovering.debt).toBe(97);
  expect(recovering.credits).toBe(63);
  expect(recovering.lastDay!.bill).toBe(137);
});
