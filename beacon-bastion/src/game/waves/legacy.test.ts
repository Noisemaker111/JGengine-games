import { describe, expect, test } from "bun:test";

import { STARTING_GOLD, STARTING_LIVES } from "../entities/base/catalog";
import {
  BANK_RULE,
  BOONS,
  bankRun,
  chooseBoon,
  drawBoons,
  freshLegacy,
  openingGold,
  openingLives,
  relicBountyScale,
} from "./legacy";

describe("what a finished defense banks", () => {
  test("half the purse, added to the waves it held", () => {
    const next = bankRun(freshLegacy(), { wave: 7, gold: 120 });
    expect(next.bankedGold).toBe(60);
    expect(next.standing).toBe(7);
    expect(next.runs).toBe(1);
    expect(next.offer).toHaveLength(BANK_RULE.offerCount);
  });

  test("the bank is capped and standing stacks across runs", () => {
    const first = bankRun(freshLegacy(), { wave: 6, gold: 9999 });
    expect(first.bankedGold).toBe(BANK_RULE.cap);
    const second = bankRun(first, { wave: 4, gold: 10 });
    expect(second.standing).toBe(10);
    expect(second.runs).toBe(2);
    expect(second.bankedGold).toBe(5);
  });

  test("the same finished run offers the same relics, and the next run offers another draw", () => {
    const start = { ...freshLegacy(), runs: 2, standing: 9 };
    expect(bankRun(start, { wave: 5, gold: 40 }).offer).toEqual(bankRun(start, { wave: 5, gold: 40 }).offer);
    expect(bankRun(start, { wave: 5, gold: 40 }).offer).not.toEqual(bankRun(start, { wave: 5, gold: 60 }).offer);
  });
});

describe("the relic the next defense carries", () => {
  test("carrying a relic needs it to be one of the offered three", () => {
    const offered = { ...freshLegacy(), offer: drawBoons(12) };
    const picked = chooseBoon(offered, offered.offer[1]!);
    expect(picked.boonId).toBe(offered.offer[1]!);
    expect(picked.offer).toHaveLength(0);
    const unoffered = BOONS.find((boon) => !offered.offer.includes(boon.id))!;
    expect(chooseBoon(offered, unoffered.id)).toBe(offered);
    expect(chooseBoon(offered, null).boonId).toBeNull();
  });

  test("opening gold is the flat purse plus the bank plus the relic", () => {
    const withBank = { ...freshLegacy(), bankedGold: 120, boonId: "spoils" };
    expect(openingGold(withBank)).toBe(STARTING_GOLD + 120 + 60);
    expect(openingGold({ ...freshLegacy(), bankedGold: BANK_RULE.cap + 500 })).toBe(STARTING_GOLD + BANK_RULE.cap);
  });

  test("a life relic raises the keep above its authored twenty", () => {
    expect(openingLives({ ...freshLegacy(), boonId: "gate" })).toBe(STARTING_LIVES + 5);
    expect(openingLives(freshLegacy())).toBe(STARTING_LIVES);
  });

  test("a bounty relic multiplies kill pay and nothing else", () => {
    expect(relicBountyScale({ ...freshLegacy(), boonId: "writ" })).toBeCloseTo(1.4, 5);
    expect(relicBountyScale(freshLegacy())).toBe(1);
  });
});
