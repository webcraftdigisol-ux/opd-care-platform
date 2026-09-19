import type { ClinicTier } from '@opd/shared';

// Placeholder INR pricing -- update to real prices before going live. Each
// tier's fee mirrors what it unlocks (Tier 1 = OPD only, Tier 2 = +Pharmacy/
// Lab/Radiology, Tier 3 = +IPD), not a per-clinic negotiated rate. This is
// only ever used as a suggested default: Subscription.amount is freely
// editable per record when a platform admin creates or renews one, the same
// "own recorded charge, not always re-derived from a changed catalog price"
// discipline used for PharmacySaleItem/LabResultItem/RadiologyResultItem
// elsewhere in this codebase.
export const SUBSCRIPTION_PRICING: Record<ClinicTier, { monthly: number; annual: number }> = {
  1: { monthly: 999, annual: 9999 },
  2: { monthly: 2499, annual: 24999 },
  3: { monthly: 4999, annual: 49999 },
};

export function defaultSubscriptionAmount(tier: ClinicTier, billingCycle: 'MONTHLY' | 'ANNUAL'): number {
  const pricing = SUBSCRIPTION_PRICING[tier];
  return billingCycle === 'MONTHLY' ? pricing.monthly : pricing.annual;
}
