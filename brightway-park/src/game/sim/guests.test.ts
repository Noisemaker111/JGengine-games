import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { content } from "../content";
import { resetSession, session } from "../session";
import type { GuestState, PlacedObject } from "../session";
import { needPressure, targetScore, tickGuests } from "./guests";

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
});


describe("ride audience choices", () => {
  test("families prefer gentle rides while thrill seekers prefer the drop tower at the same distance", () => {
    const family = guest({ kind: "guest_a" });
    const thrill = guest({ kind: "guest_d" });
    expect(targetScore(family, obj("ride_carousel"), 0, 4)).toBeGreaterThan(targetScore(family, obj("ride_dropzone"), 0, 4));
    expect(targetScore(thrill, obj("ride_dropzone"), 0, 4)).toBeGreaterThan(targetScore(thrill, obj("ride_carousel"), 0, 4));
  });

  function completeRide(kind: string, ride: string): number {
    resetSession();
    const ctx = createGameContext({ definition: defineGameDefinition({ name: "Ride fit", multiplayer: "off" }), content, player: { userId: "p1", isNew: true } });
    const attraction = obj(ride, { occupants: 1 });
    const rider = guest({ kind, phase: "busy", targetId: attraction.id, busy: 0.1 });
    session.placed.set(attraction.id, attraction);
    session.guests.set(rider.id, rider);
    ctx.scene.entity.spawn(kind, { id: rider.id, position: [0, 0, 0], role: "npc" });
    tickGuests(ctx, 0.2, 0);
    expect(attraction.occupants).toBe(0);
    expect(rider.visits).toBe(1);
    return rider.happy;
  }

  test("actual ride completion improves matching audiences and disappoints the opposite audience", () => {
    expect(completeRide("guest_a", "ride_carousel")).toBeGreaterThan(60);
    expect(completeRide("guest_a", "ride_dropzone")).toBeLessThan(60);
    expect(completeRide("guest_d", "ride_dropzone")).toBeGreaterThan(60);
    expect(completeRide("guest_d", "ride_carousel")).toBeLessThan(60);
  });
});
