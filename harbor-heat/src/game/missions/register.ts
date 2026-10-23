/**
 * One place that wires the game's contracts to the mission runtime: the takedown command and the
 * payout each contract runs when its mission settles. Called from the loop and from tests.
 */
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { settleBounty } from "../jobs/bounties";
import { settleCourier } from "../jobs/courier";
import { onMissionSettled, registerMissionCommands } from "./missions";

export function registerMissionContracts(ctx: GameContext): void {
  registerMissionCommands(ctx);
  onMissionSettled(ctx, (settlement) => {
    settleCourier(ctx, settlement);
    settleBounty(ctx, settlement);
  });
}
