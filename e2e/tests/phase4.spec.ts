import { expect, test } from '@playwright/test';
import { createDoctor, giveDoctorFullWeekSchedule, login, registerClinic, uniqueEmail, uniqueSlug } from '../helpers/api';
import { applySession } from '../helpers/session';
import { inputAfterLabel } from '../helpers/dom';

async function tier1Clinic() {
  const clinicSlug = uniqueSlug('clinic');
  const admin = await registerClinic({ clinicName: 'E2E Phase 4 Clinic', clinicSlug, tier: 1 });
  const doctorEmail = uniqueEmail('doctor');
  const doctor = await createDoctor(admin.token, { email: doctorEmail, consultationFee: 600, name: 'Asha Rao' });
  await giveDoctorFullWeekSchedule(admin.token, doctor.id);
  return { clinicSlug, admin, doctor, doctorEmail };
}

async function newPatient(page: import('@playwright/test').Page, firstName: string, phone: string) {
  await page.goto('/patients/new');
  await page.getByTestId('first-name').fill(firstName);
  await page.getByTestId('phone').fill(phone);
  await page.getByTestId('save-patient').click();
  await expect(page.getByTestId('patient-code')).toBeVisible();
  return page.url();
}

test.describe('Phase 4', () => {
  test('admin adds a username-only receptionist, who signs in with the username; deactivating locks them out', async ({ page, browser }) => {
    const { clinicSlug, admin } = await tier1Clinic();
    await applySession(page, admin);
    await page.goto('/admin/staff');
    await page.getByTestId('add-staff').click();
    await page.getByTestId('staff-name').fill('Rekha Desk');
    await page.getByTestId('staff-username').fill('Rekha Desk');
    await expect(page.getByTestId('staff-username')).toHaveValue('rekhadesk');
    await page.getByTestId('staff-password').fill('temp123');
    await page.getByTestId('create-staff').click();
    const row = page.getByTestId('staff-row').filter({ hasText: 'Rekha Desk' });
    await expect(row).toContainText('@rekhadesk');

    // Sign in as her in a separate browser (its own storage).
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await other.goto('/login');
    await other.getByPlaceholder('e.g. sunrise-clinic').fill(clinicSlug);
    await inputAfterLabel(other, 'Email, phone or username').fill('rekhadesk');
    await other.locator('input[type="password"]').fill('temp123');
    await other.getByRole('button', { name: 'Sign in' }).click();
    await expect(other).toHaveURL('/reception');

    // Deactivate: her next sign-in is refused.
    await row.getByRole('button', { name: 'Deactivate' }).click();
    await expect(row).toContainText('Deactivated');
    await other.evaluate(() => localStorage.clear());
    await other.goto('/login');
    await other.getByPlaceholder('e.g. sunrise-clinic').fill(clinicSlug);
    await inputAfterLabel(other, 'Email, phone or username').fill('rekhadesk');
    await other.locator('input[type="password"]').fill('temp123');
    await other.getByRole('button', { name: 'Sign in' }).click();
    await expect(other.getByText(/deactivated/)).toBeVisible();
    await otherContext.close();
  });

  test('catalogue brands flow into the prescription and the printed summary', async ({ page }) => {
    const { clinicSlug, doctorEmail } = await tier1Clinic();
    const doctor = await login({ clinicSlug, email: doctorEmail });
    await applySession(page, doctor);

    // The starter list brings in medicines with brands.
    await page.goto('/catalogue');
    await page.getByTestId('add-common').click();
    await expect(page.getByText(/Added \d+ items/)).toBeVisible();
    await page.getByTestId('catalogue-filter').fill('dolo 650');
    const para = page.getByTestId('catalogue-row').filter({ hasText: 'Paracetamol' });
    await expect(para).toContainText('Dolo 650');

    // Add another brand to it.
    await para.getByRole('button', { name: /Edit Paracetamol/ }).click();
    await page.getByTestId('edit-brands').fill('Pyrigesic 650');
    await page.getByTestId('edit-brands').press('Enter');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('catalogue-row').filter({ hasText: 'Pyrigesic 650' })).toBeVisible();

    // Prescribe by typing the brand.
    await newPatient(page, 'Meera', '9822233344');
    await page.getByRole('tab', { name: 'Consultations' }).click();
    await page.getByTestId('new-consultation').click();
    await page.getByRole('button', { name: 'Add medicine' }).click();
    await page.getByTestId('prescription-medicine-0').fill('pyrig');
    await page.getByTestId('prescription-medicine-0-suggestions').getByText('Pyrigesic 650 — Paracetamol 650 mg').click();
    await expect(page.getByTestId('prescription-medicine-0')).toHaveValue('Paracetamol');
    await expect(page.getByTestId('prescription-brand-0')).toHaveValue('Pyrigesic 650');

    // The brand box offers the other brands of that medicine.
    await page.getByTestId('prescription-brand-0').fill('');
    await page.getByTestId('prescription-brand-0').focus();
    await expect(page.getByTestId('prescription-brand-0-suggestions')).toContainText('Dolo 650');
    await page.getByTestId('prescription-brand-0-suggestions').getByText('Dolo 650').click();

    await page.getByTestId('rx-morning-0').check();
    await page.getByTestId('rx-night-0').check();
    await expect(page.getByTestId('rx-total-0')).toContainText('× Dolo 650');
    await page.getByTestId('save-consultation').click();
    await page.getByTestId('print-summary').first().click();
    await expect(page.getByTestId('visit-summary')).toContainText('Dolo 650 (Paracetamol 650 mg)');
  });

  test('revenue report shows billed vs collected and exports CSV; a report file is uploaded to the patient', async ({ page }) => {
    const { admin, doctor } = await tier1Clinic();
    await applySession(page, admin);
    const profile = await newPatient(page, 'Ravi', '9811122233');
    const patientId = profile.split('/').pop()!;

    // A visit with part of the fee paid.
    await page.goto(`/admin/walk-in?patientId=${patientId}`);
    await page.getByTestId('walkin-doctor').selectOption(doctor.id);
    await page.getByRole('button', { name: 'Register & Assign Token' }).click();
    await expect(page.getByTestId('walkin-success')).toBeVisible();
    await page.goto('/admin');
    await page.getByRole('button', { name: '₹600.00' }).click();
    await page.getByPlaceholder('Amount').fill('200');
    await page.getByRole('button', { name: 'Record Payment' }).click();
    await expect(page.getByText(/200/).first()).toBeVisible();

    await page.goto('/admin/reports');
    await expect(page.getByTestId('report-records')).toHaveText('1');
    await expect(page.getByTestId('report-billed')).toHaveText('₹600');
    await expect(page.getByTestId('report-collected')).toHaveText('₹200');
    await expect(page.getByTestId('report-outstanding')).toHaveText('₹400');
    await expect(page.getByTestId('transactions')).toContainText('Part paid');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
    expect(download.suggestedFilename()).toMatch(/^revenue_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.csv$/);

    // Upload an outside report to the patient's record.
    await page.goto(`/patients/${patientId}?tab=reports`);
    await page.getByTestId('upload-PATIENT_REPORT').setInputFiles({
      name: 'outside-cbc.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%e2e\n'),
    });
    await expect(page.getByText('outside-cbc.pdf')).toBeVisible();
  });
});
