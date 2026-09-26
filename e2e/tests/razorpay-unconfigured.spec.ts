import { test, expect } from '@playwright/test';
import { bookAppointment, registerPatient, setupClinicWithDoctor } from '../helpers/api';
import { applySession } from '../helpers/session';

function tomorrowDateStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// The e2e environment (like this sandbox generally) has no real Razorpay
// credentials configured -- see server/.env.e2e, which deliberately carries
// no RAZORPAY_* vars, unlike server/.env.test's fake-but-signable ones used
// by the pure signature-verification unit tests. This is the realistic
// state every newly-registered clinic starts in, and per the "never fake a
// successful payment" design principle (see payments.routes.ts), the UI
// must show that honestly rather than offering a button that would fail.
test.describe('Razorpay: unconfigured clinic', () => {
  test('a patient sees online payment is unavailable instead of a Pay Online button', async ({ page }) => {
    const { clinicSlug, doctor } = await setupClinicWithDoctor();
    const patientSession = await registerPatient({ clinicSlug });
    await bookAppointment(patientSession.token, { doctorId: doctor.id, date: tomorrowDateStr(), startTime: '09:00' });

    await applySession(page, patientSession);
    await page.goto('/');

    await expect(page.getByText('Balance ₹500.00')).toBeVisible();
    await expect(page.getByText('Please pay this bill at the clinic counter.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Pay .* Online/ })).toHaveCount(0);
  });

  test('a clinic admin sees online renewal is unavailable instead of a Renew Now button', async ({ page }) => {
    const { clinicSlug, admin } = await setupClinicWithDoctor();
    void clinicSlug;

    await applySession(page, admin);
    await page.goto('/admin/billing');

    await expect(page.getByText('Tier 1 — OPD')).toBeVisible();
    await expect(page.getByText("Online renewal isn't set up yet")).toBeVisible();
    await expect(page.getByRole('button', { name: /Renew Now/ })).toHaveCount(0);
  });
});
