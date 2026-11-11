import { Card } from '../kit/ui';
import { ABRE, ALVO_S, ATUAL, FECHA, PACIENCIA_MIN, TMA_N2, VOLUME_DIA } from '../fila';
import { CANAIS } from '../operacao/motor';

export default function Sobre() {
  return (
    <>
      <Card titulo="O que é">
        <div className="prosa">
          <p>Uma central de service desk fictícia (a TI da Rotalume) que roda sozinha no navegador, feita para a coordenação: o que está acontecendo agora, quem está em cada posição de atendimento, como está cada fila e qual é a próxima ação. Contatos chegam por telefone, chat e portal, são atendidos pelo N1 e, quando o N1 não resolve, viram chamados do N2.</p>
          <p>A ideia vem do dia a dia de suporte. Painéis de central costumam mostrar números; aqui dá para mexer na operação (logar, pausar, mudar quem atende qual canal, declarar incidente) e ver o efeito na hora, na fila e na sala em 3D.</p>
        </div>
      </Card>
      <Card titulo="As telas">
        <div className="prosa">
          <ul>
            <li><b>Comando:</b> cinco indicadores do dia, a sala em 3D, o copiloto, o treino de crise e o histórico do turno.</li>
            <li><b>Filas:</b> uma fila por canal, com alvo próprio, a matriz de quem atende o quê, os assuntos dos últimos 30 minutos e os chamados do N2 por prazo.</li>
            <li><b>Analistas:</b> PAs, pausas com motivo e limite, aderência à escala, indicadores por pessoa e a linha do tempo do dia.</li>
            <li><b>Planejamento:</b> hoje contra o previsto, o “e se” e a escala ideal hora a hora.</li>
            <li><b>Mural:</b> a versão para a TV da sala, só com o que a equipe precisa ver de longe.</li>
          </ul>
        </div>
      </Card>
      <Card titulo="O copiloto">
        <div className="prosa">
          <p>O copiloto <b>não é IA generativa</b>. São regras escritas, que leem o estado da operação e o modelo de fila e propõem a próxima ação, com um botão para aplicar. Toda ação aplicada fica no histórico do turno.</p>
          <ul>
            <li><b>Possível incidente:</b> um assunto com pelo menos 8 contatos em 30 minutos e mais que o dobro do normal. Declarar publica o aviso (que segura parte dos contatos), encurta o atendimento com roteiro e abre o chamado pai P1 no N2.</li>
            <li><b>Fila acima do alvo:</b> 3 ou mais esperando além do alvo do canal. Sugere habilitar no canal alguém que está livre, chamar de volta quem está numa pausa adiável ou logar quem está fora.</li>
            <li><b>Pausa acima do limite</b> e <b>gente da escala fora da operação</b>, com a ação para corrigir.</li>
            <li><b>Previsão:</b> quando o modelo de fila pede mais analistas do que há logados, nesta hora ou na próxima.</li>
            <li><b>Janela para feedback:</b> fila zerada e folga pelo modelo. É a hora de tirar alguém da fila sem ferir a meta.</li>
          </ul>
        </div>
      </Card>
      <Card titulo="O modelo">
        <div className="prosa">
          <ul>
            <li><b>Ao vivo:</b> cada contato é sorteado (chegadas de Poisson, tempos exponenciais), com semente fixa. Cada canal tem alvo de espera próprio: telefone {CANAIS.telefone.alvo} min, chat {CANAIS.chat.alvo} min e portal {CANAIS.portal.alvo} min. Quem está livre pega o contato mais urgente (espera ÷ alvo) entre os canais em que está habilitado.</li>
            <li><b>Pessoas:</b> cada analista tem um ritmo e uma taxa de resolução um pouco diferentes, para os indicadores por pessoa terem o que mostrar.</li>
            <li><b>Satisfação:</b> 40% dos atendidos respondem à pesquisa; a chance de resposta boa cai quando a espera passa do alvo ou o chamado do N2 vence.</li>
            <li><b>N2:</b> {TMA_N2} minutos por chamado, na ordem do prazo da prioridade. O que sobra passa para o dia seguinte.</li>
            <li><b>Previsão (Planejamento e copiloto):</b> o N1 como uma fila só, hora a hora, pelo <b>Erlang C</b>, com alvo de {ALVO_S} s e desistência média em {PACIENCIA_MIN} minutos. É mais exigente que o ao vivo, que usa o alvo de cada canal.</li>
            <li><b>Demanda:</b> {VOLUME_DIA} contatos num dia normal, das {ABRE}h às {FECHA}h, com pico às 9–11h e depois do almoço. Hoje: {ATUAL.n1} analistas no N1, {ATUAL.n2} no N2, {ATUAL.tma} min de atendimento e {ATUAL.fcr}% resolvido no primeiro contato.</li>
          </ul>
          <p>É um modelo para conversar sobre operação e prioridades, não uma previsão: centrais reais têm picos fora do padrão e contatos de duração muito variada.</p>
        </div>
      </Card>
      <Card titulo="Como foi construído">
        <div className="prosa">
          <ul>
            <li>React 19 + TypeScript, Vite e React Router.</li>
            <li>Um <b>motor de simulação</b> sem tela (TypeScript puro, testado), acima das rotas: a operação continua andando ao trocar de tela, e funciona mesmo sem 3D.</li>
            <li>3D com <b>three.js</b>, que só desenha o que o motor diz; carregado depois que a página aparece. Em aparelhos mais fracos, a cena desliga sombras e suavização.</li>
            <li>Gráficos em SVG próprio, com dicas no mouse, no toque e no teclado; tema claro, escuro ou automático.</li>
            <li>Testes das fórmulas (inclusive o Erlang C contra valores de tabela), do motor e das regras do copiloto, e testes no navegador com checagem de acessibilidade, no computador e no celular, a cada envio.</li>
            <li>Mesma identidade visual do <a href="https://painel-qualidade-rotalume.vercel.app">painel de qualidade</a> e do <a href="https://sqgrotalume.vercel.app">SGQ</a> da Rotalume.</li>
          </ul>
        </div>
      </Card>
    </>
  );
}
