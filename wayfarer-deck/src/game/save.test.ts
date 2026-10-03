import { expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import type { KeyValueStorage } from "@jgengine/core/game/keyValueStore";
import { game } from "../game.config";
import { onInit, onNewPlayer } from "../loop";
import { combatHandle } from "./combat";
import { content } from "./content";
import { CARD_CATALOG, cardTypeOf } from "./cards";
import { freshRouteState } from "./route";
import { parseRoadSave, readRoadSave, SAVE_KEY, validRoadSave, writeRoadSave, type LegacyRoadSave, type RoadSave } from "./save";

function sample(): RoadSave {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "ui-preview", isNew: true } });
  onInit(ctx); onNewPlayer(ctx);
  return { version: 2, phase: "combat", encounterIndex: 0, rewardSeed: 0, rewards: [], combat: combatHandle.read(ctx).capture()!, route: freshRouteState() };
}
function memory(raw?: string): { storage: KeyValueStorage; values: Map<string, string> } {
  const values = new Map<string, string>(raw === undefined ? [] : [[SAVE_KEY, raw]]);
  return { values, storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } } };
}

test("v2 save roundtrip retains detached ordered piles, route and combat", () => {
  const save = sample();
  const { storage } = memory();
  expect(validRoadSave(save)).toBe(true);
  expect(writeRoadSave(save, storage)).toBe(true);
  const loaded = readRoadSave(storage);
  expect(loaded).toEqual({ save, damaged: false, unavailable: false });
  loaded.save!.combat.log.push("Only the loaded copy changes");
  expect(save.combat.log).not.toContain("Only the loaded copy changes");
});

test("v1 migration keeps legacy five-fight progression without writing", () => {
  const { route: _route, ...base } = sample();
  const legacy: LegacyRoadSave = { ...base, version: 1, phase: "combat" };
  const raw = JSON.stringify(legacy);
  const { storage, values } = memory(raw);
  const migrated = readRoadSave(storage).save!;
  expect(validRoadSave(legacy)).toBe(true);
  expect(migrated.version).toBe(2);
  expect(migrated.route.legacy).toBe(true);
  expect(migrated.combat).toEqual(legacy.combat);
  expect(values.get(SAVE_KEY)).toBe(raw);
});

test("corrupt, newer and oversized saves remain stored", () => {
  for (const raw of ["broken", JSON.stringify({ ...sample(), version: 3 }), " ".repeat(128 * 1024 + 1)]) {
    const { storage, values } = memory(raw);
    expect(readRoadSave(storage)).toEqual({ save: null, damaged: true, unavailable: false });
    expect(values.get(SAVE_KEY)).toBe(raw);
  }
});

test("denied reads and writes report unavailable without destroying saves", () => {
  const storage: KeyValueStorage = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("denied"); } };
  expect(readRoadSave(storage)).toEqual({ save: null, damaged: false, unavailable: true });
  expect(writeRoadSave(sample(), storage)).toBe(false);
  expect(writeRoadSave(sample(), null)).toBe(false);
});

test("invalid route, stock, card ids and combat bounds reject before write", () => {
  const changes: ((save: RoadSave) => void)[] = [
    save => { save.route.path = ["low_road", "final_gate"]; save.route.nodeId = "final_gate"; },
    save => { save.route.coins = Number.POSITIVE_INFINITY; },
    save => { save.route.shop = { entries: [{ id: "tonic", kind: "heal", qty: 1, price: { currency: "road_coins", amount: 0 } }] }; },
    save => { save.combat.zones.hand = ["trail_cut#1", "trail_cut#1"]; },
    save => { save.combat.zones.deck = [...save.combat.zones.deck!, "trail_cut#bogus"]; },
    save => { save.combat.hero.weak = 21; },
    save => { save.combat.turn.round = 1.5; },
    save => { save.combat.log = Array(25).fill("line"); },
    save => { save.rewards = ["trail_cut"]; },
  ];
  for (const change of changes) {
    const save = sample(); change(save);
    const { storage, values } = memory("keep existing");
    expect(parseRoadSave(save)).toBeNull();
    expect(writeRoadSave(save, storage)).toBe(false);
    expect(values.get(SAVE_KEY)).toBe("keep existing");
  }
});


test("route, reward and shop saves retain choices and canonical stock", () => {
  const save = sample();
  save.combat.enemy.hp = 0;
  save.combat.phase = "won";
  save.route.battlesWon = 1;
  save.phase = "reward";
  save.rewards = Object.values(CARD_CATALOG).filter(card => !card.type.endsWith("+")).slice(0, 3).map(card => card.type);
  expect(validRoadSave(save)).toBe(true);
  save.phase = "route"; save.rewards = [];
  expect(validRoadSave(save)).toBe(true);
  save.phase = "shop"; save.route.nodeId = "tollhouse"; save.route.path.push("tollhouse");
  save.route.shop = { entries: [
    ...Object.values(CARD_CATALOG).filter(card => !card.type.endsWith("+")).slice(0, 3).map(card => ({ id: `card:${card.type}`, kind: "card", qty: 1, price: { currency: "road_coins", amount: 20 } })),
    { id: "tonic", kind: "heal", qty: 0, price: { currency: "road_coins", amount: 12 } },
    { id: "prune", kind: "prune", qty: 1, price: { currency: "road_coins", amount: 14 } },
  ] };
  const { storage } = memory();
  expect(writeRoadSave(save, storage)).toBe(true);
  expect(readRoadSave(storage).save).toEqual(save);
  save.route.battlesWon = 2;
  expect(validRoadSave(save)).toBe(false);
});

test("upgraded cards and a pruned pack remain valid across reload", () => {
  const save = sample();
  const zones = save.combat.zones;
  const id = zones.hand![0]!;
  const type = `${cardTypeOf(id)}+`;
  expect(Object.hasOwn(CARD_CATALOG, type)).toBe(true);
  zones.hand = zones.hand!.map(card => card === id ? `${type}${id.slice(id.indexOf("#"))}` : card);
  zones.deck = zones.deck!.slice(0, 3);
  expect(zones.hand!.length + zones.deck!.length).toBe(8);
  const { storage } = memory();
  expect(writeRoadSave(save, storage)).toBe(true);
  expect(readRoadSave(storage).save!.combat.zones).toEqual(zones);
});
