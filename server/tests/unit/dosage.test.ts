import { suggestPharmacyQuantity } from '../../src/utils/dosage';

describe('suggestPharmacyQuantity', () => {
  it('multiplies known frequency codes by duration', () => {
    expect(suggestPharmacyQuantity('BD', 5)).toBe(10); // twice daily x 5 days
    expect(suggestPharmacyQuantity('TDS', 3)).toBe(9); // thrice daily x 3 days
    expect(suggestPharmacyQuantity('OD', 7)).toBe(7); // once daily x 7 days
  });

  it('is case-insensitive on the frequency code', () => {
    expect(suggestPharmacyQuantity('bid', 4)).toBe(8);
  });

  it('sums a dash-separated dose pattern like 1-0-1', () => {
    expect(suggestPharmacyQuantity('1-0-1', 5)).toBe(10); // 2 doses/day x 5 days
    expect(suggestPharmacyQuantity('1-1-1', 3)).toBe(9); // 3 doses/day x 3 days
  });

  it('defaults unknown free-text frequency to once daily rather than throwing', () => {
    expect(suggestPharmacyQuantity('as needed', 5)).toBe(5);
  });

  it('never suggests fewer than 1 unit even for a zero/negative duration', () => {
    expect(suggestPharmacyQuantity('OD', 0)).toBe(1);
    expect(suggestPharmacyQuantity('OD', -3)).toBe(1);
  });
});
