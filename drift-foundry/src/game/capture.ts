import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { runSessionStore } from "./run/session";

/** What a staged run should look like when the capture takes it. */
export type StageMode = "midrun" | "result";

/** One simulated step at the frame rate the run is tuned for. */
const STEP = 1 / 60;

export interface StageReadout {
  phase: string;
  runTime: number;
  z: number;
  speedKmh: number;
  outcome: string;
}

/**
 * Drive the run's own session forward with the throttle pinned, pressing jump for the ramps.
 * The pickups, gates, crusher, damage, rivals and the finish are the real systems: this is the
 * corridor driven quickly, not a pose dropped onto the track.
 */
function drive(ctx: GameContext, seconds: number): void {
  const session = runSessionStore.peek(ctx);
  if (session === undefined) return;
  const axis = { throttle: 1, brake: 0, steer: 0 };
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    session.tick(STEP, axis, { jumpPressed: true, plowBracing: true });
    if (session.snapshot().phase !== "running") return;
  }
}

export function stageRun(ctx: GameContext, mode: StageMode): void {
  const session = runSessionStore.peek(ctx);
  if (session === undefined) return;
  session.start();
  // Partway down the corridor the mid-run shot frames the compactor closing; the result shot keeps
  // driving to whatever ending the gauntlet hands the kart.
  drive(ctx, mode === "midrun" ? 14 : 180);
}

export function stageReadout(ctx: GameContext): StageReadout {
  const snapshot = runSessionStore.peek(ctx)?.snapshot();
  return {
    phase: snapshot?.phase ?? "none",
    runTime: Math.round((snapshot?.runTime ?? 0) * 10) / 10,
    z: Math.round((snapshot?.pose.position[2] ?? 0) * 10) / 10,
    speedKmh: Math.round(snapshot?.pose.speedKmh ?? 0),
    outcome: snapshot?.outcome?.kind ?? "none",
  };
}

/**
 * Dev-only capture staging for the two states that need a driven corridor: a mid-run with the
 * compactor on the kart, and a finished run with its result card. Play reaches both by racing.
 */
export function registerCaptureCommands(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  ctx.game.commands.define<{ mode?: StageMode }>("run.stage", {
    apply(state, input) {
      stageRun(state, input.mode ?? "midrun");
      return state;
    },
  });
}
