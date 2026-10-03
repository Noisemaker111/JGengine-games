import { expect, test } from "bun:test";
import { CARD_CATALOG } from "./cards";
import { validateCrossingContent } from "./contentValidation";
import { ROAD_NODES } from "./route";

test("the custom card crossing and every authored road branch validate deterministically", () => {
  expect(validateCrossingContent()).toEqual([]);
  expect(validateCrossingContent(Object.fromEntries(Object.entries(ROAD_NODES).reverse()))).toEqual([]);
  expect(validateCrossingContent(ROAD_NODES, { ...CARD_CATALOG, wayfarer_note: { type: "wayfarer_note", name: "Wayfarer's note", kind: "skill", build: "tempo", cost: 0, text: "Read a note.", art: "brace", effects: {} } })).toEqual([]);
});

test("a broken road choice and a disconnected final gate identify the authored repair location", () => {
  const typo = validateCrossingContent({ ...ROAD_NODES, low_road: { ...ROAD_NODES.low_road!, next: ["missing_tollhouse", "stranded_porter"] } });
  expect(typo.some(issue => issue.severity === "error" && issue.referenceId === "missing_tollhouse" && issue.path === "/road/low_road/next/0" && issue.repair.length > 0)).toBe(true);
  const blocked = validateCrossingContent({ ...ROAD_NODES, gate_fire: { ...ROAD_NODES.gate_fire!, next: [] }, gate_trader: { ...ROAD_NODES.gate_trader!, next: [] } });
  expect(blocked.some(issue => issue.severity === "error" && issue.contentId === "final_gate" && issue.repair.length > 0)).toBe(true);
});

test("existing but swapped record identities violate the game's lookup rules", () => {
  const swappedRoad = validateCrossingContent({ ...ROAD_NODES, low_road: { ...ROAD_NODES.low_road!, id: "tollhouse" }, tollhouse: { ...ROAD_NODES.tollhouse!, id: "low_road" } });
  expect(swappedRoad.some(issue => issue.code === "inconsistent-reference" && issue.path === "/road/low_road/id" && issue.referenceId === "tollhouse" && issue.repair.includes("low_road"))).toBe(true);
  const swappedCards = validateCrossingContent(ROAD_NODES, { ...CARD_CATALOG, trail_cut: { ...CARD_CATALOG.trail_cut!, type: "pack_guard" }, pack_guard: { ...CARD_CATALOG.pack_guard!, type: "trail_cut" } });
  expect(swappedCards.some(issue => issue.code === "inconsistent-reference" && issue.path === "/cards/trail_cut/type" && issue.referenceId === "pack_guard" && issue.repair.includes("trail_cut"))).toBe(true);
});

test("a combat road stop must declare its encounter before a crossing starts", () => {
  expect(validateCrossingContent({ ...ROAD_NODES, low_road: { ...ROAD_NODES.low_road!, encounterIndex: undefined } }).some(issue => issue.severity === "error" && issue.path === "/road/low_road/encounterIndex" && issue.repair.length > 0)).toBe(true);
});
