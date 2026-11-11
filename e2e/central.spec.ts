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
  await page.getByLabel('Analistas logados no N1').fill('9');
  await expect(ns.locator('.k-val')).not.toHaveText(antes!);
  await expect(ns.locator('.var-boa')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Equipe' }).getByRole('button', { name: /, N1,/ })).toHaveCount(9);
  await expect(page.getByRole('listitem', { name: 'PA 09: Íris, logado' })).toBeVisible();
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
  await page.getByLabel('Analistas logados no N2').fill('2');
  await expect(kpi(page, 'SLA do N2').locator('.pill')).toHaveText('Fora da meta');
  await expect(page.locator('.manchete')).toContainText('O N2 resolve só');
});

test('clicar num analista mostra os números dele', async ({ page }) => {
  await page.goto('/');
  await page.locator('.fab-cena').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /^Carla, N1/ }).click();
  const sel = page.getByRole('dialog', { name: 'Carla, N1' });
  await expect(sel).toContainText('Atendimentos hoje');
  await expect(sel).toContainText('PA 03');
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

test('PA: logar, pausar e deslogar mexe na equipe, nos crachás 3D e na fila', async ({ page }) => {
  await page.goto('/');
  const n1 = page.getByLabel('Analistas logados no N1');
  await expect(page.locator('.sd-cracha')).toHaveCount(11);
  await expect(page.locator('.sd-cracha', { hasText: 'Ana' })).toContainText('PA 01');

  // logar alguém numa PA livre
  await page.getByLabel('Logar analista na PA 10').selectOption('Marta');
  await expect(page.getByRole('listitem', { name: 'PA 10: Marta, logado' })).toBeVisible();
  await expect(n1).toHaveValue('8');
  await expect(page.locator('.sd-cracha', { hasText: 'Marta' })).toContainText('PA 10');

  // pausa: continua na PA, mas sai da conta
  await page.getByRole('button', { name: 'Pausar Ana (PA 01)' }).click();
  await expect(page.getByRole('listitem', { name: 'PA 01: Ana, em pausa' })).toBeVisible();
  await expect(n1).toHaveValue('7');
  await expect(page.locator('.sd-cracha.pausa', { hasText: 'Ana' })).toBeVisible();

  // deslogar: some da cena e volta para a lista de quem está fora
  await page.getByRole('button', { name: 'Deslogar Bruno da PA 02' }).click();
  await expect(page.getByRole('listitem', { name: 'PA 02: livre' })).toBeVisible();
  await expect(page.locator('.sd-cracha', { hasText: 'Bruno' })).toHaveCount(0);
  await expect(n1).toHaveValue('6');
  await expect(kpi(page, 'Nível de serviço').locator('.var-ruim')).toBeVisible();

  // quem já está numa PA não aparece para logar em outra; quem saiu volta a aparecer
  const pa02 = page.getByLabel('Logar analista na PA 02');
  await expect(pa02.locator('option', { hasText: 'Marta' })).toHaveCount(0);
  await pa02.selectOption('Bruno');
  await expect(page.getByRole('listitem', { name: 'PA 02: Bruno, logado' })).toBeVisible();

  await page.getByRole('button', { name: 'Voltar para hoje' }).click();
  await expect(page.getByRole('listitem', { name: 'PA 01: Ana, logado' })).toBeVisible();
  await expect(n1).toHaveValue('7');
});

test('PA: pausar pelo cartão da mesa na cena 3D', async ({ page }) => {
  await page.goto('/');
  await page.locator('.fab-cena').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /^Davi, N1/ }).click();
  const sel = page.getByRole('dialog', { name: 'Davi, N1' });
  await sel.getByRole('button', { name: 'Pausa' }).click();
  await expect(sel).toContainText('Em pausa');
  await expect(page.getByRole('listitem', { name: 'PA 04: Davi, em pausa' })).toBeVisible();
  await sel.getByRole('button', { name: 'Deslogar' }).click();
  await expect(sel).toHaveCount(0);
  await expect(page.getByRole('listitem', { name: 'PA 04: livre' })).toBeVisible();
});
