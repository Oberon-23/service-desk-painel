# Design do painel de Service Desk

Guia de design do painel: para quem ele é, como a tela é organizada, os tokens, os componentes e as regras.
O que dá para checar automaticamente roda no CI (`src/governanca.test.ts`). O resto entra no checklist do pull request.

## 1. Para quem e para quê

**Quem usa:** a coordenação do service desk (coordenador, supervisor de turno, analista de qualidade).

**Perguntas que a tela responde, nesta ordem:**

1. Como está a operação **agora**? (nível de serviço, fila, abandono, aderência, N2 vencido)
2. **O que pede ação** neste momento? (pontos de atenção)
3. **Quem** está em cada PA e quem está em pausa há tempo demais? (aba Equipe)
4. Quais chamados do N2 **vencem primeiro**? (aba Chamados do N2)
5. **E se** a equipe ou a demanda mudassem? (aba Simulador)

O que não responde uma dessas perguntas não entra na Central ao vivo. Vai para Dimensionamento (planejamento) ou Sobre (método).

## 2. Organização da tela

```
Agora                      → 5 indicadores do dia até este momento (simulação ao vivo)
Sala em 3D | Pontos de atenção
Abas: Equipe · Chamados do N2 · Simulador
```

- **Ao vivo e previsto nunca se misturam.** Números da simulação animada ficam em "Agora", nos pontos de atenção e nas abas Equipe e Chamados. Números do modelo de fila (Erlang C) ficam só na aba Simulador, com "previsão" no texto de ajuda.
- **Pontos de atenção** são a lista de trabalho da coordenação. Vêm em ordem de gravidade (vermelho antes de laranja) e cada item leva à aba onde se resolve. A regra de cada alerta está em `pontosDeAtencao()` (`src/telas/central/comum.ts`). Lista vazia mostra "Nada pedindo atenção agora", nunca um espaço em branco.
- **A aba ativa vai na URL** (`?aba=chamados`), para dar para mandar o link direto.
- **Cada aba tem uma tarefa.** Equipe: logar, pausar e deslogar. Chamados: priorizar o N2. Simulador: testar cenários.

## 3. Metas e limites

Ficam num lugar só (`comum.ts` e `fila.ts`) e aparecem na tela junto do número.

| O quê | Meta ou limite |
|---|---|
| Nível de serviço (atendidos em até 60 s) | ≥ 80% |
| Abandono | ≤ 5% |
| SLA do N2 (modelo) | ≥ 90% em até 8 h |
| Aderência à escala | ≥ 90% dos escalados disponíveis |
| Fila do N1 | alerta acima de 5 contatos |
| Prazo do N2 por prioridade | P1 2 h · P2 4 h · P3 8 h · P4 16 h (horas úteis) |
| Pausas | Descanso 10 · Lanche 20 · Banheiro 5 · Feedback 15 · Treinamento 30 · Particular 5 (min) |

## 4. Tokens

Todos em `src/kit/tema.css`, no `:root` e nos blocos de tema. **Fora desses blocos não existe valor solto.**

### Cores

| Token | Uso | Não usar para |
|---|---|---|
| `--good`, `--warn`, `--bad` (+ `-soft`) | Situação contra uma meta: na meta, atenção, fora | Decoração, categorias |
| `--accent` (+ `-soft`, `-ink`) | Interação: aba ativa, botão principal, foco, seleção | Indicar situação |
| `--ink`, `--ink-2`, `--muted` | Texto principal, secundário, apoio | — |
| `--surface`, `--surface-2`, `--bg`, `--line`, `--line-2` | Fundos e bordas | — |
| `--c1`…`--c6` | Séries de gráfico (validadas para daltonismo) | Situação |
| `--seq-1`…`--seq-6` | Mapas de calor (escala sequencial) | — |
| `--papel` | Branco fixo nos dois temas (impressão, botão do interruptor) | — |

**Cor nunca vai sozinha.** Toda situação tem texto ("Na meta", "Vencido há 1h40", "Em pausa") além da cor.

### Tipografia: 8 tamanhos

| Token | px | Uso |
|---|---|---|
| `--fs-0` | 10 | Crachá da cena 3D no celular |
| `--fs-1` | 11,5 | Metadado, cabeçalho de tabela, eixo |
| `--fs-2` | 12,5 | Texto secundário, botão pequeno |
| `--fs-3` | 13,5 | Corpo da interface |
| `--fs-4` | 15 | Número de resumo |
| `--fs-5` | 17 | Título de cartão e de seção |
| `--fs-6` | 22 | Título de página |
| `--fs-7` | 28 | Número de indicador |

