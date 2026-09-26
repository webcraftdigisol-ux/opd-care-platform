import { expect, test } from '@playwright/test';
import { createDoctor, login, registerClinic, uniqueEmail, uniqueSlug } from '../helpers/api';
import { applySession } from '../helpers/session';

// A Tier 1 clinic: no pharmacy/lab departments, so suggestions come only
// from the Doctor's Catalogue.
async function tier1ClinicWithDoctor() {
  const clinicSlug = uniqueSlug('clinic');
  const admin = await registerClinic({ clinicName: 'E2E Tier 1 Clinic', clinicSlug, tier: 1 });
  const doctorEmail = uniqueEmail('doctor');
  await createDoctor(admin.token, { email: doctorEmail, consultationFee: 1000, name: 'Asha Rao' });
  const doctor = await login({ clinicSlug, email: doctorEmail });
  return { clinicSlug, admin, doctor };
}

test.describe('Consultation (Tier 1)', () => {
  test('doctor keeps a catalogue, records a visit from the profile, and prints the summary', async ({ page }) => {
    const { doctor } = await tier1ClinicWithDoctor();
    await applySession(page, doctor);

    // Doctor's Catalogue: add Paracetamol in two strengths.
    await page.goto('/catalogue');
    for (const strength of ['250 mg', '500 mg']) {
      await page.getByTestId('catalogue-name').fill('Paracetamol');
      await page.getByTestId('catalogue-strength').fill(strength);
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(page.getByTestId('catalogue-list')).toContainText(strength);
    }

    // Register a patient, then start a consultation from the profile.
    await page.goto('/patients/new');
    await page.getByTestId('first-name').fill('Meera');
    await page.getByTestId('last-name').fill('Joshi');
    await page.getByTestId('phone').fill('9822233344');
    await page.getByLabel('Known allergies').fill('Sulfa drugs');
    await page.getByTestId('save-patient').click();
    await expect(page.getByTestId('patient-code')).toHaveText('PT000001');
    await page.getByRole('tab', { name: 'Consultations' }).click();
    await page.getByTestId('new-consultation').click();

    await expect(page).toHaveURL(/\/doctor\/consult\//);
    await expect(page.getByTestId('consult-allergies')).toContainText('Sulfa drugs');
    await expect(page.getByTestId('consult-fee')).toHaveValue('1000');

    // Vitals in °F, with automatic BMI and a soft warning for swapped BP.
    await page.getByTestId('vital-tempF').fill('99.2');
    await page.getByTestId('vital-bpSystolic').fill('80');
    await page.getByTestId('vital-bpDiastolic').fill('120');
    await page.getByTestId('vital-heightCm').fill('160');
    await page.getByTestId('vital-weightKg').fill('93');
    await expect(page.getByTestId('bmi')).toHaveValue('36.3');
    await expect(page.getByTestId('vitals-warnings')).toContainText('swapped');
    await page.getByTestId('vital-bpSystolic').fill('120');
    await page.getByTestId('vital-bpDiastolic').fill('80');
    await expect(page.getByTestId('vitals-warnings')).toHaveCount(0);

    await page.getByTestId('chief-complaint').fill('Fever for 3 days');
    await page.getByTestId('diagnosis').fill('Viral fever');

    // Prescription: pick name + strength from the catalogue, tick M and N.
    await page.getByRole('button', { name: 'Add medicine' }).click();
    await page.getByTestId('prescription-medicine-0').fill('para');
    await page.getByTestId('prescription-medicine-0-suggestions').getByText('Paracetamol (500 mg)').click();
    await expect(page.getByTestId('prescription-medicine-0')).toHaveValue('Paracetamol');
    await expect(page.getByLabel('Strength', { exact: true })).toHaveValue('500 mg');
    await page.getByTestId('rx-morning-0').check();
    await page.getByTestId('rx-night-0').check();
    await page.getByLabel('Days', { exact: true }).fill('10');
    await page.getByLabel('Food timing').selectOption('AFTER_FOOD');
    await expect(page.getByTestId('rx-total-0')).toContainText('Total to dispense: 20 × Paracetamol 500 mg');

    // Lab ordering works in Tier 1 too.
    await page.getByRole('button', { name: 'Add test' }).click();
    await page.getByTestId('lab-test-name-0').fill('CBC');

    await page.getByTestId('advice').fill('Plenty of fluids');
    await page.getByRole('button', { name: '+1 week' }).click();
    await page.getByLabel(/Doctor notes/).fill('Private: check thyroid next time');
    await page.getByTestId('save-consultation').click();

    // Back on the profile's timeline.
    await expect(page).toHaveURL(/\/patients\/.+\?tab=consultations/);
    const visit = page.getByTestId('timeline-visit').first();
    await expect(visit).toContainText('Visit 1');
    await expect(visit).toContainText('Viral fever');
    await expect(visit).toContainText('BMI 36.3');
    await expect(visit).toContainText('Morning, Night, after food');

    // The printable summary: what the patient gets, without private notes.
    await visit.getByTestId('print-summary').click();
    const summary = page.getByTestId('visit-summary');
    await expect(summary).toContainText('Visit Summary');
    await expect(summary).toContainText('PT000001');
    await expect(summary).toContainText('Paracetamol (500 mg)');
    await expect(summary).toContainText('CBC');
    await expect(summary).toContainText('Plenty of fluids');
    await expect(summary).toContainText('Follow-up:');
    await expect(summary).not.toContainText('check thyroid');
    await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeVisible();
  });
});
