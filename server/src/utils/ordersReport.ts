import type { Department, OrdersReport, OrdersReportRow, OrdersReportSummary } from '@opd/shared';
import { prisma } from '../prisma';
import { medicineLabel } from './visitSummary';

const round2 = (n: number) => Math.round(n * 100) / 100;

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// What doctors ordered in a date range (by visit day) -- medicines, lab
// tests, imaging -- and how much of it was then done in the clinic's own
// pharmacy, lab and radiology: per line, per department, per item and per
// doctor. Amounts are the in-house line charges (before tax).
export async function computeOrdersReport(opts: {
  clinicId: string;
  from: string;
  to: string;
  doctorId?: string;
  departments: Department[];
}): Promise<OrdersReport> {
  const { clinicId, from, to } = opts;
  const want = (d: Department) => opts.departments.includes(d);
  const consultations = await prisma.consultation.findMany({
    where: {
      appointment: {
        clinicId,
        date: { gte: new Date(`${from}T00:00:00Z`), lt: new Date(`${nextDay(to)}T00:00:00Z`) },
        ...(opts.doctorId ? { doctorId: opts.doctorId } : {}),
      },
    },
    include: {
      appointment: { include: { patient: { include: { patientProfile: { select: { patientCode: true } } } }, doctor: { include: { user: true } } } },
      prescriptions: { include: { saleItems: true } },
      labTestsOrdered: { include: { resultItems: true } },
      radiologyOrdered: { include: { resultItems: true } },
    },
  });

  const rows: OrdersReportRow[] = [];
  for (const c of consultations) {
    const a = c.appointment;
    const base = {
      date: a.date.toISOString().slice(0, 10),
      patientId: a.patient?.id ?? null,
      patientName: a.patient?.name ?? a.guestName ?? '—',
      patientCode: a.patient?.patientProfile?.patientCode ?? null,
      doctorId: a.doctorId,
      doctorName: a.doctor.user.name,
    };
    for (const p of want('PHARMACY') ? c.prescriptions : []) {
      const done = p.saleItems;
      const substituted = done.some((s) => s.substitutedFor);
      rows.push({
        ...base,
        department: 'PHARMACY',
        ordered: medicineLabel(p),
        status: done.length ? (substituted ? 'SUBSTITUTED' : 'IN_HOUSE') : p.skippedAt ? 'NOT_DONE' : 'PENDING',
        doneAs: done.length ? done.map((s) => s.medicineName).join(', ') : null,
        quantity: done.length ? done.reduce((n, s) => n + s.quantity, 0) : null,
        amount: round2(done.reduce((n, s) => n + s.lineTotal, 0)),
        note: p.skipReason,
      });
    }
    for (const [department, orders] of [
      ['LAB', c.labTestsOrdered],
      ['RADIOLOGY', c.radiologyOrdered],
    ] as const) {
      if (!want(department)) continue;
      for (const o of orders) {
        const done = o.resultItems;
        rows.push({
          ...base,
          department,
          ordered: o.testName,
          status: done.length ? (done.some((r) => r.substitutedFor) ? 'SUBSTITUTED' : 'IN_HOUSE') : o.skippedAt ? 'NOT_DONE' : 'PENDING',
          doneAs: done.length ? done.map((r) => r.testName).join(', ') : null,
          quantity: done.length || null,
          amount: round2(done.reduce((n, r) => n + r.price, 0)),
          note: o.skipReason,
        });
      }
    }
  }
  rows.sort((x, y) => x.date.localeCompare(y.date) || x.patientName.localeCompare(y.patientName));

  const inHouse = (r: OrdersReportRow) => r.status === 'IN_HOUSE' || r.status === 'SUBSTITUTED';
  const summary: OrdersReportSummary[] = (['PHARMACY', 'LAB', 'RADIOLOGY'] as const).filter(want).map((department) => {
    const mine = rows.filter((r) => r.department === department);
    return {
      department,
      ordered: mine.length,
      inHouse: mine.filter(inHouse).length,
      substituted: mine.filter((r) => r.status === 'SUBSTITUTED').length,
      notDone: mine.filter((r) => r.status === 'NOT_DONE').length,
      pending: mine.filter((r) => r.status === 'PENDING').length,
      revenue: round2(mine.reduce((n, r) => n + r.amount, 0)),
    };
  });

  const tally = <K extends string>(key: (r: OrdersReportRow) => K) => {
    const m = new Map<K, { rows: OrdersReportRow[] }>();
    for (const r of rows) {
      const g = m.get(key(r)) ?? { rows: [] };
      g.rows.push(r);
      m.set(key(r), g);
    }
    return [...m.values()].map(({ rows: g }) => ({
      first: g[0]!,
      ordered: g.length,
      inHouse: g.filter(inHouse).length,
      revenue: round2(g.reduce((n, r) => n + r.amount, 0)),
    }));
  };

  return {
    from,
    to,
    summary,
    byItem: tally((r) => `${r.department}|${r.ordered.toLowerCase()}`)
      .map(({ first, ...t }) => ({ department: first.department, name: first.ordered, ...t }))
      .sort((x, y) => y.ordered - x.ordered || x.name.localeCompare(y.name)),
    byDoctor: tally((r) => `${r.doctorId}|${r.department}`)
      .map(({ first, ...t }) => ({ doctorId: first.doctorId, doctorName: first.doctorName, department: first.department, ...t }))
      .sort((x, y) => x.doctorName.localeCompare(y.doctorName) || x.department.localeCompare(y.department)),
    rows,
  };
}
