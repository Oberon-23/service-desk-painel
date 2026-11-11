# Service Desk ao vivo

Central de service desk fictícia (a TI da Rotalume) simulada em 3D: contatos chegam por telefone, chat e portal, esperam na fila, são atendidos pelo N1 e, quando o N1 não resolve, seguem para o N2. Ao lado, controles de **“e se”** mostram na hora o efeito de mudar a equipe, o tempo de atendimento, a resolução no primeiro contato ou a demanda.

Projeto de portfólio de [Breno Silva](https://github.com/Oberon-23). Mesma identidade do [painel de qualidade](https://painel-qualidade-rotalume.vercel.app) e do [SGQ](https://sqgrotalume.vercel.app) da Rotalume.

## O que tem

| Tela | O que responde |
|---|---|
| **Central ao vivo** | Como a fila se comporta agora? Simulação 3D (filas, mesas do N1 e do N2, contatos resolvidos, escalados e desistências), placar do dia, controle das posições de atendimento (logar, pausar com motivo e deslogar cada analista na sua PA, com o nome dele em cima da mesa na cena 3D), aderência à escala com alerta de pausa acima do limite, chamados do N2 por prazo de SLA (P1 a P4, vencidos e em risco primeiro) e nível de serviço hora a hora. Controles: analistas no N1 e no N2, volume, tempo médio de atendimento, resolução no primeiro contato, portal de autoatendimento e segunda-feira de manhã. |
| **Dimensionamento** | Quantas pessoas cada hora precisa para atender 80% em até 60 s? Escala mínima por hora contra a equipe fixa de hoje, custo da diferença e quanto cada analista a mais rende. |
| **Sobre o projeto** | O modelo, as fórmulas e como foi construído. |

Indicadores: **nível de serviço** (atendidos em até 60 s, meta 80%), **espera média**, **abandono** (meta até 5%), **SLA do N2** (resolvidos em até 8 horas úteis, meta 90%), ocupação e custo por contato.

## O modelo (`src/fila.ts`)

- **N1:** Erlang C hora a hora, a fórmula clássica de dimensionamento de centrais; os testes conferem o resultado com valores de tabela.
- **Desistência:** paciência média de 6 minutos; abandono = chance de a espera passar da paciência.
- **N2:** fila hora a hora com 30 min por chamado; o que sobra no fim do dia passa para o seguinte.
- **Demanda:** 300 contatos num dia normal (8h às 18h), pico às 9–11h e depois do almoço; segunda de manhã, 40% a mais.
- **Animação:** mesmo cenário, sorteado contato a contato (chegadas de Poisson, tempos exponenciais). O placar ao vivo oscila em torno do valor calculado, como numa central real.

É um modelo para discutir escala e prioridades, não uma previsão.

## Tecnologia

React 19 + TypeScript, Vite, React Router, **three.js** (carregado só na aba ao vivo e montado depois que a página aparece; sem sombras em aparelhos mais fracos) e gráficos em SVG próprio, com dicas no mouse, no toque e no teclado. Tema claro, escuro ou automático.

## Testes

- `npm test`: fórmulas do modelo (Erlang C, cenários, escala ideal).
- `npm run build && npm run e2e`: as telas no computador e no celular, sem erro no console nem rolagem lateral; a simulação andando, pausa, controles de “e se”, seleção de analista, logar/pausar/deslogar nas PAs, alerta de pausa estourada, ordem dos chamados do N2 por prazo, dimensionamento e acessibilidade (WCAG 2.1 AA) no tema claro e no escuro. Roda no CI a cada envio, com os cabeçalhos de segurança da Vercel.

## Rodar

```bash
npm ci
npm run dev
```
