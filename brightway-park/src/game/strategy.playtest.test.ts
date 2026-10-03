import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { game } from "../game.config";
import { loop } from "../loop";
import { content } from "./content";
import { session } from "./session";
import { snapshotPark } from "./persistence";
import { currentMetrics } from "./sim/economy";
import { objectUpkeep, weatherForDay } from "./sim/operations";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let records: Map<string, string>;
beforeEach(() => {
  records = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => records.set(key, value), removeItem: (key: string) => records.delete(key) } });
});
afterEach(() => { if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage); else Reflect.deleteProperty(globalThis, "localStorage"); });
function boot(): HeadlessRunner { return createHeadlessRunner({ definition: game.game, content, loop, maxStepSeconds: .25 }); }
function step(runner: HeadlessRunner, seconds: number): void { for (let i = 0; i < seconds * 4; i++) runner.step(.25); }
function build(runner: HeadlessRunner, id: string, x: number, z: number): void {
  const count = session.placed.size;
  runner.ui.invoke("build.select", { id });
  runner.ui.invoke("park.pointer", { point: [x, 0, z], object: null, entity: null });
  expect(session.placed.size).toBe(count + 1);
}
function plan(runner: HeadlessRunner, premium: boolean): void {
  runner.ui.invoke("park.start");
  build(runner, "ride_carousel", -12, 20);
  build(runner, "staff_janitor", 8, 24);
  runner.ui.invoke("park.policy", { key: "marketing", value: premium ? "festival" : "local" });
  runner.ui.invoke("park.policy", { key: "supply", value: premium ? "buffered" : "lean" });
  for (const object of session.placed.values()) if (object.catalogId.startsWith("ride_")) runner.ui.invoke("build.upgrade", { id: object.id, upgrade: premium ? "premium" : "efficient" });
}
function season(premium: boolean) {
  const runner = boot();
  plan(runner, premium);
  for (let seconds = 0; seconds < 600 && !session.won && !session.gameOver; seconds++) {
    if (seconds === 40) build(runner, "stall_drink", 8, 20);
    if (seconds % 50 === 0) for (const object of session.placed.values()) if ((object.wear ?? 0) > 50) runner.ui.invoke("build.repair", { id: object.id });
    step(runner, 1);
  }
  return { won: session.won, cash: session.cash, revenue: session.revenueYesterday, upkeep: session.upkeepYesterday, happiness: session.happinessAvg, litter: session.litter, day: session.day, appeal: currentMetrics().totalAppeal };
}

describe("independent park strategy playtests", () => {
  test("efficient local and premium festival parks earn the blue ribbon through real guest spending", () => {
    const local = season(false);
    records.clear();
    const festival = season(true);
    for (const result of [local, festival]) {
      expect(result.won).toBe(true);
      expect(result.day).toBeGreaterThan(1);
      expect(result.revenue).toBeGreaterThan(result.upkeep);
      expect(result.happiness).toBeGreaterThanOrEqual(50);
      expect(result.litter).toBeLessThanOrEqual(40);
    }
    expect(festival.appeal).toBeGreaterThan(local.appeal);
    expect(festival.upkeep).toBeGreaterThan(local.upkeep);
    expect(festival.cash).not.toBe(local.cash);
  }, 15_000);
  test("priced-out festival crowds cannot fund escalating overhead and bankruptcy", () => {
    const runner = boot();
    plan(runner, true);
    runner.ui.invoke("park.ticket", { delta: 42 });
    for (let seconds = 0; seconds < 3000 && !session.gameOver; seconds++) step(runner, 1);
    expect(session.gameOver).toBe(true);
    expect(session.revenueYesterday).toBe(0);
    expect(session.bankruptDays).toBe(3);
  }, 20_000);
  test("closing a worn ride trades availability for cheap recovery and reopening", () => {
    const runner = boot();
    plan(runner, false);
    step(runner, 50);
    const object = [...session.placed.values()].find(object => object.catalogId === "ride_carousel")!;
    const wear = object.wear ?? 0;
    expect(wear).toBeGreaterThan(0);
    const upkeep = objectUpkeep(object);
    runner.ui.invoke("build.toggle", { id: object.id });
    expect(object.closed).toBe(true);
    expect(objectUpkeep(object)).toBeLessThan(upkeep);
    step(runner, 20);
    expect(object.wear ?? 0).toBeLessThan(wear);
    runner.ui.invoke("build.toggle", { id: object.id });
    expect(object.closed).toBe(false);
  });
  test("free play funds unlocked construction and maintenance through heat and rain", () => {
    const runner = boot();
    plan(runner, false);
    let expanded = false;
    const weather = new Set<string>();
    for (let seconds = 0; seconds < 750 && session.day < 5 && !session.gameOver; seconds++) {
      if (seconds === 40) build(runner, "stall_drink", 8, 20);
      if (session.won && !session.winDismissed) runner.ui.invoke("park.continue");
      if (session.winDismissed && !expanded) {
        build(runner, "path_walk", 0, 8);
        build(runner, "ride_ferris", 0, 0);
        expanded = true;
      }
      if (seconds % 40 === 0) for (const object of session.placed.values()) if ((object.wear ?? 0) > 50) runner.ui.invoke("build.repair", { id: object.id });
      weather.add(weatherForDay(session.day).id);
      step(runner, 1);
    }
    expect(expanded).toBe(true);
    expect(session.gameOver).toBe(false);
    expect(session.day).toBeGreaterThanOrEqual(5);
    expect(session.cash).toBeGreaterThan(0);
    expect(weather.has("heat")).toBe(true);
    expect(weather.has("rain")).toBe(true);
    expect(currentMetrics().rides).toBe(4);
  }, 60_000);
  test("pause/save/full reload retain constructed park, chosen policies and upgrade decisions", () => {
    const runner = boot();
    plan(runner, true);
    step(runner, 10);
    runner.ui.invoke("pauseToggle");
    const frozen = snapshotPark(runner.ctx);
    step(runner, 5);
    expect(snapshotPark(runner.ctx)).toEqual(frozen);
    runner.ui.invoke("park.save");
    const reloaded = boot();
    expect(session.hasSave).toBe(true);
    expect(session.started).toBe(false);
    expect(session.marketing).toBe("festival");
    expect(session.supply).toBe("buffered");
    expect([...session.placed.values()].filter(object => object.upgrade === "premium")).toHaveLength(3);
    expect(session.cash).toBe(frozen.stats.cash);
    expect(reloaded.ctx.time.isPaused()).toBe(true);
    reloaded.ui.invoke("park.start");
    expect(reloaded.ctx.time.isPaused()).toBe(false);
  });
});
