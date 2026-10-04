import { describe, expect, test } from "bun:test";

import { editorLayers } from "../../editorLayers";
import { seedPlacements, type SeedPlacement } from "./setup";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { game } from "../../game.config";
import { loop } from "../../loop";
import { content } from "../content";
import { session } from "../session";
import { connectedTracks, hasPathAccess } from "../sim/operations";

const RIDES: readonly SeedPlacement[] = [
  { catalogId: "ride_carousel", x: -20, z: 8 },
  { catalogId: "ride_coaster", x: 20, z: 4 },
  { catalogId: "stall_food", x: -12, z: 28 },
  { catalogId: "stall_food", x: 12, z: 28 },
];
const TRACK_LOOP: readonly [number, number][] = [
  [28, 4], [28, 8], [28, 12], [28, 16], [24, 16], [20, 16], [16, 16], [16, 12], [16, 8], [16, 4],
];
const PATHS: readonly [number, number][] = [
  [0, 48], [0, 44], [0, 40], [0, 36], [0, 32], [0, 28], [0, 24], [0, 20], [0, 16],
  [-4, 20], [4, 20], [-4, 28], [-8, 28], [4, 28], [8, 28], [-4, 12], [-8, 12], [4, 12], [8, 12],
];
const TREES: readonly [number, number][] = [
  [-32, 12], [32, 12], [-28, -8], [28, 28], [-20, 32], [20, 32], [-8, -12], [8, -12],
  [-16, 44], [16, 44], [-32, 32], [32, 32], [-24, -12], [24, -12], [0, -12], [-32, -20],
];

const EXPECTED: readonly SeedPlacement[] = [
  ...RIDES,
  ...TRACK_LOOP.map(([x, z]) => ({ catalogId: "track_piece", x, z })),
  ...PATHS.map(([x, z]) => ({ catalogId: "path_walk", x, z })),
  ...TREES.map(([x, z]) => ({ catalogId: "deco_tree", x, z })),
];

describe("brightway-park starter park (authored scene)", () => {
  test("the editor expansion preserves the original park placements", () => {
    expect(seedPlacements().slice(0, EXPECTED.length)).toEqual([...EXPECTED]);
  });

  test("the authored document carries the seed content the runtime reads", () => {
    expect(editorLayers.markers.filter(m => m.id.startsWith("midway-link-")).length).toBe(10);
    expect(editorLayers.markers.find(m => m.id === "shade-carousel")).toBeDefined();
    expect(editorLayers.markers.find(m => m.id === "shade-refreshments")).toBeDefined();
    const track = editorLayers.paths.find((path) => path.id === "coaster-track");
    expect(track?.kind).toBe("route");
    expect(track?.points).toHaveLength(TRACK_LOOP.length);
  });

  test("every starter service is reachable from the entrance and every track joins its station", () => {
    createHeadlessRunner({ definition: game.game, content, loop });
    expect(session.placed.size).toBe(seedPlacements().length);
    for (const obj of session.placed.values()) {
      if (obj.catalogId.startsWith("ride_") || obj.catalogId.startsWith("stall_")) expect(hasPathAccess(obj)).toBe(true);
      if (obj.catalogId === "ride_coaster") expect(connectedTracks(obj)).toBe(TRACK_LOOP.length);
    }
  });
});
