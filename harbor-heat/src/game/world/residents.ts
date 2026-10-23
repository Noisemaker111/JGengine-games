import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import {
  createOffScreenWorld,
  resolveRoutine,
  type NearAgents,
  type NearHandoff,
  type NearSpawn,
  type NeedDefinition,
  type OffScreenWorld,
  type RoutineTimeline,
} from "@jgengine/core/gameplay";
import { createNavGrid, findPath, type NavGrid, type NavPoint } from "@jgengine/core/nav/navGrid";

import { editorLayers } from "../../editorLayers";
import type { BuildingFootprintXZ } from "./setup";

/**
 * Mainsail's named residents (D1.1, engine B1.3): every resident follows an authored day — home,
 * work, a meal, home again — resolved against the world clock by `resolveRoutine`, and the population
 * is split by distance through `createOffScreenWorld`, so a resident across the city is a schedule, a
 * position and a needs record and costs nothing per frame.
 *
 * The near half is this city's own: residents walk around the authored buildings on the shared nav
 * grid, so a resident that comes into range appears exactly where the cheap state already had it and
 * walks on from there.
 */

/** One game day in game-seconds — the same 720 s the clock in `game.config.ts` runs on. */
const CYCLE_SECONDS = 720;
/** Walking pace in metres per game-second. */
const WALK_SPEED = 1.35;
/** Distance at which a resident is simulated for real, and the band past which it goes cheap again. */
const NEAR_RADIUS = 62;
const FAR_RADIUS = 88;
/** Most residents that may switch sides of the boundary in one tick. */
const SWITCH_BUDGET = 4;
/** How close a walker must be to a waypoint before it turns for the next one. */
const WAYPOINT_REACH = 0.6;

/** Needs every resident carries; a meal stop refills hunger. */
const NEEDS: readonly NeedDefinition[] = [
  { id: "hunger", max: 100, rate: 0.05 },
  { id: "rest", max: 100, rate: 0.02 },
];

/** An authored `resident_place` marker: where a routine stop actually happens. */
export interface ResidentPlace {
  id: string;
  label: string;
  position: readonly [number, number, number];
}

export const RESIDENT_PLACES: readonly ResidentPlace[] = editorLayers.markers
  .filter((marker) => marker.kind === "resident_place")
  .map((marker) => ({
    id: marker.id,
    label: marker.label ?? marker.id,
    position: [marker.position.x, marker.position.y, marker.position.z] as const,
  }));

const PLACES: Readonly<Record<string, readonly [number, number, number]>> = Object.fromEntries(
  RESIDENT_PLACES.map((place) => [place.id, place.position]),
);

/**
 * One resident: a name, the model it wears, and the three authored places its day runs between. The
 * times are content (one shared coastal work day); the places are the scene document's.
 */
export interface ResidentSpec {
  id: string;
  name: string;
  kind: string;
  home: string;
  work: string;
  meal: string;
}

export const RESIDENTS: readonly ResidentSpec[] = [
  { id: "rosa", name: "Rosa Quill", kind: "ped_beach", home: "place_home_gull", work: "place_shack", meal: "place_kiosk" },
  { id: "tino", name: "Tino Bate", kind: "ped_beach", home: "place_kiosk", work: "place_home_gull", meal: "place_shack" },
  { id: "mae", name: "Mae Sonder", kind: "ped_beach", home: "place_shack", work: "place_kiosk", meal: "place_home_gull" },
  { id: "walt", name: "Walt Gorse", kind: "ped_beach", home: "place_home_salt", work: "place_cafe", meal: "place_market" },
  { id: "dee", name: "Dee Marrow", kind: "ped_beach", home: "place_diner", work: "place_market", meal: "place_cafe" },
  { id: "ada", name: "Ada Verge", kind: "ped_city", home: "place_home_verge", work: "place_newsstand", meal: "place_busstop" },
  { id: "cyrus", name: "Cyrus Mott", kind: "ped_beach", home: "place_kiosk", work: "place_shack", meal: "place_kiosk" },
  { id: "ines", name: "Ines Rook", kind: "ped_city", home: "place_diner", work: "place_newsstand", meal: "place_busstop" },
  { id: "pim", name: "Pim Tallow", kind: "ped_city", home: "place_home_verge", work: "place_corner_cafe", meal: "place_cafe" },
  { id: "juno", name: "Juno Marsh", kind: "ped_city", home: "place_home_salt", work: "place_corner_cafe", meal: "place_newsstand" },
  { id: "elroy", name: "Elroy Snapp", kind: "ped_city", home: "place_diner", work: "place_busstop", meal: "place_newsstand" },
  { id: "nia", name: "Nia Pike", kind: "ped_city", home: "place_flat", work: "place_offices", meal: "place_avenue_cafe" },
  { id: "ossie", name: "Ossie Rand", kind: "ped_city", home: "place_avenue_cafe", work: "place_offices", meal: "place_flat" },
  { id: "bex", name: "Bex Corvo", kind: "ped_city", home: "place_flat", work: "place_avenue_cafe", meal: "place_offices" },
  { id: "tess", name: "Tess Amado", kind: "ped_city", home: "place_offices", work: "place_flat", meal: "place_avenue_cafe" },
  { id: "rufus", name: "Rufus Hake", kind: "ped_city", home: "place_avenue_cafe", work: "place_flat", meal: "place_offices" },
  { id: "opal", name: "Opal Vey", kind: "ped_city", home: "place_flat", work: "place_avenue_cafe", meal: "place_flat" },
  { id: "hollis", name: "Hollis Fen", kind: "ped_docks", home: "place_canteen", work: "place_docks", meal: "place_warehouse" },
  { id: "gil", name: "Gil Roper", kind: "ped_docks", home: "place_warehouse", work: "place_canteen", meal: "place_docks" },
  { id: "ned", name: "Ned Scurry", kind: "ped_docks", home: "place_docks", work: "place_warehouse", meal: "place_canteen" },
  { id: "cass", name: "Cass Dobbs", kind: "ped_docks", home: "place_canteen", work: "place_warehouse", meal: "place_docks" },
  { id: "wren", name: "Wren Fitch", kind: "ped_docks", home: "place_warehouse", work: "place_docks", meal: "place_canteen" },
];

