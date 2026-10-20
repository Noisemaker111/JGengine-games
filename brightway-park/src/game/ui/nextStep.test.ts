import { describe, expect, test } from "bun:test";

import { MILESTONES } from "../catalog";
import { nextMilestone, nextStepText } from "./nextStep";

describe("objective next step", () => {
  test("starts with the first milestone at 60 rating", () => {
    expect(nextMilestone(0)?.unlock).toBe("tier_flowers");
    expect(nextStepText(0)).toBe(
      "Raise rating to 60 ★ — add scenery and keep guests happy to unlock Flower beds & lamps",
    );
  });

  test("a rating exactly on a milestone moves on to the next one", () => {
    expect(nextMilestone(60)?.rating).toBe(120);
    expect(nextStepText(60)).toContain("unlock Fountain & drink stall");
  });

  test("text is actionable: names the target rating and the unlock", () => {
    for (const m of MILESTONES.slice(0, -1)) {
      const text = nextStepText(m.rating - 1);
      expect(text).toStartWith("Raise rating to ");
      expect(text).toContain(`${m.rating} ★`);
      expect(text).toContain(m.label);
    }
  });

  test("returns null once every milestone is unlocked", () => {
    const top = MILESTONES[MILESTONES.length - 1]!;
    expect(nextMilestone(top.rating)).toBeNull();
    expect(nextStepText(top.rating + 100)).toBeNull();
  });
});
