import { expect, test, type Page } from '@playwright/test';

const kpi = (page: Page, grupo: string, nome: string) =>
  page.getByRole('region', { name: grupo }).locator('.kpi').filter({ has: page.locator('.k-lab', { hasText: new RegExp(`^${nome}`) }) });
const linha = (page: Page, pa: string) => page.getByRole('region', { name: 'Analistas nas PAs' }).getByRole('row').filter({ hasText: pa });
const logar = async (page: Page, nome: string, pa?: string) => {
  const f = page.getByRole('form', { name: 'Logar analista' });
  await f.getByLabel('Analista').selectOption(nome);
  if (pa) await f.getByLabel('PA').selectOption({ label: pa });
  await f.getByRole('button', { name: 'Logar' }).click();
};

test('a central 3D anda e os indicadores de agora se preenchem', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.fab-cena canvas')).toBeVisible();
  await page.locator('.fab-cena').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '20×' }).click();
  await expect(kpi(page, 'Indicadores de agora', 'Nível de serviço').locator('.k-val')).toHaveText(/\d+,\d%/, { timeout: 15_000 });
  await expect(page.locator('.secao-h')).toContainText('Hoje até');
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

test('abas: teclado troca de aba e a aba vai para a URL', async ({ page }) => {
  await page.goto('/');
  const equipe = page.getByRole('tab', { name: /Equipe/ });
  await expect(equipe).toHaveAttribute('aria-selected', 'true');
  await equipe.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Chamados do N2/ })).toBeFocused();
  await expect(page).toHaveURL(/aba=chamados/);
  await expect(page.getByRole('tabpanel')).toContainText('Chamados do N2 por prazo');
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Simulador' })).toHaveAttribute('aria-selected', 'true');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Simulador' })).toHaveAttribute('aria-selected', 'true');
});

test('simulador: mais analistas melhoram a previsão; voltar para hoje desfaz', async ({ page }) => {
  await page.goto('/?aba=simulador');
  const ns = kpi(page, 'Indicadores principais', 'Nível de serviço');
  const antes = await ns.locator('.k-val').textContent();
  await page.getByLabel('Analistas logados no N1').fill('9');
  await expect(ns.locator('.k-val')).not.toHaveText(antes!);
  await expect(ns.locator('.var-boa')).toBeVisible();
  await page.getByRole('tab', { name: /Equipe/ }).click();
  await expect(page.getByRole('tab', { name: /Equipe/ })).toContainText('13');
  await expect(linha(page, 'PA 09')).toContainText('Íris');
  await page.getByRole('tab', { name: 'Simulador' }).click();
  await page.getByRole('button', { name: 'Voltar para hoje' }).click();
  await expect(ns.locator('.k-val')).toHaveText(antes!);
});

test('simulador: segunda-feira piora e o portal de autoatendimento melhora', async ({ page }) => {
  await page.goto('/?aba=simulador');
  const ns = kpi(page, 'Indicadores principais', 'Nível de serviço');
  await page.getByRole('switch', { name: 'Segunda-feira de manhã' }).click();
  await expect(ns.locator('.var-ruim')).toBeVisible();
  await page.getByRole('switch', { name: 'Portal de autoatendimento' }).click();
  await page.getByRole('switch', { name: 'Segunda-feira de manhã' }).click();
  await expect(ns.locator('.var-boa')).toBeVisible();
});

test('simulador: N2 sem gente suficiente derruba o SLA previsto', async ({ page }) => {
  await page.goto('/?aba=simulador');
  await page.getByLabel('Analistas logados no N2').fill('2');
  await expect(kpi(page, 'Indicadores principais', 'SLA do N2').locator('.pill')).toHaveText('Fora da meta');
  await expect(page.locator('.manchete')).toContainText('O N2 resolveria só');
});

test('clicar no nome leva à mesa no 3D, e o cartão da mesa pausa e desloga', async ({ page }) => {
  await page.goto('/');
  await linha(page, 'PA 04').getByRole('button', { name: 'Davi', exact: true }).click();
  const sel = page.getByRole('dialog', { name: 'Davi, N1' });
  await expect(sel).toContainText('PA 04');
  await expect(sel).toContainText('Atendimentos hoje');
  await sel.getByLabel('Motivo da pausa').selectOption('feedback');
  await expect(sel).toContainText('Em pausa');
  await expect(linha(page, 'PA 04')).toContainText('Feedback');
  await sel.getByRole('button', { name: 'Deslogar' }).click();
  await expect(sel).toHaveCount(0);
  await expect(linha(page, 'PA 04')).toHaveCount(0);
});

