const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'ui.spec.js',
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:3000', viewport: { width: 1920, height: 1080 }, launchOptions: { args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox'] } },
  webServer: { command: 'node server-preview.js', port: 3000, reuseExistingServer: true, timeout: 20000 }
});
