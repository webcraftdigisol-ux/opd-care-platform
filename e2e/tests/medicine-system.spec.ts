import { expect, test } from '@playwright/test';
import { uniqueEmail } from '../helpers/api';

test.describe('Type of clinic', () => {
  test('an Ayurvedic Tier 2 clinic registers and its pharmacy starts with the Ayurvedic list', async ({ page }) => {
    await page.goto('/register-clinic');
    const code = `ayur${Date.now().toString().slice(-8)}`;
    await page.locator('label:text-is("Clinic name") + input').fill('Dhanvantari Ayurveda');
    await page.locator('label:text-is("Clinic code (used to sign in)") + input').fill(code);
    await page.locator('label:text-is("Plan") + select').selectOption('2');
    await page.getByText('Ayurvedic', { exact: true }).click();
    await expect(page.getByTestId('load-lists')).toBeChecked();
    await page.locator('label:text-is("Your name (clinic admin)") + input').fill('Dr. Admin');
    await page.locator('label:text-is("Your email") + input').fill(uniqueEmail('ayur'));
    await page.locator('label:text-is("Password") + input').fill('password123');
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto('/pharmacy/settings');
    await expect(page.getByTestId('load-standard')).toContainText('Ayurvedic');
    await page.getByTestId('med-filter').fill('triphala churna');
    await expect(page.getByTestId('med-row').first()).toContainText('Triphala Churna');
    await page.getByTestId('med-filter').fill('paracetamol');
    await expect(page.getByTestId('med-row')).toHaveCount(0);

    await page.goto('/admin/settings');
    await expect(page.getByTestId('clinic-medicine-system')).toHaveValue('AYURVEDIC');
  });
});
