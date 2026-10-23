import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import {
  addScheduledRule,
  advanceLedger,
  balanceOf,
  type ResourceLedger,
  type ResourcePolicy,
} from "@jgengine/core/economy/resourceLedger";

import { DAY_LENGTH } from "../catalog";
import { buildableDef } from "../objects/catalog";
import { session } from "../session";
import { syncAmbience } from "../audio";
import { claimMilestones, milestoneContents, syncStanding } from "../milestones";
import { createLoan, loanDay, LOAN_OFFER } from "../loan";
import { computeMetrics, ratingTarget, type ParkMetrics } from "./rating";
import { placedList } from "../build/placement";

const BANKRUPT_LIMIT = 3;

/**
 * The nominal `daily-upkeep` cycle carries no amount; the real cost is the live park metrics. Only
 * the upkeep rule is retuned here, so the loan rule's own transaction passes through untouched.
 */
const dailyUpkeepAmount: ResourcePolicy = (txn, ctx) =>
  txn.ruleId === "daily-upkeep" ? [{ ...txn, amount: (ctx.vars.upkeep ?? 0) + (ctx.vars.restock ?? 0) }] : [txn];

/** The loan's nightly instalment, read from the loan book rather than from its own rule. */
const loanPaymentAmount: ResourcePolicy = (txn, ctx) =>
  txn.ruleId === "loan-payment" ? [{ ...txn, amount: ctx.vars.loanPayment ?? 0 }] : [txn];

/**
 * Settle one day's upkeep, restock and loan instalment through the shared scheduled-transaction
 * ledger. The park balance is re-seeded from live `cash` (absorbing the day's ticket/ride/stall
 * flows) before the scheduled rules debit it, so the ledger stays authoritative for the recurring
 * charges without changing observable cash.
 */
export function settleDailyUpkeep(
  ledger: ResourceLedger,
  cash: number,
  upkeep: number,
  restock: number,
  loanPayment = 0,
): { ledger: ResourceLedger; cash: number } {
  const seeded: ResourceLedger = { ...ledger, accounts: { ...ledger.accounts, park: { cash } } };
  const res = advanceLedger(seeded, seeded.nowSeconds + DAY_LENGTH, {
    vars: { upkeep, restock, loanPayment },
    policies: [dailyUpkeepAmount, loanPaymentAmount],
  });
  return { ledger: res.ledger, cash: balanceOf(res.ledger, "park", "cash") };
}

export function currentMetrics(): ParkMetrics {
  return computeMetrics(placedList());
}

export function restockCost(): number {
  let cost = 0;
  for (const obj of session.placed.values()) {
    const def = buildableDef(obj.catalogId);
    if (def.stall === undefined) continue;
    cost += (def.stall.stock - obj.stock) * def.stall.restock;
  }
  return cost;
}

function restockStalls(): void {
  for (const obj of session.placed.values()) {
    const def = buildableDef(obj.catalogId);
    if (def.stall !== undefined) obj.stock = def.stall.stock;
  }
}

/** Take the park's standing loan offer. Returns the cash the ledger adds to the till. */
export function takeLoan(): number {
  if (session.loan !== null) return 0;
  session.loan = createLoan(LOAN_OFFER.principal, LOAN_OFFER.dailyRate, LOAN_OFFER.termDays);
  session.cash += LOAN_OFFER.principal;
  // One more scheduled rule in the same ledger, due at this day's next midnight.
  session.ledger = addScheduledRule(session.ledger, {
    id: "loan-payment",
    currency: "cash",
    amount: 0,
    everySeconds: DAY_LENGTH,
    startSeconds: session.day * DAY_LENGTH,
    source: "park",
  });
  return LOAN_OFFER.principal;
}

/** Pay the loan off early from the till. Returns what was actually paid. */
export function payOffLoan(): number {
  if (session.loan === null) return 0;
  const paid = Math.min(session.cash, session.loan.outstanding);
  if (paid <= 0) return 0;
  session.cash -= paid;
  const outstanding = session.loan.outstanding - paid;
  session.loan = outstanding > 0 ? { ...session.loan, outstanding } : null;
  return paid;
}

export function economyDayTick(ctx: GameContext): void {
  const metrics = currentMetrics();
  const restock = restockCost();
  const instalment = session.loan === null ? null : loanDay(session.loan);
  const payment = instalment?.payment ?? 0;
  const total = metrics.dailyUpkeep + restock + payment;
  const settled = settleDailyUpkeep(session.ledger, session.cash, metrics.dailyUpkeep, restock, payment);
  session.ledger = settled.ledger;
  session.cash = settled.cash;
  restockStalls();
  if (instalment !== null) {
    session.loan = instalment.loan;
    if (instalment.loan === null) {
      ctx.game.notices.push({ text: "Loan paid off — the park owes nothing", tone: "success" });
    } else {
      ctx.game.notices.push({
        text: `Loan ${payment} paid (${instalment.interest} interest) · ${Math.round(instalment.loan.outstanding)} still owed`,
        tone: "info",
      });
    }
  }
  session.upkeepYesterday = total;
  session.revenueYesterday = session.revenueToday;
  const net = session.revenueYesterday - total;
  const detail = instalment === null ? "" : " incl. loan";
  ctx.game.notices.push({
    text: `Day ${session.day}: ${net >= 0 ? "+" : ""}${Math.round(net)} net${detail} (${session.guestsToday} guests)`,
    tone: net >= 0 ? "success" : "warn",
  });
  ctx.game.audio.play("settle");

  if (session.cash < 0) {
    session.bankruptDays += 1;
    if (session.bankruptDays >= BANKRUPT_LIMIT) {
      session.gameOver = true;
      session.open = false;
      ctx.time.pause();
      setGamePhase(ctx, "ended");
      syncAmbience(ctx);
      ctx.game.notices.push({ text: "Bankrupt! The park has closed for good.", tone: "warn" });
      ctx.game.audio.play("bankrupt");
    } else {
      ctx.game.notices.push({ text: `In the red — ${BANKRUPT_LIMIT - session.bankruptDays} day(s) to recover`, tone: "warn" });
    }
  } else {
    session.bankruptDays = 0;
  }

  session.day += 1;
  session.guestsToday = 0;
  session.revenueToday = 0;
}

/**
 * The rating rides on the same standing the milestones read: charging standing to the live rating
 * then claiming the shared gate set is what grants an unlock, so a milestone cannot drift from the
 * number the HUD shows.
 */
export function tickRating(ctx: GameContext, dt: number, metrics: ParkMetrics): void {
  const target = ratingTarget(metrics, session.happinessAvg, session.guestsToday, session.litter);
  const ease = 1 - Math.exp(-dt * 0.25);
  session.rating += (target - session.rating) * ease;

  session.litter = Math.max(0, session.litter - metrics.cleaning * 0.08 * dt);

  syncStanding(session.rating);
  const granted = ctx.game.unlocks?.list(ctx.player.userId) ?? [];
  for (const gate of claimMilestones(session.cash, granted)) {
    ctx.game.unlocks?.grant(ctx.player.userId, gate.unlock);
    const contents = milestoneContents(gate.unlock);
    ctx.game.notices.push({
      text: `Milestone! ${gate.label} — ${contents.length > 0 ? contents.join(" & ") : gate.unlock} now in the build palette`,
      tone: "success",
    });
    ctx.game.audio.play("milestone");
  }
}
