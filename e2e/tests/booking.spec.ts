import { test, expect } from '@playwright/test';
import { registerPatient, setupClinicWithDoctor } from '../helpers/api';
import { applySession } from '../helpers/session';

test.describe('patient booking', () => {
  test('a patient can book an appointment and see it on their dashboard', async ({ page }) => {
    const { clinicSlug, doctor } = await setupClinicWithDoctor();
    const patientSession = await registerPatient({ clinicSlug });

    await applySession(page, patientSession);
    await page.goto('/book');

    await expect(page.getByText('Loading doctors…')).toBeHidden();
    await page.locator('select').selectOption(doctor.id);
    await page.getByRole('button', { name: 'Confirm Booking' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByText('My Appointments')).toBeVisible();
    await expect(page.getByText(doctor.user.name)).toBeVisible();
    await expect(page.getByText('#1')).toBeVisible();
  });

  test('the doctor field is required, so an empty form cannot be submitted', async ({ page }) => {
    const { clinicSlug } = await setupClinicWithDoctor();
    const patientSession = await registerPatient({ clinicSlug });

    await applySession(page, patientSession);
    await page.goto('/book');
    await expect(page.getByText('Loading doctors…')).toBeHidden();

    await page.getByRole('button', { name: 'Confirm Booking' }).click();
    // Native HTML5 required-field validation blocks the submit before the
    // app's own onSubmit handler ever runs, so the page never navigates.
    await expect(page).toHaveURL('/book');
    const isValid = await page.locator('select').evaluate((el: HTMLSelectElement) => el.checkValidity());
    expect(isValid).toBe(false);
  });
});
