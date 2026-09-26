import type { DeptRevenue, OrdersReport, RevenueDepartment } from '@opd/shared';
import { prisma } from '../prisma';
import { suggestPharmacyQuantity } from './dosage';
import { findBestNameMatch } from './match';
import { bestProduct } from './departments';

const round2 = (n: number) => Math.round(n * 100) / 100;

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

type Cell = Omit<DeptRevenue, 'department'>;
const empty = (): Cell => ({ ordered: 0, inHouse: 0, notInHouse: 0, hasUnpriced: false });

// In-house revenue by department, in rupees, for visits in a date range:
// consultation fees, and for pharmacy, lab and radiology what the doctors
// prescribed/ordered vs what the clinic's own departments then earned from
// it. A line done in-house counts at its own recorded charge (before tax);
// one not done here (pending, or marked not done) at today's list price --
// medicines at the dispensing quantity the dosing implies. Broken down by
// visit day and by doctor as well.
export async function computeOrdersReport(opts: {
  clinicId: string;
  from: string;
  to: string;
  doctorId?: string;
  departments: RevenueDepartment[];
}): Promise<OrdersReport> {
  const { clinicId, from, to } = opts;
  const want = (d: RevenueDepartment) => opts.departments.includes(d);
  const departments = (['CONSULTATION', 'PHARMACY', 'LAB', 'RADIOLOGY'] as const).filter(want);

  const [appointments, items, labCatalog, radiologyCatalog] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        clinicId,
        patientId: { not: null },
        date: { gte: new Date(`${from}T00:00:00Z`), lt: new Date(`${nextDay(to)}T00:00:00Z`) },
        ...(opts.doctorId ? { doctorId: opts.doctorId } : {}),
      },
      include: {
        doctor: { include: { user: true } },
        consultation: {
          include: {
            prescriptions: { include: { saleItems: true } },
            labTestsOrdered: { include: { resultItems: true } },
            radiologyOrdered: { include: { resultItems: true } },
          },
        },
      },
    }),
    want('PHARMACY') ? prisma.pharmacyItem.findMany({ where: { clinicId } }) : [],
    want('LAB') ? prisma.labTestCatalog.findMany({ where: { clinicId } }) : [],
    want('RADIOLOGY') ? prisma.radiologyCatalog.findMany({ where: { clinicId } }) : [],
  ]);

  // (group key) -> department -> running totals
  const total = new Map<RevenueDepartment, Cell>();
  const byDay = new Map<string, Map<RevenueDepartment, Cell>>();
  const byDoctor = new Map<string, { name: string; cells: Map<RevenueDepartment, Cell> }>();
  const cellIn = (m: Map<RevenueDepartment, Cell>, d: RevenueDepartment) => {
    let c = m.get(d);
    if (!c) m.set(d, (c = empty()));
    return c;
  };

  for (const a of appointments) {
    const day = a.date.toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, new Map());
    if (!byDoctor.has(a.doctorId)) byDoctor.set(a.doctorId, { name: a.doctor.user.name, cells: new Map() });
    const targets = [total, byDay.get(day)!, byDoctor.get(a.doctorId)!.cells];
    // Charged `done` in-house, or worth `notDone` (null = no list price).
    const add = (d: RevenueDepartment, done: number | null, notDone: number | null) => {
      for (const m of targets) {
        const c = cellIn(m, d);
        if (done != null) {
          c.ordered += done;
          c.inHouse += done;
        } else if (notDone) {
          c.ordered += notDone;
          c.notInHouse += notDone;
        } else {
          c.hasUnpriced = true;
        }
      }
    };

    // A consultation fee counts once the patient was seen.
    if (want('CONSULTATION') && ['CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED'].includes(a.status)) {
      add('CONSULTATION', a.consultationFee, null);
    }
    const c = a.consultation;
    if (!c) continue;
    if (want('PHARMACY')) {
      for (const p of c.prescriptions) {
        if (p.saleItems.length) add('PHARMACY', p.saleItems.reduce((n, s) => n + s.lineTotal, 0), null);
        else add('PHARMACY', null, (bestProduct(items, p)?.pricePerUnit ?? 0) * suggestPharmacyQuantity(p.frequency, p.durationDays));
      }
    }
    for (const [d, orders, catalog] of [
      ['LAB', c.labTestsOrdered, labCatalog],
      ['RADIOLOGY', c.radiologyOrdered, radiologyCatalog],
    ] as const) {
      if (!want(d)) continue;
      for (const o of orders) {
        if (o.resultItems.length) add(d, o.resultItems.reduce((n, r) => n + r.price, 0), null);
        else add(d, null, findBestNameMatch(catalog, o.testName)?.price ?? 0);
      }
    }
  }

  const cells = (m: Map<RevenueDepartment, Cell>): DeptRevenue[] =>
    departments.map((department) => {
      const c = m.get(department) ?? empty();
      return { department, ordered: round2(c.ordered), inHouse: round2(c.inHouse), notInHouse: round2(c.notInHouse), hasUnpriced: c.hasUnpriced };
    });

  // Days and doctors with nothing in the chosen departments are left out.
  const any = (cs: DeptRevenue[]) => cs.some((c) => c.ordered || c.hasUnpriced);

  return {
    from,
    to,
    departments: [...departments],
    summary: cells(total),
    byDay: [...byDay]
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([date, m]) => ({ date, cells: cells(m) }))
      .filter((d) => any(d.cells)),
    byDoctor: [...byDoctor]
      .map(([doctorId, d]) => ({ doctorId, doctorName: d.name, cells: cells(d.cells) }))
      .filter((d) => any(d.cells))
      .sort((x, y) => x.doctorName.localeCompare(y.doctorName)),
  };
}
