import { describe, expect, test } from "bun:test";

import { steerToward } from "@jgengine/core/movement/steering";
import { createMedalBoard } from "@jgengine/core/progression/medalBoard";

import { CAREER_KEY, newCareer, readCareer, type CareerStorage } from "../career";
import { ROUTE_GATES } from "../route/gates";
import { PICKUPS } from "../run/pickups";
import { createRunSession, type RunSession } from "../run/session";
import { eventById, eventCompactor, MEDAL_BOARD, YARD_EVENTS, YARD_TIERS } from "./catalog";
import { COMPACTOR_PLAN, compactorZAt } from "../compactor/schedule";

const DT = 1 / 60;

function memory(seed?: (career: ReturnType<typeof newCareer>) => void): CareerStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  if (seed !== undefined) {
    const career = newCareer();
    seed(career);
    map.set(CAREER_KEY, JSON.stringify(career));
  }
  return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) };
}

function shouldJump(session: RunSession): boolean {
  const snap = session.snapshot();
  const next = ROUTE_GATES.find((gate) => gate.atZ >= snap.pose.position[2]);
  return next?.requirement === "jump" && !snap.pose.airborne && next.atZ - snap.pose.position[2] < Math.max(5, snap.pose.speedKmh / 3.6 * 0.5);
}

/** The corridor driven by a script: sweep steers onto every drop and takes the swaps; `stall` brakes for that many seconds from 12 s. */
function drive(session: RunSession, { sweep = false, stall = 0 } = {}): void {
  for (let t = 0; t < 150; t += DT) {
    const snap = session.snapshot();
    if (snap.phase !== "running") return;
    if (t > 12 && t < 12 + stall) {
      session.tick(DT, { throttle: 0, brake: 1, steer: 0 }, { jumpPressed: false, plowBracing: false });
      continue;
    }
    const target = sweep ? PICKUPS.find((p) => !snap.collectedIds.has(p.id) && p.position[2] > snap.pose.position[2] - 6) : undefined;
    const desired = Math.max(-0.5, Math.min(0.5, ((target?.position[0] ?? 0) - snap.pose.position[0]) * 0.03));
    const steer = Math.max(-0.5, Math.min(0.5, steerToward(snap.pose.heading, desired) * 2));
    session.tick(DT, { throttle: 1, brake: 0, steer }, { jumpPressed: shouldJump(session), plowBracing: true, salvageSwap: sweep });
  }
}

const everyTierOpen = (career: ReturnType<typeof newCareer>) => {
  career.medals = { best: { "salvage-run": 1, "scrap-sweep": 12, "night-shift": 20, "grudge-hobbs": 9 } };
};

function race(eventId: string, options: { sweep?: boolean; stall?: number } = {}) {
  const session = createRunSession(() => 0, memory(everyTierOpen));
  expect(session.selectEvent(eventId)).toEqual({ ok: true });
  session.start();
  drive(session, options);
  return session.snapshot();
}

describe("yard calendar", () => {
  test("the authored calendar is a valid medal board and every tier holds events", () => {
    expect(() => createMedalBoard(MEDAL_BOARD)).not.toThrow();
    for (const tier of YARD_TIERS) expect(YARD_EVENTS.some((event) => event.tier === tier.id)).toBe(true);
  });

  test("a new career can race Row Six only; Night Crew asks for medals first", () => {
    const session = createRunSession(() => 0, memory());
    expect(session.selectEvent("time-sheet").ok).toBe(true);
    expect(session.selectEvent("night-shift")).toMatchObject({ ok: false });
    const calendar = session.snapshot().calendar;
    expect(calendar.tiers.map((tier) => tier.open)).toEqual([true, false, false, false]);
    expect(calendar.tiers[1]!.missing).toBe(4);
  });

  test("events change the grid and the garage: Time Sheet races alone, Bare Metal starts on a bare chassis", () => {
    const owned = (career: ReturnType<typeof newCareer>) => {
      everyTierOpen(career);
      career.ladders = { ranks: { engine: 2, front: 3, wheels: 2 } };
    };
    const session = createRunSession(() => 0, memory(owned));
    session.selectEvent("time-sheet");
    expect(session.snapshot().rivals).toHaveLength(0);
    expect(session.snapshot().race.total).toBe(1);
    expect(Object.values(session.snapshot().installed).filter(Boolean)).toHaveLength(3);
    session.selectEvent("bare-metal");
    expect(session.snapshot().rivals).toHaveLength(3);
    expect(Object.values(session.snapshot().installed).filter(Boolean)).toHaveLength(0);
  });

  test("the night crew's crusher is closer and faster than the usual shift's", () => {
    const night = eventCompactor(eventById("night-shift")!, COMPACTOR_PLAN);
    for (const t of [0, 10, 30, 50]) expect(compactorZAt(t, night)).toBeGreaterThan(compactorZAt(t, COMPACTOR_PLAN) + 14);
  });

  test("a four-second stall is survivable on the Salvage Run and fatal on Night Shift and Crusher Rush", () => {
    expect(race("salvage-run", { stall: 4 }).phase).toBe("won");
    expect(race("night-shift", { stall: 4 }).phase).toBe("crushed");
    expect(race("crusher-rush", { stall: 4 }).phase).toBe("crushed");
  });

  test("a straight line earns bronze on the Time Sheet; gold needs the sweep and the truck engine", () => {
    const line = race("time-sheet");
    expect(line.outcome?.event.medal).toBe("bronze");
    expect(line.outcome?.event.next?.medal).toBe("silver");
    expect(line.outcome?.lineNotes.some((note) => note.startsWith("P1"))).toBe(false);
    const sweep = race("time-sheet", { sweep: true });
    expect(sweep.outcome?.event.medal).toBe("gold");
  });

  test("first-time medals pay once, bank with the escape and open the next tier", () => {
    const storage = memory();
    const session = createRunSession(() => 0, storage);
    session.selectEvent("time-sheet");
    session.start();
    drive(session, { sweep: true });
    const gold = session.snapshot();
    expect(gold.outcome?.event.firstTime.map((entry) => entry.medal)).toEqual(["bronze", "silver", "gold"]);
    expect(gold.outcome?.event.reward).toBe(60 + 120 + 220);
    expect(gold.career.credits).toBe(gold.outcome!.banked + 400);
    expect(gold.calendar.points).toBe(3);

    session.restart();
    drive(session, { sweep: true });
    expect(session.snapshot().outcome?.event.reward).toBe(0);

    session.selectEvent("scrap-sweep");
    session.start();
    drive(session, { sweep: true });
    const opened = session.snapshot();
    expect(opened.outcome?.event.openedTiers).toEqual(["Night Crew"]);
    expect(opened.calendar.tiers[1]!.open).toBe(true);
    expect(readCareer(storage).medals.best["scrap-sweep"]).toBe(12);
  });

  test("a career saved before the calendar loads with no medals on the salvage run", () => {
    const storage = memory();
    const legacy = newCareer() as Partial<ReturnType<typeof newCareer>>;
    delete legacy.medals;
    delete legacy.event;
    storage.setItem(CAREER_KEY, JSON.stringify(legacy));
    const career = readCareer(storage);
    expect(career.medals).toEqual({ best: {} });
    expect(career.event).toBe("salvage-run");
  });
});
