import { expect, test, type Page } from '@playwright/test';

const TELAS = [['/', 'Comando'], ['/filas', 'Filas'], ['/analistas', 'Analistas'], ['/planejamento', 'Planejamento'], ['/planejamento?aba=ese', 'Planejamento'], ['/planejamento?aba=escala', 'Planejamento'], ['/mural', 'Service Desk'], ['/sobre', 'Sobre o projeto']] as const;

function vigiar(page: Page) {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('localhost')) erros.push(`HTTP ${r.status()}: ${r.url()}`); });
  return erros;
}

for (const [rota, titulo] of TELAS) {
  test(`${rota} abre sem erro e sem rolagem lateral`, async ({ page }) => {
    const erros = vigiar(page);
    await page.goto(rota);
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    if (rota === '/' || rota === '/mural') await expect(page.locator('.fab-cena canvas')).toBeVisible();
    if (rota.startsWith('/planejamento')) await expect(page.locator('.graf svg').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    expect(erros).toEqual([]);
  });
}

test('menu mostra as cinco seções sem rolar', async ({ page }) => {
  await page.goto('/');
  const links = page.getByRole('navigation', { name: 'Seções do painel' }).getByRole('link');
  await expect(links).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    const b = (await links.nth(i).boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
});

test('dica do gráfico hora a hora com o teclado', async ({ page }) => {
  await page.goto('/planejamento?aba=ese');
  await page.getByRole('img', { name: 'Nível de serviço por hora' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tt .tt-t')).toHaveText('9h às 10h');
});

test('o endereço antigo do dimensionamento leva à escala ideal', async ({ page }) => {
  await page.goto('/dimensionamento');
  await expect(page.getByRole('tab', { name: 'Escala ideal' })).toHaveAttribute('aria-selected', 'true');
});
