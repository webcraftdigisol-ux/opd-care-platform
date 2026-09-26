import { expect, test } from '@playwright/test';
import { setupClinicWithDoctor } from '../helpers/api';
import { applySession } from '../helpers/session';

test.describe('Appointments page', () => {
  test('desk books a registered patient and an unregistered caller, registers the caller on arrival, and completes visits', async ({ page }) => {
    const { admin } = await setupClinicWithDoctor();
    await applySession(page, admin);

    // A registered patient to book.
    await page.goto('/patients/new');
    await page.getByTestId('first-name').fill('Prasad');
    await page.getByTestId('last-name').fill('Kulkarni');
    await page.getByTestId('phone').fill('9876543210');
    await page.getByTestId('save-patient').click();
    await expect(page.getByTestId('patient-code')).toHaveText('PT000001');

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Appointments' }).click();
    await expect(page.getByTestId('day-label')).toContainText('Today');
    await expect(page.getByText('No appointments scheduled for this day.')).toBeVisible();

    // 1. Search-first booking at 15:00.
    await page.getByTestId('schedule-appointment').click();
    await page.getByTestId('patient-search').fill('kulk');
    await page.getByTestId('patient-search-result').first().click();
    await expect(page.getByTestId('booking-patient')).toContainText('PT000001');
    await page.getByTestId('booking-time').fill('15:00');
    await page.getByTestId('confirm-booking').click();
    const rows = page.getByTestId('appointment-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('15:00');
    await expect(rows.first()).toContainText('Prasad Kulkarni');

    // 2. Someone not registered yet: name + mobile only.
    await page.getByTestId('schedule-appointment').click();
    await page.getByTestId('book-unregistered').click();
    await page.getByTestId('guest-name').fill('Sunita Patil');
    await page.getByTestId('guest-phone').fill('9822211100');
    await page.getByTestId('confirm-booking').click();
    await expect(rows).toHaveCount(2);
    const guestRow = rows.filter({ hasText: 'Sunita Patil' });
    await expect(guestRow).toContainText('Not registered');

    // On arrival: register (gets a Patient ID) and check in.
    await guestRow.getByRole('button', { name: 'Register & check in' }).click();
    await page.getByTestId('register-new').click();
    await expect(guestRow).not.toContainText('Not registered');
    await expect(guestRow).toContainText('PT000002');
    await expect(guestRow).toContainText('Checked In');

    // The first visit is marked completed from its row.
    const firstRow = rows.filter({ hasText: 'Prasad Kulkarni' });
    await firstRow.getByRole('button', { name: '✓ Completed' }).click();
    await expect(firstRow).toContainText('Completed');

    // Tomorrow is empty.
    await page.getByRole('button', { name: 'Next day' }).click();
    await expect(page.getByTestId('day-label')).toContainText('Tomorrow');
    await expect(page.getByText('No appointments scheduled for this day.')).toBeVisible();

    // The dashboard counts them.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByTestId('stat-Total patients')).toHaveText('2');
    await expect(page.getByTestId('stat-Appointments today')).toHaveText('2');
    await expect(page.getByTestId('recently-registered')).toContainText('Sunita Patil');
  });
});
