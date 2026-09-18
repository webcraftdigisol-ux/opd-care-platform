import type { Page } from '@playwright/test';
import type { Session } from './api';

// The web app reads its session from localStorage (see web/src/context/AuthContext.tsx),
// so a login-by-API + inject-into-localStorage flow gets a spec straight to the
// page under test without re-driving the login form every time. A page must
// already be loaded (any same-origin URL) before localStorage is writable.
export async function applySession(page: Page, session: Session): Promise<void> {
  await page.goto('/login');
  await page.evaluate(
    ({ token, user, clinic }) => {
      localStorage.setItem('opd_token', token);
      localStorage.setItem('opd_user', JSON.stringify(user));
      localStorage.setItem('opd_clinic', JSON.stringify(clinic));
    },
    { token: session.token, user: session.user, clinic: session.clinic },
  );
}
