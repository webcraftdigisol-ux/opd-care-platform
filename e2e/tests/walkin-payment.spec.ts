import { test, expect } from '@playwright/test';
import { setupClinicWithDoctor } from '../helpers/api';
import { applySession } from '../helpers/session';

test.describe('admin walk-in registration + payment recording', () => {
  test('admin registers a walk-in patient and records their consultation fee payment', async ({ page }) => {
    const { admin, doctor } = await setupClinicWithDoctor();

    await applySession(page, admin);
    await page.goto('/admin/walk-in');

    await page.getByTestId('walkin-doctor').selectOption(doctor.id);
    await page.getByTestId('walkin-patient-name').fill('Walk-in Patient');
    await page.getByTestId('walkin-patient-phone').fill('9876543210');
    await page.getByTestId('walkin-reason').fill('Fever');
    await page.getByRole('button', { name: 'Register & Assign Token' }).click();

    await expect(page.getByTestId('walkin-success')).toContainText('Token number');
    await expect(page.getByTestId('walkin-success')).toContainText('#1');

    await page.goto('/reception');
    await expect(page.getByText('Walk-in Patient')).toBeVisible();

    // Expand the fee row to reveal the payment recorder, then pay it in full.
    await page.getByRole('button', { name: '₹500.00' }).click();
    await page.getByPlaceholder('Amount').fill('500');
    await page.getByRole('button', { name: 'Record Payment' }).click();

    await expect(page.getByText('Paid in full')).toBeVisible();
  });

  test('a duplicate walk-in phone number reuses the existing patient record', async ({ page }) => {
    const { admin, doctor } = await setupClinicWithDoctor();

    await applySession(page, admin);
    await page.goto('/admin/walk-in');
    await page.getByTestId('walkin-doctor').selectOption(doctor.id);
    await page.getByTestId('walkin-patient-name').fill('Repeat Patient');
    await page.getByTestId('walkin-patient-phone').fill('9998887770');
    await page.getByRole('button', { name: 'Register & Assign Token' }).click();
    await expect(page.getByTestId('walkin-success')).toContainText('#1');

    // Same phone number again, later the same day -- should get token #2
    // under the same patient record rather than erroring or duplicating.
    await page.getByTestId('walkin-patient-name').fill('Repeat Patient');
    await page.getByTestId('walkin-patient-phone').fill('9998887770');
    await page.getByRole('button', { name: 'Register & Assign Token' }).click();
    await expect(page.getByTestId('walkin-success')).toContainText('#2');
  });
});
