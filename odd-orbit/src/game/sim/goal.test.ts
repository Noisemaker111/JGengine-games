import { describe, expect, test } from "bun:test";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { dayGoal } from "./goal";
import { createHousehold, type HouseholdState } from "../session/types";

function station(catalogId: string): SceneObject {
  return { instanceId: `obj:${catalogId}`, catalogId, position: { x: 0, y: 0, z: 0 }, rotationY: 0 } as SceneObject;
}

function household(patch: Partial<HouseholdState> = {}): HouseholdState {
  return { ...createHousehold("goal-test"), ...patch };
}

describe("dayGoal", () => {
  test("asks for an earning station when none is furnished", () => {
    expect(dayGoal(household(), [])).toContain("Yield Console");
  });

  test("names the shortfall when credits cannot cover the midnight bill", () => {
    const objects = [station("work_console")];
    const state = household({ credits: 50 });
    expect(dayGoal(state, objects)).toMatch(/^Next: earn \d+ more credits before the \d+-credit midnight bill\.$/);
  });

  test("points to the pantry when rations run low and credits cover the bill", () => {
    const objects = [station("work_console")];
    expect(dayGoal(household({ pantry: 2 }), objects)).toContain("Pantry & bills");
  });

  test("otherwise states the bill to cover", () => {
    const objects = [station("work_console")];
    expect(dayGoal(household(), objects)).toContain("midnight bill");
  });
});
