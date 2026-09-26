import type { CertificateType, Gender } from '@opd/shared';

export const CERTIFICATE_LABEL: Record<CertificateType, string> = {
  MEDICAL_FITNESS: 'Medical fitness certificate',
  SICK_LEAVE: 'Sick leave / medical certificate',
  FIT_TO_RESUME: 'Fitness to resume work / school',
  FIT_TO_TRAVEL: 'Fitness to travel',
  GENERAL: 'General medical certificate',
};

// Which details each certificate asks for, and what they're called.
export const CERTIFICATE_FIELDS: Record<CertificateType, { diagnosis?: string; fromDate?: string; toDate?: string; purpose?: string }> = {
  MEDICAL_FITNESS: { purpose: 'Fit for (purpose)' },
  SICK_LEAVE: { diagnosis: 'Illness / diagnosis', fromDate: 'Rest from', toDate: 'Rest until' },
  FIT_TO_RESUME: { diagnosis: 'Was treated for', fromDate: 'Fit to resume from', purpose: 'Resume (work, school, sports…)' },
  FIT_TO_TRAVEL: { diagnosis: 'Condition (if any)', purpose: 'Travel details' },
  GENERAL: { diagnosis: 'Diagnosis / findings', purpose: 'Required for' },
};

export interface CertificateFacts {
  name: string;
  age: number | null;
  gender: Gender | null;
  diagnosis: string;
  fromDate: string; // "YYYY-MM-DD" or ""
  toDate: string;
  purpose: string;
  today: string; // "YYYY-MM-DD"
}

const fmt = (d: string) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '__________';

export function daysBetween(from: string, to: string): number | null {
  if (!from || !to) return null;
  const n = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return n > 0 ? n : null;
}

// The suggested wording; the doctor can edit it before issuing.
export function certificateBody(type: CertificateType, f: CertificateFacts): string {
  const title = f.gender === 'MALE' ? 'Mr. ' : f.gender === 'FEMALE' ? 'Ms. ' : '';
  const they = f.gender === 'MALE' ? 'he' : f.gender === 'FEMALE' ? 'she' : 'they';
  const is = they === 'they' ? 'are' : 'is';
  const who = `${title}${f.name}${f.age != null ? `, aged ${f.age} years,` : ''}`;
  const diagnosis = f.diagnosis.trim() || '__________';
  switch (type) {
    case 'MEDICAL_FITNESS':
      return `This is to certify that I have examined ${who} on ${fmt(f.today)}. On examination, ${they} ${is} found to be in good general health, with no evidence of any communicable disease, and ${is} medically fit ${f.purpose.trim() ? `for ${f.purpose.trim()}` : 'to carry out normal duties'}.`;
    case 'SICK_LEAVE': {
      const days = daysBetween(f.fromDate, f.toDate);
      return `This is to certify that ${who} has been under my treatment for ${diagnosis}. ${cap(they)} ${they === 'they' ? 'were' : 'was'} advised rest from ${fmt(f.fromDate)} to ${fmt(f.toDate)}${days ? ` (${days} day${days === 1 ? '' : 's'})` : ''} for recovery.`;
    }
    case 'FIT_TO_RESUME':
      return `This is to certify that ${who} was under my treatment for ${diagnosis}. ${cap(they)} ${they === 'they' ? 'have' : 'has'} recovered and ${is} fit to resume ${f.purpose.trim() || 'normal duties'} from ${fmt(f.fromDate)}.`;
    case 'FIT_TO_TRAVEL':
      return `This is to certify that I have examined ${who} on ${fmt(f.today)}${f.diagnosis.trim() ? `, a known case of ${f.diagnosis.trim()}` : ''}. ${cap(they)} ${is} medically fit to travel${f.purpose.trim() ? ` (${f.purpose.trim()})` : ''}.`;
    case 'GENERAL':
      return `This is to certify that ${who} was examined by me on ${fmt(f.today)}.${f.diagnosis.trim() ? ` Findings / diagnosis: ${f.diagnosis.trim()}.` : ''}${f.purpose.trim() ? ` This certificate is issued on request for ${f.purpose.trim()}.` : ''}`;
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
