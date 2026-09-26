import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { toPharmacyItem, toPharmacySale } from '../utils/serialize';
import { suggestPharmacyQuantity } from '../utils/dosage';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, requireTier, type AuthedRequest } from '../middleware/auth';
import { STARTER_CATALOG } from '../utils/starterCatalog';
import { medicineLabel } from '../utils/visitSummary';
import {
  bestProduct,
  isSubstitution,
  patientForCounter,
  productLabel,
  queueSince,
  substitutesFor,
  toDeptPatient,
} from '../utils/departments';
import type { DeptQueueEntry, DeptVisit, PharmacyOrderLine, PharmacyPatientOrders } from '@opd/shared';

export const pharmacyRouter = Router();

pharmacyRouter.use(requireAuth, requireTier(2));

const COUNTER = ['ADMIN', 'PHARMACIST'] as const;

// ---- Medicine list (the pharmacy's settings) ----

pharmacyRouter.get(
  '/items',
  asyncHandler(async (req: AuthedRequest, res) => {
    const items = await prisma.pharmacyItem.findMany({
      where: { clinicId: req.auth!.clinicId },
      orderBy: [{ name: 'asc' }, { strength: 'asc' }, { brand: 'asc' }],
    });
    res.json(items.map(toPharmacyItem));
  }),
);

const blank = (v: string | null | undefined) => v?.trim() || null;
const upsertItemSchema = z.object({
  name: z.string().trim().min(1, 'Medicine name is required').max(200),
  strength: z.string().max(50).nullish().transform(blank),
  brand: z.string().max(80).nullish().transform(blank),
  unitsPerStrip: z.number().int().positive().nullable().optional(),
  // 0 = not priced yet (the standard list comes in unpriced).
  pricePerUnit: z.number().nonnegative(),
  costPricePerUnit: z.number().nonnegative(),
  stockUnits: z.number().int().nonnegative().optional(),
});

const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const sameProduct = (a: { name: string; strength: string | null; brand: string | null }, b: typeof a) =>
  lower(a.name) === lower(b.name) && lower(a.strength) === lower(b.strength) && lower(a.brand) === lower(b.brand);

async function assertNewProduct(clinicId: string, p: { name: string; strength: string | null; brand: string | null }, exceptId?: string) {
  const same = await prisma.pharmacyItem.findMany({ where: { clinicId, name: { equals: p.name, mode: 'insensitive' } } });
  if (same.some((s) => s.id !== exceptId && sameProduct(s, p))) {
    throw new HttpError(409, `${productLabel(p)} is already in the medicine list`);
  }
}

pharmacyRouter.post(
  '/items',
  requireRole(...COUNTER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = upsertItemSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    await assertNewProduct(clinicId, { name: data.name, strength: data.strength ?? null, brand: data.brand ?? null });
    const item = await prisma.pharmacyItem.create({ data: { ...data, stockUnits: data.stockUnits ?? 0, clinicId } });
    res.status(201).json(toPharmacyItem(item));
  }),
);

// The standard medicine list (the same generics and brands the Doctor's
// Catalogue offers, plus anything this clinic's doctors added there), one
// row per brand, unpriced -- the pharmacist then fills in cost and MRP.
// Rows already in the list are skipped, so it's safe to run again.
pharmacyRouter.post(
  '/items/starter',
  requireRole(...COUNTER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const clinicId = req.auth!.clinicId;
    const [existing, doctorItems] = await Promise.all([
      prisma.pharmacyItem.findMany({ where: { clinicId }, select: { name: true, strength: true, brand: true } }),
      prisma.doctorCatalogItem.findMany({ where: { clinicId, kind: 'MEDICINE' } }),
    ]);
    const sources = [
      ...STARTER_CATALOG.filter((s) => s.kind === 'MEDICINE').map((s) => ({ name: s.name, strength: s.strength ?? null, brands: s.brands ?? [] })),
      ...doctorItems.map((d) => ({ name: d.name, strength: d.strength, brands: d.brands })),
    ];
    const toAdd: { name: string; strength: string | null; brand: string | null }[] = [];
    for (const s of sources) {
      for (const brand of s.brands.length ? s.brands : [null]) {
        const row = { name: s.name, strength: s.strength, brand };
        if (![...existing, ...toAdd].some((e) => sameProduct(e, row))) toAdd.push(row);
      }
    }
    await prisma.pharmacyItem.createMany({
      data: toAdd.map((r) => ({ ...r, clinicId, pricePerUnit: 0, costPricePerUnit: 0, stockUnits: 0 })),
    });
    res.json({ added: toAdd.length });
  }),
);

