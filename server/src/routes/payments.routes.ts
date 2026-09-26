import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { Prisma, type PaymentOrder } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { withPatient } from '../utils/patients';
import { toPayment, toSubscriptionPayment } from '../utils/serialize';
import { notifyPatientEmail } from '../utils/notify';
import {
  getRazorpayClient,
  getRazorpayKeyId,
  isRazorpayConfigured,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../utils/razorpay';
import { computeRenewalPeriod } from '../utils/subscriptionRenewal';
import { defaultSubscriptionAmount } from '../utils/subscriptionPricing';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';
import type { BillType, RazorpayOrderResponse, VerifyRazorpayPaymentRequest } from '@opd/shared';

export const paymentsRouter = Router();

paymentsRouter.use(requireAuth);

// Who may record/view a payment against each bill type -- mirrors exactly
// who already has write/read access to that bill itself elsewhere in the
// API (Pharmacist for Pharmacy, Lab Technician for Lab, etc). IPD payments
// stay Admin/Doctor-only, same as admission/discharge -- Head Nurse's
// billing access is deliberately read-only (see the granular-roles round).
export const ROLES_BY_BILL_TYPE: Record<BillType, string[]> = {
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

// A patient may act on their own bill (view it, or pay it online); anyone
// else needs the same staff access that bill type's manual-recording side
// requires. Shared by the GET (view) and POST /razorpay/orders (pay) routes.
function requireBillAccess(auth: AuthedRequest['auth'], billType: BillType, patientId: string) {
  const isOwnBill = auth!.role === 'PATIENT' && auth!.userId === patientId;
  if (!isOwnBill) {
    requireBillTypeRole(auth!.role, billType);
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
      const found = await prisma.appointment.findFirst({ where: { id: billId, clinicId }, include: { patient: true } });
      if (!found) throw new HttpError(404, 'Appointment not found');
      const appt = withPatient(found);
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
    requireBillAccess(req.auth, query.billType, bill.patientId);

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

// ---- Online payments (Razorpay) ----
//
// One platform-level Razorpay account serves every clinic, the same shared-
// account design already used for WhatsApp -- a clinic gets a working "Pay
// Online" button immediately on signup rather than waiting on its own
// merchant onboarding. See README's "Online Payments" section.
//
// PaymentOrder is the server's own record of what a razorpayOrderId is for,
// created the moment an order is requested (before any money has actually
// moved). Neither the signed checkout callback nor the webhook payload is
// ever trusted to carry billType/billId/amount -- both look that up here by
// razorpayOrderId instead, so a client can't claim to be paying for
// something other than what the order was actually created for.

paymentsRouter.get(
  '/razorpay/status',
  asyncHandler(async (_req: AuthedRequest, res) => {
    res.json({ configured: isRazorpayConfigured() });
  }),
);

const createBillOrderSchema = z.object({
  billType: z.enum(['CONSULTATION', 'PHARMACY', 'LAB', 'RADIOLOGY', 'IPD']),
  billId: z.string().min(1),
});

paymentsRouter.post(
  '/razorpay/orders',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createBillOrderSchema.parse(req.body);
    const client = getRazorpayClient();
    if (!client) throw new HttpError(400, 'Online payments are not configured for this clinic yet');
    const clinicId = req.auth!.clinicId;

    const bill = await loadBill(clinicId, data.billType, data.billId);
    requireBillAccess(req.auth, data.billType, bill.patientId);

    const alreadyPaid = await amountPaidSoFar(clinicId, data.billType, data.billId);
    const balanceDue = Math.round((bill.total - alreadyPaid) * 100) / 100;
    if (balanceDue <= 0.01) throw new HttpError(400, 'This bill is already fully paid');

    const order = await client.createOrder({
      amountPaise: Math.round(balanceDue * 100),
      currency: 'INR',
      receipt: crypto.randomUUID(),
    });
    await prisma.paymentOrder.create({
      data: {
        clinicId,
        razorpayOrderId: order.id,
        kind: 'BILL',
        billType: data.billType,
        billId: data.billId,
        patientId: bill.patientId,
        initiatedByUserId: req.auth!.userId,
        amount: balanceDue,
      },
    });

    const response: RazorpayOrderResponse = { orderId: order.id, amount: order.amount, currency: order.currency, keyId: getRazorpayKeyId()! };
    res.status(201).json(response);
  }),
);

paymentsRouter.post(
  '/razorpay/subscription-orders',
  requireRole('ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const client = getRazorpayClient();
    if (!client) throw new HttpError(400, 'Online payments are not configured for this clinic yet');
    const clinicId = req.auth!.clinicId;

    const subscription = await prisma.subscription.findUnique({ where: { clinicId } });
    if (!subscription) throw new HttpError(404, 'This clinic has no subscription record');

    // Self-serve renewal always renews at the clinic's current tier/cycle
    // and the listed price -- changing tier or getting a discounted rate
    // stays a platform-admin-mediated action (see platform.routes.ts).
    const amount = defaultSubscriptionAmount(subscription.tier as 1 | 2 | 3, subscription.billingCycle);
    const order = await client.createOrder({
      amountPaise: Math.round(amount * 100),
      currency: 'INR',
      receipt: crypto.randomUUID(),
    });
    await prisma.paymentOrder.create({
      data: {
        clinicId,
        razorpayOrderId: order.id,
        kind: 'SUBSCRIPTION',
        subscriptionId: subscription.id,
        initiatedByUserId: req.auth!.userId,
        amount,
      },
    });

    const response: RazorpayOrderResponse = { orderId: order.id, amount: order.amount, currency: order.currency, keyId: getRazorpayKeyId()! };
    res.status(201).json(response);
  }),
);

// Captures one PaymentOrder into its final Payment/SubscriptionPayment row.
// Called from both the client-side verify endpoint and the webhook -- one
// or the other, or (in the ordinary case) both, will call this for the
// same razorpayPaymentId; the unique constraint on razorpayPaymentId is
// what actually enforces "only once", this function just makes that
// outcome look like an ordinary success on the replay instead of an error.
async function captureBillPayment(order: PaymentOrder, razorpayPaymentId: string): Promise<{ isNew: boolean }> {
  try {
    await prisma.payment.create({
      data: {
        clinicId: order.clinicId,
        patientId: order.patientId!,
        billType: order.billType!,
        billId: order.billId!,
        amount: order.amount,
        method: 'RAZORPAY',
        razorpayOrderId: order.razorpayOrderId,
        razorpayPaymentId,
        recordedById: order.initiatedByUserId,
      },
    });
    return { isNew: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { isNew: false };
    throw err;
  }
}

async function captureSubscriptionPayment(order: PaymentOrder, razorpayPaymentId: string): Promise<{ isNew: boolean }> {
  const subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: order.subscriptionId! } });
  const { periodStart, periodEnd } = computeRenewalPeriod(subscription.currentPeriodEnd, subscription.billingCycle);
  try {
    await prisma.$transaction([
      prisma.subscriptionPayment.create({
        data: {
          subscriptionId: subscription.id,
          amount: order.amount,
          billingCycle: subscription.billingCycle,
          periodStart,
          periodEnd,
          paidByUserId: order.initiatedByUserId,
          razorpayOrderId: order.razorpayOrderId,
          razorpayPaymentId,
        },
      }),
      prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'ACTIVE', currentPeriodEnd: periodEnd } }),
    ]);
    return { isNew: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { isNew: false };
    throw err;
  }
}

