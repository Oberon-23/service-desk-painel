import { expect, test, type Page } from '@playwright/test';

const kpi = (page: Page, nome: string) => page.locator('.kpi').filter({ has: page.locator('.k-lab', { hasText: new RegExp(`^${nome}`) }) });

test('a central 3D anda: contatos chegam e são atendidos', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.fab-cena canvas')).toBeVisible();
  await page.locator('.fab-cena').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '20×' }).click();
  const atendidos = page.locator('.sd-placar li', { hasText: 'Atendidos hoje' }).locator('b');
  await expect.poll(async () => Number((await atendidos.textContent())?.replace(/\D/g, '') || 0), { timeout: 15_000 }).toBeGreaterThan(10);
});

test('pausar congela o relógio', async ({ page }) => {
  await page.goto('/');
  await page.locator('.fab-cena').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Pausar a simulação' }).click();
  await page.waitForTimeout(500);
  const relogio = page.locator('.fab-relogio');
  const a = await relogio.textContent();
  await page.waitForTimeout(1200);
  await expect(relogio).toHaveText(a!);
});

test('"e se": mais analistas melhoram o nível de serviço; voltar para hoje desfaz', async ({ page }) => {
  await page.goto('/');
  const ns = kpi(page, 'Nível de serviço');
  const antes = await ns.locator('.k-val').textContent();
  await page.getByLabel('Analistas no N1').fill('9');
  await expect(ns.locator('.k-val')).not.toHaveText(antes!);
  await expect(ns.locator('.var-boa')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Equipe' }).getByRole('button', { name: /N1:/ })).toHaveCount(9);
  await page.getByRole('button', { name: 'Voltar para hoje' }).click();
  await expect(ns.locator('.k-val')).toHaveText(antes!);
});

test('"e se": segunda-feira piora e o portal de autoatendimento melhora', async ({ page }) => {
  await page.goto('/');
  const ns = kpi(page, 'Nível de serviço');
  await page.getByRole('switch', { name: 'Segunda-feira de manhã' }).click();
  await expect(ns.locator('.var-ruim')).toBeVisible();
  await page.getByRole('switch', { name: 'Portal de autoatendimento' }).click();
  await page.getByRole('switch', { name: 'Segunda-feira de manhã' }).click();
  await expect(ns.locator('.var-boa')).toBeVisible();
});

test('N2 sem gente suficiente derruba o SLA', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Analistas no N2').fill('2');
  await expect(kpi(page, 'SLA do N2').locator('.pill')).toHaveText('Fora da meta');
  await expect(page.locator('.manchete')).toContainText('O N2 resolve só');
});

test('clicar num analista mostra os números dele', async ({ page }) => {
  await page.goto('/');
  await page.locator('.fab-cena').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /^Carla, N1/ }).click();
  const sel = page.getByRole('dialog', { name: 'Carla, N1' });
  await expect(sel).toContainText('Atendimentos hoje');
  await sel.getByRole('button', { name: 'Fechar' }).click();
  await expect(sel).toHaveCount(0);
});

test('dimensionamento mostra a escala e troca o tipo de dia', async ({ page }) => {
  await page.goto('/dimensionamento');
  const pico = kpi(page, 'Analistas no pico').locator('.k-val');
  const normal = Number(await pico.textContent());
  await page.getByRole('button', { name: 'Segunda-feira' }).click();
  await expect.poll(async () => Number(await pico.textContent())).toBeGreaterThan(normal);
  await expect(page.getByRole('img', { name: 'Equipe mínima por hora contra a equipe atual' })).toBeVisible();
});
