import { expect, test } from "bun:test";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import type { KeyValueStorage } from "@jgengine/core/game/keyValueStore";
import { game } from "../../game.config";
import { registerCommands } from "../commands";
import { FURNITURE_BY_ID } from "../objects/catalog";
import { content } from "../content";
import { setupWorld } from "../sim/setup";
import { advanceLifeEvents, LIFE_EVENT_SECONDS } from "../sim/events";
import { simulateHousehold } from "../sim/simulate";
import { pairKey } from "./types";
import { householdStore } from "./store";
import { captureOrbitSave, ORBIT_SAVE_KEY, readOrbitSave, restoreOrbitSave, validOrbitSave, writeOrbitSave, type OrbitSave } from "./save";

function boot() {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "orbit-save-test", isNew: true } });
  setupWorld(ctx);
  return ctx;
}
function memory(raw?: string): { storage: KeyValueStorage; values: Map<string, string> } {
  const values = new Map<string, string>(raw === undefined ? [] : [[ORBIT_SAVE_KEY, raw]]);
  return { values, storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } } };
}

test("household, furniture, order, positions and clock roundtrip together", () => {
  const first = boot();
  first.time.setSpeed(4);
  simulateHousehold(first, first.time.advance(8));
  first.scene.object.place("sleep_pod", 5, 0, 5, { instanceId: "placed:sleep_pod:1", rotation: Math.PI / 2 });
  first.scene.object.rotate("hab:hab_wall:-9:-9", Math.PI);
  const state = householdStore.read(first);
  state.order.reverse();
  state.selectedMemberId = state.order[0]!;
  state.members[state.order[0]!]!.assignedByPlayer = true;
  state.members[state.order[0]!]!.action = { kind: "seek", goal: "energy", objId: "placed:sleep_pod:1" };
  state.debt = 81;
  state.pantry = 7;
  state.members[state.order[1]!]!.completedShifts = 3;
  first.scene.entity.stats.set(state.order[0]!, "health", { current: 88 });
  householdStore.write(first, { ...state });
  const before = captureOrbitSave(first);
  expect(validOrbitSave(before)).toBe(true);
  const { storage } = memory();
  expect(writeOrbitSave(first, storage)).toBe(true);
  const loaded = readOrbitSave(storage);
  expect(loaded).toEqual({ save: before, damaged: false, unavailable: false });
  const second = boot();
  restoreOrbitSave(second, loaded.save!);
  expect(captureOrbitSave(second)).toEqual(before);
  expect(second.scene.object.get("placed:sleep_pod:1")!.rotationY).toBe(Math.PI / 2);
  expect(second.scene.object.get("hab:hab_wall:-9:-9")!.rotationY).toBe(Math.PI);
  const dt = first.time.advance(1);
  simulateHousehold(first, dt);
  simulateHousehold(second, second.time.advance(1));
  expect(captureOrbitSave(second)).toEqual(captureOrbitSave(first));
});

test("nightly ledger cursor restores without charging twice", () => {
  const first = boot();
  simulateHousehold(first, first.time.advance(132));
  const settled = captureOrbitSave(first);
  expect(settled.household.day).toBe(1);
  expect(validOrbitSave(settled)).toBe(true);
  const second = boot(); restoreOrbitSave(second, settled);
  const credits = householdStore.read(second).credits;
  simulateHousehold(second, second.time.advance(0.25));
  expect(householdStore.read(second).credits).toBe(credits);
  expect(householdStore.read(second).economy).toEqual(settled.household.economy);
});

test("corrupt and newer saves are preserved, denied storage stays truthful", () => {
  for (const raw of ["broken", JSON.stringify({ ...captureOrbitSave(boot()), version: 2 }), " ".repeat(256 * 1024 + 1)]) {
    const { storage, values } = memory(raw);
    expect(readOrbitSave(storage)).toEqual({ save: null, damaged: true, unavailable: false });
    expect(values.get(ORBIT_SAVE_KEY)).toBe(raw);
  }
  const denied: KeyValueStorage = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("denied"); } };
  expect(readOrbitSave(denied)).toEqual({ save: null, damaged: false, unavailable: true });
  expect(writeOrbitSave(boot(), denied)).toBe(false);
  expect(writeOrbitSave(boot(), null)).toBe(false);
});

test("bounded needs, relationships, economy, schedules and world reject atomically", () => {
  const changes: ((save: OrbitSave) => void)[] = [
    save => { save.household.members[save.household.order[0]!]!.needs.hunger = 101; },
    save => { save.household.members[save.household.order[0]!]!.shiftProgress = 21; },
    save => { save.household.members[save.household.order[0]!]!.actionUntil = Number.POSITIVE_INFINITY; },
    save => { save.household.relationships[Object.keys(save.household.relationships)[0]!] = -101; },
    save => { save.household.economy.rules.upkeep!.amount = 0; },
    save => { save.household.economy.cursors.upkeep!.nextDueSeconds = 0; },
    save => { save.household.order[1] = save.household.order[0]!; },
    save => { save.household.debt = -1; },
    save => { save.clock.now = Number.NaN; },
    save => { save.household.nextLifeEventAt = save.clock.now + LIFE_EVENT_SECONDS + 1; },
    save => { save.household.nextLifeEventAt = -1; },
    save => { save.objects = [null] as unknown as OrbitSave["objects"]; },
    save => { save.entities = [null] as unknown as OrbitSave["entities"]; },
    save => { save.objects[0]!.catalogId = "unknown"; },
    save => { save.entities[0]!.position = [Number.POSITIVE_INFINITY, 0, 0]; },
  ];
  for (const change of changes) {
    const first = boot();
    const before = captureOrbitSave(first);
    const bad = structuredClone(before); change(bad);
    expect(validOrbitSave(bad)).toBe(false);
    expect(() => restoreOrbitSave(first, bad)).toThrow("Invalid Odd Orbit save");
    expect(captureOrbitSave(first)).toEqual(before);
  }
});


