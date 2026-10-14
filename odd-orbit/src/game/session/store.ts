import { defineStore } from "@jgengine/core/store/defineStore";

import { WORLD_SEED } from "../../world";
import { createHousehold, type HouseholdState } from "./types";

export const householdStore = defineStore<HouseholdState>("household", () => createHousehold(WORLD_SEED));

/** Selector equality for derived slices: unchanged when each own key holds the same value, so unrelated sim writes skip the render. */
export function shallowEqual(previous: object | null, next: object | null): boolean {
  if (Object.is(previous, next)) return true;
  if (previous === null || next === null) return false;
  const keys = Object.keys(previous);
  return keys.length === Object.keys(next).length && keys.every(key => Object.hasOwn(next, key) && Object.is(Reflect.get(previous, key), Reflect.get(next, key)));
}