Números em tabela e indicador usam `font-variant-numeric: tabular-nums`. Códigos (INC…, PA 03) usam `--mono`.

### Forma e espaço

- **Raios:** `--r-xs` 4, `--r-sm` 8, `--r-md` 10, `--r-lg` 14 (cartões), `--r-pill` 999. Também valem `0` e `50%`.
- **Espaçamento:** múltiplos de 4 (`--s-1` 4 … `--s-8` 32). Entre cartões, 16. Dentro do cartão, 12 a 20.

## 5. Componentes

Componentes do kit (`src/kit`) que são compartilhados com os outros painéis da Rotalume:

| Componente | Quando usar |
|---|---|
| `Card` | Todo bloco de conteúdo, sempre com título (`titulo`) |
| `Kpis` | Até 5 indicadores de topo, cada um com meta e situação quando houver meta |
| `Manchete` | A frase-resumo de uma análise (só no Simulador) |
| `Abas` | Trocar de tarefa na mesma página, com setas, Home e End no teclado |
| `Segmentado` | Trocar o modo de uma mesma vista (velocidade 1×, 5×, 20×) |
| `Pill` / `.pill` | Situação curta em texto: Na meta, Em pausa, Vencido |
| `Grafico`, `BarrasH`, `Legenda` | Gráficos em SVG, sempre com `rotulo` para leitor de tela |
| `.resumo` | Linha de números pequenos dentro de um cartão |
| `.tabela-resp` | Tabela que vira lista no celular. Número à direita (`.num`), código em `.mono` |
| `.btn-pri` | Ação principal do cartão (no máximo um por cartão) |
| `.btn-sec` | Ação secundária com texto |
| `.btn-ic` | Ação só com ícone, sempre com `aria-label` |
| `.link` | Ir para algo relacionado (o nome do analista leva à mesa no 3D) |

## 6. Texto

- Português do Brasil, frases curtas, verbo no infinitivo nos botões ("Logar", "Voltar da pausa").
- Todo número diz a unidade e o período: "Abandono" com "Meta ≤ 5%", "Pausa no dia: 14 min".
- Durações: `dur()` mostra "8 min" ou "2h05". Percentuais com vírgula: "83,4%".
- Subtítulo de cartão com no máximo duas linhas. O detalhe fica no ícone (i).

## 7. Estados

| Estado | Como aparece |
|---|---|
| Carregando | "Carregando a central 3D…" na cena; "—" nos indicadores |
| Vazio | Texto que explica e diz o próximo passo ("Ninguém logado. Use 'Logar analista'…") |
| Sem 3D | Aviso no lugar da cena. O Simulador continua funcionando |
| Nada a fazer | "Nada pedindo atenção agora", com ícone de ok |

## 8. Acessibilidade

O alvo é WCAG 2.1 AA nos dois temas, testado pelo axe no CI.

- Teclado chega em tudo. As abas seguem o padrão WAI-ARIA.
- Todo `select` tem rótulo (`aria-label` ou `<label>`).
- Todo gráfico tem rótulo e uma alternativa em texto (nota abaixo ou dica por teclado).
- Com `prefers-reduced-motion`, a simulação começa pausada.

## 9. Responsivo

| Largura | Comportamento |
|---|---|
| > 1100 px | Sala 3D e Pontos de atenção lado a lado |
| ≤ 1100 px | Um embaixo do outro |
| ≤ 700 px | Tabelas viram lista |
| ≤ 600 px | Indicadores em 2 colunas; crachás 3D só com o nome |

Nunca pode haver rolagem lateral. Os testes de ponta a ponta checam isso no celular.

## 10. Como as regras são aplicadas

**`src/governanca.test.ts` (roda no CI) barra:**

- cor hexadecimal fora dos tokens, no CSS e no código
- tamanho de fonte fora da escala `--fs-*` e raio fora de `--r-*`
- estilo inline com cor, fonte ou espaçamento em número solto
- botão só de ícone sem `aria-label`, gráfico sem `rotulo`, cartão sem título, `select` sem rótulo

**Exceção consciente:** um comentário `design-ok: <motivo>` na mesma linha, por exemplo os tons de pele da ilustração 3D.

**Revisão humana** pelo checklist do pull request (`.github/pull_request_template.md`).
