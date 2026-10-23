import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { BOUNTY_CRED, grantCred } from "../progression/cred";
import { BOUNTY_SPOTS, districtAt } from "../world/districts";
import type { MissionSettlement } from "../missions/missions";

export const BOUNTY_UNLOCK_QUEST = "m2_dock_sweep";
export const BOUNTY_COOLDOWN_SEC = 45;
export const BOUNTY_TARGET_PREFIX = "bounty_target_";
/** Slower than a sprinting player, so the chase is winnable on foot and quick in a car. */
export const MARK_FLEE_SPEED = 3.6;
/** How close the player must be to take the mark alive. */
export const MARK_TAKEDOWN_RADIUS = 4.5;

export interface BountyState {
  /** Lifetime contracts completed - drives payout escalation and spot rotation. */
  completed: number;
  /** Instance id of the live target, or null between contracts. */
  targetId: string | null;
  /** Spot the live target was staged at (`BOUNTY_SPOTS` id). */
  spotId: string | null;
  /** Game-time (sec) when the next contract may stage. */
  nextAt: number;
}

export const bountyStore = defineStore<BountyState | undefined>("harbor.bounty", undefined);

export function bountyPayout(completed: number): number {
  return 350 + Math.min(completed, 8) * 175;
}

/** Round-robin over the authored spots so consecutive contracts always move districts. */
export function bountySpotIndex(completed: number, spotCount: number): number {
  return spotCount <= 0 ? 0 : completed % spotCount;
}

function bountyState(ctx: GameContext): BountyState {
  return bountyStore.read(ctx) ?? { completed: 0, targetId: null, spotId: null, nextAt: 0 };
}

/** Instance id of the live mark, or null between contracts. */
export function liveBountyTarget(ctx: GameContext): string | null {
  return bountyState(ctx).targetId;
}

/** Re-arm the cooldown after a contract settles, however it ended. */
export function armBountyCooldown(ctx: GameContext): void {
  const state = bountyState(ctx);
  bountyStore.write(ctx, { ...state, targetId: null, spotId: null, nextAt: ctx.time.now() + BOUNTY_COOLDOWN_SEC });
}

/** Pay a settled bounty contract. The chase, deadline and escape were the mission's. */
export function settleBounty(ctx: GameContext, settlement: MissionSettlement): void {
  const state = bountyState(ctx);
  if (!settlement.missionId.startsWith("bounty_")) return;
  const won = settlement.status === "completed";
  if (!won) {
    armBountyCooldown(ctx);
    ctx.game.notices.push({ text: `Bounty lost: ${settlement.reason}.`, tone: "warn" });
    void ctx.game.save?.checkpoint();
    return;
  }
  const payout = bountyPayout(state.completed);
  const target = liveBountyTarget(ctx);
  if (target !== null) ctx.scene.entity.despawn(target);
  ctx.game.economy.grant(ctx.player.userId, "cash", payout);
  grantCred(ctx, BOUNTY_CRED);
  bountyStore.write(ctx, {
    completed: state.completed + 1,
    targetId: null,
    spotId: null,
    nextAt: ctx.time.now() + BOUNTY_COOLDOWN_SEC,
  });
  ctx.game.notices.push({ text: `Bounty collected - $${payout}.`, tone: "success" });
  void ctx.game.save?.checkpoint();
}

function unlocked(ctx: GameContext): boolean {
  return ctx.game.quest!.list(ctx.player.userId).some((q) => q.questId === BOUNTY_UNLOCK_QUEST && q.status === "completed");
}

/**
 * Stage a contract when the cooldown allows and report the spot it staged, so the caller starts its
 * mission. The live target is a world entity, so it (and the store) survive the whole-world save.
 */
export function stageBounty(ctx: GameContext): string | null {
  if (!unlocked(ctx)) return null;
  const state = bountyState(ctx);
  if (state.targetId !== null) return null;
  if (ctx.time.now() < state.nextAt) return null;
  const spot = BOUNTY_SPOTS[bountySpotIndex(state.completed, BOUNTY_SPOTS.length)];
  if (spot === undefined) return null;
  const targetId = `${BOUNTY_TARGET_PREFIX}${state.completed}_${spot.id}`;
  const [x, , z] = spot.position;
  ctx.scene.entity.spawn("bounty_mark", {
    id: targetId,
    position: [x, ctx.world.groundHeightAt(x, z), z],
    role: "npc",
  });
  bountyStore.write(ctx, { ...state, targetId, spotId: spot.id });
  const district = districtAt(x, z)?.label ?? "the streets";
  ctx.game.notices.push({ text: `Bounty posted: ${spot.label}, ${district}.`, tone: "info" });
  return spot.id;
}

/** The mark runs while its contract is live: away from the player, so the chase has to be driven. */
export function tickBountyMark(ctx: GameContext, dt: number): void {
  const targetId = liveBountyTarget(ctx);
  if (targetId === null) return;
  const mark = ctx.scene.entity.get(targetId);
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (mark === null || player === null) return;
  const dx = mark.position[0] - player.position[0];
  const dz = mark.position[2] - player.position[2];
  const distance = Math.hypot(dx, dz);
  if (distance < 1) return;
  ctx.scene.entity.moveToward(mark.id, [mark.position[0] + (dx / distance) * 12, mark.position[1], mark.position[2] + (dz / distance) * 12], { speed: MARK_FLEE_SPEED, dt });
}

/** Distance from the player to the live mark, or null when no contract is live. */
export function markDistance(ctx: GameContext): number | null {
  const targetId = liveBountyTarget(ctx);
  if (targetId === null) return null;
  const mark = ctx.scene.entity.get(targetId);
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (mark === null || player === null) return null;
  return Math.hypot(mark.position[0] - player.position[0], mark.position[2] - player.position[2]);
}

/** True when the live mark is gone without a settlement — a restore edge re-arms the cooldown. */
export function bountyTargetMissing(ctx: GameContext): boolean {
  const targetId = liveBountyTarget(ctx);
  return targetId !== null && ctx.scene.entity.get(targetId) === null;
}
