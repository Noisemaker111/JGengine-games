import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { FURNITURE_BY_ID } from "../objects/catalog";
import type { HouseholdState } from "../session/types";
import { nextBill, RATION_BUNDLE } from "./economy";

/** Rations at or below this count make the pantry the household's most urgent need. */
const LOW_RATIONS = 4;

/**
 * The single next thing the household needs, in plain words. Ordered by what stops the
 * habitat first: no earning station, then the midnight bill, then food.
 */
export function dayGoal(state: HouseholdState, objects: readonly SceneObject[]): string {
  const hasWorkStation = objects.some(object => FURNITURE_BY_ID[object.catalogId]?.role === "work");
  const bill = Math.round(nextBill(state, objects));
  if (!hasWorkStation) return "Next: furnish a Yield Console so a being can earn credits before midnight.";
  if (state.credits < bill) return `Next: earn ${Math.round(bill - state.credits)} more credits before the ${bill}-credit midnight bill.`;
  if (state.pantry < LOW_RATIONS) return `Next: buy ${RATION_BUNDLE.quantity} rations in Pantry & bills before the household runs short.`;
  return `Next: keep everyone fed and cover the ${bill}-credit midnight bill.`;
}
