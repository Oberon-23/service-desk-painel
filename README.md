# Service Desk ao vivo

Central de comando de um service desk fictício (a TI da Rotalume) para a coordenação: a operação roda sozinha no navegador, com filas por canal, analistas em PAs e chamados do N2, e dá para **mexer nela** (logar, pausar, mudar quem atende cada canal, declarar incidente) e ver o efeito na hora, nos números e na sala em 3D. Um **copiloto de regras** aponta a próxima ação, e o **treino de crise** provoca problemas para praticar.

Projeto de portfólio de [Breno Silva](https://github.com/Oberon-23). Mesma identidade do [painel de qualidade](https://painel-qualidade-rotalume.vercel.app) e do [SGQ](https://sqgrotalume.vercel.app) da Rotalume.

## O que tem

| Tela | O que tem |
|---|---|
| **Comando** | Cinco números do dia até agora (nível de serviço, fila, abandono, satisfação, N2 vencidos). A **sala em 3D** com uma raia de fila por canal e o nome de quem está em cada PA. O **copiloto**: regras que leem a operação e o modelo de fila e sugerem a próxima ação, com um clique para aplicar. **Treino de crise** (queda da VPN, pico, duas faltas) e o **histórico do turno**. |
| **Filas** | Telefone, chat e portal, cada um com alvo próprio, histórico do dia e números do dia. **Quem atende o quê** (roteamento por habilidade, editável). Assuntos dos últimos 30 minutos e **chamados do N2** por prazo. |
| **Analistas** | Aderência à escala, logar em PA, pausas com motivo e limite, e por pessoa: atendimentos, tempo médio, resolução no 1º contato, satisfação e ocupação. **Linha do tempo** do dia de cada um. |
| **Planejamento** | **Hoje contra o previsto** (projeção do dia e horas com falta de gente), **E se…?** (Erlang C) e **Escala ideal** hora a hora. |
| **Mural** | Versão para a TV da sala: aviso mais grave, seis números grandes e a sala em 3D. |

Indicadores: **nível de serviço** (atendidos em até 60 s, meta 80%), **espera média**, **abandono** (meta até 5%), **SLA do N2** (resolvidos em até 8 horas úteis, meta 90%), ocupação e custo por contato.

## Ideias de mercado que entraram

Pesquisa em ferramentas e guias de central de atendimento e service desk (Genesys, NICE, DMG Consulting, HDI, Parloa):

- **Copiloto do supervisor:** priorizar o que é urgente, perceber pico de assunto antes que vire caos e sugerir a ação, em vez de só mostrar números.
- **Gestão intradiária:** comparar o dia com o previsto e reprojetar o resto do dia, em vez de esperar o relatório do dia seguinte.
- **Painel enxuto:** só número que muda uma decisão do turno, e velocidade sempre ao lado de qualidade (nível de serviço com satisfação, tempo médio com resolução no primeiro contato).
- **Backlog por prazo e roteamento por habilidade**, e um **mural** para a TV da sala com o que a equipe precisa ver de longe.

## O motor ao vivo (`src/operacao`)

- Um contato por vez, sorteado com semente fixa (o mesmo dia sempre se repete): chegadas de Poisson, tempos exponenciais, três canais com alvo e paciência próprios.
- Quem está livre pega o contato mais urgente (espera ÷ alvo do canal) entre os canais em que está habilitado. O N2 atende pela ordem do prazo.
- Cada analista tem um ritmo e uma taxa de resolução um pouco diferentes; 40% dos atendidos respondem à pesquisa de satisfação.
- O motor não depende de React nem do 3D: as telas leem uma foto a cada 250 ms e a cena só desenha.

## O modelo de previsão (`src/fila.ts`)

- **N1:** Erlang C hora a hora, a fórmula clássica de dimensionamento de centrais; os testes conferem o resultado com valores de tabela.
- **Desistência:** paciência média de 6 minutos; abandono = chance de a espera passar da paciência.
- **N2:** fila hora a hora com 30 min por chamado; o que sobra no fim do dia passa para o seguinte.
- **Demanda:** 300 contatos num dia normal (8h às 18h), pico às 9–11h e depois do almoço; segunda de manhã, 40% a mais.

É um modelo para discutir escala e prioridades, não uma previsão.

## Tecnologia

React 19 + TypeScript, Vite, React Router, **three.js** (carregado só na aba ao vivo e montado depois que a página aparece; sem sombras em aparelhos mais fracos) e gráficos em SVG próprio, com dicas no mouse, no toque e no teclado. Tema claro, escuro ou automático.

## Design

As regras de design (para quem é a tela, organização, metas, tokens, componentes, estados e acessibilidade) estão em [docs/DESIGN.md](docs/DESIGN.md). O que dá para checar automaticamente roda no CI em `src/governanca.test.ts`: cor fora dos tokens, fonte fora da escala, raio solto, botão de ícone sem nome, gráfico sem rótulo. Pull requests seguem o checklist em `.github/pull_request_template.md`.

## Testes

- `npm test`: fórmulas do modelo (Erlang C, cenários, escala ideal), o motor da operação (contas que fecham, roteamento por habilidade, pausas, virada do dia), as regras do copiloto e os treinos de crise, e a governança de design.
- `npm run build && npm run e2e`: as telas no computador e no celular, sem erro no console nem rolagem lateral; a simulação andando, pausa, controles de “e se”, seleção de analista, logar/pausar/deslogar nas PAs, alerta de pausa estourada, ordem dos chamados do N2 por prazo, dimensionamento e acessibilidade (WCAG 2.1 AA) no tema claro e no escuro. Roda no CI a cada envio, com os cabeçalhos de segurança da Vercel.

## Rodar

```bash
npm ci
npm run dev
```
