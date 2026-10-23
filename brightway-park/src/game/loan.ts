/**
 * The park's loan: one amortising debt a day at a time.
 *
 * The arithmetic lives here so a test can pin it; the money itself moves through the shared
 * `@jgengine/core/economy/resourceLedger` scheduled rule in `economy.ts`, so the loan is one more
 * authored rule in the park's ledger rather than a second wallet.
 */

export interface LoanState {
  /** Money borrowed at the start. */
  principal: number;
  /** Still owed, interest included as it is charged. */
  outstanding: number;
  /** Interest per day, charged on the outstanding balance. */
  dailyRate: number;
  /** Days the loan is scheduled over. */
  termDays: number;
  /** Payments settled so far. */
  daysPaid: number;
  /** The scheduled daily payment the ledger debits. */
  payment: number;
  /** Interest paid so far - what the loan actually cost. */
  totalInterest: number;
}

export interface LoanDay {
  /** Interest charged on today's opening balance. */
  interest: number;
  /** How much of the payment came off the balance. */
  principal: number;
  /** Money the ledger debits today. */
  payment: number;
  /** The loan after today's payment; null once it is paid off. */
  loan: LoanState | null;
}

/** The park's offer: $6,000 over ten days at 3% a day, repaid nightly. */
export const LOAN_OFFER = { principal: 6000, dailyRate: 0.03, termDays: 10 } as const;

/**
 * Fixed daily payment for an amortising loan: `P * r / (1 - (1+r)^-n)`, rounded to whole dollars.
 * A zero-interest loan is the principal divided across the term.
 */
export function loanPaymentFor(principal: number, dailyRate: number, termDays: number): number {
  if (!(principal > 0) || termDays <= 0) return 0;
  if (dailyRate <= 0) return Math.ceil(principal / termDays);
  const growth = Math.pow(1 + dailyRate, termDays);
  return Math.round((principal * dailyRate * growth) / (growth - 1));
}

export function createLoan(principal: number, dailyRate: number, termDays: number): LoanState {
  return {
    principal,
    outstanding: principal,
    dailyRate,
    termDays,
    daysPaid: 0,
    payment: loanPaymentFor(principal, dailyRate, termDays),
    totalInterest: 0,
  };
}

/**
 * Settle one day of the loan: interest on the opening balance, then the rest of the scheduled
 * payment off the principal. The final payment is short-adjusted so the balance lands exactly on
 * zero rather than overpaying.
 */
export function loanDay(loan: LoanState): LoanDay {
  const interest = Math.round(loan.outstanding * loan.dailyRate);
  const lastDay = loan.daysPaid + 1 >= loan.termDays;
  const payment = lastDay ? loan.outstanding + interest : Math.min(loan.payment, loan.outstanding + interest);
  const principal = Math.max(0, payment - interest);
  const outstanding = Math.max(0, loan.outstanding - principal);
  const next: LoanState = {
    ...loan,
    outstanding,
    daysPaid: loan.daysPaid + 1,
    totalInterest: loan.totalInterest + interest,
  };
  return { interest, principal, payment, loan: outstanding > 0 ? next : null };
}

/** Pay an extra amount off the balance; returns the loan after it and what was accepted. */
export function repayLoan(loan: LoanState, amount: number): { loan: LoanState | null; paid: number } {
  const paid = Math.max(0, Math.min(amount, loan.outstanding));
  if (paid <= 0) return { loan, paid: 0 };
  const outstanding = loan.outstanding - paid;
  return { loan: outstanding > 0 ? { ...loan, outstanding } : null, paid };
}

/** A loan a HUD can read without arithmetic: the daily charge and how far through the term it is. */
export function loanSummary(loan: LoanState): { owed: number; payment: number; daysLeft: number; interest: number } {
  return {
    owed: loan.outstanding,
    payment: Math.min(loan.payment, loan.outstanding + Math.round(loan.outstanding * loan.dailyRate)),
    daysLeft: Math.max(0, loan.termDays - loan.daysPaid),
    interest: loan.totalInterest,
  };
}
