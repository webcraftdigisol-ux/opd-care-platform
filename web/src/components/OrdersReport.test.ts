import { describe, expect, it } from 'vitest';
import type { OrdersReport } from '@opd/shared';
import { ordersToCsv } from './OrdersReport';

const cell = (department: 'CONSULTATION' | 'PHARMACY' | 'ROOM', ordered: number, inHouse: number, ipd = 0) => ({
  department,
  ordered,
  inHouse,
  notInHouse: ordered - inHouse,
  hasUnpriced: false,
  ipd,
});

const report: OrdersReport = {
  from: '2026-09-01',
  to: '2026-09-30',
  departments: ['CONSULTATION', 'PHARMACY'],
  hasIpd: false,
  summary: [cell('CONSULTATION', 500, 500), cell('PHARMACY', 100, 25)],
  byDay: [{ date: '2026-09-26', cells: [cell('CONSULTATION', 500, 500), cell('PHARMACY', 100, 25)] }],
  byDoctor: [{ doctorId: 'd', doctorName: '=Asha Rao', cells: [cell('CONSULTATION', 500, 500), cell('PHARMACY', 100, 25)] }],
};

describe('in-house revenue CSV export', () => {
  it('writes the department totals, then revenue by day and by doctor -- rupees only, formulas neutralised', () => {
    const lines = ordersToCsv(report).split('\r\n');
    expect(lines[2]).toBe('"Department","Prescribed / ordered (₹)","Done in-house (₹)","Not done in-house (₹)","In-house %"');
    expect(lines[3]).toBe('"Consultation","500","500","0","100"');
    expect(lines[4]).toBe('"Pharmacy","100","25","75","25"');
    expect(lines[5]).toBe('"Total","600","525","75","88"');
    expect(lines[7]).toBe('"In-house revenue by day (₹)","Consultation","Pharmacy","Total"');
    expect(lines[8]).toBe('"2026-09-26","500","25","525"');
    expect(lines[11]).toBe('"\'=Asha Rao","500","25","525"');
  });

  it('at a Tier 3 clinic adds IPD and total columns, leaving OPD cells empty for IPD-only rows', () => {
    const t3: OrdersReport = {
      ...report,
      departments: ['CONSULTATION', 'PHARMACY', 'ROOM'],
      hasIpd: true,
      summary: [cell('CONSULTATION', 500, 500, 800), cell('PHARMACY', 100, 25, 300), cell('ROOM', 0, 0, 2000)],
      byDay: [{ date: '2026-09-26', cells: [cell('CONSULTATION', 500, 500, 800), cell('PHARMACY', 100, 25, 300), cell('ROOM', 0, 0, 2000)] }],
      byDoctor: [],
    };
    const lines = ordersToCsv(t3).split('\r\n');
    expect(lines[2]).toBe(
      '"Department","OPD prescribed / ordered (₹)","OPD done in-house (₹)","OPD not done in-house (₹)","In-house %","IPD (₹)","Total revenue (₹)"',
    );
    expect(lines[3]).toBe('"Consultation","500","500","0","100","800","1300"');
    expect(lines[5]).toBe('"Room charges","","","","","2000","2000"');
    expect(lines[6]).toBe('"Total","600","525","75","88","3100","3625"');
    expect(lines[9]).toBe('"2026-09-26","1300","325","2000","3625"');
  });
});
