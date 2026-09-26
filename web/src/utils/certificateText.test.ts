import { describe, expect, it } from 'vitest';
import { certificateBody, daysBetween } from './certificateText';

const facts = { name: 'Kiran Joshi', age: 34, gender: 'FEMALE' as const, diagnosis: 'acute viral fever', fromDate: '2026-09-24', toDate: '2026-09-27', purpose: '', today: '2026-09-26' };

describe('certificate wording', () => {
  it('writes a sick-leave certificate with the rest period and its length', () => {
    expect(certificateBody('SICK_LEAVE', facts)).toBe(
      'This is to certify that Ms. Kiran Joshi, aged 34 years, has been under my treatment for acute viral fever. She was advised rest from 24 September 2026 to 27 September 2026 (4 days) for recovery.',
    );
  });

  it('writes a fitness certificate for a purpose, and uses neutral wording when sex is unknown', () => {
    expect(certificateBody('MEDICAL_FITNESS', { ...facts, gender: null, age: null, purpose: 'joining duty at XYZ Ltd' })).toBe(
      'This is to certify that I have examined Kiran Joshi on 26 September 2026. On examination, they are found to be in good general health, with no evidence of any communicable disease, and are medically fit for joining duty at XYZ Ltd.',
    );
  });

  it('leaves blanks to fill when a date is missing, and counts days inclusively', () => {
    expect(certificateBody('FIT_TO_RESUME', { ...facts, fromDate: '' })).toContain('from __________.');
    expect(daysBetween('2026-09-24', '2026-09-24')).toBe(1);
    expect(daysBetween('2026-09-25', '2026-09-24')).toBeNull();
  });
});
