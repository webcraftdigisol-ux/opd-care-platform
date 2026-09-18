import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { toConsultation } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';

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
  prescriptions: z.array(prescriptionSchema).optional(),
  labTestsOrdered: z.array(labOrderSchema).optional(),
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

    const consultation = await prisma.$transaction(async (tx) => {
      const existing = await tx.consultation.findUnique({ where: { appointmentId: appointment.id } });
      const saved = existing
        ? await tx.consultation.update({
            where: { appointmentId: appointment.id },
            data: { vitals: data.vitals ?? undefined, diagnosis: data.diagnosis, notes: data.notes },
          })
        : await tx.consultation.create({
            data: {
              appointmentId: appointment.id,
              vitals: data.vitals ?? undefined,
              diagnosis: data.diagnosis,
              notes: data.notes,
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

      await tx.appointment.update({
        where: { id: appointment.id },
        data: { status: data.complete ? 'COMPLETED' : 'IN_CONSULTATION' },
      });

      return tx.consultation.findUniqueOrThrow({
        where: { id: saved.id },
        include: { prescriptions: true, labTestsOrdered: true },
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
      include: { prescriptions: true, labTestsOrdered: true },
    });
    if (!consultation) throw new HttpError(404, 'No consultation recorded yet');
    res.json(toConsultation(consultation));
  }),
);
