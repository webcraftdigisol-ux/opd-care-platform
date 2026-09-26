import { describe, expect, it } from 'vitest';
import type { TransactionsReport } from '@opd/shared';
import { toCsv } from './RevenueReport';

describe('revenue CSV export', () => {
  it('quotes every cell, doubles quotes, neutralises formulas and adds a totals row', () => {
    const report: TransactionsReport = {
      from: '2026-09-01',
      to: '2026-09-30',
      rows: [
        {
          billType: 'CONSULTATION',
          billId: 'a',
          date: '2026-09-26T05:30:00.000Z',
          patientId: 'p',
          patientName: '=HYPERLINK("x")',
          patientCode: 'PT000001',
          doctorName: 'Asha "Doc" Rao',
          description: 'OPD consultation, Viral fever',
          billed: 500,
          collected: 200,
          outstanding: 300,
          status: 'PARTLY_PAID',
        },
      ],
      byDay: [],
      byType: [],
      byMethod: [],
      totals: { count: 1, billed: 500, collected: 200, outstanding: 300 },
    };
    const lines = toCsv(report).split('\r\n');
    expect(lines[0]).toBe('"Date","Time","Type","Patient","Patient ID","Doctor","Description","Status","Billed","Collected","Outstanding"');
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[1]).toContain('"Asha ""Doc"" Rao"');
    expect(lines[1]).toContain('"OPD consultation, Viral fever","Part paid","500","200","300"');
    expect(lines[2]).toBe('"Total","","","","","","1 record(s)","","500","200","300"');
  });
});
