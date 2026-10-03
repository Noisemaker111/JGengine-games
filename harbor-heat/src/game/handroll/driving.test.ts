import { describe, expect, test } from "bun:test";
import { activeTouchControlsMode } from "@jgengine/core/input/touchControlsMode";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { game } from "../../game.config";
import { content } from "../content";
import { vehicleById } from "../entities/vehicles/catalog";
import { createDriving, type Driving } from "./driving";
import { drivingStore } from "./shared";

const HERO = "driving-test-rider";
const DT = 1 / 60;

function boot(): { ctx: GameContext; driving: Driving } {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: HERO, isNew: true } });
  ctx.scene.entity.spawn("street_runner", { id: HERO, position: [-180, 0, 40], role: "player" });
  return { ctx, driving: createDriving() };
}

function expectReleased(ctx: GameContext, driving: Driving): void {
  expect(driving.drivingVehicleId()).toBeNull();
  expect(driving.carSpeedKmh()).toBe(0);
  expect(driving.telemetry().mode).toBe("ground");
  expect(drivingStore.read(ctx)).toBeNull();
  expect(activeTouchControlsMode(ctx)).toBeNull();
  expect(ctx.camera.followedEntityId()).toBe(HERO);
  expect(ctx.camera.chaseTuning()).toBeNull();
  expect(ctx.scene.entity.get(HERO)?.hidden).toBe(false);
  expect(ctx.scene.entity.get(HERO)?.movement.frozen).toBe(false);
}

describe("vehicle possession recovery", () => {
  test("a car relocated after exit is re-entered at its current pose without old momentum", () => {
    const { ctx, driving } = boot();
    ctx.scene.entity.spawn("car_muscle", { id: "car", position: [-180, 0, 40], role: "prop" });
    driving.enterVehicle(ctx, "car");
    ctx.input.publish(["moveForward"]);
    for (let i = 0; i < 120; i++) driving.tickDriving(ctx, DT);
    expect(driving.carSpeedKmh()).toBeGreaterThan(5);
    driving.exitVehicle(ctx);
    expectReleased(ctx, driving);

    ctx.scene.entity.setPose("car", { position: [-180, 0, 140], rotationY: 0.8 });
    ctx.input.publish([]);
    driving.enterVehicle(ctx, "car");
    driving.tickDriving(ctx, DT);
    const car = ctx.scene.entity.get("car")!;
    expect(car.position[0]).toBeCloseTo(-180, 6);
    expect(car.position[2]).toBeCloseTo(140, 6);
    expect(car.rotationY).toBeCloseTo(0.8, 6);
    expect(driving.carSpeedKmh()).toBe(0);
  });

  test("a landed aircraft re-entered after scene relocation starts at the new pose", () => {
    const { ctx, driving } = boot();
    ctx.scene.entity.spawn("air_helicopter", { id: "heli", position: [-180, 0, 40], role: "prop" });
    driving.enterVehicle(ctx, "heli");
    driving.tickDriving(ctx, DT);
    driving.exitVehicle(ctx);
    expectReleased(ctx, driving);
    ctx.scene.entity.setPose("heli", { position: [-180, 0, 140], rotationY: 0.8 });
    driving.enterVehicle(ctx, "heli");
    driving.tickDriving(ctx, DT);
    const heli = ctx.scene.entity.get("heli")!;
    expect(heli.position[0]).toBeCloseTo(-180, 3);
    expect(heli.position[2]).toBeCloseTo(140, 3);
    expect(heli.rotationY).toBeCloseTo(0.8, 6);
  });

  test("a despawned driven vehicle restores on-foot controls and permits boarding another car", () => {
    const { ctx, driving } = boot();
    ctx.scene.entity.spawn("car_compact", { id: "removed", position: [-180, 0, 40], role: "prop" });
    driving.enterVehicle(ctx, "removed");
    ctx.input.publish(["moveForward"]);
    for (let i = 0; i < 60; i++) driving.tickDriving(ctx, DT);
    ctx.scene.entity.despawn("removed");
    driving.tickDriving(ctx, DT);
    expectReleased(ctx, driving);
    const rider = ctx.scene.entity.get(HERO)!;
    expect(rider.position[1]).toBe(ctx.world.groundHeightAt(rider.position[0], rider.position[2]));
    ctx.scene.entity.spawn("car_compact", { id: "replacement", position: rider.position, role: "prop" });
    driving.enterVehicle(ctx, "replacement");
    expect(driving.drivingVehicleId()).toBe("replacement");
    expect(activeTouchControlsMode(ctx)).toBe("car");
    expect(ctx.scene.entity.get(HERO)?.hidden).toBe(true);
  });

  test("explosion releases the driver and leaves pursuit cruiser simulations registered", () => {
    const { ctx, driving } = boot();
    const cop = vehicleById("car_cop")!;
    if (cop.dynamics.type !== "ground") throw new Error("car_cop must use ground dynamics");
    const cruiser = driving.makeCarSim("cruiser", cop.dynamics.tuning, cop.collisionRadius, [-180, 0, 100], 0);
    driving.cruiserVehicles.set("cruiser", cruiser);
    ctx.scene.entity.spawn("car_compact", { id: "exploded", position: [-180, 0, 40], role: "prop" });
    driving.enterVehicle(ctx, "exploded");
    expect(driving.explodeVehicle(ctx, "exploded", [-180, 0, 40])).toBe(true);
    expectReleased(ctx, driving);
    expect(driving.cruiserVehicles.get("cruiser")).toBe(cruiser);
    expect(cruiser.tick(DT, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }).forwardSpeed).toBeGreaterThan(0);
  });
});
