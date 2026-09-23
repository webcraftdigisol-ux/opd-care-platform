import type { BillingCycle } from '@opd/shared';

// Shared by both renewal paths -- a platform admin manually recording a
// payment (platform.routes.ts) and a clinic admin paying online (self-serve,
// via payments.routes.ts) -- so the two can never drift into different date
// math for the same operation.
//
// A renewal always extends from whichever is later: "now" (a lapsed
// subscription doesn't get backdated credit for the time it was down) or
// the current period end (an early renewal stacks on top of time already
// paid for, rather than shortening it).
export function computeRenewalPeriod(currentPeriodEnd: Date, billingCycle: BillingCycle): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Math.max(Date.now(), currentPeriodEnd.getTime()));
  const periodDays = billingCycle === 'MONTHLY' ? 30 : 365;
  const periodEnd = new Date(periodStart.getTime() + periodDays * 24 * 60 * 60 * 1000);
  return { periodStart, periodEnd };
}
