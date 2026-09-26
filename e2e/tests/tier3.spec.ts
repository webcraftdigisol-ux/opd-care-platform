import { expect, test } from '@playwright/test';
import { createDoctor, login, request, setupAdmittedPatient, setupClinicWithDoctor, uniqueEmail } from '../helpers/api';
import { applySession } from '../helpers/session';

test.describe('Certificates (every tier)', () => {
  test('a doctor issues a sick-leave certificate with suggested wording and prints it', async ({ page, context }) => {
    const { clinicSlug, admin } = await setupClinicWithDoctor({ tier: 1 });
    const email = uniqueEmail('doctor');
    await createDoctor(admin.token, { name: 'Asha Rao', email });
    const doctor = await login({ clinicSlug, email });
    const patient = await request<{ id: string }>('POST', '/patients', { firstName: 'Kiran', lastName: 'Joshi', phone: '9811100077', gender: 'FEMALE', ageYears: 34 }, admin.token);

    await applySession(page, doctor);
    await page.goto(`/patients/${patient.id}?tab=certificates`);
    await page.getByTestId('new-certificate').click();
    await page.getByTestId('certificate-type').selectOption('SICK_LEAVE');
    await page.getByTestId('certificate-diagnosis').fill('acute viral fever');
    await page.getByTestId('certificate-from').fill('2026-09-24');
    await page.getByTestId('certificate-to').fill('2026-09-27');
    await expect(page.getByTestId('certificate-body')).toHaveValue(/Ms\. Kiran Joshi, aged 34 years, has been under my treatment for acute viral fever\..*\(4 days\)/);

    const [printed] = await Promise.all([context.waitForEvent('page'), page.getByTestId('issue-certificate').click()]);
    await expect(printed.getByTestId('certificate-print')).toContainText('Sick leave / medical certificate');
    await expect(printed.getByTestId('certificate-body-print')).toContainText('rest from 24 September 2026 to 27 September 2026');
    await expect(printed.getByTestId('certificate-print')).toContainText('Dr. Asha Rao');
    await printed.close();
    await expect(page.getByTestId('certificate-row')).toContainText('Sick leave / medical certificate');
  });
});

test.describe('Tier 3 IPD', () => {
  test('consent for surgery: written, printed, marked signed, and a procedure recorded under it; the running bill shows on the patient', async ({ page, context }) => {
    const { admin, patientSession, admission } = await setupAdmittedPatient();
    await applySession(page, admin);
    await page.goto(`/admin/ipd/admissions/${admission.id}`);

    await page.getByTestId('new-consent').click();
    await page.getByTestId('consent-kind').selectOption('SURGERY');
    await page.getByTestId('consent-procedure').fill('Laparoscopic appendectomy');
    await page.getByTestId('consent-risks').fill('Bleeding, infection, conversion to open surgery');
    await page.getByTestId('save-consent').click();
    const row = page.getByTestId('consent-row').filter({ hasText: 'Laparoscopic appendectomy' });
    await expect(row).toContainText('Awaiting signature');

    const [printed] = await Promise.all([context.waitForEvent('page'), row.getByTestId('print-consent').click()]);
    await expect(printed.getByTestId('consent-print')).toContainText('Informed Consent for Surgery / Operation');
    await expect(printed.getByTestId('consent-print')).toContainText('Bleeding, infection, conversion to open surgery');
    await expect(printed.getByTestId('consent-print')).toContainText('General Ward');
    await printed.close();

    await row.getByTestId('mark-signed').click();
    await page.getByTestId('signer-name').fill('Sunita Patil');
    await page.getByTestId('signer-relation').selectOption('Spouse');
    await page.getByTestId('witness-name').fill('Nurse Asha');
    await page.getByTestId('confirm-signed').click();
    await expect(row.getByTestId('consent-signed')).toContainText('Signed by Sunita Patil (Spouse), witness Nurse Asha');

    // Record the surgery under that consent.
    await page.getByPlaceholder('Procedure name').fill('Laparoscopic appendectomy');
    await page.getByPlaceholder('Fee').last().fill('20000');
    await page.getByTestId('procedure-consent').selectOption({ label: 'Consent: Laparoscopic appendectomy' });
    await page.getByPlaceholder('Procedure name').locator('xpath=..').getByRole('button', { name: '+' }).click();
    await expect(page.getByText('(consent signed by Sunita Patil)')).toBeVisible();

    // The patient's Billing tab has the admission's running bill.
    await page.goto(`/patients/${patientSession.user.id}?tab=billing`);
    const bill = page.getByTestId('ipd-bill');
    await expect(bill).toContainText('In progress');
    await bill.locator('summary').click();
    await expect(bill.getByTestId('ipd-breakdown')).toContainText('Procedures & surgery');
    await expect(bill.getByTestId('ipd-breakdown')).toContainText('₹20,000');
    await expect(bill.getByTestId('ipd-breakdown')).toContainText('Deposit paid at admission');
  });

  test('the in-house revenue report splits OPD and IPD at a Tier 3 clinic', async ({ page }) => {
    const { admin, admission } = await setupAdmittedPatient();
    await request('POST', `/ipd/admissions/${admission.id}/procedures`, { name: 'Dressing', consentSigned: false, fee: 700 }, admin.token);
    await applySession(page, admin);
    await page.goto('/admin/reports');
    await page.getByRole('tab', { name: 'Revenue summary' }).click();
    await expect(page.getByTestId('orders-by-department')).toContainText('OPD — ordered vs done in-house');
    await expect(page.getByTestId('orders-dept-PROCEDURE').getByTestId('dept-ipd')).toHaveText('₹700');
    await expect(page.getByTestId('orders-dept-PROCEDURE').getByTestId('dept-total')).toHaveText('₹700');
  });
});
