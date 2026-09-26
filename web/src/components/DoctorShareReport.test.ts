import { describe, expect, it } from 'vitest';
import { doctorShareCsv } from './DoctorShareReport';

describe('doctorShareCsv', () => {
  it('writes a row per doctor and department, with no share for over-the-counter sales', () => {
    const csv = doctorShareCsv({
      from: '2026-09-01',
      to: '2026-09-30',
      rows: [
        { doctorId: 'd1', doctorName: 'Asha Rao', department: 'LAB', revenue: 300, cost: 100, profit: 200, percent: 20, share: 40 },
        { doctorId: null, doctorName: 'Over the counter (no doctor)', department: 'PHARMACY', revenue: 10, cost: 6, profit: 4, percent: 0, share: 0 },
      ],
      totals: { revenue: 310, cost: 106, profit: 204, share: 40 },
    }).split('\r\n');
    expect(csv).toEqual([
      '"Doctor share 2026-09-01 to 2026-09-30"',
      '"Doctor","Department","Revenue","Cost","Profit","Share %","Doctor\'s share"',
      '"Asha Rao","Laboratory","300","100","200","20","40"',
      '"Over the counter (no doctor)","Pharmacy","10","6","4","",""',
      '"Total","","310","106","204","","40"',
    ]);
  });
});
