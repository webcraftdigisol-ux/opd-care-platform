import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { Prisma, PatientProfile, User } from '@prisma/client';
import { HttpError } from '../middleware/errorHandler';
import type { Gender, Patient, PatientDetailsInput, PatientSearchResult } from '@opd/shared';

type Tx = Prisma.TransactionClient;

// Staff-registered patients have no email of their own; the account still
// needs a unique one, so it gets a placeholder that notify.ts never sends
// to (anything ending @opd.local) and that toPatient() reports as null.
export const PLACEHOLDER_EMAIL_DOMAIN = '@opd.local';

export function placeholderEmail(): string {
  return `patient-${crypto.randomUUID()}${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

export function formatPatientCode(n: number): string {
  return `PT${String(n).padStart(6, '0')}`;
}

// The clinic's next Patient ID. The increment is a single UPDATE, so two
// registrations at once still get different numbers (the row lock holds
// until the surrounding transaction ends).
export async function nextPatientCode(tx: Tx, clinicId: string): Promise<string> {
  const clinic = await tx.clinic.update({
    where: { id: clinicId },
    data: { lastPatientNumber: { increment: 1 } },
    select: { lastPatientNumber: true },
  });
  return formatPatientCode(clinic.lastPatientNumber);
}

// Phones are stored as typed minus spacing and punctuation ("+91 98765-43210"
// -> "+919876543210"), so a digits-only "contains" search finds them.
export function normalizePhone(phone: string): string {
  return phone.trim().replace(/[^\d+]/g, '');
}

export function joinName(first: string, middle?: string | null, last?: string | null): string {
  return [first, middle, last]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ');
}

// Best-effort split for records that only ever had one name field
// (self-signup, older walk-ins): first word, then the rest as last name.
export function splitName(name: string): { firstName: string; lastName: string | null } {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] ?? name, lastName: parts.length > 1 ? parts.slice(1).join(' ') : null };
}

function wholeYearsBetween(from: Date, to: Date): number {
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const beforeBirthday =
    to.getUTCMonth() < from.getUTCMonth() ||
    (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() < from.getUTCDate());
  if (beforeBirthday) years -= 1;
  return Math.max(0, years);
}

export function currentAge(
  profile: Pick<PatientProfile, 'dateOfBirth' | 'ageYears' | 'ageRecordedAt'>,
  now = new Date(),
): number | null {
  if (profile.dateOfBirth) return wholeYearsBetween(profile.dateOfBirth, now);
  if (profile.ageYears != null) {
    const since = profile.ageRecordedAt ? wholeYearsBetween(profile.ageRecordedAt, now) : 0;
    return profile.ageYears + since;
  }
  return null;
}

const toDateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function toPatient(user: User, profile: PatientProfile): Patient {
  return {
    id: user.id,
    patientCode: profile.patientCode,
    name: user.name,
    firstName: profile.firstName,
    middleName: profile.middleName,
    lastName: profile.lastName,
    gender: (profile.gender as Gender | null) ?? null,
    dateOfBirth: toDateOnly(profile.dateOfBirth),
    age: currentAge(profile),
    bloodGroup: profile.bloodGroup,
    maritalStatus: profile.maritalStatus,
    nationality: profile.nationality,
    phone: user.phone,
    alternatePhone: profile.alternatePhone,
    email: isPlaceholderEmail(user.email) ? null : user.email,
    emergencyContact: profile.emergencyContact,
    occupation: profile.occupation,
    referredBy: profile.referredBy,
    address: profile.address,
    city: profile.city,
    state: profile.state,
    pincode: profile.pincode,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    allergies: profile.allergies,
    chronicDiseases: profile.chronicDiseases,
    pastSurgeries: profile.pastSurgeries,
    familyHistory: profile.familyHistory,
    insuranceDetails: profile.insuranceDetails,
    tpa: profile.tpa,
    doctorNotes: profile.doctorNotes,
    whatsappOptIn: user.whatsappOptIn,
    registeredAt: user.createdAt.toISOString(),
  };
}

export function toPatientSearchResult(
  user: User & { patientProfile: PatientProfile | null },
  lastVisit: Date | null,
): PatientSearchResult {
  const profile = user.patientProfile;
  return {
    id: user.id,
    patientCode: profile?.patientCode ?? '',
    name: user.name,
    gender: (profile?.gender as Gender | null) ?? null,
    age: profile ? currentAge(profile) : null,
    phone: user.phone,
    lastVisit: toDateOnly(lastVisit),
  };
}

const blankToNull = (v: string | null | undefined) => {
  if (v === undefined) return undefined;
  const t = v?.trim();
  return t ? t : null;
};

// The profile columns from a (possibly partial) registration/edit payload.
// Undefined means "leave as is"; an empty string clears the field.
export function profileFields(input: Partial<PatientDetailsInput>, now = new Date()) {
  const fields: Prisma.PatientProfileUncheckedUpdateInput = {};
  const text = [
    'middleName',
    'lastName',
    'bloodGroup',
    'maritalStatus',
    'nationality',
    'emergencyContact',
    'occupation',
    'referredBy',
    'address',
    'city',
    'state',
    'pincode',
    'allergies',
    'chronicDiseases',
    'pastSurgeries',
    'familyHistory',
    'insuranceDetails',
    'tpa',
    'doctorNotes',
  ] as const;
  for (const key of text) {
    const v = blankToNull(input[key]);
    if (v !== undefined) (fields as Record<string, unknown>)[key] = v;
  }
  if (input.firstName !== undefined) fields.firstName = input.firstName.trim();
  if (input.alternatePhone !== undefined) {
    fields.alternatePhone = input.alternatePhone ? normalizePhone(input.alternatePhone) || null : null;
  }
  if (input.gender !== undefined) fields.gender = input.gender ?? null;
  if (input.heightCm !== undefined) fields.heightCm = input.heightCm ?? null;
  if (input.weightKg !== undefined) fields.weightKg = input.weightKg ?? null;
  if (input.dateOfBirth !== undefined) {
    fields.dateOfBirth = input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00.000Z`) : null;
  }
  if (input.ageYears !== undefined) {
    fields.ageYears = input.ageYears ?? null;
    fields.ageRecordedAt = input.ageYears != null ? now : null;
  }
  return fields;
}

