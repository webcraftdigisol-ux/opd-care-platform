import { Router } from 'express';
import { z } from 'zod';
import type { Appointment, LabInvoice, LabResultItem, LabTestCatalog, LabTestOrder, User } from '@prisma/client';
import type { DeptQueueEntry, DeptVisit, TestOrderLine, TestPatientOrders } from '@opd/shared';
import { prisma } from '../prisma';
import { toLabInvoice, toLabTestCatalogEntry } from './serialize';
import { findBestNameMatch } from './match';
import { loadStandardTests } from './standardLists';
import { patientForCounter, queueSince, toDeptPatient } from './departments';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, requireTier, type AuthedRequest } from '../middleware/auth';

// The Lab and Radiology counters work the same way -- a test catalogue
// with prices, the doctor's orders, an invoice whose lines carry the
// results -- over parallel tables (LabTestCatalog/RadiologyCatalog, ...).
// Their rows have identical shapes, so one router serves both; the Prisma
// delegates differ only in name, hence the loose typing below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Delegate = any;

export interface TestDepartmentConfig {
  label: string; // "Lab", "Radiology"
  role: 'LAB_TECHNICIAN' | 'RADIOLOGY_TECHNICIAN';
  starterKind: 'LAB_TEST' | 'RADIOLOGY';
  // The Consultation relation holding this department's orders.
  ordersRelation: 'labTestsOrdered' | 'radiologyOrdered';
  catalog: Delegate;
  order: Delegate;
  invoice: Delegate;
  resultItem: Delegate;
}

type Order = LabTestOrder & { resultItems: LabResultItem[] };
type Invoice = LabInvoice & { items: LabResultItem[]; patient?: User };

const lower = (s: string) => s.trim().toLowerCase();

