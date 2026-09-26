import { Router } from 'express';
import { z } from 'zod';
import type { Receipt } from '@opd/shared';
import { prisma } from '../prisma';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, requireTier, type AuthedRequest } from '../middleware/auth';
import { patientForCounter, receiptNo, toDeptPatient } from '../utils/departments';

// A printable receipt for a pharmacy sale or a lab/radiology bill, in one
// shape so the web has a single receipt page.
export const receiptsRouter = Router();

receiptsRouter.use(requireAuth, requireTier(2));

const TYPES = {
  pharmacy: { billType: 'PHARMACY', prefix: 'PH', role: 'PHARMACIST' },
  lab: { billType: 'LAB', prefix: 'LB', role: 'LAB_TECHNICIAN' },
  radiology: { billType: 'RADIOLOGY', prefix: 'RD', role: 'RADIOLOGY_TECHNICIAN' },
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

receiptsRouter.get(
  '/:type/:id',
  requireRole('ADMIN', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGY_TECHNICIAN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const type = z.enum(['pharmacy', 'lab', 'radiology']).parse(req.params.type);
    const t = TYPES[type];
    const role = req.auth!.role;
    // Each counter prints its own receipts; admin and the front desk, any.
    if (role !== 'ADMIN' && role !== 'RECEPTIONIST' && role !== t.role) throw new HttpError(403, 'You do not have access to this receipt');
    const clinicId = req.auth!.clinicId;
    const where = { id: req.params.id, clinicId };
    const include = {
      patient: patientForCounter,
      appointment: { include: { doctor: { include: { user: true } } } },
    } as const;

    let bill;
    let lines: Receipt['lines'];
    let preparedBy: string;
    if (type === 'pharmacy') {
      const sale = await prisma.pharmacySale.findFirst({ where, include: { ...include, items: true, soldBy: true } });
      if (!sale) throw new HttpError(404, 'Receipt not found');
      bill = sale;
      preparedBy = sale.soldBy.name;
      lines = sale.items.map((i) => ({
        description: i.medicineName,
        detail: i.substitutedFor ? `In place of ${i.substitutedFor}` : null,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        amount: round2(i.lineTotal),
      }));
    } else {
      const delegate = type === 'lab' ? prisma.labInvoice : prisma.radiologyInvoice;
      const invoice = await (delegate as typeof prisma.labInvoice).findFirst({ where, include: { ...include, items: true, recordedBy: true } });
      if (!invoice) throw new HttpError(404, 'Receipt not found');
      bill = invoice;
      preparedBy = invoice.recordedBy.name;
      lines = invoice.items.map((i) => ({
        description: i.testName,
        detail: i.substitutedFor ? `In place of ${i.substitutedFor}` : null,
        quantity: 1,
        unitPrice: i.price,
        amount: round2(i.price),
      }));
    }

    const [clinic, payments] = await Promise.all([
      prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } }),
      prisma.payment.findMany({ where: { clinicId, billType: t.billType, billId: bill.id }, orderBy: { createdAt: 'asc' } }),
    ]);
    const paid = round2(payments.reduce((n, p) => n + p.amount, 0));
    const receipt: Receipt = {
      billType: t.billType,
      billId: bill.id,
      receiptNo: receiptNo(t.prefix, bill.createdAt, bill.id),
      createdAt: bill.createdAt.toISOString(),
      clinic: { name: clinic.name, address: clinic.address, phone: clinic.phone },
      patient: toDeptPatient(bill.patient),
      doctorName: bill.appointment?.doctor.user.name ?? null,
      preparedBy,
      lines,
      subtotal: round2(bill.subtotal),
      taxPercent: bill.taxPercent,
      taxAmount: round2(bill.taxAmount),
      total: round2(bill.total),
      paid,
      balance: round2(Math.max(0, bill.total - paid)),
      payments: payments.map((p) => ({ method: p.method, amount: p.amount, paidAt: p.createdAt.toISOString() })),
    };
    res.json(receipt);
  }),
);
