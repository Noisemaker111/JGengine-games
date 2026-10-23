import { beforeEach, describe, expect, test } from "bun:test";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { content } from "./content";
import { agentOf } from "./agents";
import { resetSession, session, type PlacedObject } from "./session";
import { tickRidePark, tickGuests, seedGuests } from "./sim/guests";
import { joinRide, resetRides, rideBoard, rideDefinition, coasterCircuit, rideStats, rideView, serviceRide, syncRidePark } from "./rides";

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

  test("a guest that reaches a ride joins its line, boards, and pays its ticket", () => {
    const ctx = context();
    session.placed.set("ride_carousel#1", carousel());
    syncRidePark(() => 1);
    seedGuests(ctx, 1);
    const guest = [...session.guests.values()][0]!;
    const agent = agentOf(guest, ctx.rng);
    agent.needs.refill("fun", -agent.needs.value("fun"));
    ctx.scene.entity.setPose(guest.id, { position: [0, 0, 56] });
    const cashBefore = session.cash;

    for (let i = 0; i < 900; i += 1) {
      tickRidePark(ctx, 0.1);
      tickGuests(ctx, 0.1, 14);
    }

    const view = rideView("ride_carousel#1")!;
    expect(view.cycles).toBeGreaterThan(0);
    expect(guest.visits).toBeGreaterThan(0);
    expect(session.cash).toBeGreaterThan(cashBefore);
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

  test("a build or a demolition re-syncs the sim and keeps surviving ride state", () => {    const ctx = context();
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

  test("the train runs the track's own lap and is back at the station when it ends", () => {
    const ctx = context();
    session.placed.set("ride_coaster#1", { ...carousel(), id: "ride_coaster#1", catalogId: "ride_coaster", x: -8, z: 4 });
    // A 5 x 3 ring of track around the station: 12 pieces, one closed lap.
    for (let i = 0; i < 5; i += 1) session.placed.set(`track_piece#${i}`, { ...carousel(), id: `track_piece#${i}`, catalogId: "track_piece", x: i * 4, z: 0 });
    for (let i = 1; i < 3; i += 1) session.placed.set(`track_piece#r${i}`, { ...carousel(), id: `track_piece#r${i}`, catalogId: "track_piece", x: 16, z: i * 4 });
    for (let i = 3; i >= 0; i -= 1) session.placed.set(`track_piece#b${i}`, { ...carousel(), id: `track_piece#b${i}`, catalogId: "track_piece", x: i * 4, z: 8 });
    session.placed.set("track_piece#l1", { ...carousel(), id: "track_piece#l1", catalogId: "track_piece", x: 0, z: 4 });
    syncRidePark(() => 1);
    const circuit = coasterCircuit();
    expect(circuit.closed).toBe(true);
    expect(circuit.length).toBe(2 * (5 + 3) * 4 - 16);

    // The ride sim runs the lap the track measured, not a number in the catalog.
    const definition = rideDefinition(session.placed.get("ride_coaster#1")!, 0);
    expect(definition.rideSeconds).toBe(Math.max(4, circuit.lapSeconds));

    for (let i = 0; i < 4; i += 1) joinRide("ride_coaster#1", `guest#${i}`);
    const lap = Math.max(4, circuit.lapSeconds);
    const fractions: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      tickRidePark(ctx, 0.2);
      const view = rideView("ride_coaster#1")!;
      if (view.phase === "riding") fractions.push(1 - view.phaseSeconds / lap);
    }
    // It leaves the station, gets most of the way round, and the last lap fraction wraps home.
    expect(fractions[0]!).toBeLessThan(0.2);
    expect(Math.max(...fractions)).toBeGreaterThan(0.85);
    expect(rideView("ride_coaster#1")!.cycles).toBeGreaterThan(0);
  });
});
