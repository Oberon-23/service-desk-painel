import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ROTAS = ['/', '/filas', '/analistas', '/planejamento', '/planejamento?aba=ese', '/planejamento?aba=escala', '/mural', '/sobre'];
type Opts = ConstructorParameters<typeof AxeBuilder>[0];

for (const tema of ['light', 'dark'] as const) {
  test.describe(`tema ${tema === 'light' ? 'claro' : 'escuro'}`, () => {
    test.use({ colorScheme: tema });
    for (const rota of ROTAS) {
      test(`sem problemas graves de acessibilidade em ${rota}`, async ({ page }) => {
        await page.goto(rota);
        await page.locator('h1').first().waitFor();
        await page.waitForTimeout(150);
        const r = await new AxeBuilder({ page } as unknown as Opts).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      });
    }
  });
}
