import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import type { FoodTiming, Gender, Prescription, VisitSummary, Vitals } from '@opd/shared';
import { prisma } from '../prisma';
import { HttpError } from '../middleware/errorHandler';
import { toPrescription } from './serialize';
import { currentAge, withPatient } from './patients';

// The clinic's local time for "when was this visit"; every clinic so far is
// in India.
const CLINIC_TZ = 'Asia/Kolkata';

export async function loadVisitSummary(clinicId: string, appointmentId: string): Promise<VisitSummary> {
  const found = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId },
    include: {
      clinic: true,
      patient: { include: { patientProfile: true } },
      doctor: { include: { user: true } },
      consultation: { include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true } },
    },
  });
  if (!found) throw new HttpError(404, 'Visit not found');
  const appointment = withPatient(found);
  const c = appointment.consultation;
  if (!c) throw new HttpError(404, 'No consultation recorded for this visit yet');

  // Visits are numbered per patient, oldest first, counting consulted ones.
  const earlier = await prisma.appointment.findMany({
    where: { clinicId, patientId: appointment.patientId, consultation: { isNot: null } },
    select: { id: true, date: true, tokenNumber: true },
    orderBy: [{ date: 'asc' }, { tokenNumber: 'asc' }, { createdAt: 'asc' }],
  });
  const visitNumber = earlier.findIndex((a) => a.id === appointment.id) + 1;

  const profile = appointment.patient.patientProfile;
  return {
    appointmentId: appointment.id,
    visitNumber,
    date: appointment.date.toISOString().slice(0, 10),
    time: c.createdAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: CLINIC_TZ }),
    clinic: {
      name: appointment.clinic.name,
      address: appointment.clinic.address,
      phone: appointment.clinic.phone,
      logoUrl: appointment.clinic.logoUrl,
    },
    doctor: {
      name: appointment.doctor.user.name,
      specialization: appointment.doctor.specialization,
      qualification: appointment.doctor.qualification,
      registrationNumber: appointment.doctor.registrationNumber,
    },
    patient: {
      id: appointment.patientId,
      name: appointment.patient.name,
      patientCode: profile?.patientCode ?? '',
      age: profile ? currentAge(profile) : null,
      gender: (profile?.gender as Gender | null) ?? null,
      phone: appointment.patient.phone,
    },
    symptoms: [c.chiefComplaint, c.presentIllness].filter((s): s is string => !!s),
    diagnosis: c.diagnosis,
    vitals: (c.vitals as Vitals | null) ?? null,
    prescriptions: c.prescriptions.map(toPrescription),
    labTests: c.labTestsOrdered.map((o) => ({ name: o.testName, notes: o.notes })),
    radiology: c.radiologyOrdered.map((o) => ({ name: o.testName, notes: o.notes })),
    advice: c.notes,
    imagingAdvice: c.imagingAdvice,
    followUpDate: c.followUpDate ? c.followUpDate.toISOString().slice(0, 10) : null,
  };
}

// ---- Wording shared by the PDF (the web print page has its own copy) ----

export const FOOD_TIMING_LABEL: Record<FoodTiming, string> = {
  BEFORE_FOOD: 'before food',
  AFTER_FOOD: 'after food',
  WITH_FOOD: 'with food',
  EMPTY_STOMACH: 'on an empty stomach',
};

export function whenToTake(p: Prescription): string {
  const times = [p.morning && 'Morning', p.afternoon && 'Afternoon', p.night && 'Night'].filter(Boolean).join(', ');
  const base = times || p.frequency;
  const dose = p.dosage && p.dosage !== '1' ? `${p.dosage} · ` : '';
  return `${dose}${base}${p.foodTiming ? `, ${FOOD_TIMING_LABEL[p.foodTiming]}` : ''}`;
}

// "Dolo 650 (Paracetamol 650 mg)" with a brand, else "Paracetamol (650 mg)".
export function medicineLabel(p: Pick<Prescription, 'medicine' | 'strength' | 'brand'>): string {
  if (p.brand) return `${p.brand} (${p.medicine}${p.strength ? ` ${p.strength}` : ''})`;
  return `${p.medicine}${p.strength ? ` (${p.strength})` : ''}`;
}

