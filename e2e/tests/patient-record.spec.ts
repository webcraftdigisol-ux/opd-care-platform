import { expect, test } from '@playwright/test';
import { createStaff, login, setupClinicWithDoctor } from '../helpers/api';
import { applySession } from '../helpers/session';

test.describe('Patient record: register, find, profile, edit', () => {
  test('admin registers a patient, lands on the profile, finds them again and edits the details', async ({ page }) => {
    const { admin } = await setupClinicWithDoctor();
    await applySession(page, admin);

    await page.goto('/admin');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'New Patient' }).click();
    await expect(page).toHaveURL(/\/patients\/new$/);

    await page.getByTestId('first-name').fill('Prasad');
    await page.getByTestId('last-name').fill('Kulkarni');
    await page.getByTestId('gender').selectOption('MALE');
    await page.getByTestId('age').fill('35');
    await page.getByTestId('phone').fill('98765 43210');
    await page.getByLabel('Known allergies').fill('Penicillin');
    await page.getByTestId('save-patient').click();

    // Straight onto the new patient's profile.
    await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('patient-name')).toHaveText('Prasad Kulkarni');
    await expect(page.getByTestId('patient-code')).toHaveText('PT000001');
    await expect(page.getByTestId('allergy-banner')).toContainText('Penicillin');

    // Find Patient: case-insensitive, part of the name, suggestions as you type.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Find Patient' }).click();
    await page.getByTestId('patient-search').fill('kulk');
    const result = page.getByTestId('patient-search-result');
    await expect(result).toHaveCount(1);
    await expect(result).toContainText('PT000001');
    await expect(result).toContainText('M, 35y');
    await result.click();
    await expect(page.getByTestId('patient-name')).toHaveText('Prasad Kulkarni');

    // Edit details from the profile.
    await page.getByRole('link', { name: 'Edit details' }).click();
    await page.getByLabel('City').fill('Pune');
    await page.getByTestId('save-patient').click();
    await expect(page.getByTestId('patient-code')).toHaveText('PT000001');
    await expect(page.getByText('Pune').first()).toBeVisible();

    // A second patient on the same mobile is warned about, not blocked.
    await page.goto('/patients/new');
    await page.getByTestId('first-name').fill('Asha');
    await page.getByTestId('phone').fill('9876543210');
    await expect(page.getByTestId('same-phone')).toContainText('Prasad Kulkarni');
    await page.getByTestId('save-patient').click();
    await expect(page.getByTestId('patient-code')).toHaveText('PT000002');
  });

  test('the front desk sees the profile and billing, but not the clinical tabs', async ({ page }) => {
    const { admin, clinicSlug } = await setupClinicWithDoctor();
    const staff = await createStaff(admin.token, { role: 'RECEPTIONIST' });
    const reception = await login({ clinicSlug, email: staff.email });
    await applySession(page, reception);

    await page.goto('/patients/new');
    await page.getByTestId('first-name').fill('Ravi');
    await page.getByTestId('phone').fill('9811122233');
    await page.getByTestId('save-patient').click();
    await expect(page.getByTestId('patient-code')).toHaveText('PT000001');

    await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Billing' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Consultations' })).toHaveCount(0);
  });

  test('admin gets every screen in the sidebar', async ({ page }) => {
    const { admin } = await setupClinicWithDoctor({ tier: 3 });
    await applySession(page, admin);
    await page.goto('/admin');
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const label of ['Dashboard', 'New Patient', 'Find Patient', 'Pharmacy counter', 'Lab counter', 'Radiology counter', 'In-Patients', 'Wards', 'Staff', 'Reports']) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
    // ...and can open them, e.g. the pharmacy counter.
    await nav.getByRole('link', { name: 'Pharmacy counter' }).click();
    await expect(page).toHaveURL(/\/pharmacy$/);
  });
});