pharmacyRouter.put(
  '/items/:id',
  requireRole(...COUNTER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = upsertItemSchema.partial().parse(req.body);
    const existing = await prisma.pharmacyItem.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
    });
    if (!existing) throw new HttpError(404, 'Pharmacy item not found');
    if (data.name !== undefined || data.strength !== undefined || data.brand !== undefined) {
      await assertNewProduct(
        existing.clinicId,
        {
          name: data.name ?? existing.name,
          strength: data.strength !== undefined ? data.strength : existing.strength,
          brand: data.brand !== undefined ? data.brand : existing.brand,
        },
        existing.id,
      );
    }
    const item = await prisma.pharmacyItem.update({ where: { id: req.params.id }, data });
    res.json(toPharmacyItem(item));
  }),
);

pharmacyRouter.delete(
  '/items/:id',
  requireRole(...COUNTER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await prisma.pharmacyItem.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
    });
    if (!existing) throw new HttpError(404, 'Pharmacy item not found');
    // PharmacySaleItem.itemId is ON DELETE SET NULL, and a sale item already
    // carries its own frozen medicineName/unitPrice snapshot from the sale
    // it was created in (see the "own recorded charge" design elsewhere in
    // this schema) -- so this always succeeds and never rewrites a past sale.
    await prisma.pharmacyItem.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

// ---- Counter workflow ----

// Patients with medicines still to dispense from a recent visit.
pharmacyRouter.get(
  '/queue',
  requireRole(...COUNTER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const pendingLine = { skippedAt: null, saleItems: { none: {} } } satisfies Prisma.PrescriptionWhereInput;
    const consultations = await prisma.consultation.findMany({
      where: {
        appointment: { clinicId: req.auth!.clinicId, date: { gte: queueSince() }, patientId: { not: null } },
        prescriptions: { some: pendingLine },
      },
      include: {
        appointment: { include: { patient: patientForCounter, doctor: { include: { user: true } } } },
        prescriptions: { include: { saleItems: { select: { id: true } } } },
      },
      orderBy: [{ appointment: { date: 'desc' } }, { createdAt: 'desc' }],
      take: 100,
    });
    const queue: DeptQueueEntry[] = consultations.map((c) => {
      const pending = c.prescriptions.filter((p) => !p.skippedAt && p.saleItems.length === 0);
      return {
        patient: toDeptPatient(c.appointment.patient!),
        appointmentId: c.appointmentId,
        visitDate: c.appointment.date.toISOString().slice(0, 10),
        doctorName: c.appointment.doctor.user.name,
        pending: pending.length,
        total: c.prescriptions.length,
        items: pending.map(medicineLabel),
      };
    });
    res.json(queue);
  }),
);

