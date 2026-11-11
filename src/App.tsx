import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { BookOpen, CalendarClock, Headset, Layers, Radio, Users } from 'lucide-react';
import { FiltrosProvider } from './kit/filtros';
import { Moldura, type Visao } from './kit/ui';
import { OperacaoProvider } from './operacao/contexto';
import { Relogio } from './telas/partes/Sala3D';
const Comando = lazy(() => import('./telas/Comando'));
const Filas = lazy(() => import('./telas/Filas'));
const Analistas = lazy(() => import('./telas/Analistas'));
const Planejamento = lazy(() => import('./telas/Planejamento'));
const Mural = lazy(() => import('./telas/Mural'));
const Sobre = lazy(() => import('./telas/Sobre'));

const VISOES: Visao[] = [
  { path: '/', label: 'Comando', curto: 'Comando', icon: <Radio />, heading: 'Comando', sub: 'O turno agora: indicadores, a sala em 3D e a próxima ação', filtros: 'nenhum', semPeriodo: true },
  { path: '/filas', label: 'Filas', curto: 'Filas', icon: <Layers />, heading: 'Filas', sub: 'Cada canal com o seu alvo, quem atende o quê e os chamados do N2 por prazo', filtros: 'nenhum', semPeriodo: true },
  { path: '/analistas', label: 'Analistas', curto: 'Equipe', icon: <Users />, heading: 'Analistas', sub: 'Quem está em cada PA, pausas, aderência e como cada pessoa está indo hoje', filtros: 'nenhum', semPeriodo: true },
  { path: '/planejamento', label: 'Planejamento', curto: 'Plano', icon: <CalendarClock />, heading: 'Planejamento', sub: 'Hoje contra o previsto, o “e se” e a escala ideal hora a hora', filtros: 'nenhum', semPeriodo: true },
  { path: '/sobre', label: 'Sobre', curto: 'Sobre', icon: <BookOpen />, heading: 'Sobre o projeto', sub: 'As telas, o copiloto, o modelo e como foi construído', filtros: 'nenhum', semPeriodo: true },
];

export default function App() {
  return (
    <FiltrosProvider chave="rotalume-sd" defs={[]}>
      <OperacaoProvider>
        <Routes>
          <Route path="mural" element={<Suspense fallback={<p className="carregando" role="status">Carregando…</p>}><Mural /></Suspense>} />
          <Route element={<Moldura produto="Service Desk" icone={<Headset size={18} />} visoes={VISOES} asOf="" extra={<Relogio />}
            rodape={<>Projeto de portfólio de <a href="https://github.com/Oberon-23">Breno Silva</a> · A central é fictícia e todos os números são simulados.</>} />}>
            <Route index element={<Comando />} />
            <Route path="filas" element={<Filas />} />
            <Route path="analistas" element={<Analistas />} />
            <Route path="planejamento" element={<Planejamento />} />
            <Route path="dimensionamento" element={<Navigate to="/planejamento?aba=escala" replace />} />
            <Route path="sobre" element={<Sobre />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </OperacaoProvider>
    </FiltrosProvider>
  );
}
