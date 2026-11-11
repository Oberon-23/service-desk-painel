import { Card } from '../kit/ui';
import { ABRE, ALVO_S, ATUAL, FECHA, PACIENCIA_MIN, SLA_N2_H, TMA_N2, VOLUME_DIA } from '../fila';

export default function Sobre() {
  return (
    <>
      <Card titulo="O que é">
        <div className="prosa">
          <p>Uma central de service desk fictícia (a TI da Rotalume) simulada em 3D. Contatos chegam por telefone, chat e portal, esperam na fila, são atendidos pelo N1 e, quando o N1 não resolve, seguem para o N2. Ao lado, controles de “e se” mostram o efeito de mudar a equipe, o tempo de atendimento, a resolução no primeiro contato ou a demanda.</p>
          <p>A ideia vem do dia a dia de suporte: a pergunta “quantas pessoas eu preciso às 10h de segunda?” tem resposta com conta, e a conta fica mais fácil de discutir quando dá para ver a fila andando.</p>
        </div>
      </Card>
      <Card titulo="O modelo">
        <div className="prosa">
          <ul>
            <li><b>N1:</b> fila com várias pessoas atendendo, calculada hora a hora pelo <b>Erlang C</b>, a fórmula clássica de dimensionamento de centrais. Daí saem o nível de serviço (atendidos em até {ALVO_S} s), a espera média e a ocupação.</li>
            <li><b>Desistência:</b> quem espera desiste, em média, depois de {PACIENCIA_MIN} minutos. O abandono é a chance de a espera passar da paciência.</li>
            <li><b>N2:</b> o que o N1 não resolve entra numa fila hora a hora, com {TMA_N2} minutos por chamado; o que sobra no fim do dia passa para o dia seguinte. O SLA é a parte resolvida em até {SLA_N2_H} horas úteis.</li>
            <li><b>Demanda:</b> {VOLUME_DIA} contatos num dia normal, das {ABRE}h às {FECHA}h, com pico às 9–11h e depois do almoço. Segunda de manhã tem 40% a mais.</li>
            <li><b>Hoje:</b> {ATUAL.n1} analistas no N1, {ATUAL.n2} no N2, {ATUAL.tma} min de atendimento e {ATUAL.fcr}% resolvido no primeiro contato.</li>
            <li><b>Animação:</b> usa o mesmo cenário, mas sorteia contato a contato (chegadas de Poisson, tempos exponenciais). Por isso o placar ao vivo oscila em torno do valor calculado, como numa central de verdade.</li>
          </ul>
          <p>É um modelo para conversar sobre escala e prioridades, não uma previsão: centrais reais têm picos fora do padrão, contatos de duração muito variada e pausas da equipe.</p>
        </div>
      </Card>
      <Card titulo="Como foi construído">
        <div className="prosa">
          <ul>
            <li>React 19 + TypeScript, Vite e React Router.</li>
            <li>3D com <b>three.js</b>, carregado só na aba ao vivo e montado depois que a página aparece. Em aparelhos mais fracos, a cena desliga sombras e suavização.</li>
            <li>Gráficos em SVG próprio, com dicas no mouse, no toque e no teclado; tema claro, escuro ou automático.</li>
            <li>Testes das fórmulas (inclusive o Erlang C contra valores de tabela) e testes no navegador com checagem de acessibilidade, no computador e no celular, a cada envio.</li>
            <li>Mesma identidade visual do <a href="https://painel-qualidade-rotalume.vercel.app">painel de qualidade</a> e do <a href="https://sqgrotalume.vercel.app">SGQ</a> da Rotalume.</li>
          </ul>
        </div>
      </Card>
    </>
  );
}
