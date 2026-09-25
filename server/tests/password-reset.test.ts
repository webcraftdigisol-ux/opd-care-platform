import crypto from 'crypto';
import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, loginAs, uniqueEmail } from './helpers';
import { resetWhatsAppClientForTests } from '../src/utils/whatsapp';

afterAll(async () => {
  await prisma.$disconnect();
});

// The code is random and only its hash is stored, so tests pin it.
function pinNextCode(code: number) {
  return jest.spyOn(crypto, 'randomInt').mockImplementationOnce(() => code);
}

async function requestCode(clinicSlug: string, identifier: string) {
  return request(app).post('/api/auth/password-reset/request').send({ clinicSlug, identifier });
}

async function confirm(clinicSlug: string, identifier: string, code: string, newPassword = 'new-password-1') {
  return request(app).post('/api/auth/password-reset/confirm').send({ clinicSlug, identifier, code, newPassword });
}

async function setupPatient(phone = `+9198${Math.floor(10000000 + Math.random() * 89999999)}`) {
  const { clinic } = await setupClinicWithAdmin({ tier: 1 });
  const email = uniqueEmail('reset');
  const { user } = await createUser(clinic.id, 'PATIENT', { email, phone, password: 'old-password' });
  return { clinic, user, email, phone };
}

describe('Password reset over WhatsApp', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends a code for an email match, and the code resets the password exactly once', async () => {
    const { clinic, user, email } = await setupPatient();
    pinNextCode(123456);

    const req = await requestCode(clinic.slug, email);
    expect(req.status).toBe(200);
    expect(req.body.message).toMatch(/6-digit code/);

    const otp = await prisma.passwordResetOtp.findFirstOrThrow({ where: { userId: user.id } });
    expect(otp.codeHash).not.toContain('123456');
    const notification = await prisma.notification.findFirstOrThrow({
      where: { patientId: user.id, type: 'PASSWORD_RESET_OTP' },
    });
    expect(notification.channel).toBe('WHATSAPP');
    expect(notification.status).toBe('SENT'); // the stub client in tests
    expect(notification.body).not.toContain('123456');

    const ok = await confirm(clinic.slug, email, '123456');
    expect(ok.status).toBe(200);
    await expect(loginAs(clinic.slug, email, 'new-password-1')).resolves.toBeTruthy();

    const reused = await confirm(clinic.slug, email, '123456', 'another-password');
    expect(reused.status).toBe(400);
  });

  it('finds the account by phone however it is typed, and the phone then works as a login', async () => {
    const { clinic, phone } = await setupPatient('+919876512345');
    pinNextCode(654321);

    await requestCode(clinic.slug, '98765 12345');
    const ok = await confirm(clinic.slug, '098765-12345', '654321');
    expect(ok.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ clinicSlug: clinic.slug, email: '9876512345', password: 'new-password-1' });
    expect(login.status).toBe(200);
    expect(login.body.user.phone).toBe(phone);
  });

  it('gives the same reply for an unknown account or one with no phone, and sends nothing', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const email = uniqueEmail('nophone');
    const { user } = await createUser(clinic.id, 'PATIENT', { email });

    const known = await requestCode(clinic.slug, email);
    const unknown = await requestCode(clinic.slug, 'nobody@example.com');
    expect(known.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(await prisma.passwordResetOtp.count({ where: { userId: user.id } })).toBe(0);
  });

  it('retires a code after 5 wrong guesses, even if the 6th is right', async () => {
    const { clinic, email, user } = await setupPatient();
    pinNextCode(111111);
    await requestCode(clinic.slug, email);

    for (let i = 0; i < 5; i++) {
      expect((await confirm(clinic.slug, email, '999999')).status).toBe(400);
    }
    expect((await confirm(clinic.slug, email, '111111')).status).toBe(400);
    const otp = await prisma.passwordResetOtp.findFirstOrThrow({ where: { userId: user.id } });
    expect(otp.attempts).toBe(5);
    expect(otp.usedAt).not.toBeNull();
  });

  it('rejects an expired code', async () => {
    const { clinic, email, user } = await setupPatient();
    pinNextCode(222222);
    await requestCode(clinic.slug, email);
    await prisma.passwordResetOtp.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await confirm(clinic.slug, email, '222222')).status).toBe(400);
  });

  it('allows one code per minute, and a new code replaces the old one', async () => {
    const { clinic, email, user } = await setupPatient();
    pinNextCode(333333);
    await requestCode(clinic.slug, email);
    await requestCode(clinic.slug, email); // inside the 60s cooldown: no new code
    expect(await prisma.passwordResetOtp.count({ where: { userId: user.id } })).toBe(1);

    // Age the first code past the cooldown, then ask again.
    await prisma.passwordResetOtp.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
    });
    pinNextCode(444444);
    await requestCode(clinic.slug, email);
    expect(await prisma.passwordResetOtp.count({ where: { userId: user.id } })).toBe(2);

    expect((await confirm(clinic.slug, email, '333333')).status).toBe(400);
    expect((await confirm(clinic.slug, email, '444444')).status).toBe(200);
  });

  it('validates the code format and password length', async () => {
    const { clinic, email } = await setupPatient();
    expect((await confirm(clinic.slug, email, '12ab56')).status).toBe(400);
    expect((await confirm(clinic.slug, email, '123456', '123')).status).toBe(400);
  });
});

describe('Sign-in and reset by phone with a shared number', () => {
  it('treats a phone that matches two accounts as no match, so email must be used', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    await createUser(clinic.id, 'DOCTOR', { phone: '+919811100000', password: 'pw-123456' });
    const { user: patient } = await createUser(clinic.id, 'PATIENT', { phone: '98111 00000', password: 'pw-123456' });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ clinicSlug: clinic.slug, email: '9811100000', password: 'pw-123456' });
    expect(login.status).toBe(401);

    await request(app).post('/api/auth/password-reset/request').send({ clinicSlug: clinic.slug, identifier: '9811100000' });
    expect(await prisma.passwordResetOtp.count({ where: { userId: patient.id } })).toBe(0);
  });
});

describe('Password reset without a WhatsApp provider', () => {
  const saved = process.env.WHATSAPP_PROVIDER;
  beforeEach(() => {
    delete process.env.WHATSAPP_PROVIDER; // like a fresh deployment: no provider, stub fallback
    resetWhatsAppClientForTests();
  });
  afterEach(() => {
    process.env.WHATSAPP_PROVIDER = saved;
    resetWhatsAppClientForTests();
  });

  it('reports itself unavailable and refuses to "send" a code nobody would receive', async () => {
    const { clinic, email, user } = await setupPatient();

    const status = await request(app).get('/api/auth/password-reset/status');
    expect(status.body).toEqual({ available: false });

    const res = await requestCode(clinic.slug, email);
    expect(res.status).toBe(503);
    expect(await prisma.passwordResetOtp.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe('Password reset status', () => {
  it('is available when a provider (or the deliberately chosen stub) is configured', async () => {
    const status = await request(app).get('/api/auth/password-reset/status');
    expect(status.body).toEqual({ available: true });
  });
});
