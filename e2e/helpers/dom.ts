import type { Page, Locator } from '@playwright/test';

// A handful of web pages (e.g. RegisterPage) use a <label> that is visually
// above its <input> but not associated via htmlFor/id, so getByLabel() can't
// find it. This walks the DOM the same way a sighted user reads it: the
// input immediately following a label with this exact text.
export function inputAfterLabel(page: Page, labelText: string): Locator {
  return page.locator(`xpath=//label[normalize-space(text())="${labelText}"]/following-sibling::input[1]`);
}
