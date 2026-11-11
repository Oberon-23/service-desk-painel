import { expect, test, type Page } from '@playwright/test';

const kpi = (page: Page, grupo: string, nome: string) =>
  page.getByRole('region', { name: grupo }).locator('.kpi').filter({ has: page.locator('.k-lab', { hasText: new RegExp(`^${nome}`) }) });
const linha = (page: Page, pa: string) => page.getByRole('region', { name: 'Analistas nas PAs' }).getByRole('row').filter({ hasText: pa });
const relogio = (page: Page) => page.locator('.relogio-hora');
const copiloto = (page: Page) => page.getByRole('list', { name: 'Sugestões do copiloto' }).getByRole('listitem');
/** Pausa a simulação e confirma que pausou (o botão vira "Continuar"). */
const pausar = async (page: Page) => {
  await expect(async () => {
    const b = page.getByRole('button', { name: 'Pausar a simulação' });
    if (await b.count()) await b.click();
    await expect(page.getByRole('button', { name: 'Continuar a simulação' })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
};
const irPara = (page: Page, nome: string) => page.getByRole('navigation', { name: 'Seções do painel' }).getByRole('link', { name: nome }).click();

test('comando: a operação abre com a manhã simulada e o relógio anda', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.fab-cena canvas')).toBeVisible();
  await expect(kpi(page, 'Indicadores de agora', 'Nível de serviço').locator('.k-val')).toHaveText(/\d+,\d%/);
  await expect(kpi(page, 'Indicadores de agora', 'Satisfação').locator('.k-val')).toHaveText(/\d+%/);
  const a = await relogio(page).textContent();
  await page.getByRole('button', { name: '20×' }).click();
  await expect(relogio(page)).not.toHaveText(a!);
  await expect(page.locator('.sd-cracha')).toHaveCount(11);
});

test('pausar congela o relógio, e a simulação continua ao trocar de tela', async ({ page }) => {
  await page.goto('/');
  await pausar(page);
  const a = await relogio(page).textContent();
  await page.waitForTimeout(1000);
  await expect(relogio(page)).toHaveText(a!);
  await page.getByRole('button', { name: 'Continuar a simulação' }).click();
  await page.getByRole('button', { name: '20×' }).click();
  await irPara(page, 'Filas');
  await expect(page.getByRole('heading', { level: 1, name: 'Filas' })).toBeVisible();
  await expect(relogio(page)).not.toHaveText(a!); // o mesmo dia segue andando
  await expect(page.getByRole('button', { name: '20×' })).toHaveAttribute('aria-pressed', 'true');
});

test('treino de crise: queda da VPN vira incidente pelo copiloto', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await page.getByRole('listitem').filter({ hasText: 'Queda da VPN' }).getByRole('button', { name: 'Disparar' }).click();
  await expect(page.getByText(/Em andamento: queda da VPN/)).toBeVisible();
  // a 20×, o copiloto percebe em uns 20 minutos simulados (1 s); a queda dura 90 (4,5 s)
  await page.getByRole('button', { name: '20×' }).click();
  const item = copiloto(page).filter({ hasText: 'Possível incidente: VPN' });
  await expect(item).toBeVisible({ timeout: 20_000 });
  await pausar(page);
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: 'Declarar incidente' }).click();
  await expect(copiloto(page).filter({ hasText: /Incidente INC\d+ em andamento: VPN/ })).toBeVisible();
  const hist = page.getByRole('list', { name: 'Histórico do turno' });
  await expect(hist).toContainText('Copiloto: “Declarar incidente” aplicado pela coordenação.');
  await expect(hist).toContainText('Aviso publicado na URA e no portal');
  // o chamado pai P1 aparece no topo dos chamados do N2 e o assunto fica destacado
  await irPara(page, 'Filas');
  const pai = page.getByRole('region', { name: 'Lista de chamados do N2' }).locator('tbody tr').filter({ hasText: 'incidente pai' });
  await expect(pai).toHaveCount(1);
  await expect(pai).toContainText('P1');
  await expect(page.getByText(/Incidente INC\d+ declarado para VPN/)).toBeVisible();
  // recomeçar o dia desfaz tudo
  await irPara(page, 'Comando');
  await page.getByRole('button', { name: 'Recomeçar o dia' }).click();
  await expect(page.getByText('Nenhuma crise em andamento.')).toBeVisible();
  await expect(relogio(page)).toHaveText('10:30');
});

