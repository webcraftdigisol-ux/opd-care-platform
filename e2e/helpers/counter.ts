import { expect, type Page } from '@playwright/test';

// Opens a patient at a department counter (/pharmacy, /lab, /radiology)
// the way staff do: search by name, pick the result.
export async function openAtCounter(page: Page, base: '/pharmacy' | '/lab' | '/radiology', patientName: string): Promise<void> {
  await page.goto(base);
  await page.getByTestId('patient-search').fill(patientName);
  await page.getByTestId('patient-search-result').filter({ hasText: patientName }).first().click();
  await expect(page.getByTestId('dept-patient-name')).toHaveText(patientName);
}

// Adds a test the doctor didn't order and bills it -- the lab/radiology
// "walk-in" case.
export async function billExtraTest(page: Page, testName: string, price: string): Promise<void> {
  await page.getByTestId('add-test').click();
  await page.locator('input[data-testid^="test-extra-"]').fill(testName);
  await page.locator('input[data-testid^="test-price-extra-"]').fill(price);
  await page.getByTestId('mark-done').click();
  await expect(page.getByTestId('receipt-created')).toBeVisible();
}
