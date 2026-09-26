import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { toConsultation, toNotification, patientWithCode } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';
import { notifyPatientWhatsApp } from '../utils/whatsapp';
import { frequencyFromTicks } from '../utils/dosage';
import {
  createSummaryToken,
  doctorTitle,
  formatDisplayDate,
  loadVisitSummary,
  renderVisitSummaryPdf,
  visitSummaryFileName,
} from '../utils/visitSummary';
import type { Request } from 'express';

export const consultationsRouter = Router();

consultationsRouter.use(requireAuth);

const prescriptionSchema = z
  .object({
    medicine: z.string().trim().min(1),
    strength: z.string().trim().nullish(),
    dosage: z.string().trim().optional(),
    morning: z.boolean().optional(),
    afternoon: z.boolean().optional(),
    night: z.boolean().optional(),
    frequency: z.string().trim().optional(),
    foodTiming: z.enum(['BEFORE_FOOD', 'AFTER_FOOD', 'WITH_FOOD', 'EMPTY_STOMACH']).nullish(),
    durationDays: z.number().int().positive(),
    notes: z.string().optional(),
  })
  .refine((p) => p.morning || p.afternoon || p.night || p.frequency, {
    message: 'Each medicine needs a time of day (morning/afternoon/night) or a frequency',
  })
  // Ticks win: the stored frequency is always what the pharmacy reads.
  .transform((p) => {
    const ticked = !!(p.morning || p.afternoon || p.night);
    return {
      medicine: p.medicine,
      strength: p.strength || null,
      dosage: p.dosage || '1',
      morning: !!p.morning,
      afternoon: !!p.afternoon,
      night: !!p.night,
      frequency: ticked ? frequencyFromTicks(p) : p.frequency!,
      foodTiming: p.foodTiming ?? null,
      durationDays: p.durationDays,
      notes: p.notes || null,
    };
  });

const labOrderSchema = z.object({
  testName: z.string().min(1),
  notes: z.string().optional(),
});

const radiologyOrderSchema = z.object({
  testName: z.string().min(1),
  notes: z.string().optional(),
});

const vitalsSchema = z
  .object({
    bpSystolic: z.number().optional(),
    bpDiastolic: z.number().optional(),
    pulse: z.number().optional(),
    tempF: z.number().optional(),
    tempC: z.number().optional(),
    respiratoryRate: z.number().optional(),
    weightKg: z.number().optional(),
    heightCm: z.number().optional(),
    spo2: z.number().optional(),
    bloodSugar: z.number().optional(),
    bloodSugarType: z.enum(['FASTING', 'PP', 'RANDOM']).optional(),
  })
  .optional();

// Free-text fields: undefined leaves the saved value alone, blank clears it.
const text = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : v.trim() || null));

const saveSchema = z.object({
  vitals: vitalsSchema,
  chiefComplaint: text,
  presentIllness: text,
  relevantHistory: text,
  diagnosis: text,
  differentialDiagnosis: text,
  notes: text,
  imagingAdvice: text,
  doctorNotes: text,
  consultationFee: z.number().nonnegative().optional(),
  // "" clears the follow-up.
  followUpDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional(),
  prescriptions: z.array(prescriptionSchema).optional(),
  labTestsOrdered: z.array(labOrderSchema).optional(),
  radiologyOrdered: z.array(radiologyOrderSchema).optional(),
  complete: z.boolean().optional(),
});

async function assertOwnsAppointment(req: AuthedRequest, appointmentId: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: req.auth!.clinicId },
  });
  if (!appointment) throw new HttpError(404, 'Appointment not found');
  if (req.auth!.role === 'DOCTOR') {
    const doctor = await prisma.doctorProfile.findUnique({ where: { userId: req.auth!.userId } });
    if (!doctor || doctor.id !== appointment.doctorId) {
      throw new HttpError(403, 'Not your appointment');
    }
  }
  return appointment;
}