async function capturePaymentOrder(order: PaymentOrder, razorpayPaymentId: string): Promise<{ isNew: boolean }> {
  return order.kind === 'BILL' ? captureBillPayment(order, razorpayPaymentId) : captureSubscriptionPayment(order, razorpayPaymentId);
}

async function notifyBillPaid(order: PaymentOrder) {
  const bill = await loadBill(order.clinicId, order.billType!, order.billId!);
  const alreadyPaid = await amountPaidSoFar(order.clinicId, order.billType!, order.billId!);
  const balanceDue = Math.round((bill.total - alreadyPaid) * 100) / 100;
  await notifyPatientEmail({
    clinicId: order.clinicId,
    patientId: bill.patientId,
    type: 'PAYMENT_RECEIVED',
    to: bill.patientEmail,
    subject: `Payment received — ₹${order.amount.toFixed(2)}`,
    body: `Hi ${bill.patientName}, your online payment of ₹${order.amount.toFixed(2)} was received. ${
      balanceDue > 0.01 ? `Remaining balance: ₹${balanceDue.toFixed(2)}.` : 'This bill is now fully paid.'
    }`,
  });
}

const verifySchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
}) satisfies z.ZodType<VerifyRazorpayPaymentRequest>;

paymentsRouter.post(
  '/razorpay/verify',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = verifySchema.parse(req.body);
    if (!verifyPaymentSignature(data.razorpayOrderId, data.razorpayPaymentId, data.razorpaySignature)) {
      throw new HttpError(400, 'Invalid payment signature');
    }

    const order = await prisma.paymentOrder.findUnique({ where: { razorpayOrderId: data.razorpayOrderId } });
    if (!order || order.clinicId !== req.auth!.clinicId) throw new HttpError(404, 'Payment order not found');

    if (order.kind === 'BILL') {
      requireBillAccess(req.auth, order.billType!, order.patientId!);
    } else if (req.auth!.role !== 'ADMIN') {
      throw new HttpError(403, 'Only a clinic admin can complete a subscription renewal');
    }

    const { isNew } = await capturePaymentOrder(order, data.razorpayPaymentId);
    if (isNew && order.kind === 'BILL') await notifyBillPaid(order);

    if (order.kind === 'BILL') {
      const bill = await loadBill(order.clinicId, order.billType!, order.billId!);
      const amountPaid = await amountPaidSoFar(order.clinicId, order.billType!, order.billId!);
      res.json({
        billType: order.billType,
        billId: order.billId,
        total: bill.total,
        amountPaid,
        balanceDue: Math.round((bill.total - amountPaid) * 100) / 100,
      });
    } else {
      const subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: order.subscriptionId! } });
      res.json({ tier: subscription.tier, currentPeriodEnd: subscription.currentPeriodEnd, status: subscription.status });
    }
  }),
);

