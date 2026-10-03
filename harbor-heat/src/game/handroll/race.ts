import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { advancePathFollow, createPathFollow, type PathFollowConfig, type PathFollowState } from "@jgengine/core/nav/pathFollow";
import { createRaceState, firstPastPost, raceOutcomeOf, raceTrack, type RaceState } from "@jgengine/core/game/race";
import { RACE_ROUTES, type RaceRoute } from "../world/districts";
import { vehicleById } from "../entities/vehicles/catalog";
import type { Driving } from "./driving";
import { RIVAL_RACER_ID, raceStore, type RaceSnapshot } from "./shared";

export interface HarborRival {
  name: string;
  vehicleId: string;
  speed: number;
  brief: string;
}

const RIVALS: Readonly<Record<string, HarborRival>> = {
  "race-loop": { name: "Rafa", vehicleId: "car_muscle", speed: 15.5, brief: "Rafa holds a steady pace through the long loop. Keep your car to the finish." },
  "race-harbor": { name: "Mina", vehicleId: "car_compact", speed: 13, brief: "Mina knows every dock turn. A clean line beats her Pico." },
  "race-heights": { name: "Sol", vehicleId: "car_sport", speed: 17, brief: "Sol's Cicada is the quickest challenge. Bring speed to Palm Heights." },
  "race-coast": { name: "Tavo", vehicleId: "car_suv", speed: 11.5, brief: "Tavo's Vagabond runs a relaxed coastal pace. Learn the gates here." },
};

export function rivalForRoute(routeId: string): HarborRival {
  return RIVALS[routeId] ?? RIVALS["race-loop"]!;
}

export const RACE_START_RADIUS = 9;

/**
 * The race slice: authored street-race circuits and their scripted rival racer. Every `route` path in
 * the scene document is a startable race; starting picks the circuit whose start line (last authored
 * checkpoint) is nearest the player. Reads the player's world position through the {@link Driving}
 * seam and gates starting on the player being in a ground vehicle.
 */
export interface Race {
  startRace(ctx: GameContext): boolean;
  raceActive(): boolean;
  tick(ctx: GameContext, dt: number): void;
}

/** The circuit whose start line (last checkpoint) is nearest to a world position. */
export function nearestRoute(pos: readonly [number, number, number]): RaceRoute | null {
  let best: RaceRoute | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const route of RACE_ROUTES) {
    const start = route.checkpoints[route.checkpoints.length - 1];
    if (start === undefined) continue;
    const dist = Math.hypot(pos[0] - start[0], pos[2] - start[1]);
    if (dist < bestDist) {
      best = route;
      bestDist = dist;
    }
  }
  return best;
}

