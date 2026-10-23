import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { content } from "../content";
import { QUESTS } from "../quests/catalog";
import { BOUNTY_SPOTS } from "../world/districts";
import {
  BOUNTY_COOLDOWN_SEC,
  BOUNTY_UNLOCK_QUEST,
  bountyPayout,
  bountySpotIndex,
  bountyStore,
  liveBountyTarget,
  markDistance,
  settleBounty,
  stageBounty,
} from "./bounties";
import { missionBoard, startBountyMission, takeMark, tickHarborMissions } from "../missions/missions";
import { registerMissionContracts } from "../missions/register";

function bootContext(): GameContext {
  const ctx = createGameContext({
    definition: defineGameDefinition({
      name: "harbor-heat-bounty-test",
      assets: createAssetCatalog(),
      multiplayer: "off",
      features: { quest: true },
    }),
    content,
    player: { userId: "p1", isNew: true },
  });
  registerMissionContracts(ctx);
  return ctx;
}

function unlock(ctx: GameContext): void {
  ctx.game.quest!.register(QUESTS);
  ctx.game.quest!.grant("p1", BOUNTY_UNLOCK_QUEST);
  ctx.game.quest!.progress("p1", BOUNTY_UNLOCK_QUEST, "clear_gangers", 5);
  expect(ctx.game.quest!.turnIn("p1", BOUNTY_UNLOCK_QUEST)).toBeNull();
}

/** Put the mark next to the player, so the pursuit is inside its keep-close distance. */
function meetMark(ctx: GameContext): string {
  const targetId = liveBountyTarget(ctx);
  if (targetId === null) throw new Error("expected a live mark");
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) throw new Error("expected the player");
  ctx.scene.entity.update(targetId, { position: [player.position[0] + 1, player.position[1], player.position[2]] });
  return targetId;
}

describe("harbor-heat bounty contracts", () => {
  test("payout escalates with completed contracts and caps", () => {
    expect(bountyPayout(0)).toBe(350);
    expect(bountyPayout(1)).toBe(525);
    expect(bountyPayout(8)).toBe(bountyPayout(20));
  });

  test("spots rotate round-robin so consecutive contracts move", () => {
    const first = bountySpotIndex(0, BOUNTY_SPOTS.length);
    const second = bountySpotIndex(1, BOUNTY_SPOTS.length);
    expect(first).not.toBe(second);
    expect(bountySpotIndex(BOUNTY_SPOTS.length, BOUNTY_SPOTS.length)).toBe(first);
  });

  test("contracts stay locked until the docks are cleared", () => {
    const ctx = bootContext();
    ctx.scene.entity.spawn("street_runner", { id: "p1", position: [0, 0, 0], role: "player" });
    ctx.game.quest!.register(QUESTS);
    expect(stageBounty(ctx)).toBeNull();
  });

  test("the chase is a deadline: the mark escaping fails the contract", () => {
    const ctx = bootContext();
    ctx.scene.entity.spawn("street_runner", { id: "p1", position: [0, 0, 0], role: "player" });
    unlock(ctx);
    const spot = stageBounty(ctx);
    expect(spot).not.toBeNull();
    startBountyMission(ctx, spot!);
    expect(missionBoard.read(ctx).active).toBe(`bounty_${spot}`);
    const beforeBounty = ctx.game.economy.balance("p1", "cash");

    // Stand still while the mark runs: the contract runs out of time.
    for (let second = 0; second < 92; second += 1) tickHarborMissions(ctx, 1);
    expect(missionBoard.read(ctx).active).toBeNull();
    expect(bountyStore.read(ctx)?.targetId).toBeNull();
    expect(ctx.game.economy.balance("p1", "cash")).toBe(beforeBounty);
  });

  test("catching the mark then taking it pays once and arms the next spot", () => {
    const ctx = bootContext();
    ctx.scene.entity.spawn("street_runner", { id: "p1", position: [0, 0, 0], role: "player" });
    unlock(ctx);
    const spot = stageBounty(ctx)!;
    startBountyMission(ctx, spot);

    meetMark(ctx);
    tickHarborMissions(ctx, 1 / 30);
    expect(missionBoard.read(ctx).view?.objectiveId).toBe("take");
    expect(markDistance(ctx)).toBeLessThan(4.5);

    const before = ctx.game.economy.balance("p1", "cash");
    expect(takeMark(ctx)).toBe(true);
    expect(ctx.game.economy.balance("p1", "cash") - before).toBe(bountyPayout(0));
    expect(bountyStore.read(ctx)?.completed).toBe(1);
    expect(bountyStore.read(ctx)?.targetId).toBeNull();
    expect((bountyStore.read(ctx)?.nextAt ?? 0) - ctx.time.now()).toBeCloseTo(BOUNTY_COOLDOWN_SEC, 5);
    expect(missionBoard.read(ctx).active).toBeNull();
  });

  test("a settled contract reports through the mission settlement, not a kill counter", () => {
    const ctx = bootContext();
    ctx.scene.entity.spawn("street_runner", { id: "p1", position: [0, 0, 0], role: "player" });
    unlock(ctx);
    const beforeBounty = ctx.game.economy.balance("p1", "cash");
    settleBounty(ctx, { missionId: "bounty_plaza", status: "failed", remaining: 0, elapsed: 90, reason: "the mark got away" });
    expect(ctx.game.economy.balance("p1", "cash")).toBe(beforeBounty);
    expect(bountyStore.read(ctx)?.completed).toBe(0);
  });
});
