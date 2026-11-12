# Design do painel de Service Desk

Guia de design do painel: para quem ele é, como a tela é organizada, os tokens, os componentes e as regras.
O que dá para checar automaticamente roda no CI (`src/governanca.test.ts`). O resto entra no checklist do pull request.

## 1. Para quem e para quê

**Quem usa:** a coordenação do service desk (coordenador, supervisor de turno, analista de qualidade) e, no mural, a equipe da sala.

**Perguntas que o painel responde, e onde:**

| Pergunta | Tela |
|---|---|
| Como está a operação **agora** e **qual é a próxima ação**? | Comando |
| Qual **fila** está apertada, quem atende cada canal e o que vence primeiro no N2? | Filas |
| **Quem** está em cada PA, quem está em pausa demais e como cada pessoa está indo? | Analistas |
| O dia está saindo como o **previsto**? E se a equipe ou a demanda mudarem? Quantas pessoas cada hora pede? | Planejamento |
| O que a sala precisa ver **de longe**? | Mural (TV) |

O que não responde uma dessas perguntas não entra. A regra para escolher indicador, tirada da pesquisa de mercado: **só entra número que muda uma decisão do turno**, e todo indicador de velocidade anda junto com um de qualidade (nível de serviço com satisfação, tempo médio com resolução no primeiro contato).

## 2. Organização

```
Comando       Agora (5 indicadores) → Sala em 3D | Copiloto → Treino de crise | Histórico do turno
Filas         Telefone | Chat | Portal → Quem atende o quê | Assuntos em 30 min → Chamados do N2
Analistas     Aderência → Logar → Tabela por PA → Linha do tempo do dia
Planejamento  Abas: Hoje contra o previsto · E se…? · Escala ideal
Mural         Aviso → 6 números grandes → Sala em 3D
```

- **Uma operação só.** O motor (`src/operacao/motor.ts`) roda acima das rotas: trocar de tela não reinicia o dia. O relógio e a velocidade ficam no topo de todas as telas.
- **Ao vivo e previsto não se misturam.** Comando, Filas, Analistas e Mural mostram a simulação ao vivo. O modelo de fila (Erlang C) aparece em Planejamento e, como explicação, nas sugestões do copiloto.
- **Toda ação deixa rastro.** Logar, pausar, mudar canal, crises e ações do copiloto vão para o Histórico do turno.
- **O copiloto sugere, a coordenação decide.** Nenhuma ação é aplicada sem clique.

## 3. Metas, limites e regras

Ficam num lugar só (`src/operacao/motor.ts`, `src/telas/partes/formatos.ts` e `src/fila.ts`) e aparecem na tela junto do número.

| O quê | Meta ou limite |
|---|---|
| Alvo de espera por canal | Telefone 1 min (meta 80%) · Chat 2 min (80%) · Portal 15 min (90%) |
| Abandono (telefone e chat) | ≤ 5% |
| Satisfação | ≥ 85% de “satisfeito” |
| Resolução no primeiro contato | referência 70% |
| SLA do N2 | ≥ 90% no prazo · P1 2 h · P2 4 h · P3 8 h · P4 16 h (horas úteis) |
| Aderência à escala | ≥ 90% dos escalados disponíveis |
| Pausas | Descanso 10 · Lanche 20 · Banheiro 5 · Feedback 15 · Treinamento 30 · Particular 5 (min) |
| Tempo médio destoando | mais de 25% acima da média do N1, com pelo menos 8 atendimentos |

### Regras do copiloto (`src/operacao/copiloto.ts`)

Em ordem de gravidade. Cada uma tem teste em `src/operacao/motor.test.ts`.

1. **Possível incidente:** um assunto com 8 ou mais contatos em 30 min e 2,2× o normal. O alerta só some quando o volume cai abaixo de 1,4× (histerese, para não piscar). Ação: declarar incidente.
2. **Chamado P1** aberto e **chamados vencidos** no N2.
3. **Pausa acima do limite.** Ação: chamar de volta.
4. **Fila de um canal acima do alvo** (3 ou mais esperando além do alvo). Ação, nesta ordem: habilitar no canal alguém livre; chamar de volta quem está em pausa adiável (descanso, feedback, treinamento); logar quem está fora.
5. **Gente da escala fora da operação.** Ação: logar alguém de fora da escala para cobrir.
6. **Previsão:** o Erlang C pede mais analistas do que há logados nesta hora (ou na próxima, depois do minuto 30). Ação: chamar da pausa ou logar.
7. **Janela para feedback** (informativo): fila zerada, 3 ou mais livres e folga de 2 pelo modelo.
8. **Tempo médio destoando** (informativo).

