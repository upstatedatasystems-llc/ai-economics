const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.browser.spec.cjs',
  timeout: 25000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'],['html',{open:'never'}]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8765',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}},
    {name:'mobile',use:{...devices['Desktop Chrome'],viewport:{width:390,height:844},isMobile:true,hasTouch:true}}
  ],
  webServer: {
    command: 'PYTHONPATH=src python3 -m ai_economics serve --port 8765',
    url: 'http://127.0.0.1:8765/data/research.json',
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
