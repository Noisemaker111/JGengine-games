import { beforeEach, describe, expect, test } from "bun:test";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { content } from "../content";
import { resetSession, session, type PlacedObject } from "../session";
import { tickRidePark } from "./guests";
import { joinRide, resetRides, rideBoard, rideStats, rideView, serviceRide, syncRidePark } from "./rides";

function context() {
  return createGameContext({
    definition: defineGameDefinition({ name: "Brightway ride test", multiplayer: "off" }),
    content,
    player: { userId: "p1", isNew: true },
    seed: "ride-test",
  });
}

function carousel(): PlacedObject {
  return { id: "ride_carousel#1", catalogId: "ride_carousel", x: 0, z: 20, stock: 0, soldTotal: 0, occupants: 0 };
}

describe("brightway-park rides on the shared ride sim", () => {
  beforeEach(() => {
    resetSession();
    resetRides();
    session.open = true;
  });

  test("a breakdown takes the ride offline, keeps its line, and the park's read says so", () => {
    const ctx = context();
    session.placed.set("ride_carousel#1", carousel());
    // A deterministic rng of 0 breaks the ride on its first completed cycle.
    syncRidePark(() => 0);
    for (let i = 0; i < 12; i += 1) joinRide("ride_carousel#1", `guest#${i}`);

    // Board, ride, unload: the carousel's own 13-second cycle.
    for (let i = 0; i < 200; i += 1) tickRidePark(ctx, 0.1);

    const view = rideView("ride_carousel#1")!;
    expect(view.phase).toBe("broken");
    expect(view.breakdowns).toBe(1);
    // Six boarded and are unloaded, six are still waiting, and nothing boards while it is down.
    expect(view.queue.size).toBe(6);
    expect(view.queue.wait.seconds).toBeGreaterThan(0);
    expect(rideStats().rides).toBe(1);
    expect(rideBoard()).toMatchObject({ rides: 1, online: 0, broken: 1, queued: 6 });
  });

  test("a repaired ride comes back and takes its waiting line", () => {
    const ctx = context();
    session.placed.set("ride_carousel#1", carousel());
    syncRidePark(() => 0);
    for (let i = 0; i < 8; i += 1) joinRide("ride_carousel#1", `guest#${i}`);
    for (let i = 0; i < 200; i += 1) tickRidePark(ctx, 0.1);
    const broken = rideView("ride_carousel#1")!;
    expect(broken.phase).toBe("broken");

    tickRidePark(ctx, broken.phaseSeconds + 1);
    const repaired = rideView("ride_carousel#1")!;
    expect(repaired.phase).not.toBe("broken");
    expect(repaired.breakdowns).toBe(1);

    // The head of the line boards on the next tick and the line shrinks.
    tickRidePark(ctx, 0.1);
    expect(rideView("ride_carousel#1")!.queue.size).toBeLessThan(repaired.queue.size);
  });

  test("servicing a ride clears the wear a breakdown curve reads", () => {
    const ctx = context();
    session.placed.set("ride_carousel#1", carousel());
    // An rng of 1 never breaks, so the ride just accumulates cycles.
    syncRidePark(() => 1);
    for (let i = 0; i < 4; i += 1) joinRide("ride_carousel#1", `guest#${i}`);
    for (let i = 0; i < 100; i += 1) tickRidePark(ctx, 0.2);
    const worn = rideView("ride_carousel#1")!;
    expect(worn.wear).toBeGreaterThan(0);

    const service = serviceRide("ride_carousel#1")!;
    expect(service.cost).toBeGreaterThan(0);
    expect(service.wear).toBe(worn.wear);
    expect(rideView("ride_carousel#1")!.wear).toBe(0);
  });

  test("a build or a demolition re-syncs the sim and keeps surviving ride state", () => {
    const ctx = context();
    session.placed.set("ride_carousel#1", carousel());
    syncRidePark(() => 1);
    for (let i = 0; i < 3; i += 1) joinRide("ride_carousel#1", `guest#${i}`);
    for (let i = 0; i < 30; i += 1) tickRidePark(ctx, 0.2);
    const before = rideView("ride_carousel#1")!;

    session.placed.set("ride_ferris#1", { ...carousel(), id: "ride_ferris#1", catalogId: "ride_ferris" });
    syncRidePark(() => 1);
    expect(rideStats().rides).toBe(2);
    const after = rideView("ride_carousel#1")!;
    expect(after.cycles).toBe(before.cycles);
    expect(after.wear).toBe(before.wear);

    session.placed.delete("ride_ferris#1");
    syncRidePark(() => 1);
    expect(rideStats().rides).toBe(1);
  });
});
