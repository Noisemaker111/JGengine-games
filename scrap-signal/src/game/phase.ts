import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase as publishPhase, type GamePhase } from "@jgengine/core/game/gamePhase";
import { actionContextStack } from "@jgengine/core/game/controlGate";

/** Published shell 0.18.1 seeds its input tracker once while the menu is active.
 * Keep base bindings (including user overrides) discoverable at that point;
 * the menu context and play-controls store still gate input dispatch.
 * Remove this compatibility seam after the coordinator's shell fix is published.
 */
export function setGamePhase(ctx: GameContext, phase: GamePhase): void {
  publishPhase(ctx, phase);
  if (phase !== "playing") {
    actionContextStack(ctx).push({ id: "menu", codes: {}, passthrough: true });
  }
}
