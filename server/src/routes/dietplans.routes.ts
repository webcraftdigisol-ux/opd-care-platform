import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { toDietPlan, toNotification } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';
import { notifyPatientWhatsApp } from '../utils/whatsapp';

export const dietPlansRouter = Router();

dietPlansRouter.use(requireAuth);

// Same write-role pattern as a prescription (consultations.routes.ts):
// doctor authors it, admin can too as a backup. Reading is broader (any
// clinic staff, plus the patient themself for their own) -- set per route
// below, same split as every other clinical record in this app.
const createSchema = z.object({
  patientId: z.string().min(1),
  consultationId: z.string().optional(),
  dietaryPreference: z.enum(['VEG', 'NON_VEG', 'EGGETARIAN', 'VEGAN']),
  allergies: z.string().optional(),
  localFoodNotes: z.string().optional(),
  planText: z.string().min(1),
});

dietPlansRouter.post(
  '/',
  requireRole('DOCTOR', 'ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    const patient = await prisma.user.findFirst({
      where: { id: data.patientId, clinicId: req.auth!.clinicId, role: 'PATIENT' },
    });
    if (!patient) throw new HttpError(404, 'Patient not found');

    if (data.consultationId) {
      // Scoped through the appointment, same as assertOwnsAppointment in
      // consultations.routes.ts -- Consultation itself carries no clinicId.
      const consultation = await prisma.consultation.findFirst({
        where: { id: data.consultationId, appointment: { clinicId: req.auth!.clinicId, patientId: data.patientId } },
      });
      if (!consultation) throw new HttpError(404, 'Consultation not found for this patient');
    }

    const plan = await prisma.dietPlan.create({
      data: {
        clinicId: req.auth!.clinicId,
        patientId: data.patientId,
        consultationId: data.consultationId,
        createdById: req.auth!.userId,
        dietaryPreference: data.dietaryPreference,
        allergies: data.allergies,
        localFoodNotes: data.localFoodNotes,
        planText: data.planText,
      },
      include: { createdBy: true },
    });
    res.status(201).json(toDietPlan(plan));
  }),
);

dietPlansRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
    if (!patientId) throw new HttpError(400, 'patientId query parameter is required');
    if (req.auth!.role === 'PATIENT' && req.auth!.userId !== patientId) {
      throw new HttpError(403, 'Not authorized to view these diet plans');
    }
    const plans = await prisma.dietPlan.findMany({
      where: { patientId, clinicId: req.auth!.clinicId },
      include: { createdBy: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(plans.map(toDietPlan));
  }),
);

dietPlansRouter.post(
  '/:id/send-whatsapp',
  requireRole('DOCTOR', 'ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const plan = await prisma.dietPlan.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
      include: { patient: true, createdBy: true },
    });
    if (!plan) throw new HttpError(404, 'Diet plan not found');

    // notifyPatientWhatsApp never throws -- SKIPPED/FAILED are expected,
    // auditable outcomes recorded on the Notification row, not HTTP
    // errors, same as every other notification trigger in this app. The
    // caller reads the returned status to show "sent" vs. why it wasn't.
    const notification = await notifyPatientWhatsApp({
      clinicId: req.auth!.clinicId,
      patientId: plan.patientId,
      type: 'DIET_PLAN_SHARED',
      to: plan.patient.phone,
      optedIn: plan.patient.whatsappOptIn,
      templateName: 'diet_plan_shared',
      params: [plan.patient.name, plan.createdBy.name, plan.planText],
      renderedBody: `Hi ${plan.patient.name}, here is your diet plan from Dr. ${plan.createdBy.name}:\n\n${plan.planText}`,
    });
    res.json(toNotification(notification));
  }),
);
