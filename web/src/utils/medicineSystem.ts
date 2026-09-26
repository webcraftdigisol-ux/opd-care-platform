import type { MedicineSystem } from '@opd/shared';

export const MEDICINE_SYSTEMS: { value: MedicineSystem; label: string; hint: string }[] = [
  { value: 'ALLOPATHIC', label: 'Allopathic', hint: 'Modern medicine — generics and Indian brands' },
  { value: 'AYURVEDIC', label: 'Ayurvedic', hint: 'Churna, vati, guggulu, arishta, bhasma, taila and proprietary Ayurvedic brands' },
  { value: 'HOMEOPATHIC', label: 'Homeopathic', hint: 'Dilutions (30C, 200C, 1M), mother tinctures, biochemics and patent remedies' },
  { value: 'MIXED', label: 'Mix of all', hint: 'Allopathic, Ayurvedic and Homeopathic lists together' },
];

export const medicineSystemLabel = (s: MedicineSystem | undefined) => MEDICINE_SYSTEMS.find((m) => m.value === s)?.label ?? 'Allopathic';