/**
 * Time to walk between two authored places, in game-seconds.
 *
 * Whole seconds on purpose: a fractional boundary plus the engine's `wrap()` loses a bit, which makes
 * `RoutineTimeline.nextChangeAfter(t)` return `t` itself for a far resident refreshed exactly on a
 * departure — `createOffScreenWorld` then spins on that boundary forever. Integer stops keep the
 * boundary comparison exact.
 */
function walkTime(from: string, to: string): number {
  const a = PLACES[from];
  const b = PLACES[to];
  if (a === undefined || b === undefined) return 0;
  return Math.ceil(Math.hypot(a[0] - b[0], a[2] - b[2]) / WALK_SPEED);
}

/**
 * One resident's day: home overnight, work from the morning, a proper sit-down meal at lunch, a
 * second stretch at work and home for the evening. Each resident is shifted a few seconds off the
 * hour so the boardwalk does not empty and refill in lockstep.
 */
export function routineFor(spec: ResidentSpec, index: number): RoutineTimeline {
  // Up to twenty minutes off the shared work day, so neighbours leave for lunch at different times.
  const jitter = ((index * 13) % 21) - 10;
  return resolveRoutine({
    cycleSeconds: CYCLE_SECONDS,
    travelSeconds: walkTime,
    stops: [
      { place: spec.home, arriveAt: 0, activity: "sleep" },
      { place: spec.work, arriveAt: 240 + jitter, activity: "work" },
      { place: spec.meal, arriveAt: 372 + jitter, activity: "meal", refill: { hunger: 45 } },
      { place: spec.work, arriveAt: 450 + jitter, activity: "work" },
      { place: spec.home, arriveAt: 630 + jitter, activity: "home" },
    ],
  });
}

interface Walker {
  id: string;
  entityId: string;
  path: readonly NavPoint[];
  index: number;
  needs: Record<string, number>;
  position: [number, number, number];
}

/** The near half: nav-grid routes stepped along by hand, one entity per resident in range. */
interface CityWalkers extends NearAgents {
  count(): number;
}

/**
 * Build the near half: a nav grid over the city with every authored building blocked, and residents
 * that walk it. A re-bake would come with the editor's nav bake, which this scene does not author yet.
 */
