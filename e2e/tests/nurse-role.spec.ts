import { test, expect } from '@playwright/test';
import { createStaff, dischargeAdmission, login, setupAdmittedPatient } from '../helpers/api';
import { applySession } from '../helpers/session';

// Mirrors server/tests/role-gating.test.ts at the DOM level: a Nurse gets
// ward-floor logging (vitals/medications) but no financial or admin
// visibility, per the role comment at the top of IpdAdmissionDetailPage.tsx.
test.describe('Nurse role hides clinical/admin/billing controls', () => {
  test('a Nurse sees nursing controls but not clinical, transfer, or discharge controls', async ({ page }) => {
    const { clinicSlug, admin, admission } = await setupAdmittedPatient();
    const nurse = await createStaff(admin.token, { role: 'NURSE' });
    const nurseSession = await login({ clinicSlug, email: nurse.email });

    await applySession(page, nurseSession);
    await page.goto(`/admin/ipd/admissions/${admission.id}`);

    // Nursing: vitals + medications stay available to a plain Nurse.
    await expect(page.getByPlaceholder('Pulse')).toBeVisible();
    await expect(page.getByPlaceholder('Medicine').first()).toBeVisible();

    // Bed transfer / discharge are Admin+Doctor (transfer also Head Nurse).
    await expect(page.getByRole('button', { name: 'Transfer Room' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Discharge' })).toHaveCount(0);

    // Doctor visits / procedures / other charges / pharmacy / lab / radiology
    // "add" rows are Admin+Doctor only -- a plain Nurse gets exactly the two
    // nursing "+" buttons (vitals, medications), none of the other five.
    await expect(page.getByRole('button', { name: '+', exact: true })).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
  });

  test('a Nurse cannot see the final bill after discharge, but the admin can', async ({ page }) => {
    const { clinicSlug, admin, admission } = await setupAdmittedPatient();
    const nurse = await createStaff(admin.token, { role: 'NURSE' });
    await dischargeAdmission(admin.token, admission.id);

    await applySession(page, admin);
    await page.goto(`/admin/ipd/admissions/${admission.id}`);
    await expect(page.getByText('Final Bill')).toBeVisible();

    const nurseSession = await login({ clinicSlug, email: nurse.email });
    await applySession(page, nurseSession);
    await page.goto(`/admin/ipd/admissions/${admission.id}`);
    await expect(page.getByText('Final Bill')).toHaveCount(0);
  });

  test('a Nurse only sees the In-Patients nav link, and cannot reach /admin/staff', async ({ page }) => {
    const { clinicSlug, admin } = await setupAdmittedPatient();
    const nurse = await createStaff(admin.token, { role: 'NURSE' });
    const nurseSession = await login({ clinicSlug, email: nurse.email });

    await applySession(page, nurseSession);
    await page.goto('/admin/ipd/admissions');

    await expect(page.getByRole('link', { name: 'In-Patients' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Wards' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Staff' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Reports' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Notifications' })).toHaveCount(0);

    await page.goto('/admin/staff');
    await expect(page).toHaveURL('/admin/ipd/admissions');
  });
});
