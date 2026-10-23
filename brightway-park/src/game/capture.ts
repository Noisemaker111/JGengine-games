import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { DAY_LENGTH, guestCap } from "./catalog";
import { resetPark } from "./parkReset";
import { session } from "./session";
import { stepPark } from "./sim/step";

/** What a staged park should look like when the capture takes it. */
export type StageMode = "full";

const STEP = 1 / 20;

/**
 * Run the park's own tick for `seconds` of game time. Every guest, boarding and queue in the
 * result was produced by those systems - the stage only sets the clock past opening and fills
 * the turnstiles.
 */
function advance(ctx: GameContext, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    ctx.sim.advance(STEP, (dt) => stepPark(ctx, dt));
  }
}

/**
 * Dev-only staging for the states that need a played day: a park at capacity, gates open, the
 * authored starter rides running lines and guests standing in them. Play reaches this by opening
 * the gates and waiting most of a day; `shoot --state full-park` jumps here instead.
 */
export function stagePark(ctx: GameContext, mode: StageMode): void {
  void mode;
  // Past the open fraction so the gates, the spawner and the HUD all read "open", not "closed for
  // the night" over a full park.
  advance(ctx, DAY_LENGTH * 0.27);
  resetPark(ctx, { guests: guestCap(session.rating) });
  session.started = true;
  // Let the seeded crowd spread out, board and line up; queues only exist once guests reach a ride.
  advance(ctx, 30);
}

export function registerCaptureCommands(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  ctx.game.commands.define<{ mode?: StageMode }>("park.stage", {
    apply(state, input) {
      stagePark(state, input.mode ?? "full");
      return state;
    },
  });
}