Uma pessoa entra em no máximo uma sugestão com ação, para as sugestões não se contradizerem.

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

### Tipografia: duas famílias, 9 tamanhos e o do mural

- **Newsreader** (serifa, `--serif`): título de página, manchete e números grandes (indicadores, resumos, filas, mural). É onde o olho deve cair primeiro.
- **Instrument Sans** (`--sans`): toda a interface. As duas fontes vêm do próprio site (`@fontsource`), por isso a política de segurança continua `font-src 'self'`.
- Rótulos curtos em CAIXA ALTA sempre com `letter-spacing: .06em` (indicadores, cabeçalhos de tabela, resumos). Números com algarismos tabulares. Títulos com `text-wrap: balance`.
- Tabelas sem grade: só um fio sob o cabeçalho e fios suaves entre linhas (regras de *Practical Typography*, Butterick).


| Token | px | Uso |
|---|---|---|
| `--fs-0` | 10 | Crachá da cena 3D no celular |
| `--fs-1` | 11,5 | Metadado, cabeçalho de tabela, eixo |
| `--fs-2` | 12,5 | Texto secundário, botão pequeno |
| `--fs-3` | 13,5 | Corpo da interface |
| `--fs-4` | 15 | Número de resumo |
| `--fs-5` | 17 | Título de cartão e de seção |
| `--fs-6` | 22 | Título de página |
| `--fs-7` | 28 | Número de fila |
| `--fs-8` | 34 | Título de página e número de indicador, em serifa |
| `--fs-mural` | 30–64 | Número do mural, lido de longe (cresce com a tela) |

Números em tabela e indicador usam `font-variant-numeric: tabular-nums`. Códigos (INC…, PA 03) usam `--mono`.

### Forma e espaço

- **Raios:** `--r-xs` 4, `--r-sm` 8, `--r-md` 10, `--r-lg` 14, `--r-xl` 18 (cartões), `--r-pill` 999.
- **Sombras:** `--shadow` (cartões, longa e difusa) e `--shadow-alto` (elementos sobre a página). No escuro, um fio de luz no topo em vez de sombra.
- **Movimento:** cada tela entra com um deslize de 6 px em 0,32 s, escalonado por bloco; botões mudam cor em 0,15 s. Tudo desliga com `prefers-reduced-motion`. Também valem `0` e `50%`.
- **Espaçamento:** múltiplos de 4 (`--s-1` 4 … `--s-8` 32). Entre cartões, 16. Dentro do cartão, 12 a 20.

## 5. Componentes

Componentes do kit (`src/kit`) que são compartilhados com os outros painéis da Rotalume:

| Componente | Quando usar |
|---|---|
| `Card` | Todo bloco de conteúdo, sempre com título (`titulo`) |
| `Kpis` | Até 5 indicadores de topo, cada um com meta e situação quando houver meta |
| `Copiloto` | Lista de sugestões com ação de um clique; vermelho, laranja e azul (informativo) |
| `Sala3D` / `Relogio` | A sala e o relógio da simulação; a sala sempre vem com a lista “Equipe na sala” (alternativa ao clique na cena) |
| `.fila-card` | Uma fila por canal: agora, histórico do dia (pico a cada 5 min) e números do dia |
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
| Sem 3D | Aviso no lugar da cena. Indicadores, copiloto e todas as outras telas continuam funcionando, porque o motor não depende do 3D |
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

## 10. Camadas de estilo

- `src/kit/tema.css`: tokens, temas claro e escuro e componentes.
- `src/kit/refino.css`: a camada editorial (fontes, números em serifa, respiro, sombras, tabelas, movimento, link “Pular para o conteúdo”). Carrega depois do tema.

Referências usadas no refino: *Web Interface Guidelines* (Vercel), *design-audit* e *ui-typography* (Bencium, a partir de *Practical Typography*, de Matthew Butterick).

## 11. Como as regras são aplicadas

**`src/governanca.test.ts` (roda no CI) barra:**

- cor hexadecimal fora dos tokens, no CSS e no código
- tamanho de fonte fora da escala `--fs-*` e raio fora de `--r-*`
- estilo inline com cor, fonte ou espaçamento em número solto
- botão só de ícone sem `aria-label`, gráfico sem `rotulo`, cartão sem título, `select` sem rótulo

**Exceção consciente:** um comentário `design-ok: <motivo>` na mesma linha, por exemplo os tons de pele da ilustração 3D.

**Revisão humana** pelo checklist do pull request (`.github/pull_request_template.md`).
