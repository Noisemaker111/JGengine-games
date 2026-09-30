import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { LifecycleConfig } from "@jgengine/core/game/defineGame";

import { COMPACTOR_ENTITY, KART_PLAYER_ENTITY } from "./game/entities/catalog";
import { createRunSession, runSessionStore, type RunSession } from "./game/run/session";
import { createWorldRuntime, driveInputStore, worldRuntimeStore } from "./game/run/store";
import { createDriveInput } from "./game/vehicle/input";
import { placeExitGate, placeGateBarricades, placePickupMarkers, placeZoneDressing, syncCompactorRow, syncPickupMarkers, syncClearedGates } from "./game/world/setup";

export const lifecycle: LifecycleConfig<RunSession> = {
  store: runSessionStore,
  start(session) {
    session.start();
    return session;
  },
  restart(session) {
    session.restart();
    return session;
  },
  phaseOf(session) {
    const phase = session.snapshot().phase;
    return phase === "running" ? session.snapshot().paused ? "paused" : "playing" : phase === "start" ? "menu" : "ended";
  },
  commands: { start: "startRun" },
};

export function onInit(ctx: GameContext): void {
  const propRows = placeZoneDressing(ctx);
  placeGateBarricades(ctx);
  placePickupMarkers(ctx);
  placeExitGate(ctx);
  worldRuntimeStore.write(ctx, createWorldRuntime(propRows));

  const session = createRunSession(ctx.world.groundHeightAt);
  runSessionStore.write(ctx, session);

  const input = createDriveInput();
  driveInputStore.write(ctx, input);
}

export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.bind("racers").sync([
    { id: ctx.player.userId, kind: KART_PLAYER_ENTITY, position: [0, 0, 4], role: "player" },
    { id: COMPACTOR_ENTITY, kind: COMPACTOR_ENTITY, position: [0, 0, -35], role: "prop" },
  ]);
}

export function onTick(ctx: GameContext, dt: number): void {
  const session = runSessionStore.peek(ctx);
  const input = driveInputStore.peek(ctx);
  const world = worldRuntimeStore.peek(ctx);
  if (session === undefined || input === undefined || world === undefined) return;

  // Restore all consumed scenery when a new run resets the session.
  if (session.snapshot().collectedIds.size < world.removedMarkers.size || session.snapshot().runTime < world.lastRunTime) {
    const rows = placeZoneDressing(ctx);
    placeGateBarricades(ctx);
    placePickupMarkers(ctx);
    worldRuntimeStore.write(ctx, createWorldRuntime(rows));
    input.reset();
  }
  const currentWorld = worldRuntimeStore.peek(ctx)!;

  const before = session.snapshot();
  const axis = input.sample(dt, ctx.input, before.phase === "running" && !before.paused);
  const jumpPressed = input.consumeJump() || ctx.input.justPressed("jumpHop");
  const plowBracing = ctx.input.isDown("plowBrace") || input.isDown("plowBrace");
  session.tick(dt, axis, { jumpPressed, plowBracing });

  const snapshot = session.snapshot();

  ctx.scene.entity.bind("racers").sync(
    [
      { id: ctx.player.userId, kind: KART_PLAYER_ENTITY, position: snapshot.pose.position, rotationY: snapshot.pose.heading, role: "player" },
      {
        id: COMPACTOR_ENTITY,
        kind: COMPACTOR_ENTITY,
        position: [0, ctx.world.groundHeightAt(0, snapshot.compactorZ), snapshot.compactorZ],
        role: "prop",
      },
    ],
    dt,
  );

  syncPickupMarkers(ctx, snapshot.collectedIds, currentWorld.removedMarkers);
  syncClearedGates(ctx, snapshot.clearedGateIds, currentWorld.removedGates);
  syncCompactorRow(ctx, snapshot.compactorZ, currentWorld.propRows, currentWorld.cursor);
  currentWorld.lastRunTime = snapshot.runTime;

  runSessionStore.write(ctx, session);
}
