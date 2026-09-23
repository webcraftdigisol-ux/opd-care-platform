import request from 'supertest';
import crypto from 'crypto';
import { app, prisma, setupClinicWithAdmin, createUser, createDoctor, loginAs, auth, tomorrowDateStr } from './helpers';
import { resetRazorpayClientForTests, type RazorpayClient, type RazorpayOrderResult } from '../src/utils/razorpay';

// A deterministic fake -- never makes a real network call to Razorpay, so
// this whole suite is safe to run with no live credentials and no network
// access. The real HTTP client (LiveRazorpayClient) is exercised only by
// its own shape (this test doesn't call it at all); what's under test here
// is everything AROUND it: signature verification, idempotent capture,
// access control, and the subscription-renewal math.
class FakeRazorpayClient implements RazorpayClient {
  orderCounter = 0;
  async createOrder(opts: { amountPaise: number; currency: string; receipt: string }): Promise<RazorpayOrderResult> {
    this.orderCounter += 1;
    return { id: `order_fake_${this.orderCounter}_${opts.receipt.slice(0, 8)}`, amount: opts.amountPaise, currency: opts.currency };
  }
}

function signPayment(orderId: string, paymentId: string): string {
  return crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest('hex');
}

function signWebhook(rawBody: string): string {
  return crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(rawBody).digest('hex');
}

function webhookPayload(orderId: string, paymentId: string): string {
  return JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: paymentId, order_id: orderId, status: 'captured' } } },
  });
}

// razorpayPaymentId is globally unique (not scoped to clinic, unlike the
// test emails below), so a fixed literal here would collide with a row
// left over from a previous run of this same suite against the persistent
// test database and fall into the idempotent-capture branch for what is
// actually a brand new payment -- silently leaving the new bill/subscription
// unpaid. Every payment id that gets captured must be unique per run.
function uniquePaymentId(prefix = 'pay'): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

beforeEach(() => {
  resetRazorpayClientForTests(new FakeRazorpayClient());
});

afterAll(async () => {
  resetRazorpayClientForTests(undefined);
  await prisma.$disconnect();
});

async function bookedAppointment(clinicId: string, patientId: string, doctorId: string, consultationFee = 500) {
  return prisma.appointment.create({
    data: { clinicId, patientId, doctorId, date: new Date(`${tomorrowDateStr()}T00:00:00.000Z`), tokenNumber: 1, consultationFee },
  });
}

