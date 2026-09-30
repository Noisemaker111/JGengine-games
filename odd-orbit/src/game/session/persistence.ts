import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { ClockSnapshot } from "@jgengine/core/time/simClock";
import { householdStore } from "./store";
import type { HouseholdState } from "./types";

export const SAVE_KEY = "odd-orbit.household.v1";

/** Explicit saves and browser lifecycle events; no timer or background polling. */
export function saveHousehold(ctx: GameContext): void {
  if (typeof localStorage === "undefined") return;
  try {
    const data = { version: 1, world: ctx.snapshot(), clock: ctx.time.snapshot() };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    householdStore.write(ctx, { ...householdStore.read(ctx), saveMessage: "Household saved on this device." });
  } catch {
    householdStore.write(ctx, { ...householdStore.read(ctx), saveMessage: "Save failed. Device storage may be full or disabled." });
  }
}

export function restoreHousehold(ctx: GameContext): void {
  if (typeof localStorage === "undefined") return;
  const baseline = ctx.snapshot();
  const baselineClock = ctx.time.snapshot();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === null) return;
    const data = JSON.parse(raw) as { version: number; world: Record<string, unknown>; clock: ClockSnapshot };
    if (data.version !== 1 || !data.world || !Number.isFinite(data.clock?.now)) throw new Error("Unsupported save");
    // Validate game-owned state before letting a malformed save replace the live household.
    const store = data.world.store;
    if (!Array.isArray(store)) throw new Error("Missing store");
    const saved = store.find(row => Array.isArray(row) && row[0] === "household")?.[1] as HouseholdState | undefined;
    if (!saved || !Array.isArray(saved.order) || saved.order.length === 0 || !Number.isFinite(saved.credits)) throw new Error("Missing household");
    for (const id of saved.order) {
      const member = saved.members?.[id];
      if (!member?.bodyPlan || !member.needs || !Object.values(member.needs).every(Number.isFinite)) throw new Error("Invalid being");
    }
    if (!Array.isArray(data.world.entities) || !Array.isArray(data.world.objects)) throw new Error("Missing scene");
    ctx.hydrate(data.world);
    ctx.time.hydrate(data.clock);
    const state = householdStore.read(ctx);
    if (state.order.length === 0) throw new Error("Missing household");
    householdStore.write(ctx, { ...state, orbit: state.orbit ?? { phase: "sandbox", elapsed: 0, earned: 0, built: 0, comfort: 0 }, saveMessage: "Saved household restored. Resume when ready." });
  } catch {
    ctx.hydrate(baseline);
    ctx.time.hydrate(baselineClock);
    householdStore.write(ctx, { ...householdStore.read(ctx), saveMessage: "Could not restore the saved household. The existing save is retained until you choose Save." });
  }
}