export function testDepartmentRouter(cfg: TestDepartmentConfig): Router {
  const router = Router();
  const COUNTER = ['ADMIN', cfg.role] as const;
  router.use(requireAuth, requireTier(2));

  // ---- Test list (the department's settings) ----

  router.get(
    '/catalog',
    asyncHandler(async (req: AuthedRequest, res) => {
      const catalog: LabTestCatalog[] = await cfg.catalog.findMany({ where: { clinicId: req.auth!.clinicId }, orderBy: { name: 'asc' } });
      res.json(catalog.map(toLabTestCatalogEntry));
    }),
  );

  // Price 0 = not priced yet (the standard list comes in unpriced).
  const upsertSchema = z.object({
    name: z.string().trim().min(1, 'Test name is required').max(200),
    price: z.number().nonnegative(),
    cost: z.number().nonnegative().optional(),
  });

  async function assertNewName(clinicId: string, name: string, exceptId?: string) {
    const same: LabTestCatalog | null = await cfg.catalog.findFirst({
      where: { clinicId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (same) throw new HttpError(409, `${name} is already in the list`);
  }

  router.post(
    '/catalog',
    requireRole(...COUNTER),
    asyncHandler(async (req: AuthedRequest, res) => {
      const data = upsertSchema.parse(req.body);
      await assertNewName(req.auth!.clinicId, data.name);
      const entry = await cfg.catalog.create({ data: { ...data, clinicId: req.auth!.clinicId } });
      res.status(201).json(toLabTestCatalogEntry(entry));
    }),
  );

  // The standard list (the Doctor's Catalogue's, plus this clinic's own
  // additions there), unpriced; already-listed names are skipped.
  router.post(
    '/catalog/starter',
    requireRole(...COUNTER),
    asyncHandler(async (req: AuthedRequest, res) => {
      res.json({ added: await loadStandardTests(req.auth!.clinicId, cfg.starterKind) });
    }),
  );

  router.put(
    '/catalog/:id',
    requireRole(...COUNTER),
    asyncHandler(async (req: AuthedRequest, res) => {
      const data = upsertSchema.partial().parse(req.body);
      const existing = await cfg.catalog.findFirst({ where: { id: req.params.id, clinicId: req.auth!.clinicId } });
      if (!existing) throw new HttpError(404, `${cfg.label} test not found`);
      if (data.name) await assertNewName(req.auth!.clinicId, data.name, existing.id);
      const entry = await cfg.catalog.update({ where: { id: req.params.id }, data });
      res.json(toLabTestCatalogEntry(entry));
    }),
  );

  router.delete(
    '/catalog/:id',
    requireRole(...COUNTER),
    asyncHandler(async (req: AuthedRequest, res) => {
      const existing = await cfg.catalog.findFirst({ where: { id: req.params.id, clinicId: req.auth!.clinicId } });
      if (!existing) throw new HttpError(404, `${cfg.label} test not found`);
      // A result item's catalogItemId is ON DELETE SET NULL, and it carries
      // its own frozen testName/price snapshot from the invoice it was
      // created in, so this always succeeds and never rewrites a past
      // invoice.
      await cfg.catalog.delete({ where: { id: req.params.id } });
      res.status(204).end();
    }),
  );

  // ---- Counter workflow ----

  const pendingOrder = { skippedAt: null, resultItems: { none: {} } };

  // Patients with tests still to do from a recent visit.
  router.get(
    '/queue',
    requireRole(...COUNTER),
    asyncHandler(async (req: AuthedRequest, res) => {
      type QueueRow = { appointmentId: string; appointment: Appointment & { patient: Parameters<typeof toDeptPatient>[0] | null; doctor: { user: User } } };
      const consultations = (await prisma.consultation.findMany({
        where: {
          appointment: { clinicId: req.auth!.clinicId, date: { gte: queueSince() }, patientId: { not: null } },
          [cfg.ordersRelation]: { some: pendingOrder },
        },
        include: {
          appointment: { include: { patient: patientForCounter, doctor: { include: { user: true } } } },
          [cfg.ordersRelation]: { include: { resultItems: { select: { id: true } } } },
        },
        orderBy: [{ appointment: { date: 'desc' } }, { createdAt: 'desc' }],
        take: 100,
      })) as unknown as (QueueRow & Record<string, Order[]>)[];
      const queue: DeptQueueEntry[] = consultations.map((c) => {
        const orders = c[cfg.ordersRelation] as Order[];
        const pending = orders.filter((o) => !o.skippedAt && o.resultItems.length === 0);
        return {
          patient: toDeptPatient(c.appointment.patient!),
          appointmentId: c.appointmentId,
          visitDate: c.appointment.date.toISOString().slice(0, 10),
          doctorName: c.appointment.doctor.user.name,
          pending: pending.length,
          total: orders.length,
          items: pending.map((o) => o.testName),
        };
      });
      res.json(queue);
    }),
  );

  router.get(
    '/patients/:patientId/orders',
    requireRole(...COUNTER),
    asyncHandler(async (req: AuthedRequest, res) => {
      const clinicId = req.auth!.clinicId;
      const patient = await prisma.user.findFirst({ where: { id: req.params.patientId, clinicId, role: 'PATIENT' }, ...patientForCounter });
      if (!patient) throw new HttpError(404, 'Patient not found');

      const [appointments, catalog, invoices]: [unknown[], LabTestCatalog[], Invoice[]] = await Promise.all([
        prisma.appointment.findMany({
          where: { patientId: patient.id, clinicId, consultation: { [cfg.ordersRelation]: { some: {} } } },
          include: {
            doctor: { include: { user: true } },
            consultation: { include: { [cfg.ordersRelation]: { include: { resultItems: true } } } },
          },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          take: 10,
        }),
        cfg.catalog.findMany({ where: { clinicId }, orderBy: { name: 'asc' } }),
        cfg.invoice.findMany({
          where: { clinicId, patientId: patient.id },
          include: { items: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);

      type Appt = { id: string; date: Date; doctor: { user: User }; consultation: { id: string; diagnosis: string | null } & Record<string, Order[]> };
      const visits: DeptVisit<TestOrderLine>[] = (appointments as Appt[]).map((a) => ({
        appointmentId: a.id,
        consultationId: a.consultation.id,
        date: a.date.toISOString().slice(0, 10),
        doctorName: a.doctor.user.name,
        diagnosis: a.consultation.diagnosis,
        lines: a.consultation[cfg.ordersRelation].map((o) => {
          const match = findBestNameMatch(catalog, o.testName);
          return {
            orderId: o.id,
            testName: o.testName,
            notes: o.notes,
            status: o.resultItems.length ? 'DONE' : o.skippedAt ? 'SKIPPED' : 'PENDING',
            skipReason: o.skipReason,
            done: o.resultItems.map((r) => ({ invoiceId: r.invoiceId, itemId: r.id, testName: r.testName, price: r.price, resultText: r.resultText })),
            match: match ? toLabTestCatalogEntry(match) : null,
          };
        }),
      }));

      const response: TestPatientOrders = { patient: toDeptPatient(patient), visits, invoices: invoices.map(toLabInvoice) };
      res.json(response);
    }),
  );

  async function findOrder(req: AuthedRequest): Promise<Order> {
    const o = await cfg.order.findFirst({
      where: { id: req.params.id, consultation: { appointment: { clinicId: req.auth!.clinicId } } },
      include: { resultItems: true },
    });
    if (!o) throw new HttpError(404, 'Order not found');
    return o;
  }

  const skipSchema = z.object({ reason: z.string().trim().max(200).optional() });

  // "Not doing this here" (not offered, patient declined): leaves the
  // queue. DELETE undoes it.
  router.post(
    '/orders/:id/skip',
    requireRole(...COUNTER),
    asyncHandler(async (req: AuthedRequest, res) => {
      const { reason } = skipSchema.parse(req.body ?? {});
      const o = await findOrder(req);
      if (o.resultItems.length) throw new HttpError(409, 'This test has already been done');
      await cfg.order.update({ where: { id: o.id }, data: { skippedAt: new Date(), skipReason: reason || null } });
      res.status(204).end();
    }),
  );

  router.delete(
    '/orders/:id/skip',
    requireRole(...COUNTER),
    asyncHandler(async (req: AuthedRequest, res) => {
      const o = await findOrder(req);
      await cfg.order.update({ where: { id: o.id }, data: { skippedAt: null, skipReason: null } });
      res.status(204).end();
    }),
  );

  const resultItemSchema = z.object({
    orderId: z.string().optional(),
    catalogItemId: z.string().optional(),
    testName: z.string().trim().min(1),
    resultText: z.string().optional(),
    price: z.number().nonnegative(),
  });

  const createInvoiceSchema = z.object({
    patientId: z.string().min(1),
    appointmentId: z.string().optional(),
    admissionId: z.string().optional(),
    items: z.array(resultItemSchema).min(1),
  });

  router.post(
    '/invoices',
    requireRole(...COUNTER),
    asyncHandler(async (req: AuthedRequest, res) => {
      const data = createInvoiceSchema.parse(req.body);
      const clinicId = req.auth!.clinicId;

      const patient = await prisma.user.findFirst({ where: { id: data.patientId, clinicId } });
      if (!patient) throw new HttpError(404, 'Patient not found');
      if (data.admissionId) {
        const admission = await prisma.admission.findFirst({ where: { id: data.admissionId, clinicId } });
        if (!admission) throw new HttpError(404, 'Admission not found');
      }

      // Ordered tests must be this patient's, and not done yet.
      const orderIds = data.items.flatMap((i) => (i.orderId ? [i.orderId] : []));
      if (new Set(orderIds).size !== orderIds.length) throw new HttpError(400, 'An ordered test appears twice');
      const orders: (Order & { consultation: { appointmentId: string; createdAt: Date } })[] = await cfg.order.findMany({
        where: { id: { in: orderIds }, consultation: { appointment: { clinicId, patientId: patient.id } } },
        include: { resultItems: true, consultation: { select: { appointmentId: true, createdAt: true } } },
      });
      if (orders.length !== orderIds.length) throw new HttpError(404, 'Ordered test not found for this patient');
      const done = orders.find((o) => o.resultItems.length);
      if (done) throw new HttpError(409, `${done.testName} has already been done`);

      const catalogIds = data.items.flatMap((i) => (i.catalogItemId ? [i.catalogItemId] : []));
      const catalog: LabTestCatalog[] = await cfg.catalog.findMany({ where: { id: { in: catalogIds }, clinicId } });
      if (catalog.length !== new Set(catalogIds).size) throw new HttpError(404, 'Test not found in the list');

      // Bill against the visit the tests were ordered in, so they count
      // toward that doctor (the latest visit, if several).
      const appointmentId =
        data.appointmentId ??
        [...orders].sort((a, b) => b.consultation.createdAt.getTime() - a.consultation.createdAt.getTime())[0]?.consultation.appointmentId;

      const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
      const subtotal = data.items.reduce((sum, item) => sum + item.price, 0);
      const taxAmount = Math.round(subtotal * (clinic.taxPercent / 100) * 100) / 100;
      const total = subtotal + taxAmount;

      const [invoice]: [Invoice, unknown] = await prisma.$transaction([
        cfg.invoice.create({
          data: {
            clinicId,
            patientId: data.patientId,
            appointmentId,
            admissionId: data.admissionId,
            recordedById: req.auth!.userId,
            taxPercent: clinic.taxPercent,
            subtotal,
            taxAmount,
            total,
            items: {
              create: data.items.map((item) => {
                const ordered = orders.find((o) => o.id === item.orderId);
                return {
                  orderId: item.orderId,
                  catalogItemId: item.catalogItemId,
                  testName: item.testName,
                  substitutedFor: ordered && lower(ordered.testName) !== lower(item.testName) ? ordered.testName : null,
                  cost: catalog.find((c) => c.id === item.catalogItemId)?.cost ?? null,
                  resultText: item.resultText,
                  price: item.price,
                };
              }),
            },
          },
          include: { items: true, patient: true },
        }),
        cfg.order.updateMany({ where: { id: { in: orderIds } }, data: { skippedAt: null, skipReason: null } }),
      ]);

      res.status(201).json(toLabInvoice(invoice));
    }),
  );

  // Results are often ready after the bill: fill in or correct a line's
  // result later.
  router.patch(
    '/results/:itemId',
    requireRole(...COUNTER),
    asyncHandler(async (req: AuthedRequest, res) => {
      const { resultText } = z.object({ resultText: z.string().max(5000).nullable() }).parse(req.body);
      const item = await cfg.resultItem.findFirst({ where: { id: req.params.itemId, invoice: { clinicId: req.auth!.clinicId } } });
      if (!item) throw new HttpError(404, 'Result not found');
      await cfg.resultItem.update({ where: { id: item.id }, data: { resultText: resultText?.trim() || null } });
      res.status(204).end();
    }),
  );

  router.get(
    '/invoices/:id',
    requireRole(...COUNTER),
    asyncHandler(async (req: AuthedRequest, res) => {
      const invoice = await cfg.invoice.findFirst({
        where: { id: req.params.id, clinicId: req.auth!.clinicId },
        include: { items: true, patient: true },
      });
      if (!invoice) throw new HttpError(404, 'Invoice not found');
      res.json(toLabInvoice(invoice));
    }),
  );

  router.get(
    '/invoices',
    requireRole(...COUNTER),
    asyncHandler(async (req: AuthedRequest, res) => {
      const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
      const invoices = await cfg.invoice.findMany({
        where: { clinicId: req.auth!.clinicId, ...(patientId ? { patientId } : {}) },
        include: { items: true, patient: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      res.json(invoices.map(toLabInvoice));
    }),
  );

  return router;
}