// Registers a patient: the login account (random password, placeholder
// email unless a real one is given) plus the profile with the next Patient
// ID. Runs inside the caller's transaction.
export async function createPatient(
  tx: Tx,
  clinicId: string,
  input: PatientDetailsInput,
  opts: { consentRecordedById?: string; password?: string } = {},
) {
  const passwordHash = await bcrypt.hash(opts.password ?? crypto.randomBytes(16).toString('hex'), 10);
  const consent =
    input.whatsappOptIn && opts.consentRecordedById
      ? { whatsappOptIn: true, whatsappOptInAt: new Date(), whatsappOptInRecordedById: opts.consentRecordedById }
      : {};
  const user = await tx.user.create({
    data: {
      clinicId,
      name: joinName(input.firstName, input.middleName, input.lastName),
      email: input.email?.trim() || placeholderEmail(),
      phone: normalizePhone(input.phone) || null,
      password: passwordHash,
      role: 'PATIENT',
      ...consent,
    },
  });
  const patientCode = await nextPatientCode(tx, clinicId);
  const profile = await tx.patientProfile.create({
    data: {
      ...(profileFields(input) as Prisma.PatientProfileUncheckedCreateInput),
      firstName: input.firstName.trim(),
      userId: user.id,
      clinicId,
      patientCode,
    },
  });
  return { user, profile };
}

// Search terms for the as-you-type patient search: the raw text for name
// matching, the digits for phone matching (so "98765 43210", "+91 98765..."
// and "098765..." all work), and a Patient ID with or without the PT prefix.
export function patientSearchWhere(clinicId: string, q: string): Prisma.UserWhereInput {
  const term = q.trim();
  const digits = term.replace(/\D/g, '');
  const or: Prisma.UserWhereInput[] = [{ name: { contains: term, mode: 'insensitive' } }];
  const looksLikeCode = /^PT\d*$/i.test(term);
  // Stored phones keep any country code ("+919876543210"), so match on the
  // typed digits without a leading 0 or a +91 beyond the 10-digit number.
  const tail = digits.length > 10 ? digits.slice(-10) : digits.replace(/^0+/, '');
  if (!looksLikeCode && tail.length >= 3) {
    or.push({ phone: { contains: tail } });
    or.push({ patientProfile: { alternatePhone: { contains: tail } } });
  }
  if (looksLikeCode) {
    or.push({ patientProfile: { patientCode: { startsWith: term.toUpperCase() } } });
  } else if (/^\d{1,6}$/.test(term)) {
    or.push({ patientProfile: { patientCode: formatPatientCode(Number(term)) } });
  }
  return { clinicId, role: 'PATIENT', OR: or };
}

// A PATIENT user normally gets a profile when registered (and older ones
// were backfilled by the migration); this covers anything created some
// other way, so every patient screen can rely on having one.
export async function ensurePatientProfile(prisma: { $transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T> }, user: User) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.patientProfile.findUnique({ where: { userId: user.id } });
    if (existing) return existing;
    return tx.patientProfile.create({
      data: {
        userId: user.id,
        clinicId: user.clinicId,
        patientCode: await nextPatientCode(tx, user.clinicId),
        ...splitName(user.name),
      },
    });
  });
}

export const NOT_REGISTERED_MESSAGE = 'This booking is for someone not registered yet — register them first';

// Narrows an appointment to one with a registered patient. Everything past
// booking (check-in, consultation, billing, reminders) needs one; a
// booking for someone not registered yet is refused with a clear message.
export function withPatient<A extends { patientId: string | null; patient?: unknown }>(
  appointment: A,
): A & { patientId: string; patient: NonNullable<A['patient']> } {
  if (!appointment.patientId || ('patient' in appointment && !appointment.patient)) {
    throw new HttpError(400, NOT_REGISTERED_MESSAGE);
  }
  return appointment as A & { patientId: string; patient: NonNullable<A['patient']> };
}
