import { describe, expect, test } from "bun:test";

import { BUILDABLES } from "./objects/catalog";
import { MILESTONES, milestoneContents, milestonesCrossed, nextMilestone } from "./milestones";
import { park } from "./park";

describe("brightway-park milestones", () => {
  test("every milestone opens content the palette shows", () => {
    for (const milestone of MILESTONES) {
      const contents = milestoneContents(milestone.unlock);
      expect(contents.length).toBeGreaterThan(0);
      for (const label of contents) {
        const shown = Object.values(BUILDABLES).some((def) => def.label === label && def.requires === milestone.unlock);
        expect({ label, shown }).toEqual({ label, shown: true });
      }
    }
    expect(new Set(MILESTONES.map((milestone) => milestone.id)).size).toBe(MILESTONES.length);
  });

  test("a locked kind's `when` reads the park's best rating at its milestone", () => {
    for (const milestone of MILESTONES) {
      for (const id of Object.keys(BUILDABLES).filter((kind) => BUILDABLES[kind]!.requires === milestone.unlock)) {
        expect(park.def.kinds?.[id]?.when).toEqual({ "park.peak": { atLeast: milestone.rating } });
      }
    }
  });

  test("crossing names each milestone once, and the next one is the first unreached", () => {
    expect(milestonesCrossed(0, 130).map((m) => m.id)).toEqual(["gardens_edge", "fountain_court"]);
    expect(milestonesCrossed(130, 130)).toEqual([]);
    expect(nextMilestone(130)?.id).toBe("big_wheel");
    expect(nextMilestone(10_000)).toBeNull();
  });
});
