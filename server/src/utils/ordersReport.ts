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
const empty = (): Cell => ({ ordered: 0, inHouse: 0, notInHouse: 0, hasUnpriced: false, ipd: 0 });

// The clinic's calendar day (India) for a timestamp.
const clinicDateOf = (d: Date) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// In-house revenue by department, in rupees, for visits in a date range:
// consultation fees, and for pharmacy, lab and radiology what the doctors
// prescribed/ordered vs what the clinic's own departments then earned from
// it. A line done in-house counts at its own recorded charge (before tax);
// one not done here (pending, or marked not done) at today's list price --
// medicines at the dispensing quantity the dosing implies. Broken down by
// visit day and by doctor as well.
//
// At a Tier 3 clinic each department also gets its IPD revenue -- what was
// charged to admitted patients in the range (before tax): doctor visits
// (consultation), pharmacy sales during a stay and clinic-supplied
// medicines (pharmacy), lab and radiology bills during a stay -- plus rows
// for procedures & surgery, other ward charges, and room charges (counted
// when the admission's final bill is made, at discharge). IPD revenue goes
// to the admitting doctor, a doctor visit to the doctor who visited.
export async function computeOrdersReport(opts: {
  clinicId: string;
  tier: number;
  from: string;
  to: string;
  doctorId?: string;
  departments: RevenueDepartment[];
}): Promise<OrdersReport> {
  const { clinicId, from, to } = opts;
  const hasIpd = opts.tier >= 3;
  const want = (d: RevenueDepartment) => opts.departments.includes(d);
  const departments = (['CONSULTATION', 'PHARMACY', 'LAB', 'RADIOLOGY', 'PROCEDURE', 'ROOM', 'OTHER_IPD'] as const).filter(
    (d) => want(d) && (hasIpd || !['PROCEDURE', 'ROOM', 'OTHER_IPD'].includes(d)),
  );

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

  if (hasIpd) {
    const tsRange = { gte: new Date(`${from}T00:00:00+05:30`), lt: new Date(`${nextDay(to)}T00:00:00+05:30`) };
    const admissionWhere = { clinicId, ...(opts.doctorId ? { admittingDoctorId: opts.doctorId } : {}) };
    const doctorOf = { include: { user: true } } as const;
    const admission = { include: { admittingDoctor: doctorOf } } as const;
    const [visits, sales, meds, labs, rads, procedures, charges, bills] = await Promise.all([
      want('CONSULTATION')
        ? prisma.ipdDoctorVisit.findMany({
            where: { visitedAt: tsRange, admission: { clinicId }, ...(opts.doctorId ? { doctorId: opts.doctorId } : {}) },
            include: { doctor: doctorOf },
          })
        : [],
      want('PHARMACY') ? prisma.pharmacySale.findMany({ where: { createdAt: tsRange, admission: admissionWhere }, include: { admission } }) : [],
      want('PHARMACY')
        ? prisma.ipdMedication.findMany({ where: { givenAt: tsRange, source: 'CLINIC_SUPPLIED', admission: admissionWhere }, include: { admission } })
        : [],
      want('LAB') ? prisma.labInvoice.findMany({ where: { createdAt: tsRange, admission: admissionWhere }, include: { admission } }) : [],
      want('RADIOLOGY') ? prisma.radiologyInvoice.findMany({ where: { createdAt: tsRange, admission: admissionWhere }, include: { admission } }) : [],
      want('PROCEDURE') ? prisma.ipdProcedure.findMany({ where: { performedAt: tsRange, admission: admissionWhere }, include: { admission } }) : [],
      want('OTHER_IPD') ? prisma.ipdCharge.findMany({ where: { chargedAt: tsRange, admission: admissionWhere }, include: { admission } }) : [],
      want('ROOM')
        ? prisma.admission.findMany({ where: { ...admissionWhere, dischargedAt: tsRange, bill: { isNot: null } }, include: { bill: true, admittingDoctor: doctorOf } })
        : [],
    ]);
    const addIpd = (d: RevenueDepartment, at: Date, doctor: { id: string; user: { name: string } }, amount: number) => {
      if (!amount) return;
      const day = clinicDateOf(at);
      if (!byDay.has(day)) byDay.set(day, new Map());
      if (!byDoctor.has(doctor.id)) byDoctor.set(doctor.id, { name: doctor.user.name, cells: new Map() });
      for (const m of [total, byDay.get(day)!, byDoctor.get(doctor.id)!.cells]) cellIn(m, d).ipd += amount;
    };
    for (const v of visits) addIpd('CONSULTATION', v.visitedAt, v.doctor, v.fee);
    for (const x of sales) addIpd('PHARMACY', x.createdAt, x.admission!.admittingDoctor, x.subtotal);
    for (const m of meds) addIpd('PHARMACY', m.givenAt, m.admission.admittingDoctor, m.quantity * m.unitPrice);
    for (const x of labs) addIpd('LAB', x.createdAt, x.admission!.admittingDoctor, x.subtotal);
    for (const x of rads) addIpd('RADIOLOGY', x.createdAt, x.admission!.admittingDoctor, x.subtotal);
    for (const x of procedures) addIpd('PROCEDURE', x.performedAt, x.admission.admittingDoctor, x.fee);
    for (const x of charges) addIpd('OTHER_IPD', x.chargedAt, x.admission.admittingDoctor, x.amount);
    for (const a of bills) addIpd('ROOM', a.dischargedAt!, a.admittingDoctor, a.bill!.roomCharges);
  }

  const cells = (m: Map<RevenueDepartment, Cell>): DeptRevenue[] =>
    departments.map((department) => {
      const c = m.get(department) ?? empty();
      return {
        department,
        ordered: round2(c.ordered),
        inHouse: round2(c.inHouse),
        notInHouse: round2(c.notInHouse),
        hasUnpriced: c.hasUnpriced,
        ipd: round2(c.ipd),
      };
    });

  // Days and doctors with nothing in the chosen departments are left out.
  const any = (cs: DeptRevenue[]) => cs.some((c) => c.ordered || c.hasUnpriced || c.ipd);

  return {
    from,
    to,
    departments: [...departments],
    hasIpd,
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
