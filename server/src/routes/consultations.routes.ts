import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { toConsultation, toNotification } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';
import { notifyPatientWhatsApp } from '../utils/whatsapp';

export const consultationsRouter = Router();

consultationsRouter.use(requireAuth);

const prescriptionSchema = z.object({
  medicine: z.string().min(1),
  dosage: z.string().min(1),
  frequency: z.string().min(1),
  durationDays: z.number().int().positive(),
  notes: z.string().optional(),
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
    tempC: z.number().optional(),
    weightKg: z.number().optional(),
    heightCm: z.number().optional(),
    spo2: z.number().optional(),
  })
  .optional();

const saveSchema = z.object({
  vitals: vitalsSchema,
  diagnosis: z.string().optional(),
  notes: z.string().optional(),
  followUpDate: z.string().optional(),
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
  requireRole('DOCTOR'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = saveSchema.parse(req.body);
    const appointment = await assertOwnsAppointment(req, req.params.appointmentId);

    const followUpDate = data.followUpDate ? new Date(`${data.followUpDate}T00:00:00.000Z`) : undefined;

    const consultation = await prisma.$transaction(async (tx) => {
      const existing = await tx.consultation.findUnique({ where: { appointmentId: appointment.id } });
      const saved = existing
        ? await tx.consultation.update({
            where: { appointmentId: appointment.id },
            data: {
              vitals: data.vitals ?? undefined,
              diagnosis: data.diagnosis,
              notes: data.notes,
              followUpDate,
            },
          })
        : await tx.consultation.create({
            data: {
              appointmentId: appointment.id,
              vitals: data.vitals ?? undefined,
              diagnosis: data.diagnosis,
              notes: data.notes,
              followUpDate,
            },
          });

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
        data: { status: data.complete ? 'COMPLETED' : 'IN_CONSULTATION' },
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
      include: { patient: true, doctor: { include: { user: true } } },
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
