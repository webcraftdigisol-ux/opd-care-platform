import { test, expect } from '@playwright/test';
import { bookAppointment, login, registerPatient, setupClinicWithDoctor, updateWhatsAppOptIn } from '../helpers/api';
import { applySession } from '../helpers/session';

function tomorrowDateStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

test.describe('WhatsApp opt-in and diet plans', () => {
  test('a patient can opt in to WhatsApp reminders from their dashboard', async ({ page }) => {
    const { clinicSlug } = await setupClinicWithDoctor();
    const patientSession = await registerPatient({ clinicSlug, phone: '+919876500100' });

    await applySession(page, patientSession);
    await page.goto('/');

    await expect(page.getByText('WhatsApp reminders')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Opt in' })).toBeVisible();
    await page.getByRole('button', { name: 'Opt in' }).click();
    await expect(page.getByRole('button', { name: 'Opted in' })).toBeVisible();

    // Persists across a reload -- it's server state (User.whatsappOptIn),
    // not just local UI state.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Opted in' })).toBeVisible();
  });

  test('a doctor can author a diet plan and send it via WhatsApp once the patient has opted in', async ({ page }) => {
    const { clinicSlug, doctor } = await setupClinicWithDoctor();
    const patientSession = await registerPatient({ clinicSlug, phone: '+919876500200' });
    await updateWhatsAppOptIn(patientSession.token, true);
    const appointment = await bookAppointment(patientSession.token, {
      doctorId: doctor.id,
      date: tomorrowDateStr(),
      startTime: '09:00',
    });

    const doctorSession = await login({ clinicSlug, email: doctor.user.email });

    await applySession(page, doctorSession);
    await page.goto(`/doctor/consult/${appointment.id}`);

    await expect(page.getByRole('heading', { name: 'Diet plan' })).toBeVisible();
    // The diagnosis suggests a template; non-veg fills the non-veg version.
    await page.getByTestId('diagnosis').fill('Viral fever');
    await page.getByTestId('diet-suggestion').filter({ hasText: 'Fever / viral infection' }).click();
    await page.getByTestId('diet-kind-NON_VEG').click();
    const plan = page.getByTestId('diet-plan-text');
    await expect(plan).toHaveValue(/^Fever \/ viral infection — non-vegetarian diet/);
    await expect(plan).toHaveValue(/chicken soup/);
    await plan.fill(`${await plan.inputValue()}\nAvoid processed sugar.`);
    await page.getByTestId('save-diet-plan').click();

    await expect(page.getByTestId('diet-plan').filter({ hasText: 'Avoid processed sugar.' })).toContainText('Non-veg');

    await page.getByRole('button', { name: 'Send on WhatsApp' }).click();
    await expect(page.getByText('Diet plan sent on WhatsApp.')).toBeVisible();
  });

  test('the send button is disabled with an explanation when the patient has not opted in', async ({ page }) => {
    const { clinicSlug, doctor } = await setupClinicWithDoctor();
    const patientSession = await registerPatient({ clinicSlug });
    const appointment = await bookAppointment(patientSession.token, {
      doctorId: doctor.id,
      date: tomorrowDateStr(),
      startTime: '09:00',
    });

    const doctorSession = await login({ clinicSlug, email: doctor.user.email });

    await applySession(page, doctorSession);
    await page.goto(`/doctor/consult/${appointment.id}`);

    await page.getByTestId('diet-plan-text').fill('Balanced diet.');
    await page.getByTestId('save-diet-plan').click();
    await expect(page.getByTestId('diet-plan').filter({ hasText: 'Balanced diet.' })).toBeVisible();

    await expect(page.getByText("The patient hasn't opted in to WhatsApp messages.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send on WhatsApp' })).toBeDisabled();
  });
});
