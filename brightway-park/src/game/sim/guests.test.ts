import { beforeEach, describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../../game.config";
import { content } from "../content";
import { resetSession, session, type GuestState, type PlacedObject } from "../session";
import { guestPreference, needPressure, seedGuests, spawnGuests, targetScore, tickGuests } from "./guests";
import { objectCapacity, objectPrice, objectServiceSeconds } from "./operations";

function guest(overrides: Partial<GuestState>): GuestState {
  return {
    id: "g1",
    kind: "guest",
    happy: 60,
    money: 50,
    hunger: 20,
    thirst: 20,
    souvenir: 0,
    visits: 0,
    phase: "seeking",
    targetId: null,
    target: null,
    busy: 0,
    litterTimer: 5,
    ...overrides,
  };
}

function obj(catalogId: string, patch: Partial<PlacedObject> = {}): PlacedObject {
  return { id: `${catalogId}#1`, catalogId, x: 0, z: 0, stock: 40, soldTotal: 0, occupants: 0, ...patch };
}

describe("brightway-park guest logic", () => {
  beforeEach(resetSession);
  test("need pressure rises past the comfort threshold", () => {
    expect(needPressure(30)).toBe(0);
    expect(needPressure(100)).toBeCloseTo(1);
    expect(needPressure(80)).toBeGreaterThan(needPressure(60));
  });

  test("a hungry guest with cash is drawn to a stocked food stall", () => {
    const hungry = guest({ hunger: 90 });
    expect(targetScore(hungry, obj("stall_food"), 0, 4)).toBeGreaterThan(0);
  });

  test("empty stall or broke guest is not a valid target", () => {
    expect(targetScore(guest({ hunger: 90 }), obj("stall_food", { stock: 0 }), 0, 4)).toBe(-1);
    expect(targetScore(guest({ hunger: 90, money: 2 }), obj("stall_food"), 0, 4)).toBe(-1);
  });

  test("a full ride is skipped", () => {
    const full = obj("ride_carousel", { occupants: 6 });
    expect(targetScore(guest({}), full, 0, 4)).toBe(-1);
    expect(targetScore(guest({}), obj("ride_carousel", { occupants: 0 }), 0, 4)).toBeGreaterThan(0);
  });

  test("family and thrill visitors choose different rides, and seek variety", () => {
    const family = guest({ kind: "guest_a" });
    const thrill = guest({ kind: "guest_c" });
    const gentle = obj("ride_carousel");
    const intense = obj("ride_dropzone");
    expect(guestPreference(family)).toBe("family");
    expect(targetScore(family, gentle, 0, 0)).toBeGreaterThan(targetScore(family, intense, 0, 0));
    expect(targetScore(thrill, intense, 0, 0)).toBeGreaterThan(targetScore(thrill, gentle, 0, 0));
    expect(targetScore(guest({ kind: "guest_a", visited: ["ride_carousel"] }), gentle, 0, 0)).toBeLessThan(targetScore(family, gentle, 0, 0));
  });

  test("closed and broken rides recover demand after reopening or repair", () => {
    const ride = obj("ride_carousel", { closed: true });
    expect(targetScore(guest({}), ride, 0, 0)).toBe(-1);
    ride.closed = false;
    ride.wear = 100;
    expect(targetScore(guest({}), ride, 0, 0)).toBe(-1);
    ride.wear = 20;
    expect(targetScore(guest({}), ride, 0, 0)).toBeGreaterThan(0);
  });

  test("stall service reservations cannot exceed capacity", () => {
    const ctx = createGameContext({ definition: game.game, content, player: { userId: "tester", isNew: true }, seed: "queues" });
    seedGuests(ctx, 8);
    session.open = true;
    const stall = obj("stall_food");
    session.placed.set(stall.id, stall);
    for (const visitor of session.guests.values()) visitor.hunger = 95;
    tickGuests(ctx, 0.01, 0);
    expect(stall.occupants).toBe(objectCapacity(stall));
    expect([...session.guests.values()].filter((visitor) => visitor.targetId === stall.id)).toHaveLength(objectCapacity(stall));
    expect([...session.guests.values()].filter((visitor) => visitor.phase === "leaving")).toHaveLength(0);
  });

  test("closing a busy stall releases its reservation without a sale, then reopening recovers", () => {
    const ctx = createGameContext({ definition: game.game, content, player: { userId: "tester", isNew: true }, seed: "recovery" });
    seedGuests(ctx, 1);
    session.open = true;
    const visitor = [...session.guests.values()][0]!;
    const stall = obj("stall_food", { closed: true, occupants: 1 });
    session.placed.set(stall.id, stall);
    visitor.hunger = 90;
    visitor.targetId = stall.id;
    visitor.target = [0, 0, 0];
    visitor.phase = "busy";
    visitor.busy = 0.01;
    const cash = session.cash;
    tickGuests(ctx, 0.1, 0);
    expect(stall.occupants).toBe(0);
    expect(stall.stock).toBe(40);
    expect(session.cash).toBe(cash);
    expect(visitor.targetId).toBeNull();
    stall.closed = false;
    tickGuests(ctx, 0.1, 0);
    expect(visitor.targetId).toBe(stall.id);
    expect(stall.occupants).toBe(1);
  });

  test("premium stall service charges the same quoted price and consumes one stock", () => {
    const ctx = createGameContext({ definition: game.game, content, player: { userId: "tester", isNew: true }, seed: "sale" });
    seedGuests(ctx, 1);
    session.open = true;
    const visitor = [...session.guests.values()][0]!;
    const stall = obj("stall_food", { upgrade: "premium", occupants: 1 });
    session.placed.set(stall.id, stall);
    visitor.money = 80;
    visitor.hunger = 95;
    visitor.targetId = stall.id;
    visitor.target = [0, 0, 0];
    visitor.phase = "busy";
    visitor.busy = 0.01;
    const cash = session.cash;
    tickGuests(ctx, 0.1, 0);
    expect(session.cash - cash).toBeCloseTo(objectPrice(stall));
    expect(80 - visitor.money).toBeCloseTo(objectPrice(stall));
    expect(stall.stock).toBe(39);
    expect(stall.occupants).toBe(0);
  });

  test("festival marketing raises arrivals while paused deltas do no work", () => {
    const ctx = createGameContext({ definition: game.game, content, player: { userId: "tester", isNew: true }, seed: "arrivals" });
    session.open = true;
    spawnGuests(ctx, 0, 10);
    expect(session.spawnAcc).toBe(0);
    spawnGuests(ctx, 0.05, 10);
    const local = session.spawnAcc;
    session.spawnAcc = 0;
    session.marketing = "festival";
    spawnGuests(ctx, 0.05, 10);
    expect(session.spawnAcc).toBeCloseTo(local * 1.3);
  });

  test("connected paths increase attraction demand and speed service", () => {
    const ctx = createGameContext({ definition: game.game, content, player: { userId: "tester", isNew: true }, seed: "access" });
    seedGuests(ctx, 1);
    session.open = true;
    const visitor = [...session.guests.values()][0]!;
    const ride = obj("ride_carousel", { x: 0, z: 48, occupants: 1 });
    session.placed.set(ride.id, ride);
    ctx.scene.entity.setPose(visitor.id, { position: [0, 0, 48] });
    visitor.targetId = ride.id;
    visitor.target = [0, 0, 48];
    const isolatedScore = targetScore(guest({}), { ...ride, occupants: 0 }, 0, 0);
    tickGuests(ctx, 0.1, 0);
    expect(visitor.busy).toBeCloseTo(objectServiceSeconds(ride) * 1.5);
    for (const z of [52, 56]) {
      const path = obj("path_walk", { id: `path-${z}`, x: 0, z });
      session.placed.set(path.id, path);
    }
    session.layoutRevision += 1;
    visitor.phase = "seeking";
    tickGuests(ctx, 0.1, 0);
    expect(visitor.busy).toBeCloseTo(objectServiceSeconds(ride));
    expect(targetScore(guest({}), { ...ride, occupants: 0 }, 0, 0)).toBeGreaterThan(isolatedScore * 2);
  });

  test("nearby shade reduces heatwave thirst and happiness loss", () => {
    const ctx = createGameContext({ definition: game.game, content, player: { userId: "tester", isNew: true }, seed: "shade" });
    seedGuests(ctx, 1);
    session.open = true;
    session.day = 2;
    const visitor = [...session.guests.values()][0]!;
    const ride = obj("ride_carousel", { x: 0, z: 48, occupants: 1 });
    session.placed.set(ride.id, ride);
    ctx.scene.entity.setPose(visitor.id, { position: [0, 0, 48] });
    Object.assign(visitor, { targetId: ride.id, target: [0, 0, 48], phase: "busy", busy: 100, happy: 60, hunger: 20, thirst: 20 });
    tickGuests(ctx, 1, 0);
    const exposed = { thirst: visitor.thirst, happy: visitor.happy };
    for (const [x, z] of [[-8, 48], [8, 48], [0, 40]]) {
      const tree = obj("deco_tree", { id: `tree-${x}-${z}`, x: x!, z: z! });
      session.placed.set(tree.id, tree);
    }
    session.layoutRevision += 1;
    Object.assign(visitor, { happy: 60, hunger: 20, thirst: 20 });
    tickGuests(ctx, 1, 0);
    expect(visitor.thirst).toBeLessThan(exposed.thirst);
    expect(visitor.happy).toBeGreaterThan(exposed.happy);
  });

  test("unserved visitors wait briefly, then leave with their money intact", () => {
    const ctx = createGameContext({ definition: game.game, content, player: { userId: "tester", isNew: true }, seed: "wait" });
    seedGuests(ctx, 1);
    session.open = true;
    const visitor = [...session.guests.values()][0]!;
    const cash = session.cash, money = visitor.money;
    tickGuests(ctx, 1, 0);
    expect(visitor.phase).toBe("seeking");
    for (let i = 0; i < 11; i++) tickGuests(ctx, 1, 0);
    expect(visitor.phase).toBe("leaving");
    expect(session.cash).toBe(cash);
    expect(visitor.money).toBe(money);
  });
});
