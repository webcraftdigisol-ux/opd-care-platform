import type { Gender } from '@opd/shared';

const GENDER_SHORT: Record<Gender, string> = { MALE: 'M', FEMALE: 'F', OTHER: 'O' };
export const GENDER_LABEL: Record<Gender, string> = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' };

// "M, 35y", "F", "35y" or "" -- the compact age/sex used in lists.
export function sexAge(gender: Gender | null, age: number | null): string {
  return [gender ? GENDER_SHORT[gender] : null, age != null ? `${age}y` : null].filter(Boolean).join(', ');
}

// "17 May 2026" from "2026-05-17" or an ISO timestamp.
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  // A bare date is a calendar day (read as UTC so it never shifts); a
  // timestamp is shown in the viewer's own time zone.
  const dateOnly = value.length === 10;
  const d = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(dateOnly ? { timeZone: 'UTC' } : {}),
  });
}

export function formatMoney(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// Age in whole years from a "YYYY-MM-DD" birth date, for the form's
// DOB → age hint.
export function ageFromDob(dob: string, now = new Date()): number | null {
  const d = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) {
    years -= 1;
  }
  return years >= 0 ? years : null;
}

