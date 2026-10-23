import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { CLOSE_FRACTION, OPEN_FRACTION } from "../catalog";
import { session } from "../session";
import { currentMetrics, tickRating } from "./economy";
import { spawnGuests, tickGuests, tickRidePark } from "./guests";
import { tickStaff } from "../staff";
import { savePark } from "../persistence";
import { tickScenario } from "../scenarios";
import { syncAmbience } from "../audio";

function updateOpenState(ctx: GameContext): void {
  const fraction = ctx.time.calendar().dayFraction;
  const wantOpen = !session.gameOver && fraction >= OPEN_FRACTION && fraction <= CLOSE_FRACTION;
  if (wantOpen === session.open) return;
  session.open = wantOpen;
  ctx.game.notices.push({ text: wantOpen ? `Day ${session.day} — gates open!` : "Gates closed for the night", tone: "info" });
  if (wantOpen) ctx.game.audio.play("gates");
}

/**
 * One tick of a live park, shared by the frame loop and the capture staging that fast-forwards
 * a day. Kept out of `loop.ts` so a staged state can advance the same systems without importing
 * the loop that registers it.
 */
export function stepPark(ctx: GameContext, dt: number): void {
  syncAmbience(ctx);
  if (!session.started || session.gameOver || dt <= 0) return;
  updateOpenState(ctx);
  const metrics = currentMetrics();
  // The rides run their own cycles and lines; their boardings, breakdowns and repairs land on
  // the guests and the till through the sink in `sim/guests`.
  tickRidePark(ctx, dt);
  spawnGuests(ctx, dt, metrics.totalAppeal);
  tickStaff(ctx, dt);
  tickGuests(ctx, dt, metrics.tracks);
  tickRating(ctx, dt, metrics);
  tickScenario(ctx, dt);
  // The blue ribbon is free play's own goal; a scenario has its own win and fail states.
  if (session.scenario === null && !session.won && metrics.rides >= 3 && session.rating >= 220 &&
      session.happinessAvg >= 50 && session.litter <= 40 &&
      session.day > 1 && session.revenueYesterday >= session.upkeepYesterday) {
    session.won = true;
    ctx.time.pause();
    setGamePhase(ctx, "paused");
    syncAmbience(ctx);
    ctx.game.audio.play("ribbon");
    savePark(ctx);
  }
}
