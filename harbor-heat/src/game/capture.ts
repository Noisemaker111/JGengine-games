import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { vehicleById } from "./entities/vehicles/catalog";
import { handrollOf } from "./handroll";

/** What a staged chase should look like when the capture takes it. */
export type StageMode = "chase";

/** One simulated step, at the cadence the driving and pursuit slices are tuned for. */
const STEP = 1 / 60;

/** Heat that lands the player deep in a pursuit: three stars summons cruisers. */
const CHASE_HEAT = 380;

/**
 * Stage the state a chase proof needs: the player in a car with a live pursuit around them.
 * The heat is the response system's own input, the cruisers are spawned by its own tick, and the
 * cars are driven by its own driver - this only picks the car and runs the tick forward.
 */
export function stageChase(ctx: GameContext, mode: StageMode = "chase", seconds = 10): void {
  void mode;
  const handroll = handrollOf(ctx);
  if (handroll.drivingVehicleId() === null) {
    const player = ctx.scene.entity.get(ctx.player.userId);
    const cars = ctx.scene.entity.list()
      .filter((entity) => vehicleById(entity.name) !== undefined && !entity.id.startsWith("cruiser_"))
      .sort((a, b) => (player === null ? 0 : distance(a.position, player.position) - distance(b.position, player.position)));
    const car = cars[0];
    if (car !== undefined) handroll.enterVehicle(ctx, car.id);
  }
  // Heat is witness-gated, so the scene includes the witnesses: bystanders on the player's flanks
  // the way a street crime has them, then the response system is fed its own heat input.
  const anchor = handroll.drivingVehicleId() === null
    ? ctx.scene.entity.get(ctx.player.userId)?.position ?? null
    : ctx.scene.entity.get(handroll.drivingVehicleId()!)?.position ?? null;
  if (anchor !== null) {
    for (const [index, side] of [[0, -1], [1, 1]] as const) {
      const id = `ped_witness_${index}`;
      if (ctx.scene.entity.get(id) !== null) continue;
      ctx.scene.entity.spawn("ped_beach", {
        id,
        position: [anchor[0] + 4 * side, anchor[1], anchor[2]],
        rotationY: side > 0 ? -Math.PI / 2 : Math.PI / 2,
        role: "npc",
      });
    }
  }
  for (let elapsed = 0; elapsed < STEP * 4; elapsed += STEP) {
    ctx.time.advance(STEP);
    handroll.tick(ctx, STEP);
  }
  handroll.addHeat(ctx, CHASE_HEAT);
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    ctx.time.advance(STEP);
    handroll.tick(ctx, STEP);
  }
}

function distance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));
}

export function stageReadout(ctx: GameContext): { stars: number; heat: number; cruisers: number; driving: boolean } {
  const wanted = handrollOf(ctx).wanted();
  return {
    stars: wanted.stars,
    heat: Math.round(wanted.heat),
    cruisers: ctx.scene.entity.list().filter((entity) => entity.id.startsWith("cruiser_")).length,
    driving: handrollOf(ctx).drivingVehicleId() !== null,
  };
}

/**
 * Dev-only capture staging for the chase proof: three stars, cruisers on the scene, the player on
 * the move. Play reaches it by committing crimes in front of witnesses.
 */
export function registerCaptureCommands(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  ctx.game.commands.define<{ mode?: StageMode }>("chase.stage", {
    apply(state, input) {
      stageChase(state, input.mode ?? "chase");
      return state;
    },
  });
}
