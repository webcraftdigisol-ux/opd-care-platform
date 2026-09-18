import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { toRadiologyInvoice, toRadiologyTestCatalogEntry } from '../utils/serialize';
import { findBestNameMatch } from '../utils/match';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, requireTier, type AuthedRequest } from '../middleware/auth';
import type { PendingRadiologyLine } from '@opd/shared';

export const radiologyRouter = Router();

radiologyRouter.use(requireAuth, requireTier(2));

// ---- Catalog ----

radiologyRouter.get(
  '/catalog',
  asyncHandler(async (req: AuthedRequest, res) => {
    const catalog = await prisma.radiologyCatalog.findMany({
      where: { clinicId: req.auth!.clinicId },
      orderBy: { name: 'asc' },
    });
    res.json(catalog.map(toRadiologyTestCatalogEntry));
  }),
);

const upsertCatalogSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
});

radiologyRouter.post(
  '/catalog',
  requireRole('ADMIN', 'RADIOLOGY_TECHNICIAN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = upsertCatalogSchema.parse(req.body);
    const entry = await prisma.radiologyCatalog.create({ data: { ...data, clinicId: req.auth!.clinicId } });
    res.status(201).json(toRadiologyTestCatalogEntry(entry));
  }),
);

radiologyRouter.put(
  '/catalog/:id',
  requireRole('ADMIN', 'RADIOLOGY_TECHNICIAN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = upsertCatalogSchema.partial().parse(req.body);
    const existing = await prisma.radiologyCatalog.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
    });
    if (!existing) throw new HttpError(404, 'Radiology test not found');
    const entry = await prisma.radiologyCatalog.update({ where: { id: req.params.id }, data });
    res.json(toRadiologyTestCatalogEntry(entry));
  }),
);

// ---- Counter workflow ----

radiologyRouter.get(
  '/patients/:patientId/pending',
  requireRole('ADMIN', 'RADIOLOGY_TECHNICIAN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const clinicId = req.auth!.clinicId;
    const patient = await prisma.user.findFirst({ where: { id: req.params.patientId, clinicId } });
    if (!patient) throw new HttpError(404, 'Patient not found');

    const [appointments, catalog] = await Promise.all([
      prisma.appointment.findMany({
        where: { patientId: patient.id, clinicId },
        include: { consultation: { include: { radiologyOrdered: true } } },
        orderBy: { date: 'desc' },
        take: 10,
      }),
      prisma.radiologyCatalog.findMany({ where: { clinicId } }),
    ]);

    const lines: PendingRadiologyLine[] = [];
    for (const appointment of appointments) {
      if (!appointment.consultation) continue;
      for (const order of appointment.consultation.radiologyOrdered) {
        const alreadyResulted = await prisma.radiologyResultItem.findFirst({ where: { orderId: order.id } });
        const matched = findBestNameMatch(catalog, order.testName);
        lines.push({
          orderId: order.id,
          appointmentId: appointment.id,
          appointmentDate: appointment.date.toISOString().slice(0, 10),
          testName: order.testName,
          notes: order.notes,
          matchedTest: matched ? toRadiologyTestCatalogEntry(matched) : null,
          suggestedPrice: matched?.price ?? 0,
          alreadyResulted: !!alreadyResulted,
        });
      }
    }

    res.json(lines);
  }),
);

const resultItemSchema = z.object({
  orderId: z.string().optional(),
  catalogItemId: z.string().optional(),
  testName: z.string().min(1),
  resultText: z.string().optional(),
  price: z.number().nonnegative(),
});

const createInvoiceSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().optional(),
  admissionId: z.string().optional(),
  items: z.array(resultItemSchema).min(1),
});

radiologyRouter.post(
  '/invoices',
  requireRole('ADMIN', 'RADIOLOGY_TECHNICIAN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createInvoiceSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;

    const patient = await prisma.user.findFirst({ where: { id: data.patientId, clinicId } });
    if (!patient) throw new HttpError(404, 'Patient not found');
    if (data.admissionId) {
      const admission = await prisma.admission.findFirst({ where: { id: data.admissionId, clinicId } });
      if (!admission) throw new HttpError(404, 'Admission not found');
    }

    const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
    const subtotal = data.items.reduce((sum, item) => sum + item.price, 0);
    const taxAmount = Math.round(subtotal * (clinic.taxPercent / 100) * 100) / 100;
    const total = subtotal + taxAmount;

    const invoice = await prisma.radiologyInvoice.create({
      data: {
        clinicId,
        patientId: data.patientId,
        appointmentId: data.appointmentId,
        admissionId: data.admissionId,
        recordedById: req.auth!.userId,
        taxPercent: clinic.taxPercent,
        subtotal,
        taxAmount,
        total,
        items: {
          create: data.items.map((item) => ({
            orderId: item.orderId,
            catalogItemId: item.catalogItemId,
            testName: item.testName,
            resultText: item.resultText,
            price: item.price,
          })),
        },
      },
      include: { items: true, patient: true },
    });

    res.status(201).json(toRadiologyInvoice(invoice));
  }),
);

radiologyRouter.get(
  '/invoices/:id',
  requireRole('ADMIN', 'RADIOLOGY_TECHNICIAN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const invoice = await prisma.radiologyInvoice.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
      include: { items: true, patient: true },
    });
    if (!invoice) throw new HttpError(404, 'Invoice not found');
    res.json(toRadiologyInvoice(invoice));
  }),
);

radiologyRouter.get(
  '/invoices',
  requireRole('ADMIN', 'RADIOLOGY_TECHNICIAN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
    const invoices = await prisma.radiologyInvoice.findMany({
      where: { clinicId: req.auth!.clinicId, ...(patientId ? { patientId } : {}) },
      include: { items: true, patient: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(invoices.map(toRadiologyInvoice));
  }),
);
