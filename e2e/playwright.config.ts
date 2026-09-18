import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

dotenv.config({ path: path.join(__dirname, '.env.e2e') });

const repoRoot = path.join(__dirname, '..');
const apiPort = process.env.PORT ?? '4100';
const apiUrl = `http://localhost:${apiPort}`;

// Some sandboxes pre-install Chromium at this fixed path and skip Playwright's
// own browser download (see PLAYWRIGHT_BROWSERS_PATH / PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD).
// GitHub Actions has no such path -- there, `npx playwright install chromium`
// (see ci.yml) puts the browser in Playwright's normal cache and this falls
// through to the default executable.
const sandboxChromium = '/opt/pw-browsers/chromium';
const executablePath = fs.existsSync(sandboxChromium) ? sandboxChromium : undefined;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w server',
      cwd: repoRoot,
      url: `${apiUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        DATABASE_URL: process.env.DATABASE_URL!,
        JWT_SECRET: process.env.JWT_SECRET!,
        CORS_ORIGIN: process.env.CORS_ORIGIN!,
        PORT: apiPort,
      },
    },
    {
      command: 'npm run dev -w web',
      cwd: repoRoot,
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        VITE_API_URL: `${apiUrl}/api`,
      },
    },
  ],
});
