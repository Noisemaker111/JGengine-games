import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { resolveAuthoredObjects } from "@jgengine/core/world/authoredObjects";

import { editorLayers } from "../../editorLayers";
import { ROUTE_GATES } from "../route/gates";
import { placeGateBarricades, placeZoneDressing, syncClearedGates, syncCompactorRow } from "./setup";

function boot() {
  return createGameContext({
    definition: defineGameDefinition({ name: "Authored foundry", multiplayer: {}, persist: false }),
    content: { objectById: () => ({}) },
    player: { userId: "driver", isNew: true },
  });
}

test("every barricade has matching approach signs before its launch or contact point", () => {
  for (const gate of ROUTE_GATES) {
    const cues = editorLayers.markers.filter((marker) => marker.kind === "gate_cue" && marker.meta?.gateId === gate.id);
    const posts = resolveAuthoredObjects({ markers: cues }).filter((object) => object.catalogId === `route_${gate.requirement}_post`);
    expect(posts).toHaveLength(2);
    expect(posts.some((post) => post.x < 0)).toBe(true);
    expect(posts.some((post) => post.x > 0)).toBe(true);
    for (const post of posts) expect(gate.atZ - post.z).toBeGreaterThanOrEqual(16);
    if (gate.requirement === "jump") {
      const launch = resolveAuthoredObjects({ markers: cues }).find((object) => object.catalogId === "jump_cue");
      expect(launch).toBeDefined();
      expect(launch!.z).toBeGreaterThan(posts[0]!.z);
      expect(launch!.z).toBeLessThan(gate.atZ);
    }
  }
});

test("authored cues survive snapshot restore, clear with their gate, and return on restart", () => {
  const ctx = boot();
  placeGateBarricades(ctx);
  const originalCount = ctx.scene.object.list().length;
  placeGateBarricades(ctx);
  expect(ctx.scene.object.list()).toHaveLength(originalCount);
  const restored = boot();
  restored.hydrate(ctx.snapshot());
  const gate = ROUTE_GATES[1]!;
  const ids = editorLayers.markers.filter((marker) => marker.meta?.gateId === gate.id).map((marker) => marker.id);
  expect(ids.every((id) => restored.scene.object.get(id) !== null)).toBe(true);
  syncClearedGates(restored, new Set([gate.id]), new Set());
  expect(ids.every((id) => restored.scene.object.get(id) === null)).toBe(true);
  expect(restored.scene.object.get("post-gate_canyon_plow-left")).not.toBeNull();
  placeGateBarricades(restored);
  expect(restored.scene.object.list()).toHaveLength(originalCount);
});

test("compactor removal includes authored landmarks and approach signs", () => {
  const ctx = boot();
  const rows = placeZoneDressing(ctx);
  placeGateBarricades(ctx);
  syncCompactorRow(ctx, 130, rows, { index: 0 });
  expect(ctx.scene.object.get("lamp-0")).toBeNull();
  expect(ctx.scene.object.get("tower-0")).toBeNull();
  expect(ctx.scene.object.get("post-gate_canyon_plow-left")).toBeNull();
  expect(ctx.scene.object.get("post-gate_canyon_jump-left")).not.toBeNull();
});
