import { describe, expect, it } from 'vitest';
import type { OrdersReport } from '@opd/shared';
import { ordersSummaryCsv, ordersToCsv } from './OrdersReport';

const report: OrdersReport = {
  from: '2026-09-01',
  to: '2026-09-30',
  summary: [{ department: 'PHARMACY', ordered: 2, inHouse: 1, substituted: 1, notDone: 1, pending: 0, revenue: 20 }],
  byItem: [
    { department: 'PHARMACY', name: 'Dolo 650 (Paracetamol 650 mg)', ordered: 1, inHouse: 1, revenue: 20 },
    { department: 'PHARMACY', name: 'Pan 40 (Pantoprazole 40 mg)', ordered: 1, inHouse: 0, revenue: 0 },
  ],
  byDoctor: [],
  rows: [
    {
      date: '2026-09-26',
      department: 'PHARMACY',
      patientId: 'p',
      patientName: '@Meera',
      patientCode: 'PT000001',
      doctorId: 'd',
      doctorName: 'Asha Rao',
      ordered: 'Dolo 650 (Paracetamol 650 mg)',
      status: 'SUBSTITUTED',
      doneAs: 'Calpol 650 (Paracetamol 650 mg)',
      quantity: 10,
      amount: 20,
      note: null,
    },
  ],
};

describe('orders report CSV export', () => {
  it('writes one line per order with its in-house status, neutralising formula-like text', () => {
    const [header, line] = ordersToCsv(report).split('\r\n');
    expect(header).toBe('"Visit date","Department","Patient","Patient ID","Doctor","Ordered","Status","Done as","Quantity","Amount","Note"');
    expect(line).toBe(
      '"2026-09-26","Pharmacy","\'@Meera","PT000001","Asha Rao","Dolo 650 (Paracetamol 650 mg)","In-house (substitute)","Calpol 650 (Paracetamol 650 mg)","10","20",""',
    );
  });

  it('summarises by item with the in-house share, then a total per department', () => {
    const lines = ordersSummaryCsv(report).split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[2]).toBe('"Pharmacy","Pan 40 (Pantoprazole 40 mg)","1","0","0","0"');
    expect(lines[3]).toBe('"Pharmacy","Total","2","1","50","20"');
  });
});
