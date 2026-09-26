import { describe, expect, it } from 'vitest';
import { bmi, totalToDispense, vitalChips, vitalsWarnings, whenToTake } from './visitFormat';

describe('visit formatting', () => {
  it('works out the total to dispense from ticks or a dash pattern, not from SOS', () => {
    expect(totalToDispense({ medicine: 'P', morning: true, night: true, durationDays: 10 })).toBe(20);
    expect(totalToDispense({ medicine: 'P', frequency: '1-1-1', durationDays: 5 })).toBe(15);
    expect(totalToDispense({ medicine: 'P', frequency: 'BD', durationDays: 3 })).toBe(6);
    expect(totalToDispense({ medicine: 'P', frequency: 'SOS', durationDays: 3 })).toBeNull();
  });

  it('says when to take a medicine in words', () => {
    expect(whenToTake({ morning: true, afternoon: false, night: true, frequency: '1-0-1', dosage: '1', foodTiming: 'AFTER_FOOD' })).toBe(
      'Morning, Night, after food',
    );
    expect(whenToTake({ morning: false, afternoon: false, night: false, frequency: 'SOS', dosage: '5 ml', foodTiming: null })).toBe('5 ml · SOS');
  });

  it('computes BMI and lists every vital recorded, including RR and sugar', () => {
    expect(bmi({ heightCm: 160, weightKg: 93 })).toBe(36.3);
    expect(vitalChips({ tempF: 98, respiratoryRate: 18, bloodSugar: 210, bloodSugarType: 'RANDOM', heightCm: 160, weightKg: 93 })).toEqual([
      '98°F',
      'RR 18/min',
      '93 kg',
      '160 cm',
      'BMI 36.3',
      'Sugar 210 mg/dL (random)',
    ]);
  });

  it('flags implausible vitals without blocking', () => {
    expect(vitalsWarnings({ bpSystolic: 80, bpDiastolic: 120, respiratoryRate: 78 })).toHaveLength(2);
    expect(vitalsWarnings({ bpSystolic: 120, bpDiastolic: 80, respiratoryRate: 16, spo2: 98 })).toEqual([]);
  });
});
