import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { BookOpen, Headset, Radio, Users } from 'lucide-react';
import { FiltrosProvider } from './kit/filtros';
import { Moldura, type Visao } from './kit/ui';
const Central = lazy(() => import('./telas/Central'));
const Dimensionamento = lazy(() => import('./telas/Dimensionamento'));
const Sobre = lazy(() => import('./telas/Sobre'));

const VISOES: Visao[] = [
  { path: '/', label: 'Central ao vivo', curto: 'Ao vivo', icon: <Radio />, heading: 'Central ao vivo', sub: 'Console da coordenação: o que está acontecendo agora, quem está em cada PA e o que pede ação', filtros: 'nenhum', semPeriodo: true },
  { path: '/dimensionamento', label: 'Dimensionamento', curto: 'Escala', icon: <Users />, heading: 'Dimensionamento da equipe', sub: 'Quantas pessoas a central precisa em cada hora para cumprir a meta', filtros: 'nenhum', semPeriodo: true },
  { path: '/sobre', label: 'Sobre o projeto', curto: 'Sobre', icon: <BookOpen />, heading: 'Sobre o projeto', sub: 'O modelo, as fórmulas e como foi construído', filtros: 'nenhum', semPeriodo: true },
];

export default function App() {
  return (
    <FiltrosProvider chave="rotalume-sd" defs={[]}>
      <Routes>
        <Route element={<Moldura produto="Service Desk" icone={<Headset size={18} />} visoes={VISOES} asOf=""
          rodape={<>Projeto de portfólio de <a href="https://github.com/Oberon-23">Breno Silva</a> · A central é fictícia e todos os números são simulados.</>} />}>
          <Route index element={<Central />} />
          <Route path="dimensionamento" element={<Dimensionamento />} />
          <Route path="sobre" element={<Sobre />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </FiltrosProvider>
  );
}
