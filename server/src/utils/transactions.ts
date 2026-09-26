import type { BillType, PaymentMethod, TransactionRow, TransactionsReport } from '@opd/shared';
import { prisma } from '../prisma';

// The clinic's calendar day (India) for timestamped bills, matching the
// dashboard; visits are already stored as date-only values.
const IST_MS = 5.5 * 3600 * 1000;
const startOfClinicDay = (date: string) => new Date(`${date}T00:00:00+05:30`);
const clinicDateOf = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

type Draft = Omit<TransactionRow, 'collected' | 'outstanding' | 'status'> & { doctorId: string | null };

// Every bill in a date range, with what has been paid against it -- the
// Reports page's transaction table and its summaries. "Billed" is the fee
// or invoice total; "collected" is money actually received for that bill
// (whenever it was paid); "outstanding" is the difference.
export async function computeTransactions(opts: {
  clinicId: string;
  tier: number;
  from: string;
  to: string;
  doctorId?: string;
  types: BillType[];
}): Promise<TransactionsReport> {
  const { clinicId, from, to } = opts;
  const want = (t: BillType) => opts.types.includes(t) && (t === 'CONSULTATION' || (t === 'IPD' ? opts.tier >= 3 : opts.tier >= 2));
  const dayRange = { gte: new Date(`${from}T00:00:00Z`), lt: new Date(`${nextDay(to)}T00:00:00Z`) };
  const tsRange = { gte: startOfClinicDay(from), lt: startOfClinicDay(nextDay(to)) };
  const patient = { include: { patientProfile: { select: { patientCode: true } } } } as const;
  const viaAppointment = { include: { doctor: { include: { user: true } } } } as const;

  const [visits, sales, labs, rads, admissions] = await Promise.all([
    want('CONSULTATION')
      ? prisma.appointment.findMany({
          where: { clinicId, date: dayRange, patientId: { not: null }, status: { in: ['CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED'] } },
          include: { patient, doctor: { include: { user: true } }, consultation: { select: { diagnosis: true, createdAt: true } } },
        })
      : [],
    want('PHARMACY')
      ? prisma.pharmacySale.findMany({ where: { clinicId, createdAt: tsRange }, include: { patient, items: true, appointment: viaAppointment } })
      : [],
    want('LAB')
      ? prisma.labInvoice.findMany({ where: { clinicId, createdAt: tsRange }, include: { patient, items: true, appointment: viaAppointment } })
      : [],
    want('RADIOLOGY')
      ? prisma.radiologyInvoice.findMany({ where: { clinicId, createdAt: tsRange }, include: { patient, items: true, appointment: viaAppointment } })
      : [],
    want('IPD')
      ? prisma.admission.findMany({
          where: { clinicId, dischargedAt: tsRange, bill: { isNot: null } },
          include: { patient, bill: true, admittingDoctor: { include: { user: true } } },
        })
      : [],
  ]);

  const who = (p: { id: string; name: string; patientProfile: { patientCode: string } | null } | null) => ({
    patientId: p?.id ?? null,
    patientName: p?.name ?? '—',
    patientCode: p?.patientProfile?.patientCode ?? null,
  });
  const drafts: Draft[] = [
    ...visits.map((a) => ({
      billType: 'CONSULTATION' as const,
      billId: a.id,
      // The visit's day; the time is when the consultation was recorded.
      date: (a.consultation?.createdAt && clinicDateOf(a.consultation.createdAt) === a.date.toISOString().slice(0, 10)
        ? a.consultation.createdAt
        : new Date(a.date.getTime() - IST_MS)
      ).toISOString(),
      ...who(a.patient),
      doctorId: a.doctorId,
      doctorName: a.doctor.user.name,
      description: a.consultation?.diagnosis ? `OPD consultation · ${a.consultation.diagnosis}` : 'OPD consultation',
      billed: a.consultationFee,
    })),
    ...sales.map((s) => ({
      billType: 'PHARMACY' as const,
      billId: s.id,
      date: s.createdAt.toISOString(),
      ...who(s.patient),
      doctorId: s.appointment?.doctorId ?? null,
      doctorName: s.appointment?.doctor.user.name ?? null,
      description: `Pharmacy · ${s.items.length} item${s.items.length === 1 ? '' : 's'}`,
      billed: s.total,
    })),
    ...labs.map((l) => ({
      billType: 'LAB' as const,
      billId: l.id,
      date: l.createdAt.toISOString(),
      ...who(l.patient),
      doctorId: l.appointment?.doctorId ?? null,
      doctorName: l.appointment?.doctor.user.name ?? null,
      description: `Lab · ${l.items.map((i) => i.testName).join(', ')}`,
      billed: l.total,
    })),
    ...rads.map((r) => ({
      billType: 'RADIOLOGY' as const,
      billId: r.id,
      date: r.createdAt.toISOString(),
      ...who(r.patient),
      doctorId: r.appointment?.doctorId ?? null,
      doctorName: r.appointment?.doctor.user.name ?? null,
      description: `Radiology · ${r.items.map((i) => i.testName).join(', ')}`,
      billed: r.total,
    })),
    ...admissions.map((a) => ({
      billType: 'IPD' as const,
      billId: a.id,
      date: a.dischargedAt!.toISOString(),
      ...who(a.patient),
      doctorId: a.admittingDoctorId,
      doctorName: a.admittingDoctor.user.name,
      description: 'IPD admission (final bill after deposit)',
      billed: Math.max(0, a.bill!.amountDue),
    })),
  ].filter((d) => !opts.doctorId || d.doctorId === opts.doctorId);

  const payments = drafts.length
    ? await prisma.payment.findMany({
        where: { clinicId, OR: drafts.map((d) => ({ billType: d.billType, billId: d.billId })) },
        select: { billType: true, billId: true, amount: true, method: true },
      })
    : [];
  const paid = new Map<string, number>();
  const byMethod = new Map<PaymentMethod, number>();
  for (const p of payments) {
    const key = `${p.billType}:${p.billId}`;
    paid.set(key, (paid.get(key) ?? 0) + p.amount);
    byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount);
  }

  const rows: TransactionRow[] = drafts
    .map(({ doctorId: _doctorId, ...d }) => {
      const billed = round2(d.billed);
      const collected = round2(paid.get(`${d.billType}:${d.billId}`) ?? 0);
      const outstanding = round2(Math.max(0, billed - collected));
      const status: TransactionRow['status'] =
        billed === 0 ? 'NO_CHARGE' : outstanding <= 0.01 ? 'PAID' : collected > 0 ? 'PARTLY_PAID' : 'UNPAID';
      return { ...d, billed, collected, outstanding, status };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const group = <K extends string>(key: (r: TransactionRow) => K) => {
    const m = new Map<K, { count: number; billed: number; collected: number }>();
    for (const r of rows) {
      const g = m.get(key(r)) ?? { count: 0, billed: 0, collected: 0 };
      g.count += 1;
      g.billed = round2(g.billed + r.billed);
      g.collected = round2(g.collected + r.collected);
      m.set(key(r), g);
    }
    return m;
  };

  return {
    from,
    to,
    rows,
    byDay: [...group((r) => clinicDateOf(new Date(r.date)))].map(([date, g]) => ({ date, ...g })),
    byType: [...group((r) => r.billType)].map(([billType, g]) => ({ billType, ...g })),
    byMethod: [...byMethod].map(([method, amount]) => ({ method, amount: round2(amount) })),
    totals: {
      count: rows.length,
      billed: round2(rows.reduce((n, r) => n + r.billed, 0)),
      collected: round2(rows.reduce((n, r) => n + r.collected, 0)),
      outstanding: round2(rows.reduce((n, r) => n + r.outstanding, 0)),
    },
  };
}
