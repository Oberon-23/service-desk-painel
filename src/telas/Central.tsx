/*
 * Central ao vivo: o console da coordenação.
 *
 *   1. Agora: indicadores do dia até este momento (simulação ao vivo)
 *   2. A central em 3D e os pontos de atenção
 *   3. Abas: Equipe (PAs e pausas) · Chamados do N2 (prazos) · Simulador (previsão do modelo e "e se")
 *
 * Números "ao vivo" vêm da simulação animada; números "previstos" vêm do modelo
 * de fila (Erlang C) e ficam só na aba Simulador, para não misturar as duas fontes.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Headset } from 'lucide-react';
import { ATUAL, type Cenario } from '../fila';
import { Abas, Card } from '../kit/ui';
import type { Posto } from '../central/tipos';
import { ajustar, logados, pontosDeAtencao, POSTOS_HOJE, type Aba, type Foco, type Mudar, type Vivo } from './central/comum';
import { IndicadoresAgora, PontosDeAtencao } from './central/Agora';
import Central3D from './central/Central3D';
import Equipe from './central/Equipe';
import ChamadosN2 from './central/ChamadosN2';
import Simulador from './central/Simulador';

const ABAS: Aba[] = ['equipe', 'chamados', 'simulador'];
const chave = (ps: Posto[]) => ps.map((p) => `${p.nivel}.${p.pa}.${p.nome}.${p.estado}`).sort().join('|');

export default function Central() {
  const [base, setBase] = useState<Cenario>(ATUAL);
  const [postos, setPostos] = useState<Posto[]>(POSTOS_HOJE);
  const [vivo, setVivo] = useState<Vivo | null>(null);
  const [foco, setFoco] = useState<Foco | null>(null);
  const [params, setParams] = useSearchParams();
  const aba: Aba = ABAS.includes(params.get('aba') as Aba) ? (params.get('aba') as Aba) : 'equipe';
  const irPara = (a: Aba) => setParams((p) => { p.set('aba', a); return p; }, { replace: true });

  // o tamanho da equipe no modelo é quem está logado nas PAs (quem está em pausa não atende)
  const c = useMemo(() => ({ ...base, n1: logados(postos, 1), n2: logados(postos, 2) }), [base, postos]);
  const alterado = JSON.stringify(c) !== JSON.stringify(ATUAL) || chave(postos) !== chave(POSTOS_HOJE);
  const atencao = useMemo(() => pontosDeAtencao(postos, vivo), [postos, vivo]);

  const mudar: Mudar = (nivel, pa, estado, nome, motivo) => setPostos((ps) => {
    const resto = ps.filter((p) => !(p.nivel === nivel && p.pa === pa) && p.nome !== nome);
    if (estado === 'fora') return resto;
    const atual = ps.find((p) => p.nivel === nivel && p.pa === pa);
    return [...resto, { nivel, pa, nome: nome ?? atual!.nome, estado, ...(estado === 'pausa' ? { motivo: motivo ?? 'descanso' } : {}) }];
  });
  const set = <K extends keyof Cenario>(k: K, v: Cenario[K]) => {
    if (k === 'n1' || k === 'n2') setPostos((ps) => ajustar(ps, k === 'n1' ? 1 : 2, v as number));
    else setBase((x) => ({ ...x, [k]: v }));
  };
  const ver = (nivel: 1 | 2, pa: number) => setFoco((f) => ({ nivel, pa, n: (f?.n ?? 0) + 1 }));

  const nVencidos = vivo?.chamados.filter((k) => k.resta < 0).length ?? 0;
  const nAtencaoEquipe = atencao.filter((a) => a.aba === 'equipe' && a.nivel === 'bad').length;

  return (
    <>
      <div className="secao-h">
        <h2>Agora</h2>
        <span>{vivo ? `Hoje até ${vivo.placar.relogio} · simulação` : 'Iniciando a simulação…'}</span>
      </div>
      <IndicadoresAgora vivo={vivo} postos={postos} />

      <div className="console-grid">
        <Card className="fab-card" titulo={<span className="tit-ic"><Headset size={18} aria-hidden="true" />Sala em 3D</span>}
          sub="Cada cubo é um contato: azul no N1, laranja no N2, verde resolvido, vermelho desistiu. Clique numa mesa para ver o analista.">
          <Central3D cenario={c} postos={postos} foco={foco} onMudar={mudar} onTique={setVivo} />
        </Card>
        <PontosDeAtencao itens={atencao} pronto={!!vivo} onAbrir={(a) => { irPara(a.aba); if (a.foco) ver(a.foco.nivel, a.foco.pa); }} />
      </div>

      <Abas rotulo="Detalhes da operação" valor={aba} onChange={irPara} abas={[
        { id: 'equipe', rotulo: 'Equipe', contagem: postos.length, alerta: nAtencaoEquipe > 0 },
        { id: 'chamados', rotulo: 'Chamados do N2', contagem: vivo?.chamados.length, alerta: nVencidos > 0 },
        { id: 'simulador', rotulo: 'Simulador' },
      ]}>
        {aba === 'equipe' && <Equipe postos={postos} placar={vivo?.placar ?? null} onMudar={mudar} onVer={ver} />}
        {aba === 'chamados' && <ChamadosN2 chamados={vivo?.chamados ?? null} placar={vivo?.placar ?? null} />}
        {aba === 'simulador' && <Simulador c={c} alterado={alterado} onSet={set} onVoltar={() => { setBase(ATUAL); setPostos(POSTOS_HOJE); }} />}
      </Abas>
    </>
  );
}
