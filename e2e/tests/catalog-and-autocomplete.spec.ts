import { test, expect } from '@playwright/test';
import { bookAppointment, createPharmacyItem, createStaff, login, registerPatient, setupAdmittedPatient, setupClinicWithDoctor } from '../helpers/api';
import { applySession } from '../helpers/session';

function tomorrowDateStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

test.describe('Medicine catalog management', () => {
  test('a pharmacist (not just Admin) can reach the medicine catalog and add, edit, and delete a medicine with its brand', async ({ page }) => {
    const { clinicSlug, admin } = await setupClinicWithDoctor({ tier: 2 });
    const pharmacist = await createStaff(admin.token, { role: 'PHARMACIST', name: 'Catalog Test Pharmacist' });
    const pharmSession = await login({ clinicSlug, email: pharmacist.email });

    await applySession(page, pharmSession);
    await page.goto('/');
    // Reachable from the sidebar's Pharmacy entry and its Medicine list tab,
    // not just a direct URL.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Pharmacy' }).click();
    await page.getByTestId('dept-tab-medicine-list').click();
    await expect(page).toHaveURL('/pharmacy/settings');

    await page.getByTestId('toggle-add').click();
    await page.getByTestId('med-name').fill('Azithromycin');
    await page.getByTestId('med-strength').fill('500 mg');
    await page.getByTestId('med-brand').fill('Zithrox');
    await page.getByTestId('med-cost').fill('8');
    await page.getByTestId('med-mrp').fill('12');
    await page.getByTestId('save-medicine').click();

    const row = page.getByTestId('med-row').filter({ hasText: 'Azithromycin' });
    await expect(row).toContainText('500 mg');
    await expect(row).toContainText('Zithrox');
    await expect(row).toContainText('₹12.00');

    await row.getByRole('button', { name: 'Edit Zithrox' }).click();
    await page.getByTestId('edit-brand').fill('Azithral 500');
    await page.getByTestId('save-edit').click();

    const updatedRow = page.getByTestId('med-row').filter({ hasText: 'Azithromycin' });
    await expect(updatedRow).toContainText('Azithral 500');

    page.once('dialog', (dialog) => dialog.accept());
    await updatedRow.getByRole('button', { name: 'Remove Azithral 500' }).click();
    await expect(page.getByTestId('med-row').filter({ hasText: 'Azithromycin' })).toHaveCount(0);
  });
});

test.describe('Medicine/test autocomplete while prescribing', () => {
  test('a doctor sees a filtered dropdown of the clinic\'s own medicines while typing a prescription, and can pick one', async ({ page }) => {
    const { clinicSlug, admin, doctor } = await setupClinicWithDoctor({ tier: 2 });
    await createPharmacyItem(admin.token, { name: 'Amoxicillin 250mg', brand: 'Novamox' });
    await createPharmacyItem(admin.token, { name: 'Amlodipine 5mg' });
    await createPharmacyItem(admin.token, { name: 'Metformin 500mg' });

    const patientSession = await registerPatient({ clinicSlug });
    const appointment = await bookAppointment(patientSession.token, {
      doctorId: doctor.id,
      date: tomorrowDateStr(),
      startTime: '09:00',
    });

    const doctorSession = await login({ clinicSlug, email: doctor.user.email });
    await applySession(page, doctorSession);
    await page.goto(`/doctor/consult/${appointment.id}`);

    await page.getByRole('button', { name: 'Add medicine' }).click();
    const medicineInput = page.getByTestId('prescription-medicine-0');
    await medicineInput.fill('Am');

    const suggestions = page.getByTestId('prescription-medicine-0-suggestions');
    await expect(suggestions).toBeVisible();
    // Matches both "Amoxicillin 250mg" and "Amlodipine 5mg" (both contain
    // "Am") but not "Metformin 500mg" -- a genuine substring filter, not
    // just "the dropdown has something in it".
    await expect(suggestions.getByText('Amoxicillin 250mg', { exact: true })).toBeVisible();
    // The pharmacy item's brand is offered too.
    await expect(suggestions.getByText('Novamox — Amoxicillin 250mg')).toBeVisible();
    await expect(suggestions.getByText('Amlodipine 5mg', { exact: true })).toBeVisible();
    await expect(suggestions.getByText('Metformin 500mg')).toHaveCount(0);

    await suggestions.getByText('Amoxicillin 250mg', { exact: true }).click();
    await expect(medicineInput).toHaveValue('Amoxicillin 250mg');
  });

  test('a nurse entering an IPD medication also gets the same medicine autocomplete', async ({ page }) => {
    const { clinicSlug, admin, admission } = await setupAdmittedPatient();
    await createPharmacyItem(admin.token, { name: 'Ondansetron 4mg' });
    const nurse = await createStaff(admin.token, { role: 'NURSE' });

    const nurseSession = await login({ clinicSlug, email: nurse.email });
    await applySession(page, nurseSession);
    await page.goto(`/admin/ipd/admissions/${admission.id}`);

    const medicineInput = page.getByTestId('ipd-medication-medicine');
    await medicineInput.fill('Ondan');
    const suggestions = page.getByTestId('ipd-medication-medicine-suggestions');
    await expect(suggestions.getByText('Ondansetron 4mg')).toBeVisible();
    await suggestions.getByText('Ondansetron 4mg').click();
    await expect(medicineInput).toHaveValue('Ondansetron 4mg');
  });
});