function createCityWalkers(ctx: GameContext, buildings: readonly BuildingFootprintXZ[]): CityWalkers {
  const grid: NavGrid = createNavGrid({
    bounds: { minX: -320, minZ: -320, maxX: 320, maxZ: 320 },
    cellSize: 2,
  });
  for (const lot of buildings) {
    // The lot's own rotated footprint plus a body's width, so a walker never clips a wall corner.
    const turned = Math.abs(Math.sin(lot.rotationY)) > 0.5;
    const halfX = (turned ? 8 : 11) + 0.8;
    const halfZ = (turned ? 11 : 8) + 0.8;
    grid.blockAabb({ minX: lot.x - halfX, minZ: lot.z - halfZ, maxX: lot.x + halfX, maxZ: lot.z + halfZ });
  }

  const kindOf = new Map(RESIDENTS.map((spec) => [spec.id, spec.kind]));
  const walkers = new Map<string, Walker>();

  function route(from: readonly [number, number, number], to: readonly [number, number, number]): readonly NavPoint[] {
    const path = findPath(grid, [from[0], from[2]], [to[0], to[2]], { clearance: 1, maxNodes: 6000, smooth: true });
    return path ?? [[to[0], to[2]]];
  }

  return {
    spawn(next: NearSpawn) {
      if (walkers.has(next.id)) return;
      const entityId = `resident-${next.id}`;
      // A restored world can still hold this resident's body while the schedule has it far: the near
      // copy owns the id, so the stale one goes rather than colliding with `spawn`.
      if (ctx.scene.entity.get(entityId) !== null) ctx.scene.entity.despawn(entityId);
      const [x, , z] = next.position;
      ctx.scene.entity.spawn(kindOf.get(next.id) ?? "ped_city", {
        id: entityId,
        position: [x, ctx.world.groundHeightAt(x, z), z],
        rotationY: 0,
        role: "npc",
      });
      walkers.set(next.id, {
        id: next.id,
        entityId,
        path: route(next.position, next.goal),
        index: 0,
        needs: { ...next.needs },
        position: [x, next.position[1], z],
      });
    },
    despawn(id: string): NearHandoff | null {
      const walker = walkers.get(id);
      if (walker === undefined) return null;
      ctx.scene.entity.despawn(walker.entityId);
      walkers.delete(id);
      return { position: walker.position, needs: walker.needs };
    },
    position(id: string) {
      const walker = walkers.get(id);
      if (walker === undefined) return null;
      return ctx.scene.entity.get(walker.entityId)?.position ?? walker.position;
    },
    needs(id: string) {
      return walkers.get(id)?.needs ?? null;
    },
    setGoal(id: string, goal) {
      const walker = walkers.get(id);
      if (walker === undefined) return;
      walker.path = route(walker.position, goal);
      walker.index = 0;
    },
    tick(dt: number) {
      if (!(dt > 0)) return;
      for (const walker of walkers.values()) {
        const entity = ctx.scene.entity.get(walker.entityId);
        if (entity === null) continue;
        let [x, , z] = entity.position;
        const fromX = x;
        const fromZ = z;
        let budget = WALK_SPEED * dt;
        while (budget > 0 && walker.index < walker.path.length) {
          const target = walker.path[walker.index]!;
          const dx = target[0] - x;
          const dz = target[1] - z;
          const distance = Math.hypot(dx, dz);
          if (distance <= WAYPOINT_REACH) {
            walker.index += 1;
            continue;
          }
          const step = Math.min(budget, distance);
          x += (dx / distance) * step;
          z += (dz / distance) * step;
          budget -= step;
        }
        // The near side decays the same needs the cheap state does, so a handoff keeps the numbers.
        for (const need of NEEDS) {
          const value = walker.needs[need.id];
          if (value === undefined) continue;
          walker.needs[need.id] = Math.max(need.min ?? 0, value - need.rate * dt);
        }
        const moved = Math.abs(x - fromX) > 1e-6 || Math.abs(z - fromZ) > 1e-6;
        const y = ctx.world.groundHeightAt(x, z);
        walker.position = [x, y, z];
        if (moved || Math.abs(entity.position[1] - y) > 0.05) {
          ctx.scene.entity.setPose(walker.entityId, {
            position: [x, y, z],
            rotationY: moved ? Math.atan2(x - fromX, z - fromZ) : entity.rotationY,
            dt,
          });
        }
      }
    },
    count: () => walkers.size,
    dispose() {
      for (const walker of walkers.values()) ctx.scene.entity.despawn(walker.entityId);
      walkers.clear();
    },
  };
}

interface CityResidents {
  world: OffScreenWorld;
  near: CityWalkers;
}

const residentsStore = perContext<{ value: CityResidents | null }>(() => ({ value: null }));

function city(ctx: GameContext): CityResidents | null {
  return residentsStore(ctx).value;
}

/**
 * Build Mainsail's population: one off-screen world over the authored places, one resident per
 * authored day, and the near half that walks the ones in range.
 */
export function setupResidents(ctx: GameContext, buildings: readonly BuildingFootprintXZ[]): void {
  const near = createCityWalkers(ctx, buildings);
  const world = createOffScreenWorld({
    places: PLACES,
    needs: NEEDS,
    policy: { nearRadius: NEAR_RADIUS, farRadius: FAR_RADIUS, switchBudget: SWITCH_BUDGET },
    near,
    residents: RESIDENTS.map((spec, index) => ({
      id: spec.id,
      home: PLACES[spec.home] ?? [0, 0, 0],
      routine: routineFor(spec, index),
    })),
    devtoolsName: "harbor.residents",
  });
  residentsStore(ctx).value = { world, near };
}

/** Split the population by distance from the player and advance the ones in range. */
export function tickResidents(ctx: GameContext, dt: number): void {
  const residents = city(ctx);
  if (residents === null) return;
  const player = ctx.scene.entity.get(ctx.player.userId);
  residents.world.tick(dt, ctx.time.now(), player?.position ?? [0, 0, 0]);
}

/** Where a resident is and what it is doing, for a HUD, a probe or a test. */
export function residentAt(ctx: GameContext, id: string) {
  return city(ctx)?.world.agent(id) ?? null;
}

/** Population counters: how many residents exist, how many are simulated, how many are cheap. */
export function residentStats(ctx: GameContext) {
  return city(ctx)?.world.stats() ?? null;
}

/** Tear the population down with the world. */
export function disposeResidents(ctx: GameContext): void {
  city(ctx)?.world.dispose();
  residentsStore(ctx).value = null;
}
