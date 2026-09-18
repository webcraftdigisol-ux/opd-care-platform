import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { toLabInvoice, toLabTestCatalogEntry } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, requireTier, type AuthedRequest } from '../middleware/auth';
import type { PendingLabLine } from '@opd/shared';
import type { LabTestCatalog as PrismaLabTestCatalog } from '@prisma/client';

export const labRouter = Router();

labRouter.use(requireAuth, requireTier(2));

async function findCatalogMatch(clinicId: string, testName: string): Promise<PrismaLabTestCatalog | null> {
  const exact = await prisma.labTestCatalog.findFirst({
    where: { clinicId, name: { equals: testName, mode: 'insensitive' } },
  });
  if (exact) return exact;

  const candidates = await prisma.labTestCatalog.findMany({ where: { clinicId } });
  const needle = testName.trim().toLowerCase();
  return (
    candidates.find(
      (c) => c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase()),
    ) ?? null
  );
}

// ---- Catalog ----

labRouter.get(
  '/catalog',
  asyncHandler(async (req: AuthedRequest, res) => {
    const catalog = await prisma.labTestCatalog.findMany({
      where: { clinicId: req.auth!.clinicId },
      orderBy: { name: 'asc' },
    });
    res.json(catalog.map(toLabTestCatalogEntry));
  }),
);

const upsertCatalogSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
});

labRouter.post(
  '/catalog',
  requireRole('ADMIN', 'LAB_TECHNICIAN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = upsertCatalogSchema.parse(req.body);
    const entry = await prisma.labTestCatalog.create({ data: { ...data, clinicId: req.auth!.clinicId } });
    res.status(201).json(toLabTestCatalogEntry(entry));
  }),
);

labRouter.put(
  '/catalog/:id',
  requireRole('ADMIN', 'LAB_TECHNICIAN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = upsertCatalogSchema.partial().parse(req.body);
    const existing = await prisma.labTestCatalog.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
    });
    if (!existing) throw new HttpError(404, 'Lab test not found');
    const entry = await prisma.labTestCatalog.update({ where: { id: req.params.id }, data });
    res.json(toLabTestCatalogEntry(entry));
  }),
);

// ---- Counter workflow ----

labRouter.get(
  '/patients/:patientId/pending',
  requireRole('ADMIN', 'LAB_TECHNICIAN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const clinicId = req.auth!.clinicId;
    const patient = await prisma.user.findFirst({ where: { id: req.params.patientId, clinicId } });
    if (!patient) throw new HttpError(404, 'Patient not found');

    const appointments = await prisma.appointment.findMany({
      where: { patientId: patient.id, clinicId },
      include: { consultation: { include: { labTestsOrdered: true } } },
      orderBy: { date: 'desc' },
      take: 10,
    });

    const lines: PendingLabLine[] = [];
    for (const appointment of appointments) {
      if (!appointment.consultation) continue;
      for (const order of appointment.consultation.labTestsOrdered) {
        const alreadyResulted = await prisma.labResultItem.findFirst({ where: { orderId: order.id } });
        const matched = await findCatalogMatch(clinicId, order.testName);
        lines.push({
          orderId: order.id,
          appointmentId: appointment.id,
          appointmentDate: appointment.date.toISOString().slice(0, 10),
          testName: order.testName,
          notes: order.notes,
          matchedTest: matched ? toLabTestCatalogEntry(matched) : null,
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
  items: z.array(resultItemSchema).min(1),
});

labRouter.post(
  '/invoices',
  requireRole('ADMIN', 'LAB_TECHNICIAN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createInvoiceSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;

    const patient = await prisma.user.findFirst({ where: { id: data.patientId, clinicId } });
    if (!patient) throw new HttpError(404, 'Patient not found');

    const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
    const subtotal = data.items.reduce((sum, item) => sum + item.price, 0);
    const taxAmount = Math.round(subtotal * (clinic.taxPercent / 100) * 100) / 100;
    const total = subtotal + taxAmount;

    const invoice = await prisma.labInvoice.create({
      data: {
        clinicId,
        patientId: data.patientId,
        appointmentId: data.appointmentId,
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

    res.status(201).json(toLabInvoice(invoice));
  }),
);

labRouter.get(
  '/invoices/:id',
  requireRole('ADMIN', 'LAB_TECHNICIAN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const invoice = await prisma.labInvoice.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
      include: { items: true, patient: true },
    });
    if (!invoice) throw new HttpError(404, 'Invoice not found');
    res.json(toLabInvoice(invoice));
  }),
);

labRouter.get(
  '/invoices',
  requireRole('ADMIN', 'LAB_TECHNICIAN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
    const invoices = await prisma.labInvoice.findMany({
      where: { clinicId: req.auth!.clinicId, ...(patientId ? { patientId } : {}) },
      include: { items: true, patient: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(invoices.map(toLabInvoice));
  }),
);
