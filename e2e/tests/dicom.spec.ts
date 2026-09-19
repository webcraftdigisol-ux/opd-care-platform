import { test, expect, type Page } from '@playwright/test';
import { createStaff, login, registerPatient, setupClinicWithDoctor } from '../helpers/api';
import { applySession } from '../helpers/session';
import { inputAfterLabel } from '../helpers/dom';
import { buildDicomFixture } from '../helpers/dicom';

async function createRadiologyReceipt(page: Page, patientName: string) {
  await page.goto('/radiology');
  await inputAfterLabel(page, 'Search patient by name or phone').fill(patientName);
  await page.getByText(patientName).click();
  await page.getByRole('button', { name: '+ Add test' }).click();
  await page.getByPlaceholder('Test name').fill('Chest X-Ray');
  await page.getByPlaceholder('Price').fill('400');
  await page.getByRole('button', { name: 'Confirm & Print Receipt' }).click();
  await expect(page.getByText('Receipt')).toBeVisible();
}

test.describe('DICOM file attachment + in-browser viewer', () => {
  test('a radiology technician uploads a .dcm file and views it rendered on a canvas', async ({ page }) => {
    const { clinicSlug, admin } = await setupClinicWithDoctor({ tier: 2 });
    const radTech = await createStaff(admin.token, { role: 'RADIOLOGY_TECHNICIAN', name: 'DICOM Test Rad Tech' });
    const radSession = await login({ clinicSlug, email: radTech.email });
    await registerPatient({ clinicSlug, name: 'DICOM Test Patient' });

    await applySession(page, radSession);
    await createRadiologyReceipt(page, 'DICOM Test Patient');

    const dicomPanel = page.getByTestId('attachment-panel-RADIOLOGY_DICOM');
    await expect(dicomPanel).toBeVisible();
    await dicomPanel.getByTestId('attachment-file-input').setInputFiles({
      name: 'chest-xray.dcm',
      mimeType: 'application/octet-stream',
      buffer: buildDicomFixture(),
    });

    const item = dicomPanel.getByTestId('attachment-item');
    await expect(item).toBeVisible();
    await expect(item).toContainText('chest-xray.dcm');

    // The other panel (RADIOLOGY_REPORT) must stay empty -- categories are
    // independent lists on the same invoice.
    await expect(page.getByTestId('attachment-panel-RADIOLOGY_REPORT').getByTestId('attachment-item')).toHaveCount(0);

    await item.getByRole('button', { name: 'chest-xray.dcm' }).click();

    const canvas = page.getByTestId('dicom-canvas');
    await expect(canvas).toBeVisible();

    // Real parsing + rendering, not just "a canvas exists": the fixture's
    // pixel data is a strict 0->252 gradient in row-major order, so with the
    // viewer's default (min/max-derived) window, the top-left pixel should
    // render pure black and the bottom-right pure white.
    const pixels = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d')!;
      const topLeft = ctx.getImageData(0, 0, 1, 1).data;
      const bottomRight = ctx.getImageData(el.width - 1, el.height - 1, 1, 1).data;
      return {
        width: el.width,
        height: el.height,
        topLeft: Array.from(topLeft),
        bottomRight: Array.from(bottomRight),
      };
    });
    expect(pixels.width).toBe(8);
    expect(pixels.height).toBe(8);
    expect(pixels.topLeft).toEqual([0, 0, 0, 255]);
    expect(pixels.bottomRight).toEqual([255, 255, 255, 255]);

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(canvas).not.toBeVisible();
  });

  test('rejects a non-.dcm file uploaded to the DICOM slot, with a clear error', async ({ page }) => {
    const { clinicSlug, admin } = await setupClinicWithDoctor({ tier: 2 });
    const radTech = await createStaff(admin.token, { role: 'RADIOLOGY_TECHNICIAN', name: 'DICOM Reject Rad Tech' });
    const radSession = await login({ clinicSlug, email: radTech.email });
    await registerPatient({ clinicSlug, name: 'DICOM Reject Patient' });

    await applySession(page, radSession);
    await createRadiologyReceipt(page, 'DICOM Reject Patient');

    const dicomPanel = page.getByTestId('attachment-panel-RADIOLOGY_DICOM');
    await dicomPanel.getByTestId('attachment-file-input').setInputFiles({
      name: 'not-a-scan.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%e2e not dicom'),
    });

    await expect(dicomPanel.getByText(/only a \.dcm dicom file/i)).toBeVisible();
    await expect(dicomPanel.getByTestId('attachment-item')).toHaveCount(0);
  });
});