consultationsRouter.put(
  '/:appointmentId',
  requireRole('DOCTOR', 'ADMIN'), // admin can do everything (clinic owner is often the doctor)
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = saveSchema.parse(req.body);
    const appointment = await assertOwnsAppointment(req, req.params.appointmentId);

    const followUpDate =
      data.followUpDate === undefined ? undefined : data.followUpDate ? new Date(`${data.followUpDate}T00:00:00.000Z`) : null;

    if (data.consultationFee !== undefined && data.consultationFee !== appointment.consultationFee) {
      const paid = await prisma.payment.aggregate({
        where: { clinicId: appointment.clinicId, billType: 'CONSULTATION', billId: appointment.id },
        _sum: { amount: true },
      });
      if (data.consultationFee + 0.01 < (paid._sum.amount ?? 0)) {
        throw new HttpError(400, `₹${paid._sum.amount} has already been paid for this visit; the fee can't be lower than that`);
      }
    }

    const fields = {
      vitals: data.vitals ?? undefined,
      chiefComplaint: data.chiefComplaint,
      presentIllness: data.presentIllness,
      relevantHistory: data.relevantHistory,
      diagnosis: data.diagnosis,
      differentialDiagnosis: data.differentialDiagnosis,
      notes: data.notes,
      imagingAdvice: data.imagingAdvice,
      doctorNotes: data.doctorNotes,
      followUpDate,
    };

    const consultation = await prisma.$transaction(async (tx) => {
      const existing = await tx.consultation.findUnique({ where: { appointmentId: appointment.id } });
      // A moved follow-up date gets its reminders afresh.
      const followUpMoved =
        existing && followUpDate !== undefined && existing.followUpDate?.getTime() !== followUpDate?.getTime();
      const saved = existing
        ? await tx.consultation.update({
            where: { appointmentId: appointment.id },
            data: {
              ...fields,
              ...(followUpMoved
                ? { followUpReminderSentAt: null, followUpDayReminderSentAt: null, followUpContacted: false }
                : {}),
            },
          })
        : await tx.consultation.create({ data: { appointmentId: appointment.id, ...fields } });

      if (data.prescriptions) {
        await tx.prescription.deleteMany({ where: { consultationId: saved.id } });
        if (data.prescriptions.length > 0) {
          await tx.prescription.createMany({
            data: data.prescriptions.map((p) => ({ ...p, consultationId: saved.id })),
          });
        }
      }

      if (data.labTestsOrdered) {
        await tx.labTestOrder.deleteMany({ where: { consultationId: saved.id } });
        if (data.labTestsOrdered.length > 0) {
          await tx.labTestOrder.createMany({
            data: data.labTestsOrdered.map((o) => ({ ...o, consultationId: saved.id })),
          });
        }
      }

      if (data.radiologyOrdered) {
        await tx.radiologyTestOrder.deleteMany({ where: { consultationId: saved.id } });
        if (data.radiologyOrdered.length > 0) {
          await tx.radiologyTestOrder.createMany({
            data: data.radiologyOrdered.map((o) => ({ ...o, consultationId: saved.id })),
          });
        }
      }

      await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          // Editing an already-completed visit later keeps it completed.
          status: data.complete || appointment.status === 'COMPLETED' ? 'COMPLETED' : 'IN_CONSULTATION',
          ...(data.consultationFee !== undefined ? { consultationFee: data.consultationFee } : {}),
        },
      });

      return tx.consultation.findUniqueOrThrow({
        where: { id: saved.id },
        include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true },
      });
    });

    res.json(toConsultation(consultation));
  }),
);

consultationsRouter.get(
  '/:appointmentId',
  asyncHandler(async (req: AuthedRequest, res) => {
    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.appointmentId, clinicId: req.auth!.clinicId },
    });
    if (!appointment) throw new HttpError(404, 'Appointment not found');

    if (req.auth!.role === 'PATIENT' && appointment.patientId !== req.auth!.userId) {
      throw new HttpError(403, 'Not your appointment');
    }
    if (req.auth!.role === 'DOCTOR') {
      const doctor = await prisma.doctorProfile.findUnique({ where: { userId: req.auth!.userId } });
      if (!doctor || doctor.id !== appointment.doctorId) {
        throw new HttpError(403, 'Not your appointment');
      }
    }

    const consultation = await prisma.consultation.findUnique({
      where: { appointmentId: appointment.id },
      include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true },
    });
    if (!consultation) throw new HttpError(404, 'No consultation recorded yet');
    res.json(toConsultation(consultation));
  }),
);

