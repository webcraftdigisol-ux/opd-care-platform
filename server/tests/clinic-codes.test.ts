import request from 'supertest';
import { app, prisma, uniqueEmail, uniqueSlug } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

const register = (clinicSlug: string) =>
  request(app)
    .post('/api/clinics/register')
    .send({ clinicName: 'Code Test Clinic', clinicSlug, adminName: 'Admin', adminEmail: uniqueEmail('admin'), adminPassword: 'password123' });

describe('clinic codes double as web addresses', () => {
  it('refuses the platform’s own names and codes that are not valid subdomains', async () => {
    for (const code of ['app', 'api', 'www', 'platform', '-anandi', 'anandi-']) {
      const res = await register(code);
      expect(res.status).toBe(400);
    }
  });

  it('accepts an ordinary code, and the public lookup finds the clinic by it', async () => {
    const code = uniqueSlug('anandi');
    expect((await register(code)).status).toBe(201);
    const found = await request(app).get(`/api/clinics/${code}`);
    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({ slug: code, name: 'Code Test Clinic' });
  });
});
