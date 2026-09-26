import type { PatientProfile, PharmacyItem as PrismaPharmacyItem, User } from '@prisma/client';
import type { DeptPatient, Gender } from '@opd/shared';
import { currentAge } from './patients';
import { medicineLabel } from './visitSummary';
import { findBestNameMatch } from './match';

// Shared by the Tier 2 department counters (pharmacy, lab, radiology).

// How far back a counter's "waiting" queue looks for visits with orders
// still to do.
export const QUEUE_DAYS = 7;

export const patientForCounter = { include: { patientProfile: true } } as const;

export function toDeptPatient(user: User & { patientProfile: PatientProfile | null }): DeptPatient {
  const profile = user.patientProfile;
  return {
    id: user.id,
    name: user.name,
    patientCode: profile?.patientCode ?? null,
    gender: (profile?.gender as Gender | null) ?? null,
    age: profile ? currentAge(profile) : null,
    phone: user.phone,
  };
}

// The first day of the queue window, as a date-only value (visits are
// stored date-only).
export function queueSince(now = new Date()): Date {
  const d = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - QUEUE_DAYS);
  return d;
}

// "650 mg", "650mg" and "650 MG" are the same strength.
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, '');

// Same composition: same generic name and, when both say, same strength.
export function sameComposition(item: Pick<PrismaPharmacyItem, 'name' | 'strength'>, want: { medicine: string; strength: string | null }): boolean {
  if (norm(item.name) !== norm(want.medicine)) return false;
  return !want.strength || !item.strength || norm(item.strength) === norm(want.strength);
}

// "Dolo 650 (Paracetamol 650 mg)" for a stocked product.
export function productLabel(item: Pick<PrismaPharmacyItem, 'name' | 'strength' | 'brand'>): string {
  return medicineLabel({ medicine: item.name, strength: item.strength, brand: item.brand });
}

type Prescribed = { medicine: string; strength: string | null; brand: string | null };

// Products that can fill a prescription line, best first: the prescribed
// brand, then others of the same composition in stock, then the rest.
export function substitutesFor<T extends PrismaPharmacyItem>(items: T[], p: Prescribed): T[] {
  const rank = (i: T) => (p.brand && norm(i.brand) === norm(p.brand) ? 0 : i.stockUnits > 0 ? 1 : 2);
  return items
    .filter((i) => sameComposition(i, p))
    .sort((a, b) => rank(a) - rank(b) || (a.brand ?? '').localeCompare(b.brand ?? ''));
}

// The product to pre-fill: the best substitute, else (for free-text
// prescriptions like "Paracetamol 500mg") a best-effort name match.
export function bestProduct<T extends PrismaPharmacyItem>(items: T[], p: Prescribed): T | null {
  const byBrand = p.brand ? items.find((i) => norm(i.brand) === norm(p.brand)) : undefined;
  return substitutesFor(items, p)[0] ?? byBrand ?? findBestNameMatch(items, p.medicine);
}

// Whether dispensing `item` for prescription `p` is a substitution: a
// different composition, or a different brand than the one prescribed.
export function isSubstitution(item: Pick<PrismaPharmacyItem, 'name' | 'strength' | 'brand'>, p: Prescribed): boolean {
  if (!sameComposition(item, p)) return true;
  return !!p.brand && norm(item.brand) !== norm(p.brand);
}

// A human receipt number: PH-260926-7F3A.
export function receiptNo(prefix: 'PH' | 'LB' | 'RD' | 'MC', createdAt: Date, id: string): string {
  const ist = new Date(createdAt.getTime() + 5.5 * 3600 * 1000).toISOString();
  return `${prefix}-${ist.slice(2, 4)}${ist.slice(5, 7)}${ist.slice(8, 10)}-${id.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}