export function bmi(v: Vitals | null): number | null {
  if (!v?.heightCm || !v.weightKg) return null;
  return Math.round((v.weightKg / (v.heightCm / 100) ** 2) * 10) / 10;
}

const SUGAR_TYPE: Record<string, string> = { FASTING: 'fasting', PP: 'PP', RANDOM: 'random' };

// Every vital recorded, as short "label value" chips.
export function vitalChips(v: Vitals | null): string[] {
  if (!v) return [];
  const chips: (string | false)[] = [
    v.tempF != null ? `Temp ${v.tempF}°F` : v.tempC != null && `Temp ${v.tempC}°C`,
    v.pulse != null && `Pulse ${v.pulse} bpm`,
    (v.bpSystolic != null || v.bpDiastolic != null) && `BP ${v.bpSystolic ?? '–'}/${v.bpDiastolic ?? '–'} mmHg`,
    v.respiratoryRate != null && `RR ${v.respiratoryRate}/min`,
    v.spo2 != null && `SpO2 ${v.spo2}%`,
    v.weightKg != null && `Weight ${v.weightKg} kg`,
    v.heightCm != null && `Height ${v.heightCm} cm`,
    bmi(v) != null && `BMI ${bmi(v)}`,
    v.bloodSugar != null &&
      `Sugar ${v.bloodSugar} mg/dL${v.bloodSugarType ? ` (${SUGAR_TYPE[v.bloodSugarType]})` : ''}`,
  ];
  return chips.filter((c): c is string => !!c);
}

export function formatDisplayDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function doctorTitle(name: string): string {
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}

const GENDER_SHORT: Record<Gender, string> = { MALE: 'M', FEMALE: 'F', OTHER: 'O' };

// ---- PDF ----

const TEAL = '#0B6259';
const GREY = '#6B7280';
const DARK = '#111827';

