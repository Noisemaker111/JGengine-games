import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { createStaffAgent, forgetAgent, staffAgentOf, staffBeat, staffId } from "./agents";
import { buildableDef } from "./objects/catalog";
import { session, type PlacedObject, type StaffState } from "./session";

const STAFF_WALK_SPEED = 3.4;
const CLEAN_PER_POST = 0.6;

function janitorPosts(): PlacedObject[] {
  const posts: PlacedObject[] = [];
  for (const obj of session.placed.values()) {
    if (buildableDef(obj.catalogId).staff !== undefined) posts.push(obj);
  }
  return posts;
}

/** Every staffed post gets one janitor body; a demolished post sends its janitor home. */
export function syncStaff(ctx: GameContext): void {
  const posts = janitorPosts();
  const live = new Set(posts.map((post) => post.id));
  for (const post of posts) {
    const id = staffId(post.id);
    if (session.staff.has(id)) continue;
    const agent = createStaffAgent(post, ctx.rng);
    const state: StaffState = { id, postId: post.id, agent: agent.snapshot() };
    session.staff.set(id, state);
    ctx.scene.entity.spawn("guest_c", { id, position: [post.x, 0, post.z], role: "npc" });
  }
  for (const [id, state] of session.staff) {
    if (live.has(state.postId)) continue;
    if (ctx.scene.entity.selection.has(id)) ctx.scene.entity.selection.remove(id);
    ctx.scene.entity.despawn(id);
    forgetAgent(id);
    session.staff.delete(id);
  }
}

function beatPoint(post: PlacedObject, place: string | null): [number, number, number] | null {
  if (place === null) return null;
  const point = staffBeat(post).find((candidate) => candidate.place === place);
  return point === undefined ? null : [point.x, 0, point.z];
}

/**
 * A janitor's shift on the clock: the agent's own work beat says which point of its ring it should
 * be at, and the body walks there. Arriving at a fresh point picks up the litter it finds.
 */
export function tickStaff(ctx: GameContext, dt: number): void {
  syncStaff(ctx);
  const now = ctx.time.now();
  for (const state of session.staff.values()) {
    const post = session.placed.get(state.postId);
    if (post === undefined) continue;
    const agent = staffAgentOf(state, post, ctx.rng);
    const frame = agent.update({
      dt,
      now,
      targets: [
        { option: "patrol", target: state.postId },
        { option: "rest", target: "bunks" },
      ],
    });

    const working = frame.phase?.activity === "work" && frame.post !== null;
    const goal = working ? beatPoint(post, frame.post) : ([0, 0, 56] as [number, number, number]);
    if (goal !== null) {
      const next = ctx.scene.entity.moveToward(state.id, goal, { speed: STAFF_WALK_SPEED, dt, stopDistance: 0.4 });
      if (next !== null) ctx.scene.entity.setPose(state.id, { position: next });
      const reached = Math.hypot(
        (ctx.scene.entity.get(state.id)?.position[0] ?? goal[0]) - goal[0],
        (ctx.scene.entity.get(state.id)?.position[2] ?? goal[2]) - goal[2],
      );
      if (working && reached <= 0.8 && session.litter > 0) {
        session.litter = Math.max(0, session.litter - CLEAN_PER_POST);
      }
    }
  }
}

/** Staff bodies the park had at save time; the agents come back from their own snapshots. */
export function restoreStaff(ctx: GameContext, states: readonly StaffState[]): void {
  for (const state of states) {
    const post = session.placed.get(state.postId);
    if (post === undefined) continue;
    session.staff.set(state.id, state);
    ctx.scene.entity.spawn("guest_c", { id: state.id, position: [post.x, 0, post.z], role: "npc" });
  }
}