test("life event deadline reload fires the same effect exactly once", () => {
  const first = boot();
  const deadline = householdStore.read(first).nextLifeEventAt;
  simulateHousehold(first, first.time.advance(deadline - first.time.now() - 0.25));
  const { storage } = memory();
  expect(writeOrbitSave(first, storage)).toBe(true);
  const second = boot(); restoreOrbitSave(second, readOrbitSave(storage).save!);
  simulateHousehold(first, first.time.advance(0.5));
  simulateHousehold(second, second.time.advance(0.5));
  expect(householdStore.read(first).nextLifeEventAt).toBe(deadline + LIFE_EVENT_SECONDS);
  expect(captureOrbitSave(second)).toEqual(captureOrbitSave(first));
  const after = captureOrbitSave(second);
  const third = boot(); restoreOrbitSave(third, after);
  simulateHousehold(second, second.time.advance(0.25)); simulateHousehold(third, third.time.advance(0.25));
  expect(householdStore.read(third).nextLifeEventAt).toBe(after.household.nextLifeEventAt);
  expect(householdStore.read(third).eventSeq).toBe(after.household.eventSeq);
  expect(captureOrbitSave(third)).toEqual(captureOrbitSave(second));
});

test("a far future reload skips missed life events and preserves the next deadline", () => {
  const first = boot();
  simulateHousehold(first, first.time.advance(210 * 9));
  first.time.advance(150);
  const saved = captureOrbitSave(first);
  expect(saved.clock.calendar.day).toBeGreaterThan(8);
  expect(saved.household.nextLifeEventAt).toBeLessThan(saved.clock.now);
  expect(validOrbitSave(saved)).toBe(true);
  const second = boot(); restoreOrbitSave(second, saved);
  for (const ctx of [first, second]) {
    const state = householdStore.read(ctx);
    advanceLifeEvents(state, ctx.time.now());
    householdStore.write(ctx, { ...state });
  }
  const after = captureOrbitSave(second);
  expect(after).toEqual(captureOrbitSave(first));
  expect(after.household.eventSeq).toBe(saved.household.eventSeq + 1);
  expect(after.household.nextLifeEventAt).toBeGreaterThan(after.clock.now);
  expect(after.household.nextLifeEventAt).toBeLessThanOrEqual(after.clock.now + LIFE_EVENT_SECONDS);
  advanceLifeEvents(householdStore.read(second), second.time.now());
  expect(captureOrbitSave(second)).toEqual(after);
});


test("building after reload allocates a distinct placement and charges once", () => {
  const first = boot(); registerCommands(first); setGamePhase(first, "playing");
  first.game.commands.run("build.tool", { toolId: "sleep_pod" });
  first.game.commands.run("world.pointer", { point: { x: 18, y: 0, z: 18 }, entity: null, object: null });
  const firstId = first.scene.object.list().find(object => object.instanceId.startsWith("placed:"))!.instanceId;
  const { storage } = memory();
  expect(writeOrbitSave(first, storage)).toBe(true);
  const second = boot(); restoreOrbitSave(second, readOrbitSave(storage).save!);
  registerCommands(second); setGamePhase(second, "playing");
  second.game.commands.run("build.tool", { toolId: "sleep_pod" });
  second.game.commands.run("world.pointer", { point: { x: 18, y: 0, z: 10 }, entity: null, object: null });
  const placed = second.scene.object.list().filter(object => object.instanceId.startsWith("placed:"));
  expect(placed.map(object => object.instanceId)).toEqual([firstId, "placed:sleep_pod:2"]);
  expect(householdStore.read(second).credits).toBe(640 - FURNITURE_BY_ID.sleep_pod!.cost * 2);
  expect(householdStore.read(second).buildTool).toBeNull();
  expect(validOrbitSave(captureOrbitSave(second))).toBe(true);
});

test("an interrupted reciprocal activity reload releases the partner without awarding a bond", () => {
  const first = boot();
  const state = householdStore.read(first);
  const [aId, bId] = state.order;
  const a = state.members[aId!]!;
  const b = state.members[bId!]!;
  a.needs = { hunger: 10, energy: 80, social: 60, fun: 60 };
  a.action = { kind: "idle" };
  b.action = { kind: "social", withId: a.id };
  b.assignedByPlayer = true;
  b.actionUntil = first.time.now() + 10;
  householdStore.write(first, { ...state, members: { ...state.members } });
  const before = captureOrbitSave(first);
  const second = boot(); restoreOrbitSave(second, before);
  for (const ctx of [first, second]) simulateHousehold(ctx, ctx.time.advance(0.25));
  const after = captureOrbitSave(second);
  expect(after).toEqual(captureOrbitSave(first));
  expect(after.household.members[b.id]!.action.kind).not.toBe("social");
  expect(after.household.members[b.id]!.assignedByPlayer).toBe(false);
  expect(after.household.relationships[pairKey(a.id, b.id)]).toBeLessThanOrEqual(before.household.relationships[pairKey(a.id, b.id)]!);
});
