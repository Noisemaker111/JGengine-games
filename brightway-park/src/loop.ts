import type { GameLoop } from "@jgengine/core/game/defineGame";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { CLOSE_FRACTION, DAY_LENGTH, OPEN_FRACTION } from "./game/catalog";
import { session } from "./game/session";
import { disposeWorld, setupWorld } from "./game/world/setup";
import { currentMetrics, economyDayTick, tickRating } from "./game/sim/economy";
import { spawnGuests, tickGuests } from "./game/sim/guests";
import { tickStaff } from "./game/staff";
import { savePark } from "./game/persistence";
import { syncAmbience } from "./game/audio";

// Midnight is a simulation event, scheduled after restoring the clock.
function scheduleMidnight(ctx: GameContext): void {
  const midnight = (Math.floor(ctx.time.now() / DAY_LENGTH) + 1) * DAY_LENGTH;
  ctx.time.at(midnight, () => {
    if (!session.gameOver) economyDayTick(ctx);
    savePark(ctx);
    if (!session.gameOver) scheduleMidnight(ctx);
  });
}

function updateOpenState(ctx: GameContext): void {
  const fraction = ctx.time.calendar().dayFraction;
  const wantOpen = !session.gameOver && fraction >= OPEN_FRACTION && fraction <= CLOSE_FRACTION;
  if (wantOpen === session.open) return;
  session.open = wantOpen;
  ctx.game.notices.push({ text: wantOpen ? `Day ${session.day} — gates open!` : "Gates closed for the night", tone: "info" });
  if (wantOpen) ctx.game.audio.play("gates");
}

export const loop: GameLoop<GameContext> = {
  onInit(ctx) {
    setupWorld(ctx);
    setGamePhase(ctx, "menu");
    scheduleMidnight(ctx);
  },
  onNewPlayer() {},
  onDispose: disposeWorld,
  onTick(ctx, dt) {
    syncAmbience(ctx);
    if (!session.started || session.gameOver || dt <= 0) return;
    updateOpenState(ctx);
    const metrics = currentMetrics();
    spawnGuests(ctx, dt, metrics.totalAppeal);
    tickStaff(ctx, dt);
    tickGuests(ctx, dt, metrics.tracks);
    tickRating(ctx, dt, metrics);
    if (!session.won && metrics.rides >= 3 && session.rating >= 220 &&
        session.happinessAvg >= 50 && session.litter <= 40 &&
        session.day > 1 && session.revenueYesterday >= session.upkeepYesterday) {
      session.won = true;
      ctx.time.pause();
      setGamePhase(ctx, "paused");
      syncAmbience(ctx);
      ctx.game.audio.play("ribbon");
      savePark(ctx);
    }
  },
};
