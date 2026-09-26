import { test, expect } from '@playwright/test';
import { createStaff, login, registerPatient, setupClinicWithDoctor } from '../helpers/api';
import { applySession } from '../helpers/session';
import { billExtraTest, openAtCounter } from '../helpers/counter';

test.describe('lab report file attachment', () => {
  test('a lab technician uploads a report file to a freshly created invoice, and it shows in the list', async ({
    page,
  }) => {
    const { clinicSlug, admin } = await setupClinicWithDoctor({ tier: 2 });
    const labTech = await createStaff(admin.token, { role: 'LAB_TECHNICIAN', name: 'Lab Tech Attach Test' });
    const labSession = await login({ clinicSlug, email: labTech.email });
    const patientSession = await registerPatient({ clinicSlug, name: 'Attachment Test Patient' });
    void patientSession;

    await applySession(page, labSession);
    await openAtCounter(page, '/lab', 'Attachment Test Patient');

    await expect(page.getByText('No tests ordered for this patient.')).toBeVisible();
    await billExtraTest(page, 'Complete Blood Count', '300');

    // Playwright can hand a file's bytes straight to the input, no on-disk
    // fixture needed.
    const fileInput = page.getByTestId('attachment-file-input');
    await fileInput.setInputFiles({
      name: 'cbc-report.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%e2e test report'),
    });

    const item = page.getByTestId('attachment-item');
    await expect(item).toBeVisible();
    await expect(item).toContainText('cbc-report.pdf');
  });

  test('a patient sees their own attachment on their records page', async ({ page }) => {
    const { clinicSlug, admin } = await setupClinicWithDoctor({ tier: 2 });
    const labTech = await createStaff(admin.token, { role: 'LAB_TECHNICIAN', name: 'Lab Tech Attach Test 2' });
    const labSession = await login({ clinicSlug, email: labTech.email });
    const patientSession = await registerPatient({ clinicSlug, name: 'Records Attachment Patient' });

    await applySession(page, labSession);
    await openAtCounter(page, '/lab', 'Records Attachment Patient');
    await billExtraTest(page, 'Lipid Profile', '500');

    await page.getByTestId('attachment-file-input').setInputFiles({
      name: 'lipid-report.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%e2e test report'),
    });
    await expect(page.getByTestId('attachment-item')).toContainText('lipid-report.pdf');

    await applySession(page, patientSession);
    await page.goto('/records');
    await expect(page.getByTestId('patient-attachment-item')).toContainText('lipid-report.pdf');
    await expect(page.getByTestId('patient-attachment-item')).toContainText('Lab report');
  });
});
