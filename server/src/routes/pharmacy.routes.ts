import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { toPharmacyItem, toPharmacySale } from '../utils/serialize';
import { suggestPharmacyQuantity } from '../utils/dosage';
import { findBestNameMatch } from '../utils/match';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, requireTier, type AuthedRequest } from '../middleware/auth';
import type { PendingPharmacyLine } from '@opd/shared';

export const pharmacyRouter = Router();

pharmacyRouter.use(requireAuth, requireTier(2));

// ---- Catalog ----

pharmacyRouter.get(
  '/items',
  asyncHandler(async (req: AuthedRequest, res) => {
    const items = await prisma.pharmacyItem.findMany({
      where: { clinicId: req.auth!.clinicId },
      orderBy: { name: 'asc' },
    });
    res.json(items.map(toPharmacyItem));
  }),
);

const upsertItemSchema = z.object({
  name: z.string().min(1),
  unitsPerStrip: z.number().int().positive().nullable().optional(),
  pricePerUnit: z.number().positive(),
  costPricePerUnit: z.number().nonnegative(),
  stockUnits: z.number().int().nonnegative(),
});

pharmacyRouter.post(
  '/items',
  requireRole('ADMIN', 'PHARMACIST'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = upsertItemSchema.parse(req.body);
    const item = await prisma.pharmacyItem.create({
      data: { ...data, clinicId: req.auth!.clinicId },
    });
    res.status(201).json(toPharmacyItem(item));
  }),
);

pharmacyRouter.put(
  '/items/:id',
  requireRole('ADMIN', 'PHARMACIST'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = upsertItemSchema.partial().parse(req.body);
    const existing = await prisma.pharmacyItem.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
    });
    if (!existing) throw new HttpError(404, 'Pharmacy item not found');
    const item = await prisma.pharmacyItem.update({ where: { id: req.params.id }, data });
    res.json(toPharmacyItem(item));
  }),
);

// ---- Counter workflow ----

pharmacyRouter.get(
  '/patients/:patientId/pending',
  requireRole('ADMIN', 'PHARMACIST'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const clinicId = req.auth!.clinicId;
    const patient = await prisma.user.findFirst({ where: { id: req.params.patientId, clinicId } });
    if (!patient) throw new HttpError(404, 'Patient not found');

    const [appointments, catalog] = await Promise.all([
      prisma.appointment.findMany({
        where: { patientId: patient.id, clinicId },
        include: { consultation: { include: { prescriptions: true } } },
        orderBy: { date: 'desc' },
        take: 10,
      }),
      prisma.pharmacyItem.findMany({ where: { clinicId } }),
    ]);

    const lines: PendingPharmacyLine[] = [];
    for (const appointment of appointments) {
      if (!appointment.consultation) continue;
      for (const prescription of appointment.consultation.prescriptions) {
        const alreadyDispensed = await prisma.pharmacySaleItem.findFirst({
          where: { prescriptionId: prescription.id },
        });
        const matched = findBestNameMatch(catalog, prescription.medicine);
        const suggestedQuantity = suggestPharmacyQuantity(prescription.frequency, prescription.durationDays);
        lines.push({
          prescriptionId: prescription.id,
          appointmentId: appointment.id,
          appointmentDate: appointment.date.toISOString().slice(0, 10),
          medicine: prescription.medicine,
          dosage: prescription.dosage,
          frequency: prescription.frequency,
          durationDays: prescription.durationDays,
          matchedItem: matched ? toPharmacyItem(matched) : null,
          suggestedQuantity,
          suggestedUnitPrice: matched?.pricePerUnit ?? 0,
          alreadyDispensed: !!alreadyDispensed,
        });
      }
    }

    res.json(lines);
  }),
);

const saleItemSchema = z.object({
  prescriptionId: z.string().optional(),
  itemId: z.string().optional(),
  medicineName: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

const createSaleSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().optional(),
  items: z.array(saleItemSchema).min(1),
});

pharmacyRouter.post(
  '/sales',
  requireRole('ADMIN', 'PHARMACIST'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSaleSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;

    const patient = await prisma.user.findFirst({ where: { id: data.patientId, clinicId } });
    if (!patient) throw new HttpError(404, 'Patient not found');

    const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxAmount = Math.round(subtotal * (clinic.taxPercent / 100) * 100) / 100;
    const total = subtotal + taxAmount;

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.pharmacySale.create({
        data: {
          clinicId,
          patientId: data.patientId,
          appointmentId: data.appointmentId,
          soldById: req.auth!.userId,
          taxPercent: clinic.taxPercent,
          subtotal,
          taxAmount,
          total,
          items: {
            create: data.items.map((item) => ({
              prescriptionId: item.prescriptionId,
              itemId: item.itemId,
              medicineName: item.medicineName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.quantity * item.unitPrice,
            })),
          },
        },
        include: { items: true, patient: true },
      });

      for (const item of data.items) {
        if (item.itemId) {
          await tx.pharmacyItem.update({
            where: { id: item.itemId },
            data: { stockUnits: { decrement: item.quantity } },
          });
        }
      }

      return created;
    });

    res.status(201).json(toPharmacySale(sale));
  }),
);

pharmacyRouter.get(
  '/sales/:id',
  requireRole('ADMIN', 'PHARMACIST'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const sale = await prisma.pharmacySale.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
      include: { items: true, patient: true },
    });
    if (!sale) throw new HttpError(404, 'Sale not found');
    res.json(toPharmacySale(sale));
  }),
);

pharmacyRouter.get(
  '/sales',
  requireRole('ADMIN', 'PHARMACIST'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
    const sales = await prisma.pharmacySale.findMany({
      where: { clinicId: req.auth!.clinicId, ...(patientId ? { patientId } : {}) },
      include: { items: true, patient: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(sales.map(toPharmacySale));
  }),
);
