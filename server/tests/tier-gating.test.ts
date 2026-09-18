import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, auth } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('tier gating', () => {
  it('blocks Pharmacy/Lab/Radiology on a Tier 1 clinic with a clear 403', async () => {
    const { adminToken } = await setupClinicWithAdmin({ tier: 1 });

    for (const path of ['/api/pharmacy/items', '/api/lab/catalog', '/api/radiology/catalog']) {
      const res = await request(app).get(path).set(auth(adminToken));
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Tier 2\+/);
    }
  });

  it('blocks IPD on a Tier 1 or Tier 2 clinic', async () => {
    const { adminToken: tier1Token } = await setupClinicWithAdmin({ tier: 1 });
    const { adminToken: tier2Token } = await setupClinicWithAdmin({ tier: 2 });

    for (const token of [tier1Token, tier2Token]) {
      const res = await request(app).get('/api/ipd/admissions').set(auth(token));
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Tier 3\+/);
    }
  });

  it('allows Pharmacy/Lab/Radiology on Tier 2+ and IPD only on Tier 3', async () => {
    const { adminToken: tier2Token } = await setupClinicWithAdmin({ tier: 2 });
    for (const path of ['/api/pharmacy/items', '/api/lab/catalog', '/api/radiology/catalog']) {
      const res = await request(app).get(path).set(auth(tier2Token));
      expect(res.status).toBe(200);
    }
    expect((await request(app).get('/api/ipd/admissions').set(auth(tier2Token))).status).toBe(403);

    const { adminToken: tier3Token } = await setupClinicWithAdmin({ tier: 3 });
    expect((await request(app).get('/api/ipd/admissions').set(auth(tier3Token))).status).toBe(200);
  });

  it('upgrading a clinic mid-session unlocks a tier-gated route on the SAME token, without re-login', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });

    const before = await request(app).get('/api/pharmacy/items').set(auth(adminToken));
    expect(before.status).toBe(403);

    // Tier is fetched fresh per request (never baked into the JWT), so this
    // takes effect immediately on the token already in hand.
    await prisma.clinic.update({ where: { id: clinic.id }, data: { tier: 2 } });

    const after = await request(app).get('/api/pharmacy/items').set(auth(adminToken));
    expect(after.status).toBe(200);
  });

  it('downgrading a clinic mid-session re-locks a tier-gated route the same way', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 3 });
    expect((await request(app).get('/api/ipd/admissions').set(auth(adminToken))).status).toBe(200);

    await prisma.clinic.update({ where: { id: clinic.id }, data: { tier: 1 } });

    const after = await request(app).get('/api/ipd/admissions').set(auth(adminToken));
    expect(after.status).toBe(403);
  });
});
