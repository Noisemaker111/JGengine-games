import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { game } from "../game.config";
import { loop } from "../loop";
import { content } from "./content";
import { DAY_LENGTH } from "./catalog";
import { session } from "./session";
import { archiveSave, decodeSave, SAVE_KEY, snapshotPark } from "./persistence";
import { economyDayTick } from "./sim/economy";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let records: Map<string, string>;
beforeEach(() => {
  records = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  } });
});
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});
const runner = () => createHeadlessRunner({ definition: game.game, content, loop, maxStepSeconds: 1 });

describe("park saves and real command boundaries", () => {
  test("menu blocks shortcuts; build, refund, ticket and occupied cells survive reload", () => {
    const first = runner();
    first.ui.invoke("pickCarousel");
    expect(session.selectedTool).toBeNull();
    first.ui.invoke("park.start");
    first.ui.invoke("build.select", { id: "ride_dropzone" });
    expect(session.selectedTool).toBeNull();
    first.ui.invoke("pickCarousel");
    const cash = session.cash;
    first.ui.invoke("park.pointer", { point: [-40, 0, -40], object: null, entity: null });
    expect(session.cash).toBe(cash - 850);
    const built = [...session.placed.values()].at(-1)!;
    first.ui.invoke("park.ticket", { delta: 3 });
    first.ui.invoke("pauseToggle");
    const saved = snapshotPark(first.ctx);
    const nextRandom = first.ctx.rng();
    const second = runner();
    expect(second.ctx.rng()).toBe(nextRandom);
    expect(session.started).toBe(false);
    expect(session.hasSave).toBe(true);
    expect(session.ticketPrice).toBe(21);
    expect(session.placed.get(built.id)).toEqual(built);
    expect(session.occupied.get("-40,-40")).toBe(built.id);
    expect(snapshotPark(second.ctx).guests).toEqual(saved.guests);
    expect(second.ctx.time.isPaused()).toBe(true);
    second.ui.invoke("park.start");
    second.ui.invoke("build.demolish", { id: built.id });
    expect(session.cash).toBe(cash - 425);
    expect(session.occupied.has("-40,-40")).toBe(false);
  });

  test("midnight settles once; reload retains ledger cursor and pauses pending awards", () => {
    const first = runner();
    first.ui.invoke("park.start");
    // Set up the last fraction before midnight through the published clock API.
    first.ctx.time.hydrate({ ...first.ctx.time.snapshot(), now: DAY_LENGTH - .01, paused: false });
    first.step(.02);
    expect(session.day).toBe(2);
    expect(session.ledger.cursors["daily-upkeep"]!.fired).toBe(1);
    session.won = true;
    first.ui.invoke("park.save");
    const second = runner();
    expect(session.ledger.cursors["daily-upkeep"]!.fired).toBe(1);
    second.ui.invoke("park.start");
    expect(second.ctx.time.isPaused()).toBe(true);
    second.ui.invoke("park.continue");
    expect(second.ctx.time.isPaused()).toBe(false);
    second.ctx.time.hydrate({ ...second.ctx.time.snapshot(), now: 2 * DAY_LENGTH - .01 });
    second.step(.02);
    expect(session.day).toBe(3);
    expect(session.ledger.cursors["daily-upkeep"]!.fired).toBe(2);
  });

  test("overlap is rejected and explicit new park archives the exact prior save", () => {
    const live = runner();
    live.ui.invoke("park.start");
    const raw = records.get(SAVE_KEY)!;
    const corrupt = JSON.parse(raw);
    corrupt.placed.push({ ...corrupt.placed[0], id: "duplicate-location" });
    expect(decodeSave(JSON.stringify(corrupt))).toBeNull();
    archiveSave();
    expect(records.has(SAVE_KEY)).toBe(false);
    expect([...records.entries()].find(([key]) => key.startsWith(`${SAVE_KEY}.backup.`))?.[1]).toBe(raw);
  });

  test("a playable starter expansion earns the award; three debt settlements end play", () => {
    const live = runner();
    live.ui.invoke("park.start");
    live.ui.invoke("pickCarousel");
    live.ui.invoke("park.pointer", { point: [-40, 0, -40], object: null, entity: null });
    live.ui.invoke("build.clear");
    live.ui.invoke("build.select", { id: "staff_janitor" });
    live.ui.invoke("park.pointer", { point: [-36, 0, -28], object: null, entity: null });
    // Advance a finite season through the actual loop, without forcing award stats.
    for (let frame = 0; frame < 450; frame++) live.step(1);
    expect(session.won).toBe(true);
    expect(live.ctx.time.isPaused()).toBe(true);
    live.ui.invoke("park.continue");
    session.cash = -100_000;
    for (let day = 0; day < 3; day++) economyDayTick(live.ctx);
    expect(session.gameOver).toBe(true);
    expect(live.ctx.time.isPaused()).toBe(true);
    const cash = session.cash;
    live.ui.invoke("park.ticket", { delta: 2 });
    live.ui.invoke("pickCarousel");
    expect(session.cash).toBe(cash);
    expect(session.selectedTool).toBe("staff_janitor");
  });
});
