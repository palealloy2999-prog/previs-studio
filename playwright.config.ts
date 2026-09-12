import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 120000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', channel: 'msedge', viewport: { width: 1440, height: 1000 }, acceptDownloads: true, actionTimeout: 15000, launchOptions: { args: ['--enable-unsafe-swiftshader'] } },
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 30000 },
});