test('treino de crise: duas faltas e o copiloto chama alguém para cobrir', async ({ page }) => {
  await page.goto('/');
  await pausar(page);
  await page.getByRole('listitem').filter({ hasText: 'Duas faltas no N1' }).getByRole('button', { name: 'Disparar' }).click();
  await expect(page.locator('.sd-cracha')).toHaveCount(9);
  const item = copiloto(page).filter({ hasText: '2 pessoas da escala do N1 fora da operação' });
  await expect(item).toContainText('Gabi');
  await item.getByRole('button', { name: /Logar \S+ para cobrir/ }).click();
  await expect(page.locator('.sd-cracha')).toHaveCount(10);
  await irPara(page, 'Analistas');
  const ad = page.getByRole('list', { name: 'Aderência à escala' });
  await expect(ad).toContainText('9 de 11 escalados atendendo');
  await expect(ad.getByRole('listitem').filter({ hasText: 'Fora da escala' })).toContainText(/Fora da escala\s*1/); // alguém de fora da escala cobrindo
});

test('filas: desmarcar um canal muda quem atende, e a fila do canal cresce', async ({ page }) => {
  await page.goto('/filas');
  await pausar(page);
  const chat = page.getByRole('article', { name: 'Fila do chat' });
  await expect(chat).toContainText('/ 4');
  for (const nome of ['Ana', 'Bruno', 'Elisa', 'Gabi']) await page.getByRole('checkbox', { name: `${nome} atende chat` }).uncheck();
  await expect(chat).toContainText('/ 0');
  await page.getByRole('button', { name: 'Continuar a simulação' }).click();
  await page.getByRole('button', { name: '20×' }).click();
  await expect(chat.locator('.fila-agora b').first()).not.toHaveText(/^[0-2]$/, { timeout: 20_000 });
  await expect(chat).toHaveClass(/apertada/);
  // o copiloto propõe reforçar o chat, e aplicar habilita alguém
  await irPara(page, 'Comando');
  const item = copiloto(page).filter({ hasText: 'Fila do chat acima do alvo' });
  await expect(item).toBeVisible({ timeout: 20_000 });
  await pausar(page);
  // a fila pode esvaziar entre ver o alerta e pausar; se ainda estiver lá, a ação proposta é aplicada
  if (await item.count()) {
    const acao = item.getByRole('button', { name: /Habilitar \S+ no chat|Logar \S+|Chamar \S+ de volta/ });
    if (await acao.count()) {
      await acao.click();
      await expect(page.getByRole('list', { name: 'Histórico do turno' })).toContainText('Copiloto:');
    } else await expect(item).toContainText('Ninguém disponível');
  }
});

test('filas: chamados do N2 em ordem de prazo', async ({ page }) => {
  await page.goto('/filas');
  await pausar(page);
  const lista = page.getByRole('region', { name: 'Lista de chamados do N2' });
  const min = (t: string) => {
    const m = t.match(/(\d+)h(\d+)|(\d+) min/);
    const v = m ? (m[1] ? +m[1] * 60 + +m[2] : +m[3]) : 0;
    return t.startsWith('Vencido') ? -v : v;
  };
  const v = (await lista.locator('tbody tr td:last-child').allTextContents()).map(min);
  expect(v.length).toBeGreaterThan(2);
  for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1]);
  await expect(page.getByRole('img', { name: 'Contatos dos últimos 30 minutos por assunto' })).toBeVisible();
});