consultationsRouter.post(
  '/:appointmentId/send-prescription-whatsapp',
  requireRole('DOCTOR', 'ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const owned = await assertOwnsAppointment(req, req.params.appointmentId);
    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: owned.id },
      include: { patient: patientWithCode, doctor: { include: { user: true } } },
    });
    const consultation = await prisma.consultation.findUnique({
      where: { appointmentId: appointment.id },
      include: { prescriptions: true },
    });
    if (!consultation) throw new HttpError(404, 'No consultation recorded yet');
    if (consultation.prescriptions.length === 0) throw new HttpError(400, 'This consultation has no prescriptions to send');

    const medicineList = consultation.prescriptions
      .map((p) => `${p.medicine} — ${p.dosage}, ${p.frequency}, ${p.durationDays} day(s)${p.notes ? ` (${p.notes})` : ''}`)
      .join('\n');

    const notification = await notifyPatientWhatsApp({
      clinicId: req.auth!.clinicId,
      patientId: appointment.patientId,
      type: 'PRESCRIPTION_SHARED',
      to: appointment.patient.phone,
      optedIn: appointment.patient.whatsappOptIn,
      templateName: 'prescription_shared',
      params: [appointment.patient.name, appointment.doctor.user.name, medicineList],
      renderedBody: `Hi ${appointment.patient.name}, here is your prescription from Dr. ${appointment.doctor.user.name}:\n\n${medicineList}`,
    });
    res.json(toNotification(notification));
  }),
);

// ---- Visit summary (the patient's printout) ----

// Who can see a visit's summary: the patient themself, the visit's own
// doctor, and clinical staff -- not the front desk, same as the records.
async function assertCanSeeVisit(req: AuthedRequest, appointmentId: string) {
  const role = req.auth!.role;
  if (role === 'RECEPTIONIST') throw new HttpError(403, 'Not authorized to view clinical records');
  const appointment = await prisma.appointment.findFirst({ where: { id: appointmentId, clinicId: req.auth!.clinicId } });
  if (!appointment) throw new HttpError(404, 'Visit not found');
  if (role === 'PATIENT' && appointment.patientId !== req.auth!.userId) throw new HttpError(403, 'Not your visit');
  if (role === 'DOCTOR') {
    const doctor = await prisma.doctorProfile.findUnique({ where: { userId: req.auth!.userId } });
    if (!doctor || doctor.id !== appointment.doctorId) throw new HttpError(403, 'Not your visit');
  }
  return appointment;
}

consultationsRouter.get(
  '/:appointmentId/summary',
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertCanSeeVisit(req, req.params.appointmentId);
    res.json(await loadVisitSummary(req.auth!.clinicId, req.params.appointmentId));
  }),
);

consultationsRouter.get(
  '/:appointmentId/summary.pdf',
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertCanSeeVisit(req, req.params.appointmentId);
    const summary = await loadVisitSummary(req.auth!.clinicId, req.params.appointmentId);
    const pdf = await renderVisitSummaryPdf(summary);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${visitSummaryFileName(summary)}"`);
    res.send(pdf);
  }),
);

// Where WhatsApp can fetch the PDF from: PUBLIC_API_URL (e.g.
// https://api.ohmscare.in/api) or, failing that, the address this request
// came in on.
function publicApiBase(req: Request): string {
  if (process.env.PUBLIC_API_URL) return process.env.PUBLIC_API_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
  return `${proto}://${req.get('host')}/api`;
}

// Sends the Visit Summary PDF to the patient on WhatsApp (with their
// consent), as a document on the approved visit_summary template.
consultationsRouter.post(
  '/:appointmentId/send-summary-whatsapp',
  requireRole('DOCTOR', 'ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const owned = await assertOwnsAppointment(req, req.params.appointmentId);
    const summary = await loadVisitSummary(req.auth!.clinicId, owned.id);
    const patient = await prisma.user.findUniqueOrThrow({ where: { id: owned.patientId } });
    const link = `${publicApiBase(req)}/public/visit-summary/${createSummaryToken(owned.id)}`;
    const date = formatDisplayDate(summary.date);
    const notification = await notifyPatientWhatsApp({
      clinicId: req.auth!.clinicId,
      patientId: owned.patientId,
      type: 'VISIT_SUMMARY_SHARED',
      to: patient.phone,
      optedIn: patient.whatsappOptIn,
      templateName: 'visit_summary',
      params: [patient.name, summary.doctor.name, date],
      renderedBody: `Hi ${patient.name}, here is the summary of your visit with ${doctorTitle(summary.doctor.name)} on ${date}, with your prescription (PDF attached).`,
      document: { link, filename: visitSummaryFileName(summary) },
    });
    res.json(toNotification(notification));
  }),
);
