import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { DAY_LENGTH } from "../../world";
import { moodOf } from "../needs/needs";
import type { HouseholdState } from "../session/types";

export const ORBIT_INCOME = 420;
export const ORBIT_COMFORT = 12;

export function stepChallenge(ctx: GameContext, state: HouseholdState, dt: number): void {
  const orbit = state.orbit;
  if (orbit?.phase !== "active") return;
  orbit.elapsed += dt;
  const comfortable = state.order.every(id => {
    const member = state.members[id];
    return member !== undefined && moodOf(member.needs).score >= 64 && Math.min(...Object.values(member.needs)) >= 30;
  });
  orbit.comfort = comfortable ? orbit.comfort + dt : 0;
  if (orbit.built >= 1 && orbit.earned >= ORBIT_INCOME && orbit.comfort >= ORBIT_COMFORT) {
    orbit.phase = "won";
    ctx.time.pause();
  } else if (orbit.elapsed >= DAY_LENGTH) {
    orbit.phase = "recovery";
    ctx.time.pause();
  }
}
