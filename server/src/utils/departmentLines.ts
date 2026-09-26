import type { Department, DepartmentReport, DeptSaleLine, DoctorShareReport, DoctorShareRow } from '@opd/shared';
import { prisma } from '../prisma';
import { receiptNo } from './departments';

const round2 = (n: number) => Math.round(n * 100) / 100;
const clinicDateOf = (d: Date) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const patient = { include: { patientProfile: { select: { patientCode: true } } } } as const;
const doctor = { include: { user: { select: { name: true } } } } as const;
const context = {
  patient,
  appointment: { include: { doctor } },
  admission: { include: { admittingDoctor: doctor } },
} as const;

// Every medicine or test a department sold in a date range (IST days), one
// line each, with revenue (before tax), cost and profit, and the doctor it
// counts for: the visit's doctor (OPD) or the admitting doctor (IPD).
// Cost is what was recorded at the sale; older sales without it fall back
// to today's list cost and are marked estimated.
export async function departmentLines(clinicId: string, department: Department, from: string, to: string): Promise<DeptSaleLine[]> {
  const createdAt = { gte: new Date(`${from}T00:00:00+05:30`), lt: new Date(`${nextDay(to)}T00:00:00+05:30`) };
  type Bill = {
    id: string;
    createdAt: Date;
    admissionId: string | null;
    patient: { name: string; patientProfile: { patientCode: string } | null };
    appointment: { doctorId: string; doctor: { user: { name: string } } } | null;
    admission: { admittingDoctorId: string; admittingDoctor: { user: { name: string } } } | null;
  };
  const base = (b: Bill, prefix: 'PH' | 'LB' | 'RD') => ({
    date: b.createdAt.toISOString(),
    billId: b.id,
    receiptNo: receiptNo(prefix, b.createdAt, b.id),
    setting: b.admissionId ? ('IPD' as const) : ('OPD' as const),
    patientName: b.patient.name,
    patientCode: b.patient.patientProfile?.patientCode ?? null,
    doctorId: b.appointment?.doctorId ?? b.admission?.admittingDoctorId ?? null,
    doctorName: b.appointment?.doctor.user.name ?? b.admission?.admittingDoctor.user.name ?? null,
  });

  const lines: DeptSaleLine[] = [];
  if (department === 'PHARMACY') {
    const sales = await prisma.pharmacySale.findMany({
      where: { clinicId, createdAt },
      include: { ...context, items: { include: { item: { select: { costPricePerUnit: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    for (const s of sales) {
      for (const i of s.items) {
        const unitCost = i.unitCost ?? i.item?.costPricePerUnit ?? 0;
        const cost = round2(unitCost * i.quantity);
        lines.push({
          ...base(s, 'PH'),
          item: i.medicineName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          revenue: round2(i.lineTotal),
          cost,
          profit: round2(i.lineTotal - cost),
          costEstimated: i.unitCost == null,
        });
      }
    }
  } else {
    const delegate = (department === 'LAB' ? prisma.labInvoice : prisma.radiologyInvoice) as typeof prisma.labInvoice;
    const invoices = await delegate.findMany({
      where: { clinicId, createdAt },
      include: { ...context, items: { include: { catalogItem: { select: { cost: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    for (const inv of invoices) {
      for (const i of inv.items) {
        const cost = round2(i.cost ?? i.catalogItem?.cost ?? 0);
        lines.push({
          ...base(inv, department === 'LAB' ? 'LB' : 'RD'),
          item: i.testName,
          quantity: 1,
          unitPrice: i.price,
          revenue: round2(i.price),
          cost,
          profit: round2(i.price - cost),
          costEstimated: i.cost == null,
        });
      }
    }
  }
  return lines;
}

export async function computeDepartmentReport(clinicId: string, department: Department, from: string, to: string): Promise<DepartmentReport> {
  const lines = await departmentLines(clinicId, department, from, to);
  const days = new Map<string, { revenue: number; cost: number; profit: number }>();
  const items = new Map<string, { item: string; quantity: number; revenue: number; cost: number; profit: number }>();
  for (const l of lines) {
    const d = days.get(clinicDateOf(new Date(l.date))) ?? { revenue: 0, cost: 0, profit: 0 };
    d.revenue += l.revenue;
    d.cost += l.cost;
    d.profit += l.profit;
    days.set(clinicDateOf(new Date(l.date)), d);
    const key = l.item.toLowerCase();
    const it = items.get(key) ?? { item: l.item, quantity: 0, revenue: 0, cost: 0, profit: 0 };
    it.quantity += l.quantity;
    it.revenue += l.revenue;
    it.cost += l.cost;
    it.profit += l.profit;
    items.set(key, it);
  }
  const r = <T extends { revenue: number; cost: number; profit: number }>(x: T): T => ({ ...x, revenue: round2(x.revenue), cost: round2(x.cost), profit: round2(x.profit) });
  return {
    department,
    from,
    to,
    lines,
    byDay: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => r({ date, ...v })),
    byItem: [...items.values()].map(r).sort((a, b) => b.revenue - a.revenue || a.item.localeCompare(b.item)),
    totals: r({
      revenue: lines.reduce((n, l) => n + l.revenue, 0),
      cost: lines.reduce((n, l) => n + l.cost, 0),
      profit: lines.reduce((n, l) => n + l.profit, 0),
      count: lines.length,
    }),
  };
}

// The doctor's share of each department's profit from their patients, at
// the admin-set rate (the doctor's own, else the clinic default, else 0).
// A loss earns no share. Over-the-counter sales with no doctor are shown
// on their own, without a share.
export async function computeDoctorShare(clinicId: string, from: string, to: string, onlyDoctorId?: string): Promise<DoctorShareReport> {
  const departments: Department[] = ['PHARMACY', 'LAB', 'RADIOLOGY'];
  const [rates, doctors, ...perDept] = await Promise.all([
    prisma.profitShareRate.findMany({ where: { clinicId } }),
    prisma.doctorProfile.findMany({ where: { user: { clinicId } }, include: { user: { select: { name: true } } } }),
    ...departments.map((d) => departmentLines(clinicId, d, from, to)),
  ]);
  const rateFor = (doctorId: string, d: Department) =>
    rates.find((r) => r.doctorId === doctorId && r.department === d)?.percent ?? rates.find((r) => r.doctorId === null && r.department === d)?.percent ?? 0;

  const rows: DoctorShareRow[] = [];
  departments.forEach((department, i) => {
    const groups = new Map<string, { revenue: number; cost: number; profit: number }>();
    for (const l of perDept[i]!) {
      if (onlyDoctorId && l.doctorId !== onlyDoctorId) continue;
      const g = groups.get(l.doctorId ?? '') ?? { revenue: 0, cost: 0, profit: 0 };
      g.revenue += l.revenue;
      g.cost += l.cost;
      g.profit += l.profit;
      groups.set(l.doctorId ?? '', g);
    }
    for (const [doctorId, g] of groups) {
      const percent = doctorId ? rateFor(doctorId, department) : 0;
      rows.push({
        doctorId: doctorId || null,
        doctorName: doctorId ? (doctors.find((d) => d.id === doctorId)?.user.name ?? '—') : 'Over the counter (no doctor)',
        department,
        revenue: round2(g.revenue),
        cost: round2(g.cost),
        profit: round2(g.profit),
        percent,
        share: round2(Math.max(0, g.profit) * (percent / 100)),
      });
    }
  });
  rows.sort((a, b) => (a.doctorId ? 0 : 1) - (b.doctorId ? 0 : 1) || a.doctorName.localeCompare(b.doctorName) || a.department.localeCompare(b.department));
  const sum = (k: 'revenue' | 'cost' | 'profit' | 'share') => round2(rows.reduce((n, r) => n + r[k], 0));
  return { from, to, rows, totals: { revenue: sum('revenue'), cost: sum('cost'), profit: sum('profit'), share: sum('share') } };
}
