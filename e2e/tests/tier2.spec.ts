import { expect, test, type Page } from '@playwright/test';
import { createDoctor, createStaff, login, request, setupClinicWithDoctor, uniqueEmail } from '../helpers/api';
import { applySession } from '../helpers/session';
import { openAtCounter } from '../helpers/counter';

async function tier2Clinic() {
  const { clinicSlug, admin } = await setupClinicWithDoctor({ tier: 2 });
  // A doctor we can sign in as.
  const doctorEmail = uniqueEmail('doctor');
  await createDoctor(admin.token, { name: 'Asha Rao', email: doctorEmail });
  const pharmacist = await createStaff(admin.token, { role: 'PHARMACIST', name: 'Ravi Pharma' });
  const labTech = await createStaff(admin.token, { role: 'LAB_TECHNICIAN', name: 'Lata Lab' });
  return {
    clinicSlug,
    admin,
    doctor: await login({ clinicSlug, email: doctorEmail }),
    pharmacist: await login({ clinicSlug, email: pharmacist.email }),
    labTech: await login({ clinicSlug, email: labTech.email }),
  };
}

async function setMrp(page: Page, filter: string, brand: string, mrp: string) {
  await page.getByTestId('med-filter').fill(filter);
  await page.getByRole('button', { name: `Edit ${brand}` }).click();
  await page.getByTestId('edit-mrp').fill(mrp);
  await page.getByTestId('save-edit').click();
  await expect(page.getByTestId('med-row').filter({ hasText: brand })).toContainText(`₹${mrp}`);
}