describe('Razorpay: bill payment order -> verify', () => {
  it('a patient can pay their own consultation fee online end to end', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const patEmail = 'razorpay-patient-1@test.local';
    const { user: patient, password } = await createUser(clinic.id, 'PATIENT', { email: patEmail });
    const patSession = await loginAs(clinic.slug, patEmail, password);
    const appt = await bookedAppointment(clinic.id, patient.id, doctorProfile.id, 500);

    const orderRes = await request(app)
      .post('/api/payments/razorpay/orders')
      .set(auth(patSession.token))
      .send({ billType: 'CONSULTATION', billId: appt.id });
    expect(orderRes.status).toBe(201);
    expect(orderRes.body.amount).toBe(50000); // paise
    expect(orderRes.body.keyId).toBe(process.env.RAZORPAY_KEY_ID);
    const { orderId } = orderRes.body;

    const paymentId = uniquePaymentId();
    const verifyRes = await request(app)
      .post('/api/payments/razorpay/verify')
      .set(auth(patSession.token))
      .send({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signPayment(orderId, paymentId) });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.balanceDue).toBe(0);
    expect(verifyRes.body.amountPaid).toBe(500);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { razorpayPaymentId: paymentId } });
    expect(payment.method).toBe('RAZORPAY');
    expect(payment.amount).toBe(500);
    expect(payment.billId).toBe(appt.id);
  });

  it("rejects a patient trying to pay someone else's bill", async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const { user: owner } = await createUser(clinic.id, 'PATIENT');
    const appt = await bookedAppointment(clinic.id, owner.id, doctorProfile.id);

    const strangerEmail = 'razorpay-stranger@test.local';
    const { password } = await createUser(clinic.id, 'PATIENT', { email: strangerEmail });
    const strangerSession = await loginAs(clinic.slug, strangerEmail, password);

    const res = await request(app)
      .post('/api/payments/razorpay/orders')
      .set(auth(strangerSession.token))
      .send({ billType: 'CONSULTATION', billId: appt.id });
    expect(res.status).toBe(403);
  });

  it('a nurse (no CONSULTATION billing access) cannot create an order for a patient', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const appt = await bookedAppointment(clinic.id, patient.id, doctorProfile.id);

    const nurseEmail = 'razorpay-nurse@test.local';
    const { password } = await createUser(clinic.id, 'NURSE', { email: nurseEmail });
    const nurseSession = await loginAs(clinic.slug, nurseEmail, password);

    const res = await request(app)
      .post('/api/payments/razorpay/orders')
      .set(auth(nurseSession.token))
      .send({ billType: 'CONSULTATION', billId: appt.id });
    expect(res.status).toBe(403);
  });

  it('order amount reflects the current balance due, not the full bill, when partially paid already', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const patEmail = 'razorpay-partial@test.local';
    const { user: patient, password } = await createUser(clinic.id, 'PATIENT', { email: patEmail });
    const patSession = await loginAs(clinic.slug, patEmail, password);
    const appt = await bookedAppointment(clinic.id, patient.id, doctorProfile.id, 500);

    await request(app).post('/api/payments').set(auth(adminToken)).send({ billType: 'CONSULTATION', billId: appt.id, amount: 200, method: 'CASH' });

    const orderRes = await request(app)
      .post('/api/payments/razorpay/orders')
      .set(auth(patSession.token))
      .send({ billType: 'CONSULTATION', billId: appt.id });
    expect(orderRes.status).toBe(201);
    expect(orderRes.body.amount).toBe(30000); // 300 rupees remaining, in paise
  });

  it('refuses to create an order for a bill that is already fully paid', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const patEmail = 'razorpay-fullypaid@test.local';
    const { user: patient, password } = await createUser(clinic.id, 'PATIENT', { email: patEmail });
    const patSession = await loginAs(clinic.slug, patEmail, password);
    const appt = await bookedAppointment(clinic.id, patient.id, doctorProfile.id, 500);
    await request(app).post('/api/payments').set(auth(adminToken)).send({ billType: 'CONSULTATION', billId: appt.id, amount: 500, method: 'CASH' });

    const res = await request(app)
      .post('/api/payments/razorpay/orders')
      .set(auth(patSession.token))
      .send({ billType: 'CONSULTATION', billId: appt.id });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already fully paid/i);
  });

  it('rejects verification with an invalid signature, and creates no payment', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const patEmail = 'razorpay-badsig@test.local';
    const { user: patient, password } = await createUser(clinic.id, 'PATIENT', { email: patEmail });
    const patSession = await loginAs(clinic.slug, patEmail, password);
    const appt = await bookedAppointment(clinic.id, patient.id, doctorProfile.id);

    const orderRes = await request(app).post('/api/payments/razorpay/orders').set(auth(patSession.token)).send({ billType: 'CONSULTATION', billId: appt.id });
    const { orderId } = orderRes.body;

    const res = await request(app)
      .post('/api/payments/razorpay/verify')
      .set(auth(patSession.token))
      .send({ razorpayOrderId: orderId, razorpayPaymentId: uniquePaymentId('pay_tampered'), razorpaySignature: 'not-a-real-signature-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
    expect(res.status).toBe(400);

    const count = await prisma.payment.count({ where: { billType: 'CONSULTATION', billId: appt.id } });
    expect(count).toBe(0);
  });

  it('is idempotent: verifying the same payment twice does not double-record it', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const patEmail = 'razorpay-idempotent@test.local';
    const { user: patient, password } = await createUser(clinic.id, 'PATIENT', { email: patEmail });
    const patSession = await loginAs(clinic.slug, patEmail, password);
    const appt = await bookedAppointment(clinic.id, patient.id, doctorProfile.id, 500);

    const orderRes = await request(app).post('/api/payments/razorpay/orders').set(auth(patSession.token)).send({ billType: 'CONSULTATION', billId: appt.id });
    const { orderId } = orderRes.body;
    const paymentId = uniquePaymentId('pay_idempotent');
    const signature = signPayment(orderId, paymentId);

    const first = await request(app).post('/api/payments/razorpay/verify').set(auth(patSession.token)).send({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature });
    expect(first.status).toBe(200);
    const second = await request(app).post('/api/payments/razorpay/verify').set(auth(patSession.token)).send({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature });
    expect(second.status).toBe(200);
    expect(second.body.balanceDue).toBe(0);

    const count = await prisma.payment.count({ where: { razorpayPaymentId: paymentId } });
    expect(count).toBe(1);
  });
});

