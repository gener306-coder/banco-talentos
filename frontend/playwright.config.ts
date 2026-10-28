import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    // Las trazas de red pueden contener credenciales: no se guardan.
    trace: 'off',
  },
  projects: [
    // Un único login de ADMIN y otro de INSTITUTION, cuyas sesiones reutilizan los demás escenarios.
    {
      name: 'setup',
      testMatch: /(admin|institution)\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Sesión reutilizable de SECRETARY (creada por ADMIN durante setup).
    {
      name: 'secretary-setup',
      testMatch: /secretary\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    // Sesión reutilizable de COMPANY (empresa y cuenta creadas por SECRETARY durante setup).
    {
      name: 'company-setup',
      testMatch: /company\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['secretary-setup'],
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup', 'secretary-setup', 'company-setup'],
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 0.0.0.0',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
})
