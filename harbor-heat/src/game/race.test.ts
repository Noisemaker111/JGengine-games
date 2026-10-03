import { describe, expect, test } from "bun:test";
import { createRaceState, firstPastPost, raceTrack } from "@jgengine/core/game/race";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { game } from "../game.config";
import { loop } from "../loop";
import { content } from "./content";
import { createDriving } from "./handroll/driving";
import { createRace, nearestRoute, rivalForRoute } from "./handroll/race";
import { raceStore, RIVAL_RACER_ID } from "./handroll/shared";
import { RACE_CHECKPOINTS, RACE_ROUTES } from "./world/districts";

function raceAt(routeId: string) {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "racer-test", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  const driving = createDriving();
  const race = createRace(driving);
  const route = RACE_ROUTES.find(candidate => candidate.id === routeId)!;
  const [x, z] = route.checkpoints.at(-1)!;
  ctx.scene.entity.spawn("car_muscle", { id: "entered-car", position: [x, 0, z], role: "prop" });
  driving.enterVehicle(ctx, "entered-car");
  return { ctx, driving, race, route };
}

describe("harbor-heat ocean loop", () => {
  test("driving the checkpoint line wins the race", () => {
    const track = raceTrack({
      checkpoints: RACE_CHECKPOINTS.map(([x, z], i) => ({
        id: `cp_${i}`,
        center: [x, 2, z] as const,
        half: [10, 8, 10] as const,
      })),
      laps: 1,
    });
    const race = createRaceState({ track, win: firstPastPost(1) });
    race.addRacer("player", 0);
    race.addRacer("rival", 0);
    let finished = false;
    RACE_CHECKPOINTS.forEach(([x, z], i) => {
      const events = race.update(i + 1, { player: [x, 2, z] as const, rival: [0, 2, 400] as const });
      if (events.some((e) => e.type === "race.finished")) finished = true;
    });
    expect(finished).toBe(true);
    expect(race.standings()[0]?.racerId).toBe("player");
  });
});

describe("harbor circuit rivals", () => {
  test("each authored circuit has its own rival car and pace", () => {
    const profiles = RACE_ROUTES.map(route => rivalForRoute(route.id));
    expect(new Set(profiles.map(profile => profile.name)).size).toBe(RACE_ROUTES.length);
    expect(new Set(profiles.map(profile => profile.vehicleId)).size).toBe(RACE_ROUTES.length);
    expect(rivalForRoute("race-coast").speed).toBeLessThan(rivalForRoute("race-heights").speed);
    for (const route of RACE_ROUTES) {
      const [x, z] = route.checkpoints.at(-1)!;
      expect(nearestRoute([x, 0, z])?.id).toBe(route.id);
    }
  });

  test("the rival moves from the start line without teleporting to checkpoint one", () => {
    const { ctx, race } = raceAt("race-harbor");
    expect(race.startRace(ctx)).toBe(true);
    const before = ctx.scene.entity.get(RIVAL_RACER_ID)!.position;
    race.tick(ctx, 1 / 60);
    const after = ctx.scene.entity.get(RIVAL_RACER_ID)!.position;
    expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeCloseTo(rivalForRoute("race-harbor").speed / 60);
    expect(ctx.scene.entity.get(RIVAL_RACER_ID)?.name).toBe("car_compact");
  });

  test("the HUD uses the SDK position between gates when the rival pulls ahead", () => {
    const { ctx, race } = raceAt("race-harbor");
    race.startRace(ctx);
    for (let i = 0; i < 60; i += 1) race.tick(ctx, 1 / 60);
    expect(raceStore.read(ctx)?.checkpoint).toBe(1);
    expect(raceStore.read(ctx)?.position).toBe(2);
  });

  test("entering elsewhere cannot buy a remote start", () => {
    const { ctx, race } = raceAt("race-harbor");
    ctx.scene.entity.setPose("entered-car", { position: [0, 0, 0] });
    expect(race.startRace(ctx)).toBe(false);
    expect(ctx.scene.entity.get(RIVAL_RACER_ID)).toBeNull();
  });

  test("the entered car must finish, and a forfeited circuit can be restarted", () => {
    const { ctx, driving, race } = raceAt("race-coast");
    race.startRace(ctx);
    driving.exitVehicle(ctx);
    race.tick(ctx, 1 / 60);
    expect(raceStore.read(ctx)?.finished).toBe(true);
    expect(raceStore.read(ctx)?.won).toBe(false);
    expect(race.raceActive()).toBe(false);
    expect(ctx.scene.entity.get(RIVAL_RACER_ID)).toBeNull();
    driving.enterVehicle(ctx, "entered-car");
    expect(race.startRace(ctx)).toBe(true);
  });

  test("a vanished entered vehicle forfeits instead of racing on foot", () => {
    const { ctx, race } = raceAt("race-coast");
    race.startRace(ctx);
    ctx.scene.entity.despawn("entered-car");
    race.tick(ctx, 1 / 60);
    expect(raceStore.read(ctx)?.won).toBe(false);
    expect(race.raceActive()).toBe(false);
  });

  test("finishing the authored route settles a win and despawns the rival", () => {
    const { ctx, race, route } = raceAt("race-loop");
    race.startRace(ctx);
    for (const [x, z] of route.checkpoints) {
      ctx.scene.entity.setPose("entered-car", { position: [x, 0, z] });
      race.tick(ctx, 1 / 60);
    }
    expect(raceStore.read(ctx)?.won).toBe(true);
    expect(race.raceActive()).toBe(false);
    expect(ctx.scene.entity.get(RIVAL_RACER_ID)).toBeNull();
  });
});