describe('Razorpay: webhook as the authoritative backstop', () => {
  it("captures the payment via webhook alone when the client's verify call never fired (browser closed)", async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const patEmail = 'razorpay-webhook-only@test.local';
    const { user: patient, password } = await createUser(clinic.id, 'PATIENT', { email: patEmail });
    const patSession = await loginAs(clinic.slug, patEmail, password);
    const appt = await bookedAppointment(clinic.id, patient.id, doctorProfile.id, 500);

    const orderRes = await request(app).post('/api/payments/razorpay/orders').set(auth(patSession.token)).send({ billType: 'CONSULTATION', billId: appt.id });
    const { orderId } = orderRes.body;
    const paymentId = uniquePaymentId('pay_webhook_only');
    const body = webhookPayload(orderId, paymentId);

    const res = await request(app)
      .post('/api/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', signWebhook(body))
      .send(body);
    expect(res.status).toBe(200);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { razorpayPaymentId: paymentId } });
    expect(payment.amount).toBe(500);
  });

  it("doesn't double-record when the webhook arrives for a payment already captured via verify", async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const patEmail = 'razorpay-both-paths@test.local';
    const { user: patient, password } = await createUser(clinic.id, 'PATIENT', { email: patEmail });
    const patSession = await loginAs(clinic.slug, patEmail, password);
    const appt = await bookedAppointment(clinic.id, patient.id, doctorProfile.id, 500);

    const orderRes = await request(app).post('/api/payments/razorpay/orders').set(auth(patSession.token)).send({ billType: 'CONSULTATION', billId: appt.id });
    const { orderId } = orderRes.body;
    const paymentId = uniquePaymentId('pay_both_paths');

    await request(app)
      .post('/api/payments/razorpay/verify')
      .set(auth(patSession.token))
      .send({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signPayment(orderId, paymentId) });

    const body = webhookPayload(orderId, paymentId);
    const res = await request(app)
      .post('/api/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', signWebhook(body))
      .send(body);
    expect(res.status).toBe(200);

    const count = await prisma.payment.count({ where: { razorpayPaymentId: paymentId } });
    expect(count).toBe(1);
  });

  it('rejects a webhook with an invalid signature', async () => {
    const body = webhookPayload(`order_fake_${crypto.randomBytes(4).toString('hex')}`, uniquePaymentId('pay_fake_x'));
    const res = await request(app)
      .post('/api/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', 'wrong-signature-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
      .send(body);
    expect(res.status).toBe(400);
  });
});

describe('Razorpay: not configured', () => {
  it('refuses order creation and reports unconfigured status when no client is available', async () => {
    resetRazorpayClientForTests(null);
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const appt = await bookedAppointment(clinic.id, patient.id, doctorProfile.id);
    const email = 'razorpay-unconfigured@test.local';
    const { password } = await createUser(clinic.id, 'PATIENT', { email });
    void patient;
    const session = await loginAs(clinic.slug, email, password);

    const status = await request(app).get('/api/payments/razorpay/status').set(auth(session.token));
    expect(status.body).toEqual({ configured: false });

    const orderRes = await request(app).post('/api/payments/razorpay/orders').set(auth(session.token)).send({ billType: 'CONSULTATION', billId: appt.id });
    expect(orderRes.status).toBe(400);
    expect(orderRes.body.message).toMatch(/not configured/i);
  });
});

describe('Razorpay: subscription self-serve renewal', () => {
  it('a clinic admin can pay their own renewal online, extending the period and syncing tier/status', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const before = await prisma.subscription.findUniqueOrThrow({ where: { clinicId: clinic.id } });

    const orderRes = await request(app).post('/api/payments/razorpay/subscription-orders').set(auth(adminToken)).send({});
    expect(orderRes.status).toBe(201);
    expect(orderRes.body.amount).toBe(99900); // Tier 1 MONTHLY default price, in paise (see subscriptionPricing.ts)
    const { orderId } = orderRes.body;
    const paymentId = uniquePaymentId('pay_subscription');

    const verifyRes = await request(app)
      .post('/api/payments/razorpay/verify')
      .set(auth(adminToken))
      .send({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signPayment(orderId, paymentId) });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.status).toBe('ACTIVE');

    const after = await prisma.subscription.findUniqueOrThrow({ where: { clinicId: clinic.id } });
    expect(after.currentPeriodEnd.getTime()).toBeGreaterThan(before.currentPeriodEnd.getTime());
    expect(after.tier).toBe(before.tier); // self-serve never changes tier

    const subPayment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayPaymentId: paymentId } });
    expect(subPayment.paidByUserId).not.toBeNull();
    expect(subPayment.recordedByAdminId).toBeNull();
  });

  it('a non-admin clinic user cannot initiate a subscription renewal', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const email = 'razorpay-sub-doctor@test.local';
    const { password } = await createUser(clinic.id, 'DOCTOR', { email });
    const session = await loginAs(clinic.slug, email, password);

    const res = await request(app).post('/api/payments/razorpay/subscription-orders').set(auth(session.token)).send({});
    expect(res.status).toBe(403);
  });
});
