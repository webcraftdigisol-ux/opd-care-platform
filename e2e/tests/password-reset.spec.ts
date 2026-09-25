import { test, expect } from '@playwright/test';
import { registerClinic, registerPatient, uniqueSlug } from '../helpers/api';
import { inputAfterLabel } from '../helpers/dom';

test.describe('forgot password over WhatsApp', () => {
  test('a patient reaches the reset page from sign-in, gets the code step, and a wrong code is rejected', async ({ page }) => {
    const clinicSlug = uniqueSlug('clinic-reset');
    await registerClinic({ clinicName: 'Reset Test Clinic', clinicSlug });
    await registerPatient({ clinicSlug, phone: '+919812345678' });

    await page.goto(`/login?clinic=${clinicSlug}`);
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(`/forgot-password?clinic=${clinicSlug}`);

    // The clinic code carries over from the sign-in page.
    await expect(page.getByPlaceholder('e.g. sunrise-clinic')).toHaveValue(clinicSlug);
    await page.getByTestId('reset-identifier').fill('98123 45678');
    await page.getByRole('button', { name: 'Send code on WhatsApp' }).click();

    await expect(page.getByText(/a 6-digit code has been sent to its WhatsApp number/)).toBeVisible();
    await page.getByTestId('reset-code').fill('000000');
    await inputAfterLabel(page, 'New password').fill('brand-new-pass');
    await inputAfterLabel(page, 'Confirm new password').fill('brand-new-pass');
    await page.getByRole('button', { name: 'Set new password' }).click();

    await expect(page.getByText('That code is invalid or has expired.', { exact: false })).toBeVisible();
  });
});
