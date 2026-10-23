import type { GameLoop } from "@jgengine/core/game/defineGame";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { DAY_LENGTH } from "./game/catalog";
import { session } from "./game/session";
import { disposeWorld, setupWorld } from "./game/world/setup";
import { economyDayTick } from "./game/sim/economy";
import { registerCaptureCommands, stepPark } from "./game/capture";
import { savePark } from "./game/persistence";

// Midnight is a simulation event, scheduled after restoring the clock.
function scheduleMidnight(ctx: GameContext): void {
  const midnight = (Math.floor(ctx.time.now() / DAY_LENGTH) + 1) * DAY_LENGTH;
  ctx.time.at(midnight, () => {
    if (!session.gameOver) economyDayTick(ctx);
    savePark(ctx);
    if (!session.gameOver) scheduleMidnight(ctx);
  });
}

export const loop: GameLoop<GameContext> = {
  onInit(ctx) {
    setupWorld(ctx);
    registerCaptureCommands(ctx);
    setGamePhase(ctx, "menu");
    scheduleMidnight(ctx);
  },
  onNewPlayer() {},
  onDispose: disposeWorld,
  onTick(ctx, dt) {
    stepPark(ctx, dt);
  },
};
