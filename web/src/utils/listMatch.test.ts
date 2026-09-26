import { describe, expect, it } from 'vitest';
import { medicineInList, testInList, unlistedItems } from './listMatch';

const lists = {
  medicines: [
    { name: 'Paracetamol', strength: '650 mg', brands: ['Dolo 650', 'Calpol 650'] },
    { name: 'Chyawanprash', strength: null, brands: [] },
  ],
  labTests: ['CBC', 'Lipid Profile'],
  radiology: ['X-Ray Chest PA'],
};

describe('list matching', () => {
  it('matches a medicine on name and strength, and the brand when one is given', () => {
    expect(medicineInList(lists.medicines, { medicine: 'paracetamol', strength: '650 MG' })).toBe(true);
    expect(medicineInList(lists.medicines, { medicine: 'Paracetamol', strength: '650 mg', brand: 'Dolo 650' })).toBe(true);
    expect(medicineInList(lists.medicines, { medicine: 'Paracetamol', strength: '650 mg', brand: 'Crocin 650' })).toBe(false);
    expect(medicineInList(lists.medicines, { medicine: 'Paracetamol', strength: '500 mg' })).toBe(false);
    expect(medicineInList(lists.medicines, { medicine: 'Chyawanprash', strength: '' })).toBe(true);
    expect(testInList(lists.labTests, ' cbc ')).toBe(true);
    expect(testInList(lists.labTests, 'HbA1c')).toBe(false);
  });

  it('lists what is missing, ignoring blank rows', () => {
    expect(
      unlistedItems(
        lists,
        [
          { medicine: 'Paracetamol', strength: '650 mg', brand: 'Dolo 650' },
          { medicine: 'Ashwagandha Churna', strength: '100 g', brand: '' },
          { medicine: ' ', strength: '' },
        ],
        [{ testName: 'CBC' }, { testName: 'HbA1c' }],
        [{ testName: 'MRI Knee' }, { testName: '' }],
      ),
    ).toEqual(['Ashwagandha Churna 100 g', 'HbA1c', 'MRI Knee']);
  });
});
