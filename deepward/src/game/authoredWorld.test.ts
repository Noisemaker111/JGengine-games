import { describe, expect, test } from "bun:test";
import { DECOR, EXIT, GARAGE, HOME_SPAWN, PROPS, ROOMS, SALVAGE, STASH, VAULT_SPAWN, WORLD_BOUNDS, distance, editorLayers, lineOfSight, walkable, type Point } from "../world";

describe("official authored Deepward scene", () => {
  test("stable acquisitions and both home services belong to reachable authored floors", () => {
    expect(editorLayers.version).toBe(1);
    expect(walkable(HOME_SPAWN[0], HOME_SPAWN[2], "home")).toBe(true);
    expect(walkable(GARAGE[0], GARAGE[2], "home")).toBe(true);
    expect(walkable(STASH[0], STASH[2], "home")).toBe(true);
    expect(new Set(SALVAGE.map(item => item.id)).size).toBe(SALVAGE.length);
    // Flood actual walkable geometry. An acquisition must remain connected to the return rail
    // when a room or machinery footprint changes in a future official editor export.
    const reachable: Point[] = [VAULT_SPAWN];
    const visited = new Set([`${VAULT_SPAWN[0]}:${VAULT_SPAWN[2]}`]);
    for (let cursor = 0; cursor < reachable.length; cursor++) {
      const point = reachable[cursor]!;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const x = point[0] + dx, z = point[2] + dz, id = `${x}:${z}`;
        if (visited.has(id) || x <= WORLD_BOUNDS.minX || x >= WORLD_BOUNDS.maxX || z <= WORLD_BOUNDS.minZ || z >= WORLD_BOUNDS.maxZ || !walkable(x, z, "vault")) continue;
        visited.add(id); reachable.push([x, 0, z]);
      }
    }
    for (const target of [EXIT, ...SALVAGE.map(item => item.at)]) {
      expect(reachable.some(point => distance(point, target) < 1.5 && lineOfSight(point, target))).toBe(true);
    }
  });
  test("authored machinery blocks both movement and firing while room interiors remain navigable", () => {
    for (const machine of PROPS) {
      expect(walkable(machine.x, machine.z, "vault")).toBe(false);
      expect(lineOfSight([machine.x - machine.w, 0, machine.z], [machine.x + machine.w, 0, machine.z])).toBe(false);
    }
    for (const room of ROOMS) {
      expect(editorLayers.volumes.some(volume => volume.id === room.id && volume.kind === "deepward-room")).toBe(true);
    }
    expect(DECOR.some(marker => marker.id === "decor-home-printer")).toBe(true);
  });
});
