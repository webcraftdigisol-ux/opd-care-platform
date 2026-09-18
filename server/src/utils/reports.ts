import { prisma } from '../prisma';
import { findBestNameMatch } from './match';
import { suggestPharmacyQuantity } from './dosage';
import type { DailyActivityReport, DoctorActivitySummary, ReportItemBreakdown, RevenueSection } from '@opd/shared';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

interface NameTotals {
  qty: number;
  total: number;
  unmatched: number;
}

function addTotals(map: Map<string, NameTotals>, name: string, qty: number, total: number, unmatched = 0) {
  const entry = map.get(name) ?? { qty: 0, total: 0, unmatched: 0 };
  entry.qty += qty;
  entry.total += total;
  entry.unmatched += unmatched;
  map.set(name, entry);
}

function mergeBreakdown(actual: Map<string, NameTotals>, ordered: Map<string, NameTotals>): ReportItemBreakdown[] {
  const names = new Set([...actual.keys(), ...ordered.keys()]);
  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      actualQuantity: actual.get(name)?.qty ?? 0,
      actualTotal: round2(actual.get(name)?.total ?? 0),
      orderedQuantity: ordered.get(name)?.qty ?? 0,
      orderedTotal: round2(ordered.get(name)?.total ?? 0),
      unmatchedOrderedCount: ordered.get(name)?.unmatched ?? 0,
    }));
}

export async function computePharmacyReport(clinicId: string, from: Date, to: Date): Promise<RevenueSection> {
  const toEnd = endOfDay(to);

  const saleItems = await prisma.pharmacySaleItem.findMany({
    where: { sale: { clinicId, createdAt: { gte: from, lte: toEnd } } },
  });

  const actualByName = new Map<string, NameTotals>();
  let actualTotal = 0;
  for (const item of saleItems) {
    actualTotal += item.lineTotal;
    addTotals(actualByName, item.medicineName, item.quantity, item.lineTotal);
  }

  const [prescriptions, catalog] = await Promise.all([
    prisma.prescription.findMany({
      where: { consultation: { appointment: { clinicId, date: { gte: from, lte: toEnd } } } },
      include: { saleItems: true },
    }),
    prisma.pharmacyItem.findMany({ where: { clinicId } }),
  ]);

  const orderedByName = new Map<string, NameTotals>();
  let orderedTotal = 0;
  let unmatchedCount = 0;

  for (const p of prescriptions) {
    if (p.saleItems.length > 0) {
      // Already billed: use its own recorded charge, forever — never
      // re-derive it from a fresh catalog lookup by name.
      const qty = p.saleItems.reduce((s, i) => s + i.quantity, 0);
      const value = p.saleItems.reduce((s, i) => s + i.lineTotal, 0);
      orderedTotal += value;
      addTotals(orderedByName, p.medicine, qty, value);
      continue;
    }

    const suggestedQty = suggestPharmacyQuantity(p.frequency, p.durationDays);
    const match = findBestNameMatch(catalog, p.medicine);
    if (match) {
      const value = suggestedQty * match.pricePerUnit;
      orderedTotal += value;
      addTotals(orderedByName, p.medicine, suggestedQty, value);
    } else {
      unmatchedCount += 1;
      addTotals(orderedByName, p.medicine, suggestedQty, 0, 1);
    }
  }

  return {
    actual: { count: saleItems.length, total: round2(actualTotal) },
    totalOrdered: { count: prescriptions.length, total: round2(orderedTotal), unmatchedCount },
    byItem: mergeBreakdown(actualByName, orderedByName),
  };
}

export async function computeLabReport(clinicId: string, from: Date, to: Date): Promise<RevenueSection> {
  const toEnd = endOfDay(to);

  const resultItems = await prisma.labResultItem.findMany({
    where: { invoice: { clinicId, createdAt: { gte: from, lte: toEnd } } },
  });

  const actualByName = new Map<string, NameTotals>();
  let actualTotal = 0;
  for (const item of resultItems) {
    actualTotal += item.price;
    addTotals(actualByName, item.testName, 1, item.price);
  }

  const [orders, catalog] = await Promise.all([
    prisma.labTestOrder.findMany({
      where: { consultation: { appointment: { clinicId, date: { gte: from, lte: toEnd } } } },
      include: { resultItems: true },
    }),
    prisma.labTestCatalog.findMany({ where: { clinicId } }),
  ]);

  const orderedByName = new Map<string, NameTotals>();
  let orderedTotal = 0;
  let unmatchedCount = 0;

  for (const o of orders) {
    if (o.resultItems.length > 0) {
      const value = o.resultItems.reduce((s, i) => s + i.price, 0);
      orderedTotal += value;
      addTotals(orderedByName, o.testName, o.resultItems.length, value);
      continue;
    }

    const match = findBestNameMatch(catalog, o.testName);
    if (match) {
      orderedTotal += match.price;
      addTotals(orderedByName, o.testName, 1, match.price);
    } else {
      unmatchedCount += 1;
      addTotals(orderedByName, o.testName, 1, 0, 1);
    }
  }

  return {
    actual: { count: resultItems.length, total: round2(actualTotal) },
    totalOrdered: { count: orders.length, total: round2(orderedTotal), unmatchedCount },
    byItem: mergeBreakdown(actualByName, orderedByName),
  };
}

export async function computeDailyActivity(clinicId: string, date: Date): Promise<DailyActivityReport> {
  const appointments = await prisma.appointment.findMany({
    where: { clinicId, date },
    include: { doctor: { include: { user: true } } },
  });

  const byDoctorMap = new Map<string, DoctorActivitySummary>();
  let walkIns = 0;
  let completed = 0;
  let cancelled = 0;
  let noShow = 0;
  let booked = 0;

  for (const a of appointments) {
    if (a.isWalkIn) walkIns += 1;
    if (a.status === 'COMPLETED') completed += 1;
    if (a.status === 'CANCELLED') cancelled += 1;
    if (a.status === 'NO_SHOW') noShow += 1;
    if (a.status === 'BOOKED') booked += 1;

    const entry = byDoctorMap.get(a.doctorId) ?? {
      doctorId: a.doctorId,
      doctorName: a.doctor.user.name,
      total: 0,
      completed: 0,
    };
    entry.total += 1;
    if (a.status === 'COMPLETED') entry.completed += 1;
    byDoctorMap.set(a.doctorId, entry);
  }

  return {
    date: date.toISOString().slice(0, 10),
    totalAppointments: appointments.length,
    booked,
    walkIns,
    completed,
    cancelled,
    noShow,
    byDoctor: [...byDoctorMap.values()].sort((a, b) => a.doctorName.localeCompare(b.doctorName)),
  };
}