// One patient at the counter: their recent prescriptions, line by line,
// with what's been dispensed, the product to give and its substitutes.
pharmacyRouter.get(
  '/patients/:patientId/orders',
  requireRole(...COUNTER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const clinicId = req.auth!.clinicId;
    const patient = await prisma.user.findFirst({ where: { id: req.params.patientId, clinicId, role: 'PATIENT' }, ...patientForCounter });
    if (!patient) throw new HttpError(404, 'Patient not found');

    const [appointments, items, sales] = await Promise.all([
      prisma.appointment.findMany({
        where: { patientId: patient.id, clinicId, consultation: { prescriptions: { some: {} } } },
        include: {
          doctor: { include: { user: true } },
          consultation: { include: { prescriptions: { include: { saleItems: true } } } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 10,
      }),
      prisma.pharmacyItem.findMany({ where: { clinicId }, orderBy: [{ name: 'asc' }, { brand: 'asc' }] }),
      prisma.pharmacySale.findMany({
        where: { clinicId, patientId: patient.id },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const visits: DeptVisit<PharmacyOrderLine>[] = appointments.map((a) => ({
      appointmentId: a.id,
      consultationId: a.consultation!.id,
      date: a.date.toISOString().slice(0, 10),
      doctorName: a.doctor.user.name,
      diagnosis: a.consultation!.diagnosis,
      lines: a.consultation!.prescriptions.map((p) => {
        const match = bestProduct(items, p);
        return {
          prescriptionId: p.id,
          medicine: p.medicine,
          strength: p.strength,
          brand: p.brand,
          label: medicineLabel(p),
          dosage: p.dosage,
          frequency: p.frequency,
          durationDays: p.durationDays,
          foodTiming: p.foodTiming,
          notes: p.notes,
          status: p.saleItems.length ? 'DONE' : p.skippedAt ? 'SKIPPED' : 'PENDING',
          skipReason: p.skipReason,
          dispensed: p.saleItems.map((s) => ({
            saleId: s.saleId,
            medicineName: s.medicineName,
            quantity: s.quantity,
            lineTotal: s.lineTotal,
            substitutedFor: s.substitutedFor,
          })),
          suggestedQuantity: suggestPharmacyQuantity(p.frequency, p.durationDays),
          match: match ? toPharmacyItem(match) : null,
          substitutes: substitutesFor(items, p).map(toPharmacyItem),
        };
      }),
    }));

    const response: PharmacyPatientOrders = { patient: toDeptPatient(patient), visits, sales: sales.map(toPharmacySale) };
    res.json(response);
  }),
);

const skipSchema = z.object({ reason: z.string().trim().max(200).optional() });

async function findPrescription(req: AuthedRequest) {
  const p = await prisma.prescription.findFirst({
    where: { id: req.params.id, consultation: { appointment: { clinicId: req.auth!.clinicId } } },
    include: { saleItems: { select: { id: true } } },
  });
  if (!p) throw new HttpError(404, 'Prescription not found');
  return p;
}

// "Not dispensing this here" (out of stock, patient declined): takes the
// line out of the queue. DELETE undoes it.
pharmacyRouter.post(
  '/prescriptions/:id/skip',
  requireRole(...COUNTER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { reason } = skipSchema.parse(req.body ?? {});
    const p = await findPrescription(req);
    if (p.saleItems.length) throw new HttpError(409, 'This medicine has already been dispensed');
    await prisma.prescription.update({ where: { id: p.id }, data: { skippedAt: new Date(), skipReason: reason || null } });
    res.status(204).end();
  }),
);

pharmacyRouter.delete(
  '/prescriptions/:id/skip',
  requireRole(...COUNTER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const p = await findPrescription(req);
    await prisma.prescription.update({ where: { id: p.id }, data: { skippedAt: null, skipReason: null } });
    res.status(204).end();
  }),
);

const saleItemSchema = z.object({
  prescriptionId: z.string().optional(),
  itemId: z.string().optional(),
  medicineName: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

const createSaleSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().optional(),
  admissionId: z.string().optional(),
  items: z.array(saleItemSchema).min(1),
});

pharmacyRouter.post(
  '/sales',
  requireRole(...COUNTER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSaleSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;

    const patient = await prisma.user.findFirst({ where: { id: data.patientId, clinicId } });
    if (!patient) throw new HttpError(404, 'Patient not found');
    if (data.admissionId) {
      const admission = await prisma.admission.findFirst({ where: { id: data.admissionId, clinicId } });
      if (!admission) throw new HttpError(404, 'Admission not found');
    }

    // Prescription lines must be this patient's, and not dispensed yet.
    const prescriptionIds = data.items.flatMap((i) => (i.prescriptionId ? [i.prescriptionId] : []));
    if (new Set(prescriptionIds).size !== prescriptionIds.length) throw new HttpError(400, 'A prescription line appears twice');
    const prescriptions = await prisma.prescription.findMany({
      where: { id: { in: prescriptionIds }, consultation: { appointment: { clinicId, patientId: patient.id } } },
      include: { saleItems: { select: { id: true } }, consultation: { select: { appointmentId: true, createdAt: true } } },
    });
    if (prescriptions.length !== prescriptionIds.length) throw new HttpError(404, 'Prescription not found for this patient');
    const done = prescriptions.find((p) => p.saleItems.length);
    if (done) throw new HttpError(409, `${medicineLabel(done)} has already been dispensed`);

    const itemIds = data.items.flatMap((i) => (i.itemId ? [i.itemId] : []));
    const products = await prisma.pharmacyItem.findMany({ where: { id: { in: itemIds }, clinicId } });
    if (products.length !== new Set(itemIds).size) throw new HttpError(404, 'Medicine not found in the list');

    // Bill against the visit the medicines were prescribed in, so the
    // sale counts toward that doctor (the latest visit, if several).
    const appointmentId =
      data.appointmentId ??
      [...prescriptions].sort((a, b) => b.consultation.createdAt.getTime() - a.consultation.createdAt.getTime())[0]?.consultation
        .appointmentId;

    const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxAmount = Math.round(subtotal * (clinic.taxPercent / 100) * 100) / 100;
    const total = subtotal + taxAmount;

    const lines = data.items.map((item) => {
      const product = products.find((p) => p.id === item.itemId);
      const prescribed = prescriptions.find((p) => p.id === item.prescriptionId);
      const substituted = prescribed
        ? product
          ? isSubstitution(product, prescribed)
          : ![prescribed.medicine, medicineLabel(prescribed)].some((n) => n.toLowerCase() === item.medicineName.toLowerCase())
        : false;
      return {
        prescriptionId: item.prescriptionId,
        itemId: item.itemId,
        medicineName: item.medicineName,
        substitutedFor: substituted && prescribed ? medicineLabel(prescribed) : null,
        quantity: item.quantity,
        unitCost: product?.costPricePerUnit ?? null,
        unitPrice: item.unitPrice,
        lineTotal: item.quantity * item.unitPrice,
      };
    });

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.pharmacySale.create({
        data: {
          clinicId,
          patientId: data.patientId,
          appointmentId,
          admissionId: data.admissionId,
          soldById: req.auth!.userId,
          taxPercent: clinic.taxPercent,
          subtotal,
          taxAmount,
          total,
          items: { create: lines },
        },
        include: { items: true, patient: true },
      });

      // Stock is optional: a product whose stock isn't kept (0) stays at 0.
      for (const item of data.items) {
        const product = products.find((p) => p.id === item.itemId);
        if (product && product.stockUnits > 0) {
          await tx.pharmacyItem.update({
            where: { id: product.id },
            data: { stockUnits: Math.max(0, product.stockUnits - item.quantity) },
          });
          product.stockUnits = Math.max(0, product.stockUnits - item.quantity);
        }
      }
      if (prescriptionIds.length) {
        await tx.prescription.updateMany({ where: { id: { in: prescriptionIds } }, data: { skippedAt: null, skipReason: null } });
      }

      return created;
    });

    res.status(201).json(toPharmacySale(sale));
  }),
);

pharmacyRouter.get(
  '/sales/:id',
  requireRole(...COUNTER),
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
  requireRole(...COUNTER),
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
