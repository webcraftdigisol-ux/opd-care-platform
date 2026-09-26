import type { Department, PharmacyItem } from '@opd/shared';
import type { IconName } from '../components/Icon';
import { medicineLabel } from './visitFormat';

export interface DeptInfo {
  dept: Department;
  label: string; // "Pharmacy"
  base: '/pharmacy' | '/lab' | '/radiology';
  icon: IconName;
  // What a line is, in the UI's words.
  item: string; // "medicine" / "test" / "scan"
  items: string;
  doneVerb: string; // "Dispensed" / "Done"
  listTitle: string; // the settings list
}

export const DEPTS: Record<Department, DeptInfo> = {
  PHARMACY: {
    dept: 'PHARMACY',
    label: 'Pharmacy',
    base: '/pharmacy',
    icon: 'pill',
    item: 'medicine',
    items: 'medicines',
    doneVerb: 'Dispensed',
    listTitle: 'Medicine list',
  },
  LAB: {
    dept: 'LAB',
    label: 'Laboratory',
    base: '/lab',
    icon: 'flask',
    item: 'test',
    items: 'tests',
    doneVerb: 'Done',
    listTitle: 'Test list',
  },
  RADIOLOGY: {
    dept: 'RADIOLOGY',
    label: 'Radiology',
    base: '/radiology',
    icon: 'scan',
    item: 'scan',
    items: 'scans',
    doneVerb: 'Done',
    listTitle: 'Radiology list',
  },
};

// "Dolo 650 (Paracetamol 650 mg)", matching the prescription's label.
export function productLabel(p: Pick<PharmacyItem, 'name' | 'strength' | 'brand'>): string {
  return medicineLabel({ medicine: p.name, strength: p.strength, brand: p.brand });
}

// Why a line isn't being done here, offered as quick picks.
export const SKIP_REASONS: Record<Department, string[]> = {
  PHARMACY: ['Not in stock', 'Patient declined', 'Buying outside'],
  LAB: ['Test not available', 'Patient declined', 'Getting it done outside'],
  RADIOLOGY: ['Scan not available', 'Patient declined', 'Getting it done outside'],
};

export const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
