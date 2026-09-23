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

    await expect(page.getByRole('heading', { name: 'Diet Plan' })).toBeVisible();
    await page.getByPlaceholder('Allergies (optional)').fill('shellfish');
    await page.getByPlaceholder('Locally available food notes (optional)').fill('seasonal greens');
    await page
      .getByPlaceholder(/Diet plan \/ recommendation/)
      .fill('High-protein recovery diet, avoid processed sugar.');
    await page.getByRole('button', { name: 'Save diet plan' }).click();

    await expect(page.getByText('High-protein recovery diet, avoid processed sugar.')).toBeVisible();

    await page.getByRole('button', { name: 'Send via WhatsApp' }).click();
    await expect(page.getByText('Diet plan sent via WhatsApp.')).toBeVisible();
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

    await page.getByPlaceholder(/Diet plan \/ recommendation/).fill('Balanced diet.');
    await page.getByRole('button', { name: 'Save diet plan' }).click();
    await expect(page.getByText('Balanced diet.')).toBeVisible();

    await expect(page.getByText("Patient hasn't opted in to WhatsApp messages yet.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send via WhatsApp' })).toBeDisabled();
  });
});
