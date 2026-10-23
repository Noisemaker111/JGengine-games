import { beforeEach, describe, expect, test } from "bun:test";

import { createGateSet, gateFacts } from "@jgengine/core/progression/gates";

import { BUILDABLES } from "./objects/catalog";
import {
  MILESTONES,
  MILESTONE_GATES,
  claimMilestones,
  milestoneContents,
  parkGates,
  parkStanding,
  resetProgression,
  syncStanding,
  unlockResolves,
  PARK_ACTOR,
  PARK_TRACK,
} from "./progression";

describe("brightway-park milestone gates", () => {
  beforeEach(() => {
    resetProgression();
  });

  test("a milestone whose unlock resolves to nothing fails at load, not in play", () => {
    expect(() =>
      createGateSet({
        gates: [{ id: "dead", unlock: "tier_nonexistent", requires: { standing: { trackId: PARK_TRACK, min: 10 } } }],
        catalog: { has: unlockResolves },
        standing: parkStanding,
      }),
    ).toThrow(/tier_nonexistent/);
  });

  test("the shipped gate table loads, and every reward id is content the palette shows", () => {
    for (const milestone of MILESTONES) {
      expect({ unlock: milestone.unlock, resolves: unlockResolves(milestone.unlock) }).toEqual({ unlock: milestone.unlock, resolves: true });
      const contents = milestoneContents(milestone.unlock);
      expect(contents.length).toBeGreaterThan(0);
      for (const label of contents) {
        const shown = Object.values(BUILDABLES).some((def) => def.label === label && def.requires === milestone.unlock);
        expect({ label, shown }).toEqual({ label, shown: true });
      }
    }
    expect(new Set(MILESTONE_GATES.map((gate) => gate.id)).size).toBe(MILESTONE_GATES.length);
    expect(parkGates.gates().length).toBe(MILESTONES.length);
  });

  test("a milestone stays shut until the rating crosses it, then opens once", () => {
    const cash = 5000;
    for (const milestone of MILESTONES) {
      syncStanding(milestone.rating - 1);
      const before = parkGates.isOpen(milestone.id, gateFacts(parkStanding, PARK_ACTOR, { cash }));
      expect({ id: milestone.id, before }).toEqual({ id: milestone.id, before: false });

      syncStanding(milestone.rating);
      const after = parkGates.isOpen(milestone.id, gateFacts(parkStanding, PARK_ACTOR, { cash }));
      expect({ id: milestone.id, after }).toEqual({ id: milestone.id, after: true });

      const claimed = claimMilestones(cash, []);
      expect(claimed.map((gate) => gate.id)).toContain(milestone.id);
      // Once granted, the same gate is not claimed again.
      expect(claimMilestones(cash, [milestone.unlock]).map((gate) => gate.id)).not.toContain(milestone.id);
    }
  });

  test("the rating only ratchets standing upward", () => {
    syncStanding(120);
    syncStanding(80);
    expect(parkStanding.standing(PARK_ACTOR, PARK_TRACK)).toBe(120);
  });
});
