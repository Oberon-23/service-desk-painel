import { defineConfig, devices } from '@playwright/test';

/** Testes no navegador contra o build de produção (vite preview, com os mesmos cabeçalhos da Vercel). */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4175', locale: 'pt-BR', trace: 'retain-on-failure', launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  projects: [
    { name: 'computador', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'celular', use: { ...devices['Pixel 7'] }, testMatch: /telas|acessibilidade|central/ },
  ],
  webServer: { command: 'npm run preview -- --port 4175 --strictPort', url: 'http://localhost:4175', reuseExistingServer: !process.env.CI },
});