// Mounted directly on the Express app (not this router) with a raw-body
// parser, before the global express.json() -- see app.ts. Razorpay's own
// webhook signature is computed over the exact raw request bytes, so the
// body must never pass through JSON parsing/re-serialization first.
//
// This is the authoritative confirmation path: the client-side verify
// endpoint above is what gives the patient/admin immediate on-screen
// feedback, but if their browser closes before that call fires, this
// webhook is what still marks the bill paid -- Razorpay recommends exactly
// this "webhook as source of truth, client callback as UX nicety" split.
export async function razorpayWebhookHandler(req: Request, res: Response) {
  const signature = req.header('X-Razorpay-Signature');
  const rawBody = req.body as Buffer;
  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    res.status(400).json({ message: 'Invalid webhook signature' });
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ message: 'Invalid JSON payload' });
    return;
  }

  // Acknowledge every other event type -- Razorpay retries on non-2xx, and
  // there's nothing to do for events this app doesn't act on.
  if (payload.event !== 'payment.captured') {
    res.status(200).json({ received: true });
    return;
  }

  const paymentEntity = payload.payload?.payment?.entity;
  const razorpayOrderId = paymentEntity?.order_id;
  const razorpayPaymentId = paymentEntity?.id;
  if (!razorpayOrderId || !razorpayPaymentId) {
    res.status(200).json({ received: true });
    return;
  }

  const order = await prisma.paymentOrder.findUnique({ where: { razorpayOrderId } });
  if (!order) {
    // A webhook for an order this server never created (shouldn't happen
    // for this Razorpay account, but not this request's fault) -- ack it
    // rather than making Razorpay retry indefinitely.
    console.error(`[razorpay:webhook] no PaymentOrder found for razorpayOrderId=${razorpayOrderId}`);
    res.status(200).json({ received: true });
    return;
  }

  const { isNew } = await capturePaymentOrder(order, razorpayPaymentId);
  if (isNew && order.kind === 'BILL') await notifyBillPaid(order);

  res.status(200).json({ received: true });
}
