import { beforeEach, describe, expect, test } from "bun:test";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { content } from "../content";
import { agentOf, clearAgents, guestTargets, liveAgent } from "../agents";
import { resetSession, session, type PlacedObject } from "../session";
import { tickStaff } from "../staff";
import { joinRide, resetRides, syncRidePark } from "./rides";
import { seedGuests, tickGuests } from "./guests";

function context() {
  return createGameContext({
    definition: defineGameDefinition({ name: "Brightway test", multiplayer: "off" }),
    content,
    player: { userId: "p1", isNew: true },
    seed: "park-test",
  });
}

function obj(catalogId: string, x: number, z: number, patch: Partial<PlacedObject> = {}): PlacedObject {
  return { id: `${catalogId}#1`, catalogId, x, z, stock: 40, soldTotal: 0, occupants: 0, ...patch };
}

function onlyGuest() {
  const guest = [...session.guests.values()][0]!;
  return guest;
}

function fillNeeds(ctx: ReturnType<typeof context>, values: Record<string, number>): void {
  const agent = agentOf(onlyGuest(), ctx.rng);
  for (const [need, value] of Object.entries(values)) {
    agent.needs.refill(need, value - agent.needs.value(need));
  }
}

describe("brightway-park guest agents", () => {
  beforeEach(() => {
    resetSession();
    resetRides();
    clearAgents();
    session.open = true;
  });

  test("a hungry guest picks the food stall its own need and mood point at", () => {
    const ctx = context();
    session.placed.set("stall_food#1", obj("stall_food", 0, 8));
    seedGuests(ctx, 1);
    fillNeeds(ctx, { hunger: 5, thirst: 95, fun: 95, souvenir: 0, energy: 95 });

    tickGuests(ctx, 0.1, 0);

    expect(onlyGuest().targetId).toBe("stall_food#1");
    expect(liveAgent(onlyGuest().id)?.action().option).toBe("hunger");
  });

  test("an empty stall and a broke guest are not offered the stall at all", () => {
    const ctx = context();
    seedGuests(ctx, 1);
    const guest = onlyGuest();
    fillNeeds(ctx, { hunger: 5, thirst: 95, fun: 95, energy: 95 });

    session.placed.set("stall_food#1", obj("stall_food", 0, 8, { stock: 0 }));
    expect(guestTargets(guest, 0, [0, 0, 0]).some((target) => target.target === "stall_food#1")).toBe(false);

    session.placed.set("stall_food#1", obj("stall_food", 0, 8, { stock: 10 }));
    guest.money = 2;
    expect(guestTargets(guest, 0, [0, 0, 0]).some((target) => target.target === "stall_food#1")).toBe(false);
  });

  test("litter lowers a guest's mood until a janitor post is staffed", () => {
    const ctx = context();
    seedGuests(ctx, 1);
    fillNeeds(ctx, { hunger: 90, thirst: 90, fun: 90, energy: 90 });
    session.litter = 0;
    tickGuests(ctx, 0.1, 0);
    const clean = liveAgent(onlyGuest().id)!.mood().score;

    session.litter = 80;
    tickGuests(ctx, 0.1, 0);
    expect(liveAgent(onlyGuest().id)!.mood().score).toBeLessThan(clean);

    session.litter = 0;
    tickGuests(ctx, 0.1, 0);
    expect(liveAgent(onlyGuest().id)!.mood().score).toBeGreaterThan(clean - 1);
  });

  test("eating fills the need and the mood follows it up", () => {
    const ctx = context();
    session.placed.set("stall_food#1", obj("stall_food", 0, 8));
    seedGuests(ctx, 1);
    fillNeeds(ctx, { hunger: 10, thirst: 90, fun: 80, energy: 90 });
    ctx.scene.entity.setPose(onlyGuest().id, { position: [0, 0, 14] });

    tickGuests(ctx, 0.1, 0);
    const hungry = liveAgent(onlyGuest().id)!.mood().score;

    for (let i = 0; i < 120; i += 1) tickGuests(ctx, 0.1, 0);

    const agent = liveAgent(onlyGuest().id)!;
    expect(agent.needs.value("hunger")).toBeGreaterThan(60);
    expect(agent.mood().score).toBeGreaterThan(hungry);
    expect(onlyGuest().visits).toBe(1);
  });

  test("a longer line is priced as a worse choice than an empty one", () => {
    const ctx = context();
    seedGuests(ctx, 1);
    const guest = onlyGuest();
    fillNeeds(ctx, { hunger: 95, thirst: 95, fun: 5, energy: 95 });

    session.placed.set("ride_carousel#1", obj("ride_carousel", 0, 20));
    syncRidePark(ctx.rng);
    const empty = guestTargets(guest, 0, [0, 0, 0]).find((target) => target.target === "ride_carousel#1")!;
    // Five real guests join the shared line; the cost a sixth guest sees comes from that line.
    for (let i = 0; i < 5; i += 1) joinRide("ride_carousel#1", `ghost#${i}`);
    const busy = guestTargets(guest, 0, [0, 0, 0]).find((target) => target.target === "ride_carousel#1")!;

    expect(busy.cost!).toBeGreaterThan(empty.cost!);
  });

  test("a janitor walks the beat its post authored", () => {
    const ctx = context();
    session.placed.set("staff_janitor#1", obj("staff_janitor", 12, -12));
    ctx.time.hydrate({ ...ctx.time.snapshot(), now: 60, paused: true });

    tickStaff(ctx, 0.1);
    expect(session.staff.size).toBe(1);
    const staff = [...session.staff.values()][0]!;
    const start = ctx.scene.entity.get(staff.id)!.position;

    for (let i = 0; i < 40; i += 1) tickStaff(ctx, 0.1);
    const moved = ctx.scene.entity.get(staff.id)!.position;
    expect(Math.hypot(moved[0] - start[0], moved[2] - start[2])).toBeGreaterThan(0.5);
    expect(Math.hypot(moved[0] - 12, moved[2] + 12)).toBeLessThanOrEqual(7);
  });

  test("demolishing the post sends its janitor home", () => {
    const ctx = context();
    session.placed.set("staff_janitor#1", obj("staff_janitor", 12, -12));
    tickStaff(ctx, 0.1);
    const id = [...session.staff.values()][0]!.id;
    session.placed.delete("staff_janitor#1");
    tickStaff(ctx, 0.1);
    expect(session.staff.size).toBe(0);
    expect(ctx.scene.entity.get(id)).toBeNull();
  });
});
