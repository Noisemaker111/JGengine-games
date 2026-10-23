import { describe, expect, test } from "bun:test";

import { createParkLedger } from "../session";
import { settleDailyUpkeep } from "./economy";
import { createLoan, loanDay, loanPaymentFor, loanSummary, repayLoan, LOAN_OFFER } from "./finance";

/** Walk the whole loan book, one day at a time, exactly as the nightly settle does. */
function runLoan(principal: number, dailyRate: number, termDays: number) {
  let loan = createLoan(principal, dailyRate, termDays);
  const rows = [];
  while (loan !== null) {
    const day = loanDay(loan);
    rows.push(day);
    loan = day.loan;
  }
  return rows;
}

describe("brightway-park loan arithmetic", () => {
  test("the $6,000 offer amortises to a fixed $703 a day", () => {
    expect(loanPaymentFor(LOAN_OFFER.principal, LOAN_OFFER.dailyRate, LOAN_OFFER.termDays)).toBe(703);
    expect(createLoan(LOAN_OFFER.principal, LOAN_OFFER.dailyRate, LOAN_OFFER.termDays).payment).toBe(703);
  });

  test("day one charges 3% interest on the balance and pays the rest off principal", () => {
    const loan = createLoan(6000, 0.03, 10);
    const day = loanDay(loan);
    expect(day.interest).toBe(180); // round(6000 * 0.03)
    expect(day.payment).toBe(703);
    expect(day.principal).toBe(523);
    expect(day.loan!.outstanding).toBe(5477);
    expect(day.loan!.daysPaid).toBe(1);
    expect(day.loan!.totalInterest).toBe(180);
  });

  test("ten days clear the balance, and what was paid is principal plus interest", () => {
    const rows = runLoan(6000, 0.03, 10);
    expect(rows.length).toBe(10);
    const paid = rows.reduce((sum, row) => sum + row.payment, 0);
    const principal = rows.reduce((sum, row) => sum + row.principal, 0);
    const interest = rows.reduce((sum, row) => sum + row.interest, 0);
    expect(principal).toBe(6000);
    expect(paid).toBe(6000 + interest);
    expect(interest).toBeGreaterThan(1000);
    expect(rows.at(-1)!.loan).toBeNull();
    // Each day's interest is 3% of the balance the day opened with.
    const first = loanDay(createLoan(6000, 0.03, 10));
    expect(first.interest).toBe(180);
    const second = loanDay(first.loan!);
    expect(second.interest).toBe(Math.round(5477 * 0.03));
  });

  test("paying the loan down early stops the interest that would have followed", () => {
    const start = createLoan(6000, 0.03, 10);
    const { loan, paid } = repayLoan(start, 2000);
    expect(paid).toBe(2000);
    expect(loan!.outstanding).toBe(4000);
    // A day at the reduced balance costs less interest than a day at the original.
    expect(loanDay(loan!).interest).toBeLessThan(loanDay(start).interest);
    expect(repayLoan(start, 99999).loan).toBeNull();
  });

  test("the ledger debits upkeep, restock and the instalment as one night", () => {
    let ledger = createParkLedger(1, 6000, true);
    let cash = 6000;
    const payment = createLoan(6000, 0.03, 10).payment;
    ({ ledger, cash } = settleDailyUpkeep(ledger, cash, 100, 20, payment));
    expect(cash).toBe(6000 - 100 - 20 - payment);
    expect(ledger.cursors["loan-payment"]!.fired).toBe(1);
    // A second night debits a second instalment.
    ({ ledger, cash } = settleDailyUpkeep(ledger, cash, 100, 20, payment));
    expect(cash).toBe(6000 - 2 * (100 + 20 + payment));
    expect(ledger.cursors["loan-payment"]!.fired).toBe(2);
  });

  test("the HUD summary reads the same book", () => {
    const loan = loanDay(createLoan(6000, 0.03, 10)).loan!;
    const summary = loanSummary(loan);
    expect(summary.owed).toBe(5477);
    expect(summary.daysLeft).toBe(9);
    expect(summary.interest).toBe(180);
    expect(summary.payment).toBe(703);
  });
});
