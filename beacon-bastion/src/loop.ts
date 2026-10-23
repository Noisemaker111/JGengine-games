import type { GameContext, GameLoop } from "@jgengine/shell/gameKit";

import { openTitle } from "./game/menu";
import { setupWorld } from "./game/world/setup";

export const loop: GameLoop<GameContext> = {
  onInit(ctx) {
    setupWorld(ctx);
    // Boot to the keep's title: the world stands behind it, the clock does not run.
    openTitle(ctx);
  },
  onNewPlayer() {},
};
