import { describe, expect, test } from "bun:test";
import { worldObjectById } from "../objects/catalog";
import { enemyById } from "../entities/enemies/catalog";
import { fittedObjectColliders } from "@jgengine/core/scene/colliders";
import { createSceneRaycast } from "@jgengine/core/scene/sceneRaycast";
import { objectModels } from "./models";
import { terrainField } from "../../world";
import {
  AUTHORED_PIECES,
  DEAD_AIR_SITE,
  DEAD_AIR_SPAWNS,
  NPC_PLACEMENTS,
  ROUTES,
  SIDE_POIS,
  SPUR_ROUTES,
  authoredScene,
  roadPathProfiles,
} from "./level";
import { ZONES } from "./zones";

const pieceById = new Map(AUTHORED_PIECES.map((piece) => [piece.instanceId, piece]));

describe("authored document", () => {
  test("every placed prop is a document marker with a resolvable catalog id", () => {
    expect(AUTHORED_PIECES.length).toBe(408);
    for (const piece of AUTHORED_PIECES) expect(worldObjectById(piece.catalogId)).toBeDefined();
  });

  test("routes and spurs are authored paths, not generated in code", () => {
    expect(authoredScene.paths.filter((path) => path.kind === "road").length).toBe(
      ROUTES.length + SPUR_ROUTES.length,
    );
    expect(ROUTES.length).toBe(5);
    expect(SPUR_ROUTES.length).toBe(3);
  });

  test("piece ids are unique", () => {
    const ids = AUTHORED_PIECES.map((piece) => piece.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("landmarks keep their exact authored positions", () => {
    expect(pieceById.get("crash_bus")).toMatchObject({ catalogId: "bus_wreck", x: -510, z: 606 });
    expect(pieceById.get("coretown_tower")).toMatchObject({ catalogId: "water_tower", x: -22, z: 12 });
    expect(pieceById.get("reactor_gate")).toMatchObject({ catalogId: "reactor_gate", x: -80, z: -640 });
  });
});

describe("roads", () => {
  test("routes chain every zone into the campaign path", () => {
    const touched = new Set(ROUTES.flatMap((route) => [route.from, route.to]));
    for (const zone of ZONES) expect(touched.has(zone.id)).toBe(true);
  });

  test("every route is a graded path-terrain profile with retaining walls", () => {
    const profiles = roadPathProfiles((x, z) => terrainField.sampleHeight(x, z));
    expect(profiles.length).toBe(ROUTES.length + SPUR_ROUTES.length);
    for (const profile of profiles) {
      expect(profile.height?.kind).toBe("grade");
      expect(profile.retaining?.wallHeight).toBeGreaterThan(0);
      expect(profile.points.length).toBeGreaterThan(1);
      for (const [x, z] of profile.points) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(z)).toBe(true);
      }
    }
  });

  test("roads are walkable: on-road slope is gentler than raw terrain amplitude", () => {
    const route = ROUTES[1]!;
    let maxStep = 0;
    for (let index = 1; index < route.points.length; index += 1) {
      const previous = route.points[index - 1]!;
      const point = route.points[index]!;
      const drop = Math.abs(
        terrainField.sampleHeight(point.x, point.z) - terrainField.sampleHeight(previous.x, previous.z),
      );
      maxStep = Math.max(maxStep, drop);
    }
    expect(maxStep).toBeLessThan(6);
  });

  test("roadside props are authored and resolve to catalog entries", () => {
    const pieces = AUTHORED_PIECES.filter((piece) => piece.instanceId.startsWith("roadside_"));
    expect(pieces.length).toBeGreaterThan(15);
    for (const piece of pieces) expect(worldObjectById(piece.catalogId)).toBeDefined();
  });
});

describe("guided openness", () => {
  test("off-road ridges rise above climb limit so routes herd the player", () => {
    const route = ROUTES[0]!;
    let ridgeSamples = 0;
    let total = 0;
    for (let index = 3; index < route.points.length - 3; index += 2) {
      const point = route.points[index]!;
      const next = route.points[index + 1]!;
      const dx = next.x - point.x;
      const dz = next.z - point.z;
      const length = Math.hypot(dx, dz) || 1;
      const roadHeight = terrainField.sampleHeight(point.x, point.z);
      for (const side of [-1, 1]) {
        const offX = point.x + (-dz / length) * 55 * side;
        const offZ = point.z + (dx / length) * 55 * side;
        total += 1;
        if (terrainField.sampleHeight(offX, offZ) - roadHeight > 4) ridgeSamples += 1;
      }
    }
    expect(ridgeSamples / total).toBeGreaterThan(0.3);
  });

  test("every side POI has a walkable spur off a campaign zone", () => {
    expect(SPUR_ROUTES.length).toBe(SIDE_POIS.length);
    for (const spur of SPUR_ROUTES) {
      let maxStep = 0;
      for (let index = 1; index < spur.points.length; index += 1) {
        const previous = spur.points[index - 1]!;
        const point = spur.points[index]!;
        maxStep = Math.max(
          maxStep,
          Math.abs(terrainField.sampleHeight(point.x, point.z) - terrainField.sampleHeight(previous.x, previous.z)),
        );
      }
      expect(maxStep).toBeLessThan(6);
    }
  });

  test("side POIs are dressed with a reward chest", () => {
    const chests = AUTHORED_PIECES.filter(
      (piece) => piece.catalogId === "red_chest" && piece.instanceId.startsWith("poi_chest_"),
    );
    expect(chests.length).toBe(SIDE_POIS.length);
  });
});

describe("set pieces", () => {
  test("camp walls leave a gate opening toward the road", () => {
    const shelfWall = AUTHORED_PIECES.filter((piece) => piece.instanceId.startsWith("shelf_wall"));
    expect(shelfWall.length).toBeGreaterThan(6);
    expect(shelfWall.length).toBeLessThan(14);
  });

  test("landmarks anchor key zones", () => {
    const ids = new Set(AUTHORED_PIECES.map((piece) => piece.instanceId));
    expect(ids.has("crash_bus")).toBe(true);
    expect(ids.has("coretown_tower")).toBe(true);
    expect(ids.has("reactor_gate")).toBe(true);
  });

  test("named NPCs stand in the hub", () => {
    expect(NPC_PLACEMENTS.length).toBe(3);
    const hub = ZONES.find((zone) => zone.id === "arid_badlands")!;
    for (const npc of NPC_PLACEMENTS) {
      expect(Math.hypot(npc.x - hub.center.x, npc.z - hub.center.z)).toBeLessThan(hub.flattenRadius);
    }
  });
});

describe("Dead Air tactical arena", () => {
  test("wave entries are authored outside the console and stay out of the static prop plan", () => {
    expect(DEAD_AIR_SPAWNS.length).toBe(7);
    for (const spawn of DEAD_AIR_SPAWNS) {
      expect(enemyById(spawn.catalogId)).toBeDefined();
      expect(Math.hypot(spawn.x - DEAD_AIR_SITE.x, spawn.z - DEAD_AIR_SITE.z)).toBeGreaterThan(14);
      expect(Math.hypot(spawn.x - DEAD_AIR_SITE.x, spawn.z - DEAD_AIR_SITE.z)).toBeLessThan(32);
      expect(pieceById.has(spawn.id)).toBe(false);
      for (const cover of AUTHORED_PIECES.filter((piece) => piece.instanceId.startsWith("dead_air_cover_"))) {
        expect(Math.hypot(spawn.x - cover.x, spawn.z - cover.z)).toBeGreaterThan(3);
      }
    }
    expect(DEAD_AIR_SPAWNS.filter((spawn) => spawn.wave === 3).map((spawn) => spawn.catalogId)).toEqual(["husk", "marauder", "loader"]);
  });

  test("reload shelter and crouch cover have matching physical model bodies", () => {
    const tall = fittedObjectColliders(objectModels.reload_baffle!);
    const low = fittedObjectColliders(objectModels.low_cover!);
    expect(tall?.body?.shape.kind).toBe("aabb");
    expect(low?.body?.shape.kind).toBe("aabb");
    if (tall?.body?.shape.kind !== "aabb" || low?.body?.shape.kind !== "aabb") throw new Error("Missing cover bodies");
    expect(tall.body.shape.halfExtents[1] * 2).toBeCloseTo(2.6);
    expect(low.body.shape.halfExtents[1] * 2).toBeCloseTo(1.1);
    expect(tall.body.blocks).not.toBe(false);
  });

  test("the resupply and reload loops offer different sides of the objective", () => {
    const reload = authoredScene.paths.find((path) => path.id === "dead_air_west_route")!;
    const resupply = authoredScene.paths.find((path) => path.id === "dead_air_east_route")!;
    expect(reload.meta?.role).toBe("reload");
    expect(resupply.meta?.role).toBe("resupply");
    expect(Math.min(...reload.points.map((point) => point.x))).toBeLessThan(DEAD_AIR_SITE.x - 10);
    expect(Math.max(...resupply.points.map((point) => point.x))).toBeGreaterThan(DEAD_AIR_SITE.x + 15);
    const ammo = authoredScene.markers.find((marker) => marker.id === "chest_rustflat_waste_ammo_1")!;
    expect(Math.min(...resupply.points.map((point) => Math.hypot(point.x - ammo.position.x, point.z - ammo.position.z)))).toBeLessThan(3);
  });

  test("native shot queries stop at tall shelter while standing fire clears low cover", () => {
    for (const id of ["dead_air_cover_west_a", "dead_air_cover_east"]) {
      const piece = pieceById.get(id)!;
      const marker = authoredScene.markers.find((entry) => entry.id === id)!;
      expect(marker.meta?.verticalOffset).toBe(-0.5);
      const query = createSceneRaycast({ objects: {
        list: () => [{ instanceId: id, catalogId: piece.catalogId, position: [piece.x, 0, piece.z], rotationY: piece.rotation ?? 0 }],
        collidersOf: () => fittedObjectColliders(objectModels[piece.catalogId]!),
      } });
      const standing = query.raycast({ origin: [piece.x - 5, 1.7, piece.z], direction: [1, 0, 0], maxDistance: 10 });
      const crouched = query.raycast({ origin: [piece.x - 5, 0.85, piece.z], direction: [1, 0, 0], maxDistance: 10 });
      expect(crouched?.instanceId).toBe(id);
      if (piece.catalogId === "reload_baffle") expect(standing?.instanceId).toBe(id);
      else expect(standing).toBeNull();
    }
  });
});
