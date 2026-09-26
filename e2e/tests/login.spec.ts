import { test, expect } from '@playwright/test';
import { registerClinic, registerPatient, uniqueSlug } from '../helpers/api';
import { inputAfterLabel } from '../helpers/dom';

test.describe('login and role-based routing', () => {
  test('a newly registered patient lands on their dashboard after registering via the UI', async ({ page }) => {
    const clinicSlug = uniqueSlug('clinic-login');
    await registerClinic({ clinicName: 'Login Test Clinic', clinicSlug });

    await page.goto(`/register?clinic=${clinicSlug}`);
    await page.getByPlaceholder('e.g. sunrise-clinic').fill(clinicSlug);
    await page.locator('input[type="email"]').fill('patient-ui@e2e.test');
    await page.locator('input[type="password"]').fill('password123');
    await inputAfterLabel(page, 'Full name').fill('UI Test Patient');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByText('My Appointments')).toBeVisible();
  });

  test('an admin logging in is routed to /admin', async ({ page }) => {
    const clinicSlug = uniqueSlug('clinic-login');
    const { user } = await registerClinic({ clinicName: 'Login Test Clinic', clinicSlug, adminEmail: 'admin-ui@e2e.test' });

    await page.goto('/login');
    await page.getByPlaceholder('e.g. sunrise-clinic').fill(clinicSlug);
    await inputAfterLabel(page, 'Email, phone or username').fill(user.email);
    await page.locator('input[type="password"]').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/admin');
  });

  test('a wrong password shows an error and does not navigate away from /login', async ({ page }) => {
    const clinicSlug = uniqueSlug('clinic-login');
    await registerClinic({ clinicName: 'Login Test Clinic', clinicSlug });
    const patientEmail = 'patient-badpw@e2e.test';
    await registerPatient({ clinicSlug, email: patientEmail });

    await page.goto('/login');
    await page.getByPlaceholder('e.g. sunrise-clinic').fill(clinicSlug);
    await inputAfterLabel(page, 'Email, phone or username').fill(patientEmail);
    await page.locator('input[type="password"]').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });
});
