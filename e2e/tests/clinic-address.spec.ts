import { expect, test } from '@playwright/test';
import { registerClinic, uniqueEmail, uniqueSlug } from '../helpers/api';
import { inputAfterLabel } from '../helpers/dom';

// A clinic's own address (<code>.ohmscare.in in production,
// <code>.localhost here) already knows the clinic: no clinic code to type.
test.describe("clinic's own address", () => {
  test('signs in without a clinic code, showing the clinic’s name', async ({ page }) => {
    const clinicSlug = uniqueSlug('anandi');
    const email = uniqueEmail('admin');
    await registerClinic({ clinicName: 'Anandi Hospital', clinicSlug, adminEmail: email });

    await page.goto(`http://${clinicSlug}.localhost:5173/login`);
    await expect(page.getByTestId('host-clinic')).toHaveText('Anandi Hospital');
    await expect(page.getByPlaceholder('e.g. sunrise-clinic')).toHaveCount(0);
    await expect(page.getByText('Register your clinic')).toHaveCount(0);
    await inputAfterLabel(page, 'Email, phone or username').fill(email);
    await page.locator('input[type="password"]').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(`http://${clinicSlug}.localhost:5173/admin`);
  });

  test('says so when no clinic has that code', async ({ page }) => {
    await page.goto('http://no-such-clinic-xyz.localhost:5173/login');
    await expect(page.getByTestId('host-clinic-not-found')).toBeVisible();
  });
});