test.describe('Tier 2 departments', () => {
  test('pharmacy: the doctor prescribes from the pharmacy list, the pharmacist substitutes a brand, dispenses and prints the receipt; the doctor sees the in-house revenue', async ({ page, context }) => {
    const { doctor, pharmacist } = await tier2Clinic();

    // Pharmacist loads the standard list and prices two brands of Paracetamol 650.
    await applySession(page, pharmacist);
    await page.goto('/pharmacy/settings');
    await page.getByTestId('load-standard').click();
    await expect(page.getByText(/Added \d+ medicines/)).toBeVisible();
    await setMrp(page, 'dolo 650', 'Dolo 650', '2.5');
    await setMrp(page, 'calpol 650', 'Calpol 650', '2');

    // Doctor: no Doctor's Catalogue in Tier 2; prescribes Dolo 650 and a CBC.
    await applySession(page, doctor);
    await page.goto('/doctor');
    await expect(page.getByRole('link', { name: "Doctor's Catalogue" })).toHaveCount(0);
    await page.goto('/patients/new');
    await page.getByTestId('first-name').fill('Meera');
    await page.getByTestId('phone').fill('9822233344');
    await page.getByTestId('save-patient').click();
    await expect(page.getByTestId('patient-code')).toBeVisible();
    await page.getByRole('tab', { name: 'Consultations' }).click();
    await page.getByTestId('new-consultation').click();
    await page.getByRole('button', { name: 'Add medicine' }).click();
    await page.getByTestId('prescription-medicine-0').fill('dolo 6');
    await page.getByTestId('prescription-medicine-0-suggestions').getByText('Dolo 650 — Paracetamol 650 mg').click();
    await page.getByTestId('rx-morning-0').check();
    await page.getByTestId('rx-night-0').check();
    await page.getByRole('button', { name: 'Add test' }).click();
    await page.getByTestId('lab-test-name-0').fill('CBC');
    await page.getByTestId('save-consultation').click();
    await expect(page.getByTestId('print-summary').first()).toBeVisible();

    // Pharmacist: Meera is waiting; Dolo is swapped for Calpol.
    await applySession(page, pharmacist);
    await page.goto('/pharmacy');
    await page.getByTestId('queue-row').filter({ hasText: 'Meera' }).click();
    await expect(page.getByTestId('dept-patient-name')).toHaveText('Meera');
    const line = page.getByTestId('rx-line').filter({ hasText: 'Dolo 650 (Paracetamol 650 mg)' });
    const product = line.locator('select[data-testid^="product-"]');
    await expect(product.locator('option:checked')).toContainText('Dolo 650 (Paracetamol 650 mg)');
    await product.selectOption({ label: await product.locator('option', { hasText: 'Calpol 650' }).first().innerText() });
    await expect(line).toContainText('Substitute for Dolo 650 (Paracetamol 650 mg)');
    await line.locator('input[data-testid^="qty-"]').fill('10');
    await expect(page.getByTestId('dispense-total')).toHaveText('₹20.00');
    await page.getByTestId('dispense').click();
    await expect(page.getByTestId('receipt-created')).toBeVisible();
    await expect(line).toContainText('Dispensed as Calpol 650 (Paracetamol 650 mg)');

    const [receipt] = await Promise.all([context.waitForEvent('page'), page.getByTestId('print-receipt').click()]);
    await expect(receipt.getByTestId('receipt-patient')).toHaveText('Meera');
    await expect(receipt.getByTestId('receipt-line')).toContainText('In place of Dolo 650 (Paracetamol 650 mg)');
    await expect(receipt.getByTestId('receipt-total')).toHaveText('₹20.00');
    await receipt.close();

    // She's no longer waiting at the pharmacy.
    await page.goto('/pharmacy');
    await expect(page.getByTestId('queue-row').filter({ hasText: 'Meera' })).toHaveCount(0);

    // The pharmacist's own revenue report shows only pharmacy bills.
    await page.goto('/admin/reports');
    await page.getByRole('tab', { name: 'Bills & collections' }).click();
    await expect(page.getByTestId('report-billed')).toHaveText('₹20');
    await expect(page.getByText('Showing pharmacy bills.')).toBeVisible();

    // Doctor: 1 of 1 medicine done in-house (as a substitute), the CBC pending.
    await applySession(page, doctor);
    await page.goto('/admin/reports');
    await page.getByRole('tab', { name: 'Revenue summary' }).click();
    await expect(page.getByTestId('orders-dept-CONSULTATION').getByTestId('dept-inhouse')).toHaveText('₹500');
    await expect(page.getByTestId('orders-dept-PHARMACY').getByTestId('dept-inhouse')).toHaveText('₹20');
    await expect(page.getByTestId('orders-dept-LAB').getByTestId('dept-inhouse')).toHaveText('₹0');
    await expect(page.getByTestId('orders-total')).toContainText('₹520');
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-orders').click()]);
    expect(csv.suggestedFilename()).toMatch(/^inhouse_revenue_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('lab: the technician does the ordered test under the lab’s own name, enters the result later, and prices come from the test list', async ({ page }) => {
    const { admin, labTech, doctor } = await tier2Clinic();

    await applySession(page, labTech);
    await page.goto('/lab/settings');
    await page.getByTestId('load-standard').click();
    await expect(page.getByText(/Added \d+ tests/)).toBeVisible();
    await page.getByTestId('test-filter').fill('lipid');
    await page.getByRole('button', { name: 'Edit Lipid Profile' }).click();
    await page.getByTestId('edit-price').fill('600');
    await page.getByTestId('save-edit').click();
    await expect(page.getByTestId('test-row').filter({ hasText: 'Lipid Profile' })).toContainText('₹600');

    // A visit with "Lipid panel" ordered (the doctor's own wording).
    const patient = await request<{ id: string }>('POST', '/patients', { firstName: 'Kiran', phone: '9811100022' }, admin.token);
    const visit = await request<{ id: string }>('POST', '/appointments/visit', { patientId: patient.id }, doctor.token);
    await request('PUT', `/consultations/${visit.id}`, { diagnosis: 'Dyslipidaemia', labTestsOrdered: [{ testName: 'Lipid panel' }] }, doctor.token);

    await applySession(page, labTech);
    await openAtCounter(page, '/lab', 'Kiran');
    const line = page.getByTestId('test-line').filter({ hasText: 'Lipid panel' });
    const name = line.locator('input[data-testid^="test-"]').first();
    await name.fill('Lipid Profile');
    await expect(line).toContainText('In place of Lipid panel');
    await expect(line.locator('input[data-testid^="test-price-"]')).toHaveValue('600');
    await page.getByTestId('mark-done').click();
    await expect(page.getByTestId('receipt-created')).toBeVisible();
    await expect(line).toContainText('Done as Lipid Profile');

    const block = page.getByTestId('results-block').first();
    await block.locator('textarea').fill('TC 212 mg/dL, LDL 140 mg/dL');
    await block.getByTestId('save-results').click();
    await expect(block).toContainText('Saved');
    await page.reload();
    await expect(page.getByTestId('results-block').first().locator('textarea')).toHaveValue('TC 212 mg/dL, LDL 140 mg/dL');
  });

  test('the lab sees its own revenue, cost and profit; admin sets the doctors’ profit share and the doctor sees theirs', async ({ page }) => {
    const { admin, labTech, doctor } = await tier2Clinic();

    // The lab lists a CBC at ₹300 that costs it ₹100.
    await applySession(page, labTech);
    await page.goto('/lab/settings');
    await page.getByTestId('test-name').fill('CBC');
    await page.getByTestId('test-price').fill('300');
    await page.getByTestId('test-cost').fill('100');
    await page.getByTestId('add-test-entry').click();
    await expect(page.getByTestId('test-row').filter({ hasText: 'CBC' })).toContainText('cost ₹100');

    // The doctor finds the X-rays and CBC by their first letter, though
    // the radiology list is empty.
    const patient = await request<{ id: string }>('POST', '/patients', { firstName: 'Kiran', phone: '9811100033' }, admin.token);
    const visit = await request<{ id: string }>('POST', '/appointments/visit', { patientId: patient.id }, doctor.token);
    await applySession(page, doctor);
    await page.goto(`/doctor/consult/${visit.id}`);
    await page.getByRole('button', { name: 'Add test' }).click();
    await page.getByTestId('lab-test-name-0').fill('C');
    await expect(page.getByTestId('lab-test-name-0-suggestions')).toContainText('CBC');
    await page.getByTestId('lab-test-name-0-suggestions').getByText('CBC', { exact: true }).click();
    await page.getByRole('button', { name: 'Add radiology work' }).click();
    await page.getByTestId('radiology-test-name-0').fill('X');
    await expect(page.getByTestId('radiology-test-name-0-suggestions')).toContainText('X-Ray');
    await page.getByTestId('save-consultation').click();
    await expect(page.getByTestId('print-summary').first()).toBeVisible();

    // The lab does it; its report tab shows revenue, cost and profit.
    await applySession(page, labTech);
    await openAtCounter(page, '/lab', 'Kiran');
    await page.getByTestId('mark-done').click();
    await expect(page.getByTestId('receipt-created')).toBeVisible();
    await page.goto('/lab');
    await page.getByTestId('dept-tab-report').click();
    await expect(page.getByTestId('dept-report-revenue')).toHaveText('₹300');
    await expect(page.getByTestId('dept-report-cost')).toHaveText('₹100');
    await expect(page.getByTestId('dept-report-profit')).toHaveText('₹200');
    await expect(page.getByTestId('dept-report-line')).toContainText('Kiran');

    // Admin: the doctor gets 20% of the lab's profit.
    await applySession(page, admin);
    await page.goto('/admin/reports');
    await page.getByRole('tab', { name: 'Doctor share' }).click();
    await page.getByTestId('edit-share-rates').click();
    await page.getByTestId('rate-default-LAB').fill('20');
    await page.getByTestId('save-share-rates').click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await expect(page.getByTestId('share-doctors-share')).toHaveText('₹40');
    await expect(page.getByTestId('share-row').filter({ hasText: 'Laboratory' })).toContainText('20%');

    // The doctor sees their own share, without the editor.
    await applySession(page, doctor);
    await page.goto('/admin/reports');
    await page.getByRole('tab', { name: 'Doctor share' }).click();
    await expect(page.getByTestId('share-your-share')).toHaveText('₹40');
    await expect(page.getByTestId('edit-share-rates')).toHaveCount(0);
  });
});
