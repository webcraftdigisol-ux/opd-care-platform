import type { ConsentKind } from '@opd/shared';

export const CONSENT_KIND_LABEL: Record<ConsentKind, string> = {
  PROCEDURE: 'Procedure',
  SURGERY: 'Surgery / operation',
  ANAESTHESIA: 'Anaesthesia',
  BLOOD_TRANSFUSION: 'Blood transfusion',
  HIGH_RISK: 'High-risk consent',
};

// Printed title of each form.
export const CONSENT_TITLE: Record<ConsentKind, string> = {
  PROCEDURE: 'Informed Consent for Procedure',
  SURGERY: 'Informed Consent for Surgery / Operation',
  ANAESTHESIA: 'Informed Consent for Anaesthesia',
  BLOOD_TRANSFUSION: 'Informed Consent for Blood Transfusion',
  HIGH_RISK: 'High-Risk Informed Consent',
};

// Hints for the "risks" box -- the doctor writes the actual risks.
export const RISK_HINT: Record<ConsentKind, string> = {
  PROCEDURE: 'e.g. pain, bleeding, infection, failure of the procedure',
  SURGERY: 'e.g. bleeding, infection, injury to nearby organs, need for further surgery',
  ANAESTHESIA: 'e.g. nausea, sore throat, allergic reaction, breathing difficulty',
  BLOOD_TRANSFUSION: 'e.g. fever, allergic reaction, fluid overload, transfusion reaction',
  HIGH_RISK: 'State why this is high risk and the specific dangers, including to life',
};

export const RELATIONS = ['Self', 'Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Guardian', 'Other'];

// The declaration the patient (or guardian) signs, in plain words.
export function consentDeclaration(kind: ConsentKind, procedure: string, doctor: string): string[] {
  const what = kind === 'BLOOD_TRANSFUSION' ? 'the transfusion of blood / blood components' : kind === 'ANAESTHESIA' ? `anaesthesia for ${procedure}` : procedure;
  return [
    `I, the undersigned, give my consent for ${what}, to be performed by ${doctor} and the team they choose, at this hospital.`,
    'The nature and purpose of the above, the expected benefits, the risks and possible complications, and the alternatives (including not having it) have been explained to me in a language I understand. I have been able to ask questions and they have been answered to my satisfaction.',
    'I understand that no guarantee has been given about the result. I consent to any additional or different procedure, anaesthesia or treatment that the doctors consider necessary in an emergency during the course of the above, in my interest.',
    kind === 'HIGH_RISK'
      ? 'I understand that this carries a high risk, including risk to life, and I give my consent knowing this.'
      : 'I consent to the administration of anaesthesia and medicines as may be considered necessary.',
    'I am signing this form voluntarily, in a sound state of mind, after understanding its contents.',
  ];
}