export function renderVisitSummaryPdf(s: VisitSummary): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Visit Summary — ${s.patient.name}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    // Header: clinic on the left, title on the right.
    const top = doc.y;
    doc.font('Helvetica-Bold').fontSize(16).fillColor(TEAL).text(s.clinic.name, left, top, { width: width * 0.6 });
    doc.font('Helvetica').fontSize(9).fillColor(GREY);
    if (s.clinic.address) doc.text(s.clinic.address, { width: width * 0.6 });
    if (s.clinic.phone) doc.text(`Phone: ${s.clinic.phone}`, { width: width * 0.6 });
    const leftBottom = doc.y;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(DARK).text('Visit Summary', left, top, { width, align: 'right' });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(GREY)
      .text(`Visit ${s.visitNumber} · ${formatDisplayDate(s.date)}${s.time ? ` · ${s.time}` : ''}`, { width, align: 'right' });
    doc.y = Math.max(leftBottom, doc.y) + 8;
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(TEAL).lineWidth(1.5).stroke();
    doc.moveDown(0.6);

    // Patient block.
    const ageSex = [s.patient.age != null ? `${s.patient.age} yrs` : null, s.patient.gender ? GENDER_SHORT[s.patient.gender] : null]
      .filter(Boolean)
      .join(' / ');
    const rows: [string, string][] = [
      ['Patient', s.patient.name],
      ['Patient ID', s.patient.patientCode],
      ['Age / Sex', ageSex || '—'],
      ['Doctor', `${doctorTitle(s.doctor.name)}${s.doctor.qualification ? `, ${s.doctor.qualification}` : ''}`],
    ];
    const colW = width / 2;
    rows.forEach(([label, value], i) => {
      const x = left + (i % 2) * colW;
      const y = doc.y;
      doc.font('Helvetica').fontSize(8).fillColor(GREY).text(label.toUpperCase(), x, y, { width: colW - 8 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(value, x, doc.y, { width: colW - 8 });
      if (i % 2 === 0) doc.y = y;
      else doc.moveDown(0.5);
    });
    doc.x = left;

    const heading = (text: string) => {
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(TEAL).text(text.toUpperCase(), left, doc.y, { width, characterSpacing: 0.5 });
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(10).fillColor(DARK);
    };
    const para = (text: string) => doc.text(text, left, doc.y, { width });
    const bullets = (items: { name: string; notes: string | null }[]) =>
      items.forEach((i) => para(`•  ${i.name}${i.notes ? ` — ${i.notes}` : ''}`));

    if (s.symptoms.length) {
      heading('Symptoms');
      s.symptoms.forEach(para);
    }
    if (s.diagnosis) {
      heading('Diagnosis');
      para(s.diagnosis);
    }
    const chips = vitalChips(s.vitals);
    if (chips.length) {
      heading('Vitals');
      para(chips.join('   ·   '));
    }

    if (s.prescriptions.length) {
      heading('Prescription');
      const cols = [
        { title: 'Medicine', w: 0.28 },
        { title: 'When to take', w: 0.27 },
        { title: 'Duration', w: 0.13 },
        { title: 'Instructions', w: 0.22 },
        { title: 'Total', w: 0.1 },
      ].map((c) => ({ ...c, w: c.w * width }));
      const drawRow = (cells: string[], bold = false) => {
        const y = doc.y;
        let x = left;
        let maxY = y;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 8 : 9.5).fillColor(bold ? GREY : DARK);
        cells.forEach((text, i) => {
          doc.text(text, x + 2, y, { width: cols[i]!.w - 6 });
          maxY = Math.max(maxY, doc.y);
          x += cols[i]!.w;
        });
        doc.y = maxY + 4;
        doc.moveTo(left, doc.y - 2).lineTo(left + width, doc.y - 2).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
      };
      drawRow(cols.map((c) => c.title.toUpperCase()), true);
      s.prescriptions.forEach((p) =>
        drawRow([
          medicineLabel(p),
          whenToTake(p),
          `${p.durationDays} day(s)`,
          p.notes ?? '',
          p.totalToDispense != null ? String(p.totalToDispense) : '—',
        ]),
      );
      doc.x = left;
    }

    if (s.labTests.length) {
      heading('Investigations / lab tests advised');
      bullets(s.labTests);
    }
    if (s.radiology.length) {
      heading('Radiology work prescribed');
      bullets(s.radiology);
    }
    if (s.imagingAdvice) {
      heading('Ultrasound / imaging advice');
      para(s.imagingAdvice);
    }
    if (s.advice) {
      heading("Doctor's advice");
      para(s.advice);
    }

    // Footer: follow-up on the left, signature on the right.
    doc.moveDown(2.5);
    const footY = doc.y;
    if (s.followUpDate) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(`Follow-up: ${formatDisplayDate(s.followUpDate)}`, left, footY + 18);
    }
    const sigX = left + width * 0.6;
    doc.moveTo(sigX, footY + 14).lineTo(left + width, footY + 14).strokeColor(GREY).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(GREY).text("Doctor's signature", sigX, footY + 18, { width: width * 0.4, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(doctorTitle(s.doctor.name), sigX, doc.y, { width: width * 0.4, align: 'right' });
    const creds = [s.doctor.qualification, s.doctor.registrationNumber && `Reg. No. ${s.doctor.registrationNumber}`]
      .filter(Boolean)
      .join(' · ');
    if (creds) doc.font('Helvetica').fontSize(8).fillColor(GREY).text(creds, sigX, doc.y, { width: width * 0.4, align: 'right' });

    doc.end();
  });
}

export function visitSummaryFileName(s: VisitSummary): string {
  const safe = s.patient.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `Visit_Summary_${s.patient.patientCode || safe}_${s.date}.pdf`;
}

// ---- Signed links (what the WhatsApp message carries) ----
//
// WhatsApp fetches a document from a public URL, so the summary gets a
// signed, expiring link instead of needing a login: HMAC over the visit id
// and expiry with the server's secret, so it can't be forged or extended.

const LINK_TTL_MS = 30 * 24 * 3600 * 1000;

function sign(payload: string): string {
  return crypto.createHmac('sha256', process.env.JWT_SECRET!).update(`visit-summary:${payload}`).digest('base64url');
}

export function createSummaryToken(appointmentId: string, now = Date.now()): string {
  const payload = `${appointmentId}.${Math.floor((now + LINK_TTL_MS) / 1000)}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

export function verifySummaryToken(token: string, now = Date.now()): string | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const payload = Buffer.from(encoded, 'base64url').toString();
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  const [appointmentId, exp] = payload.split('.');
  if (!appointmentId || !exp || Number(exp) * 1000 < now) return null;
  return appointmentId;
}