export function createRace(driving: Driving): Race {
  let race: RaceState | null = null;
  let activeRoute: RaceRoute | null = null;
  let raceStartedAt = 0;
  let rivalState: PathFollowState | null = null;
  let rivalConfig: PathFollowConfig | null = null;
  let raceVehicleId: string | null = null;

  function publishRace(ctx: GameContext, snapshot: RaceSnapshot): void {
    raceStore.write(ctx, snapshot);
  }

  function endRace(ctx: GameContext, won: boolean): void {
    if (activeRoute === null) return;
    const player = race?.progressOf(ctx.player.userId);
    publishRace(ctx, {
      routeId: activeRoute.id,
      label: activeRoute.label,
      active: false,
      checkpoint: player?.progress ?? 0,
      total: activeRoute.checkpoints.length,
      position: won ? 1 : 2,
      timeSec: ctx.time.now() - raceStartedAt,
      finished: true,
      won,
    });
    ctx.scene.entity.despawn(RIVAL_RACER_ID);
    race = null;
    activeRoute = null;
    rivalState = null;
    rivalConfig = null;
    raceVehicleId = null;
  }

  function tickRace(ctx: GameContext, dt: number): void {
    if (race === null || activeRoute === null || rivalConfig === null || rivalState === null) return;
    if (driving.drivingVehicleId() !== raceVehicleId || raceVehicleId === null || ctx.scene.entity.get(raceVehicleId) === null) {
      ctx.game.feed.push("harbor.log", { text: "Race forfeited — keep your entered car to the finish." });
      endRace(ctx, false);
      return;
    }
    rivalState = advancePathFollow(rivalConfig, rivalState, dt);
    const [rx, , rz] = rivalState.position;
    ctx.scene.entity.setPose(RIVAL_RACER_ID, {
      position: [rx, ctx.world.groundHeightAt(rx, rz), rz],
      rotationY: rivalState.heading,
      dt,
    });
    const playerPos = driving.playerWorldPos(ctx);
    if (playerPos === null) return;
    const events = race.update(ctx.time.now(), {
      [ctx.player.userId]: playerPos,
      [RIVAL_RACER_ID]: [rx, 0, rz] as const,
    });
    const finished = events.find((event) => event.type === "race.finished");
    if (finished !== undefined) {
      endRace(ctx, raceOutcomeOf(finished.ranking, ctx.player.userId) === "win");
      return;
    }
    const player = race.progressOf(ctx.player.userId);
    publishRace(ctx, {
      routeId: activeRoute.id,
      label: activeRoute.label,
      active: true,
      checkpoint: player?.progress ?? 0,
      total: activeRoute.checkpoints.length,
      position: player?.position ?? 2,
      timeSec: ctx.time.now() - raceStartedAt,
      finished: false,
      won: false,
    });
  }

  return {
    startRace(ctx) {
      if (race !== null) return false;
      const drivenId = driving.drivingVehicleId();
      if (drivenId === null) return false;
      if (vehicleById(ctx.scene.entity.get(drivenId)?.name ?? "")?.dynamics.type !== "ground") return false;
      const playerPos = driving.playerWorldPos(ctx);
      if (playerPos === null) return false;
      const route = nearestRoute(playerPos);
      if (route === null || route.checkpoints.length === 0) return false;
      const checkpoints = route.checkpoints;
      const start = checkpoints[checkpoints.length - 1]!;
      if (Math.hypot(playerPos[0] - start[0], playerPos[2] - start[1]) > RACE_START_RADIUS) {
        ctx.scene.entity.floatText({ instanceId: drivenId, text: "DRIVE TO A RACE START LINE", kind: "warn" });
        return false;
      }
      const rival = rivalForRoute(route.id);
      const track = raceTrack({
        checkpoints: checkpoints.map(([x, z], i) => ({
          id: `cp_${i}`,
          center: [x, 2, z] as const,
          half: [10, 8, 10] as const,
        })),
        laps: 1,
      });
      race = createRaceState({ track, win: firstPastPost(1) });
      activeRoute = route;
      raceVehicleId = drivenId;
      raceStartedAt = ctx.time.now();
      race.addRacer(ctx.player.userId, raceStartedAt);
      race.addRacer(RIVAL_RACER_ID, raceStartedAt);
      ctx.scene.entity.spawn(rival.vehicleId, {
        id: RIVAL_RACER_ID,
        position: [start[0], ctx.world.groundHeightAt(start[0], start[1]), start[1]],
        rotationY: Math.atan2(checkpoints[0]![0] - start[0], checkpoints[0]![1] - start[1]),
        role: "prop",
      });
      rivalConfig = {
        waypoints: [start, ...checkpoints].map(([x, z]) => [x, 0, z] as const),
        speed: rival.speed,
        loop: false,
      };
      rivalState = createPathFollow(rivalConfig);
      ctx.game.feed.push("harbor.log", { text: `${route.label} — ${rival.brief}` });
      publishRace(ctx, {
        routeId: route.id,
        label: route.label,
        active: true,
        checkpoint: 0,
        total: checkpoints.length,
        position: 1,
        timeSec: 0,
        finished: false,
        won: false,
      });
      return true;
    },
    raceActive: () => race !== null,
    tick: tickRace,
  };
}
