import { describe, expect, test } from "bun:test";
import { fittedObjectColliders } from "@jgengine/core/scene/colliders";
import { createObjectStore } from "@jgengine/core/scene/objectStore";
import { createObstacleReachCache, resolveSourceWalkerStep, type SolidObstacleSource } from "@jgengine/core/movement/solidObstacles";
import { placeAuthoredObjectsFromDocument } from "@jgengine/core/world/authoredObjects";
import { groundFieldFor } from "@jgengine/core/world/terrain";

import { editorLayers } from "../../editorLayers";
import { world } from "../../world";
import { objectModels } from "../scenery";

const ground = groundFieldFor(world);
const store = createObjectStore();
placeAuthoredObjectsFromDocument(store, editorLayers, ground.sampleHeight);
const source: SolidObstacleSource = {
  list: store.list,
  inBox: store.inBox,
  collidersOf: (id) => fittedObjectColliders(objectModels[store.get(id)!.catalogId]!),
};
const cache = createObstacleReachCache();
const step = (x: number, z: number, dx: number, dz: number) => resolveSourceWalkerStep(
  source, cache, [x, ground.sampleHeight(x, z), z], dx, dz, { radius: 0.35, stepUpHeight: 0.3 },
);

describe("authored exterior walking with published collision resolver", () => {
  test("all eleven closed-door buildings have reachable exterior approach strips and remain solid", () => {
    const buildings = editorLayers.markers.filter((marker) => marker.id.startsWith("architecture:settlement-"));
    expect(buildings).toHaveLength(11);
    for (const marker of buildings) {
      const prefab = editorLayers.prefabs.find((entry) => entry.id === marker.meta?.sourcePrefabId)!;
      const door = prefab.fragment.markers.find((part) => part.catalogId === "lantern:Door_4_Round")!;
      const dims = objectModels[marker.catalogId!]!.dims!;
      const x = marker.position.x + door.position.x;
      const front = marker.position.z + dims.center.z + dims.footprint.d / 2;
      let z = front + 2;
      for (let tick = 0; tick < 14; tick++) {
        const move = step(x, z, 0, -0.1);
        expect(move.stepZ).toBeCloseTo(-0.1, 6);
        z += move.stepZ;
      }
      expect(z).toBeCloseTo(front + 0.6, 6);
      // A subsequent attempted move through the solid exterior must stop. This
      // deliberately does not claim that the decorative closed doors open.
      expect(step(x, z, 0, -1).stepZ).toBeGreaterThan(-0.3);
    }
  });

  test("spawn can walk to all seven town residents across the cobbled market", () => {
    const start = editorLayers.markers.find((marker) => marker.id === "spawn:player")!.position;
    const queue: [number, number][] = [[start.x, start.z]];
    const key = (x: number, z: number) => `${x},${z}`;
    const visited = new Set([key(start.x, start.z)]);
    const targets = ["npc:marshal_redbrook", "npc:wilkes_hand", "npc:apothecary_lin", "npc:trader_wilkes", "npc:brother_aldric", "npc:fisherman_brandt", "npc:foreman_odell"].map(
      (id) => editorLayers.markers.find((marker) => marker.id === id)!.position,
    );
    for (let head = 0; head < queue.length && !targets.every((target) => visited.has(key(target.x, target.z))); head++) {
      const [x, z] = queue[head]!;
      for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
        const nx = x + dx!; const nz = z + dz!;
        if (nx < -30 || nx > 30 || nz < -330 || nz > -265 || visited.has(key(nx, nz))) continue;
        const move = step(x, z, dx!, dz!);
        if (Math.abs(move.stepX - dx!) > 1e-6 || Math.abs(move.stepZ - dz!) > 1e-6) continue;
        visited.add(key(nx, nz)); queue.push([nx, nz]);
      }
    }
    for (const target of targets) {
      if (!visited.has(key(target.x, target.z))) console.log("Unreachable resident", target);
      expect(visited.has(key(target.x, target.z))).toBe(true);
    }
    expect(editorLayers.markers.find((marker) => marker.id === "street:market-cobbles")?.meta?.navigationSurface).toBe(true);
  });
});
