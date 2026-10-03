import { addScheduledRule, advanceLedger, createResourceLedger, type ResourceLedger } from "@jgengine/core/economy/resourceLedger";
import { fromMinorUnits, toMinorUnits, type CurrencyDefinition } from "@jgengine/core/economy/currency";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { DAY_LENGTH } from "../../world";
import { FURNITURE_BY_ID } from "../objects/catalog";
import { pushEvent, type HouseholdState } from "../session/types";

export const CREDIT_CURRENCY: CurrencyDefinition = { id: "credits", name: "Credits", decimals: 2 };
export const HABITAT_UPKEEP = 80;
export const RATION_BUNDLE = { cost: 36, quantity: 6 } as const;
export const RELIEF = { debt: 40, quantity: 4 } as const;
export const PANTRY_CAP = 40;

export function creditAmount(value: number): number {
  return fromMinorUnits(CREDIT_CURRENCY, toMinorUnits(CREDIT_CURRENCY, value));
}

export function createHouseholdEconomy(now = 0): ResourceLedger {
  return addScheduledRule(createResourceLedger({ nowSeconds: now }), {
    id: "upkeep", currency: "credits", amount: HABITAT_UPKEEP,
    everySeconds: DAY_LENGTH, startSeconds: (Math.floor(now / DAY_LENGTH) + 1) * DAY_LENGTH,
    source: "household", catchUp: "each", maxCatchUpCycles: 7,
  });
}

export function dailyUpkeep(objects: readonly SceneObject[]): number {
  return HABITAT_UPKEEP + objects.reduce((sum, obj) => sum + (FURNITURE_BY_ID[obj.catalogId]?.runningCost ?? 0), 0);
}

export function nextBill(state: HouseholdState, objects: readonly SceneObject[]): number {
  return dailyUpkeep(objects) + Math.min(state.debt, 40);
}

export function settleHouseholdDay(state: HouseholdState, objects: readonly SceneObject[], now: number): void {
  const today = Math.floor(now / DAY_LENGTH);
  if (today <= state.day) return;
  const repayment = Math.min(state.debt, 40);
  state.economy.accounts = { household: { credits: state.credits } };
  const result = advanceLedger(state.economy, now, {
    precision: { quantum: 0.01 },
    policies: [(txn) => [{ ...txn, amount: dailyUpkeep(objects) + repayment }]],
    maxCyclesPerRule: 7,
  });
  const balance = result.ledger.accounts.household?.credits ?? state.credits;
  const bill = result.applied.reduce((sum, txn) => sum + txn.amount, 0);
  state.credits = creditAmount(Math.max(0, balance));
  state.debt = creditAmount(Math.max(0, state.debt - repayment * result.applied.length) + Math.max(0, -balance));
  state.economy = result.ledger;
  state.economy.accounts.household = { credits: state.credits };
  const missed = state.order.reduce((sum, id) => {
    const m = state.members[id];
    return sum + (m !== undefined && (m.lifestyle === "yield" ? m.workToday < 20 : m.harvestToday === 0) ? 1 : 0);
  }, 0);
  state.lastDay = { day: state.day, income: creditAmount(state.dayIncome), harvest: state.dayHarvest, bill, missed };
  pushEvent(state, `Day ${state.day + 1}: earned ${Math.round(state.dayIncome)}, harvested ${state.dayHarvest} rations; habitat bill ${Math.round(bill)}${state.debt > 0 ? ` · debt ${Math.round(state.debt)}` : " paid"}.`, now, state.debt > 0 ? "info" : "good");
  state.day = today;
  state.dayIncome = 0;
  state.dayHarvest = 0;
  for (const id of state.order) {
    const m = state.members[id];
    if (m === undefined) continue;
    m.workToday = 0;
    m.harvestToday = 0;
    m.shiftProgress = 0;
    m.concern = null;
  }
}
