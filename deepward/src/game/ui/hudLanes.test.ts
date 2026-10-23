import { describe, expect, test } from "bun:test";
import { formatHudOverlapReport, hudBlockOverlaps, resolveHudLanes, type HudLaneSlot } from "@jgengine/react/hudLanes";
import { HUD_PANELS, placement } from "./hudPanels";

const VIEWPORTS = [
  { size: "wide", width: 1600, height: 900, zoom: 1 },
  { size: "compact", width: 844, height: 390, zoom: 0.86 },
] as const;

/** What `HudCanvas` resolves for this game, from the claim table and the measured panel sizes. */
function slots(size: "wide" | "compact"): HudLaneSlot[] {
  return HUD_PANELS.map(claim => ({ id: claim.id, anchor: claim.anchor, lane: claim.lane, order: claim.order, width: claim.measured[size].w, height: claim.measured[size].h }));
}
/** The lane layer is measured inside the canvas zoom, so a compact frame is the viewport divided by it. */
function overlapsAt(size: "wide" | "compact", width: number, height: number, zoom: number) {
  const frame = { width: width / zoom, height: height / zoom };
  const layout = resolveHudLanes(slots(size), frame);
  const blocks = layout.placements.map((pl) => ({ id: pl.id, rect: pl.rect }));
  return { layout, overlaps: hudBlockOverlaps(blocks), report: formatHudOverlapReport(hudBlockOverlaps(blocks), frame) };
}

describe("Deepward's HUD lanes", () => {
  test("every block claims a lane, so no panel places itself", () => {
    expect(HUD_PANELS.every(claim => claim.lane.length > 0)).toBe(true);
    expect(new Set(HUD_PANELS.map(claim => claim.id)).size).toBe(HUD_PANELS.length);
    expect(placement("title")).toEqual({ id: "title", anchor: "top-left", lane: "rail", order: 0 });
    expect(() => placement("missing" as "title")).toThrow(/no HUD lane/);
  });

  test("the shift plate and the departure docket stack in the top-left lane", () => {
    const same = HUD_PANELS.filter(claim => claim.anchor === "top-left" && claim.lane === "rail");
    expect(same.map(claim => claim.id)).toEqual(["title", "vitals", "home"]);
    expect(same.map(claim => claim.order)).toEqual([0, 1, 1]);
    for (const { width, height, size, zoom } of VIEWPORTS) {
      const { layout } = overlapsAt(size, width, height, zoom);
      const title = layout.rects.title!, home = layout.rects.home!;
      expect(home.y).toBeGreaterThan(title.y + title.height);
      expect(home.x).toBe(title.x);
    }
  });

  test("no two blocks intersect at 1600x900 or at 844x390", () => {
    for (const { width, height, size, zoom } of VIEWPORTS) {
      const { overlaps, report } = overlapsAt(size, width, height, zoom);
      expect(overlaps).toEqual([]);
      expect(report).toBe("");
    }
  });

  test("the top-left column stays clear of the bottom band at both sizes", () => {
    for (const { width, height, size, zoom } of VIEWPORTS) {
      const { layout } = overlapsAt(size, width, height, zoom);
      const column = ["title", "home"].map(id => layout.rects[id]!);
      const bottom = Math.min(layout.rects.radio!.y, layout.rects.prompt!.y);
      for (const rect of column) expect(rect.y + rect.height).toBeLessThan(bottom);
    }
  });
});