test('equipe: logar, pausar e deslogar mexe na contagem, nos crachás 3D e na previsão', async ({ page }) => {
  await page.goto('/');
  const ad = page.getByRole('list', { name: 'Aderência à escala' });
  await expect(page.locator('.sd-cracha')).toHaveCount(11);
  await expect(page.locator('.sd-cracha', { hasText: 'Ana' })).toContainText('PA 01');

  await logar(page, 'Marta', 'PA 10');
  await expect(linha(page, 'PA 10')).toContainText('Marta');
  await expect(page.locator('.sd-cracha', { hasText: 'Marta' })).toContainText('PA 10');
  await expect(ad).toContainText('Marta'); // fora da escala

  await page.getByLabel('Pausar Ana (PA 01)').selectOption('lanche');
  await expect(linha(page, 'PA 01')).toContainText('Lanche');
  await expect(page.locator('.sd-cracha.pausa', { hasText: 'Ana' })).toBeVisible();
  await expect(ad).toContainText('10 de 11 escalados atendendo');

  await page.getByRole('button', { name: 'Deslogar Bruno da PA 02' }).click();
  await expect(linha(page, 'PA 02')).toHaveCount(0);
  await expect(page.locator('.sd-cracha', { hasText: 'Bruno' })).toHaveCount(0);
  await expect(ad).toContainText('Bruno'); // faltando da escala

  // quem já está numa PA não aparece para logar de novo
  await expect(page.getByRole('form', { name: 'Logar analista' }).getByLabel('Analista').locator('option', { hasText: 'Marta' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Simulador' }).click();
  await expect(page.getByLabel('Analistas logados no N1')).toHaveValue('6');
  await expect(kpi(page, 'Indicadores principais', 'Nível de serviço').locator('.var-ruim')).toBeVisible();
  await page.getByRole('button', { name: 'Voltar para hoje' }).click();
  await page.getByRole('tab', { name: /Equipe/ }).click();
  await expect(linha(page, 'PA 01')).toContainText('Ana');
  await expect(linha(page, 'PA 01').locator('.pill')).toHaveText(/Atendendo|Disponível/);
});

test('pausa acima do limite vira ponto de atenção, que leva à pessoa', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Pausar Carla (PA 03)').selectOption('banheiro'); // limite 5 min
  await page.locator('.fab-cena').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '20×' }).click();
  const item = page.getByRole('list', { name: 'Pontos de atenção' }).getByRole('listitem').filter({ hasText: 'Carla passou do limite da pausa' });
  await expect(item).toBeVisible({ timeout: 15_000 });
  await expect(item).toContainText('de 5 min');
  await expect(page.locator('.sd-cracha.estourada', { hasText: 'Carla' })).toBeVisible();
  await expect(linha(page, 'PA 03')).toHaveClass(/linha-bad/);
  await page.getByRole('tab', { name: /Chamados/ }).click();
  await item.getByRole('button').click();
  await expect(page.getByRole('tab', { name: /Equipe/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('dialog', { name: 'Carla, N1' })).toBeVisible();
});

test('chamados do N2 em ordem de prazo, com vencidos no topo e nos pontos de atenção', async ({ page }) => {
  await page.goto('/?aba=chamados');
  const lista = page.getByRole('region', { name: 'Lista de chamados do N2' });
  await expect(lista.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
  const min = (t: string) => {
    const m = t.match(/(\d+)h(\d+)|(\d+) min/);
    const v = m ? (m[1] ? +m[1] * 60 + +m[2] : +m[3]) : 0;
    return t.startsWith('Vencido') ? -v : v;
  };
  const v = (await lista.locator('tbody tr td:last-child').allTextContents()).map(min);
  expect(v.length).toBeGreaterThan(2);
  for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1] - 1); // 1 min de folga entre leituras
  await expect(page.getByRole('list', { name: 'Pontos de atenção' })).toContainText('vencido');
});

test('dimensionamento mostra a escala e troca o tipo de dia', async ({ page }) => {
  await page.goto('/dimensionamento');
  const pico = page.locator('.kpi').filter({ has: page.locator('.k-lab', { hasText: /^Analistas no pico/ }) }).locator('.k-val');
  const normal = Number(await pico.textContent());
  await page.getByRole('button', { name: 'Segunda-feira' }).click();
  await expect.poll(async () => Number(await pico.textContent())).toBeGreaterThan(normal);
  await expect(page.getByRole('img', { name: 'Equipe mínima por hora contra a equipe atual' })).toBeVisible();
});
