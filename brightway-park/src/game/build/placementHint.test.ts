import { describe, expect, test } from "bun:test";
import { hoverRefusal, placementHint, setPlacementHint } from "./placementHint";

describe("hoverRefusal", () => {
  test("names the placement rule before the budget", () => {
    expect(hoverRefusal({ ok: false, reason: "Space is taken" }, 0, 850)).toBe("Space is taken");
  });
  test("names the shortfall when the spot is fine but cash is short", () => {
    expect(hoverRefusal({ ok: true }, 600, 850)).toBe("Needs $250 more");
  });
  test("is null for a buildable, affordable spot", () => {
    expect(hoverRefusal({ ok: true }, 900, 850)).toBeNull();
  });
});

describe("placement hint store", () => {
  test("holds the latest hint and clears", () => {
    setPlacementHint("Outside the fence");
    expect(placementHint()).toBe("Outside the fence");
    setPlacementHint(null);
    expect(placementHint()).toBeNull();
  });
});
