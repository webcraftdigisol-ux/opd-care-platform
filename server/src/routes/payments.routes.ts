import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { toPayment } from '../utils/serialize';
import { notifyPatientEmail } from '../utils/notify';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import type { BillType } from '@opd/shared';

export const paymentsRouter = Router();

paymentsRouter.use(requireAuth);

// Who may record/view a payment against each bill type -- mirrors exactly
// who already has write/read access to that bill itself elsewhere in the
// API (Pharmacist for Pharmacy, Lab Technician for Lab, etc). IPD payments
// stay Admin/Doctor-only, same as admission/discharge -- Head Nurse's
// billing access is deliberately read-only (see the granular-roles round).
const ROLES_BY_BILL_TYPE: Record<BillType, string[]> = {
  CONSULTATION: ['ADMIN', 'DOCTOR', 'RECEPTIONIST'],
  PHARMACY: ['ADMIN', 'PHARMACIST'],
  LAB: ['ADMIN', 'LAB_TECHNICIAN'],
  RADIOLOGY: ['ADMIN', 'RADIOLOGY_TECHNICIAN'],
  IPD: ['ADMIN', 'DOCTOR'],
};

function requireBillTypeRole(role: string, billType: BillType) {
  if (!ROLES_BY_BILL_TYPE[billType].includes(role)) {
    throw new HttpError(403, 'Insufficient permissions for this bill type');
  }
}

interface BillInfo {
  total: number;
  patientId: string;
  patientEmail: string | null;
  patientName: string;
}

// billId's meaning is polymorphic on billType -- see the Payment model
// comment in schema.prisma. Every branch scopes its lookup by clinicId, the
// same tenant-isolation discipline as every other route in this API.
async function loadBill(clinicId: string, billType: BillType, billId: string): Promise<BillInfo> {
  switch (billType) {
    case 'CONSULTATION': {
      const appt = await prisma.appointment.findFirst({ where: { id: billId, clinicId }, include: { patient: true } });
      if (!appt) throw new HttpError(404, 'Appointment not found');
      return { total: appt.consultationFee, patientId: appt.patientId, patientEmail: appt.patient.email, patientName: appt.patient.name };
    }
    case 'PHARMACY': {
      const sale = await prisma.pharmacySale.findFirst({ where: { id: billId, clinicId }, include: { patient: true } });
      if (!sale) throw new HttpError(404, 'Pharmacy sale not found');
      return { total: sale.total, patientId: sale.patientId, patientEmail: sale.patient.email, patientName: sale.patient.name };
    }
    case 'LAB': {
      const invoice = await prisma.labInvoice.findFirst({ where: { id: billId, clinicId }, include: { patient: true } });
      if (!invoice) throw new HttpError(404, 'Lab invoice not found');
      return { total: invoice.total, patientId: invoice.patientId, patientEmail: invoice.patient.email, patientName: invoice.patient.name };
    }
    case 'RADIOLOGY': {
      const invoice = await prisma.radiologyInvoice.findFirst({ where: { id: billId, clinicId }, include: { patient: true } });
      if (!invoice) throw new HttpError(404, 'Radiology invoice not found');
      return { total: invoice.total, patientId: invoice.patientId, patientEmail: invoice.patient.email, patientName: invoice.patient.name };
    }
    case 'IPD': {
      const admission = await prisma.admission.findFirst({ where: { id: billId, clinicId }, include: { patient: true, bill: true } });
      if (!admission) throw new HttpError(404, 'Admission not found');
      if (!admission.bill) throw new HttpError(400, 'This admission has not been discharged yet -- there is no final bill to pay against');
      // The deposit already nets against the bill (see IpdBill.amountDue,
      // which can itself be negative -- a refund owed). What's still
      // collectible through this ledger is only the positive remainder;
      // a negative amountDue is a refund to hand back, not something to
      // record a "payment received" against.
      return {
        total: Math.max(0, admission.bill.amountDue),
        patientId: admission.patientId,
        patientEmail: admission.patient.email,
        patientName: admission.patient.name,
      };
    }
  }
}

async function amountPaidSoFar(clinicId: string, billType: BillType, billId: string): Promise<number> {
  const result = await prisma.payment.aggregate({
    where: { clinicId, billType, billId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

const recordPaymentSchema = z.object({
  billType: z.enum(['CONSULTATION', 'PHARMACY', 'LAB', 'RADIOLOGY', 'IPD']),
  billId: z.string().min(1),
  amount: z.number().positive(),
  method: z.enum(['CASH', 'CARD', 'UPI', 'NETBANKING', 'WALLET', 'RAZORPAY']),
});

paymentsRouter.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = recordPaymentSchema.parse(req.body);
    requireBillTypeRole(req.auth!.role, data.billType);
    const clinicId = req.auth!.clinicId;

    const bill = await loadBill(clinicId, data.billType, data.billId);
    const alreadyPaid = await amountPaidSoFar(clinicId, data.billType, data.billId);
    const balanceDue = Math.round((bill.total - alreadyPaid) * 100) / 100;
    if (data.amount > balanceDue + 0.01) {
      throw new HttpError(400, `Amount exceeds the outstanding balance of ${balanceDue}`);
    }

    const payment = await prisma.payment.create({
      data: {
        clinicId,
        patientId: bill.patientId,
        billType: data.billType,
        billId: data.billId,
        amount: data.amount,
        method: data.method,
        recordedById: req.auth!.userId,
      },
      include: { recordedBy: true },
    });

    const newAmountPaid = Math.round((alreadyPaid + data.amount) * 100) / 100;
    const newBalanceDue = Math.round((bill.total - newAmountPaid) * 100) / 100;

    await notifyPatientEmail({
      clinicId,
      patientId: bill.patientId,
      type: 'PAYMENT_RECEIVED',
      to: bill.patientEmail,
      subject: `Payment received — ₹${data.amount.toFixed(2)}`,
      body: `Hi ${bill.patientName}, we've recorded a payment of ₹${data.amount.toFixed(2)} via ${data.method}. ${
        newBalanceDue > 0.01 ? `Remaining balance: ₹${newBalanceDue.toFixed(2)}.` : 'This bill is now fully paid.'
      }`,
    });

    res.status(201).json({
      billType: data.billType,
      billId: data.billId,
      total: bill.total,
      amountPaid: newAmountPaid,
      balanceDue: newBalanceDue,
      payments: [toPayment(payment)],
    });
  }),
);

const billQuerySchema = z.object({
  billType: z.enum(['CONSULTATION', 'PHARMACY', 'LAB', 'RADIOLOGY', 'IPD']),
  billId: z.string().min(1),
});

paymentsRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const query = billQuerySchema.parse(req.query);
    const clinicId = req.auth!.clinicId;
    const bill = await loadBill(clinicId, query.billType, query.billId);

    // A patient may check their own bill's payment status; anyone else needs
    // the same staff access that bill type's write side requires.
    const isOwnBill = req.auth!.role === 'PATIENT' && req.auth!.userId === bill.patientId;
    if (!isOwnBill) {
      requireBillTypeRole(req.auth!.role, query.billType);
    }

    const payments = await prisma.payment.findMany({
      where: { clinicId, billType: query.billType, billId: query.billId },
      include: { recordedBy: true },
      orderBy: { createdAt: 'asc' },
    });
    const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    res.json({
      billType: query.billType,
      billId: query.billId,
      total: bill.total,
      amountPaid: Math.round(amountPaid * 100) / 100,
      balanceDue: Math.round((bill.total - amountPaid) * 100) / 100,
      payments: payments.map(toPayment),
    });
  }),
);
