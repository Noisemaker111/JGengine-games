import { createStateSchedule } from "@jgengine/core/time/stateSchedule";
import { DAY_LENGTH } from "../../world";
import type { Lifestyle, MemberState } from "../session/types";

export const LIFESTYLES: ReadonlyArray<{ id: Lifestyle; label: string; window: string; blurb: string }> = [
  { id: "yield", label: "Yield career", window: "08–14", blurb: "20 seconds at a console earns 100 credits. Buy rations and leave time to recover." },
  { id: "bloom", label: "Bloom keeper", window: "14–18", blurb: "20 seconds tending earns four rations and 48 credits. Friends harvest an extra ration." },
];
export const SHIFT_SECONDS = 20;
export const FLEX_AFTER_SHIFTS = 3;
export type HouseholdPhase = "torpor" | "yield" | "bloom" | "bond";
const rhythm = createStateSchedule<HouseholdPhase>({ phases: [
  { state: "torpor", durationSeconds: DAY_LENGTH * 8 / 24 },
  { state: "yield", durationSeconds: DAY_LENGTH * 6 / 24 },
  { state: "bloom", durationSeconds: DAY_LENGTH * 4 / 24 },
  { state: "bond", durationSeconds: DAY_LENGTH * 4 / 24 },
  { state: "torpor", durationSeconds: DAY_LENGTH * 2 / 24 },
] });

export function householdPhase(now: number): HouseholdPhase {
  return rhythm.stateAt(now);
}

export function shiftWindow(member: MemberState): { start: number; end: number } {
  if (member.completedShifts >= FLEX_AFTER_SHIFTS) return { start: 8, end: 18 };
  return member.lifestyle === "yield" ? { start: 8, end: 14 } : { start: 14, end: 18 };
}

export function shiftIsOpen(member: MemberState, now: number): boolean {
  const hour = ((now % DAY_LENGTH) / DAY_LENGTH) * 24;
  const { start, end } = shiftWindow(member);
  return hour >= start && hour < end;
}

export function scheduleLabel(member: MemberState): string {
  const { start, end } = shiftWindow(member);
  return `${member.lifestyle === "yield" ? "Yield" : "Bloom"} ${String(start).padStart(2, "0")}–${end}${member.completedShifts >= FLEX_AFTER_SHIFTS ? " · flex" : ""}`;
}

export function shiftSeconds(_member: MemberState): number { return SHIFT_SECONDS; }

export function canChangeLifestyle(member: MemberState): boolean {
  return member.workToday === 0 && member.shiftProgress === 0 && member.harvestToday === 0;
}