test('analistas: logar, pausar com motivo e deslogar; a pausa estourada vira ação no copiloto', async ({ page }) => {
  await page.goto('/analistas');
  await pausar(page);
  const f = page.getByRole('form', { name: 'Logar analista' });
  await f.getByLabel('Analista').selectOption('Marta');
  await f.getByLabel('PA').selectOption({ label: 'PA 10' });
  await f.getByRole('button', { name: 'Logar' }).click();
  await expect(linha(page, 'PA 10')).toContainText('Marta');
  await expect(f.getByLabel('Analista').locator('option', { hasText: 'Marta' })).toHaveCount(0);

  await page.getByLabel('Pausar Carla (PA 03)').selectOption('banheiro'); // limite 5 min
  await expect(linha(page, 'PA 03')).toContainText('Banheiro');
  await page.getByRole('button', { name: 'Deslogar Bruno da PA 02' }).click();
  await expect(linha(page, 'PA 02')).toHaveCount(0);
  const ad = page.getByRole('list', { name: 'Aderência à escala' });
  await expect(ad).toContainText('9 de 11 escalados atendendo');
  await expect(ad).toContainText('Bruno');

  await page.getByRole('button', { name: 'Continuar a simulação' }).click();
  await page.getByRole('button', { name: '20×' }).click();
  await expect(linha(page, 'PA 03')).toHaveClass(/linha-bad/, { timeout: 15_000 });
  await pausar(page);
  await expect(page.getByRole('img', { name: /^Carla: \d+% do tempo atendendo/ })).toBeVisible();

  await irPara(page, 'Comando');
  await expect(page.locator('.sd-cracha.estourada', { hasText: 'Carla' })).toBeVisible();
  const item = copiloto(page).filter({ hasText: 'Carla passou do limite da pausa' });
  await item.getByRole('button', { name: 'Chamar Carla de volta' }).click();
  await expect(item).toHaveCount(0);
  await expect(page.locator('.sd-cracha.estourada')).toHaveCount(0);
});

test('comando: o cartão do analista abre pela lista da equipe, pausa e desloga', async ({ page }) => {
  await page.goto('/');
  await pausar(page);
  const cena = page.locator('.fab-cena');
  await expect(page.locator('.sd-cracha', { hasText: 'Davi' })).toBeVisible();
  await page.getByRole('group', { name: 'Equipe na sala' }).getByRole('button', { name: /^Davi, N1, PA 04/ }).click();
  const sel = page.getByRole('dialog', { name: 'Davi, N1' });
  await expect(sel).toContainText('PA 04');
  await sel.getByLabel('Motivo da pausa').selectOption('feedback');
  await expect(sel).toContainText('Feedback');
  await sel.getByRole('button', { name: 'Deslogar' }).click();
  await expect(sel).toHaveCount(0);
  await expect(cena.locator('.sd-cracha', { hasText: 'Davi' })).toHaveCount(0);
});

test('planejamento: hoje contra o previsto, e o "e se" mexe na mesma equipe', async ({ page }) => {
  await page.goto('/planejamento');
  await pausar(page);
  await expect(page.locator('.manchete')).toContainText(/Até 10:3\d chegaram \d+ contatos/);
  await expect(page.getByRole('img', { name: 'Contatos por hora, previsto e realizado' })).toBeVisible();
  await page.getByRole('tab', { name: 'E se…?' }).click();
  await expect(page).toHaveURL(/aba=ese/);
  const ns = kpi(page, 'Indicadores principais', 'Nível de serviço');
  const antes = await ns.locator('.k-val').textContent();
  await page.getByLabel('Analistas logados no N1').fill('9');
  await expect(ns.locator('.var-boa')).toBeVisible();
  await page.getByRole('switch', { name: 'Segunda-feira de manhã' }).click();
  await expect(ns.locator('.k-val')).not.toHaveText(antes!);
  await irPara(page, 'Analistas');
  await expect(linha(page, 'PA 09')).toContainText('Íris');
  await irPara(page, 'Planejamento');
  await page.getByRole('tab', { name: 'E se…?' }).click();
  await page.getByRole('button', { name: 'Recomeçar o dia' }).click();
  await expect(page.getByLabel('Analistas logados no N1')).toHaveValue('7');
  await page.getByRole('tab', { name: 'Escala ideal' }).click();
  const pico = page.locator('.kpi').filter({ has: page.locator('.k-lab', { hasText: /^Analistas no pico/ }) }).locator('.k-val');
  const normal = Number(await pico.textContent());
  await page.getByRole('button', { name: 'Segunda-feira' }).click();
  await expect.poll(async () => Number(await pico.textContent())).toBeGreaterThan(normal);
});

test('mural: números grandes, aviso do copiloto e saída', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Abrir mural' }).click();
  await expect(page).toHaveURL(/\/mural$/);
  const numeros = page.getByRole('region', { name: 'Números de agora' });
  await expect(numeros).toContainText('Telefone: esperando');
  await expect(numeros).toContainText('N1 livres agora');
  await expect(page.locator('.mural-aviso')).toBeVisible();
  await page.getByRole('link', { name: 'Sair do mural' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Comando' })).toBeVisible();
});
