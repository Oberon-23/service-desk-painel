/*
 * Central de service desk em 3D (three.js).
 *
 * Contatos chegam pela entrada (telefone, chat e portal), esperam na fila do N1,
 * vão para a mesa do primeiro analista livre e, ao fim do atendimento, ou são
 * resolvidos (sobem em verde) ou escalados para a fila do N2 (laranja). Quem espera
 * demais desiste (some em vermelho). Chegadas, tempos e desistência seguem o mesmo
 * cenário do modelo (src/fila.ts), sorteados um a um.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ABRE, chegadas, FECHA, NOMES_N1, NOMES_N2, PACIENCIA_MIN, TMA_N2, tmaEfetivo, type Cenario } from '../fila';

export type EstadoMesa = 'livre' | 'atendendo' | 'fora';
export type Selecao = { nivel: 1 | 2; mesa: number; nome: string };
export type Placar = {
  relogio: string; filaN1: number; filaN2: number; atendidos: number; noPrazo: number; abandonos: number; escalados: number; resolvidosN2: number;
  esperaMedia: number; mesas: { nivel: 1 | 2; nome: string; estado: EstadoMesa; feitos: number; ativo: boolean }[];
};
export type CoresCena = { fundo: string; chao: string; grade: string; mesa: string; mesa2: string; tela: string; ok: string; alerta: string; ruim: string; destaque: string; neutro: string; pele: string[] };

const MAX_N1 = 14, MAX_N2 = 8, MAX_TICKETS = 400;
const rnd = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const expo = (media: number) => -Math.log(1 - rnd() * 0.9999) * media;

type Ticket = {
  id: number; estado: 'fila1' | 'n1' | 'fila2' | 'n2' | 'resolvido' | 'abandono';
  chegou: number; paciencia: number; mesa: number; fim: number; inicio: number;
  pos: THREE.Vector3; alvo: THREE.Vector3; anim: number; canal: number;
};
type Mesa = { nivel: 1 | 2; i: number; grupo: THREE.Group; pessoa: THREE.Mesh; tela: THREE.Mesh; anel: THREE.Mesh; ticket: Ticket | null; feitos: number; ativo: boolean; pos: THREE.Vector3 };

/** Posição das mesas: N1 em duas fileiras no centro, N2 numa ilha à direita. */
function posMesa(nivel: 1 | 2, i: number) {
  // alterna as fileiras: com poucas pessoas, as duas fileiras ficam equilibradas
  if (nivel === 1) { const col = Math.floor(i / 2), lin = i % 2; return new THREE.Vector3(-3 + col * 2.6, 0, lin === 0 ? -2.4 : 2.4); }
  const col = Math.floor(i / 2), lin = i % 2; return new THREE.Vector3(18 + col * 2.4, 0, lin === 0 ? -2.4 : 2.4);
}
/** Lugar na fila (em S, para caber muita gente). */
function posFila(nivel: 1 | 2, k: number) {
  if (nivel === 1) { const col = k % 10, lin = Math.floor(k / 10); return new THREE.Vector3(-7.4 - lin * 0.9, 0.45, -4.5 + col * 1.0); }
  const col = k % 8, lin = Math.floor(k / 8); return new THREE.Vector3(15.2 - lin * 0.9, 0.45, -3.5 + col * 1.0);
}

export class Cena {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private mesas: Mesa[] = [];
  private tickets: Ticket[] = [];
  private inst: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private cor = new THREE.Color();
  private mats: Record<string, THREE.MeshStandardMaterial> = {};
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private raf = 0;
  private ultimo = 0;
  private visivel = true;
  private minuto = 90; // minutos desde a abertura (começa às 9h30, perto do pico, para a fila já aparecer)
  private seq = 0;
  private c: Cenario | null = null;
  private lam: number[] = [];
  private tma = 8;
  private st = { atendidos: 0, noPrazo: 0, abandonos: 0, escalados: 0, resolvidosN2: 0, somaEspera: 0 };
  rodando = true;
  velocidade = 5;

  constructor(private el: HTMLElement, private cores: CoresCena, private aoSelecionar: (s: Selecao | null) => void) {
    const leve = el.clientWidth < 700 || (navigator.hardwareConcurrency ?? 8) <= 4;
    this.renderer = new THREE.WebGLRenderer({ antialias: !leve, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, leve ? 1.5 : 2));
    this.renderer.shadowMap.enabled = !leve;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    el.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 200);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = 1.38;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 75;
    this.visaoGeral();
    this.inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshStandardMaterial({ roughness: 0.4 }), MAX_TICKETS);
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inst.castShadow = true;
    this.inst.count = 0;
    this.montar();
    this.scene.add(this.inst);
    this.aplicarCores();
    this.ro = new ResizeObserver(() => this.redimensionar());
    this.ro.observe(el);
    this.io = new IntersectionObserver(([e]) => { this.visivel = e.isIntersecting; });
    this.io.observe(el);
    this.renderer.domElement.addEventListener('pointerdown', this.onDown);
    this.renderer.domElement.addEventListener('pointerup', this.onUp);
    this.redimensionar();
    this.raf = requestAnimationFrame(this.loop);
  }

  private mat(nome: string, o: THREE.MeshStandardMaterialParameters = {}) {
    return (this.mats[nome] ??= new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05, ...o }));
  }

  private montar() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
    const sol = new THREE.DirectionalLight(0xffffff, 1.4);
    sol.position.set(10, 26, 16);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    Object.assign(sol.shadow.camera, { left: -26, right: 30, top: 16, bottom: -16, near: 1, far: 70 });
    s.add(sol);
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(70, 40), this.mat('chao'));
    chao.rotation.x = -Math.PI / 2;
    chao.receiveShadow = true;
    s.add(chao);
    const grade = new THREE.GridHelper(70, 35);
    (grade.material as THREE.Material).transparent = true;
    (grade.material as THREE.Material).opacity = 0.3;
    grade.position.y = 0.01;
    grade.name = 'grade';
    s.add(grade);

    // áreas do chão: fila N1, N1, fila N2, N2
    const area = (x: number, z: number, w: number, d: number, nome: string) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.14, roughness: 1 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.02, z);
      m.name = nome;
      s.add(m);
    };
    area(-8.6, 0, 4.2, 11, 'area-fila1');
    area(4.8, 0, 19, 11, 'area-n1');
    area(14.3, 0, 3.2, 9.6, 'area-fila2');
    area(21.6, 0, 10.6, 9.6, 'area-n2');

    // entrada: três totens (telefone, chat, portal)
    const caixa = new THREE.BoxGeometry(1, 1, 1);
    [-2.2, 0, 2.2].forEach((z, k) => {
      const t = new THREE.Mesh(caixa, this.mat(`canal${k}`));
      t.scale.set(0.8, 2.4, 1.4);
      t.position.set(-13.5, 1.2, z);
      t.castShadow = true;
      s.add(t);
    });
    const porta = new THREE.Mesh(caixa, this.mat('mesa2'));
    porta.scale.set(0.5, 0.3, 7.6);
    porta.position.set(-13.5, 2.55, 0);
    s.add(porta);

    // mesas
    const mesaGeo = new THREE.BoxGeometry(2, 0.12, 1.2);
    const pernaGeo = new THREE.BoxGeometry(0.1, 0.75, 1.1);
    const telaGeo = new THREE.BoxGeometry(0.9, 0.6, 0.06);
    const corpo = new THREE.CapsuleGeometry(0.32, 0.55, 4, 12);
    const cabeca = new THREE.SphereGeometry(0.26, 16, 12);
    const anelGeo = new THREE.TorusGeometry(0.45, 0.07, 8, 32);
    const add = (nivel: 1 | 2, n: number) => {
      for (let i = 0; i < n; i++) {
        const g = new THREE.Group();
        const p = posMesa(nivel, i);
        const voltada = p.z < 0 ? 1 : -1; // as fileiras ficam de frente uma para a outra
        g.position.copy(p);
        const tampo = new THREE.Mesh(mesaGeo, this.mat(nivel === 1 ? 'mesa' : 'mesaN2'));
        tampo.position.y = 0.8;
        tampo.castShadow = tampo.receiveShadow = true;
        g.add(tampo);
        for (const x of [-0.9, 0.9]) { const l = new THREE.Mesh(pernaGeo, this.mat('mesa2')); l.position.set(x, 0.4, 0); g.add(l); }
        const tela = new THREE.Mesh(telaGeo, new THREE.MeshStandardMaterial({ roughness: 0.3, emissiveIntensity: 0.6 }));
        tela.position.set(0, 1.25, 0.25 * voltada);
        g.add(tela);
        const pessoa = new THREE.Mesh(corpo, new THREE.MeshStandardMaterial({ roughness: 0.6 }));
        pessoa.position.set(0, 0.85, -0.95 * voltada);
        pessoa.castShadow = true;
        g.add(pessoa);
        const cab = new THREE.Mesh(cabeca, this.mat(`pele${i % 4}`));
        cab.position.set(0, 1.62, -0.95 * voltada);
        cab.castShadow = true;
        g.add(cab);
        const anel = new THREE.Mesh(anelGeo, new THREE.MeshStandardMaterial({ emissiveIntensity: 1 }));
        anel.rotation.x = Math.PI / 2;
        anel.position.set(0, 2.15, -0.95 * voltada);
        g.add(anel);
        g.userData = { nivel, mesa: i };
        s.add(g);
        this.mesas.push({ nivel, i, grupo: g, pessoa, tela, anel, ticket: null, feitos: 0, ativo: true, pos: p.clone().setY(1.15).add(new THREE.Vector3(0, 0, 0.1 * voltada)) });
      }
    };
    add(1, MAX_N1);
    add(2, MAX_N2);
  }

  setCores(c: CoresCena) { this.cores = c; this.aplicarCores(); }
  private aplicarCores() {
    const c = this.cores;
    this.scene.background = new THREE.Color(c.fundo);
    this.mat('chao').color.set(c.chao);
    this.mat('mesa').color.set(c.mesa);
    this.mat('mesaN2').color.set(c.mesa);
    this.mat('mesa2').color.set(c.mesa2);
    this.mat('canal0').color.set(c.destaque);
    this.mat('canal1').color.set(c.ok);
    this.mat('canal2').color.set(c.alerta);
    c.pele.forEach((p, k) => this.mat(`pele${k}`).color.set(p));
    const g = this.scene.getObjectByName('grade') as THREE.GridHelper | undefined;
    if (g) (g.material as THREE.LineBasicMaterial).color.set(c.grade);
    (this.scene.getObjectByName('area-fila1') as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: c.alerta, transparent: true, opacity: 0.12 });
    (this.scene.getObjectByName('area-n1') as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: c.destaque, transparent: true, opacity: 0.1 });
    (this.scene.getObjectByName('area-fila2') as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: c.alerta, transparent: true, opacity: 0.12 });
    (this.scene.getObjectByName('area-n2') as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: c.neutro, transparent: true, opacity: 0.14 });
  }

  /** Aplica o cenário: quantas mesas ocupadas, ritmo de chegada e tempos. */
  setCenario(c: Cenario) {
    this.c = c;
    this.lam = chegadas(c);
    this.tma = tmaEfetivo(c);
    this.mesas.forEach((m) => {
      m.ativo = m.i < (m.nivel === 1 ? c.n1 : c.n2);
      m.grupo.visible = m.ativo; // só aparecem as mesas com alguém trabalhando
      if (!m.ativo && m.ticket) { // a pessoa saiu: o contato volta para a fila
        m.ticket.estado = m.nivel === 1 ? 'fila1' : 'fila2';
        m.ticket = null;
      }
    });
  }

  private hora() { return ABRE + this.minuto / 60; }
  private passo(dt: number) {
    if (!this.c) return;
    this.minuto += dt;
    const total = (FECHA - ABRE) * 60;
    if (this.minuto >= total) this.novoDia();
    const t = this.minuto;
    // chegadas (processo de Poisson com a taxa da hora)
    const h = Math.min(this.lam.length - 1, Math.floor(t / 60));
    // chegadas como processo de Poisson: em cada passo curto, chance de chegada = taxa × tempo
    for (let x = (this.lam[h] / 60) * dt; x > 0 && this.tickets.length < MAX_TICKETS; x -= 1) {
      if (rnd() >= Math.min(1, x)) continue;
      const canal = rnd() < 0.5 ? 0 : rnd() < 0.6 ? 1 : 2;
      const p = new THREE.Vector3(-13.5, 1.1, [-2.2, 0, 2.2][canal]);
      this.tickets.push({ id: this.seq++, estado: 'fila1', chegou: t, paciencia: expo(PACIENCIA_MIN), mesa: -1, fim: 0, inicio: 0, pos: p, alvo: p.clone(), anim: 0, canal });
    }

    // fim de atendimento
    for (const m of this.mesas) {
      const k = m.ticket;
      if (!k || t < k.fim) continue;
      m.feitos++;
      m.ticket = null;
      if (m.nivel === 1) {
        if (rnd() < this.c.fcr / 100) { k.estado = 'resolvido'; k.anim = 0; }
        else { k.estado = 'fila2'; this.st.escalados++; }
      } else { k.estado = 'resolvido'; k.anim = 0; this.st.resolvidosN2++; }
    }
    // desistência de quem espera demais no N1
    for (const k of this.tickets) {
      if (k.estado === 'fila1' && t - k.chegou > k.paciencia) { k.estado = 'abandono'; k.anim = 0; this.st.abandonos++; }
    }
    // primeiro livre atende o primeiro da fila
    const livres1 = this.mesas.filter((m) => m.nivel === 1 && m.ativo && !m.ticket);
    const fila1 = this.tickets.filter((k) => k.estado === 'fila1');
    for (const m of livres1) {
      const k = fila1.shift();
      if (!k) break;
      k.estado = 'n1'; k.mesa = m.i; k.inicio = t; k.fim = t + expo(this.tma); m.ticket = k;
      const espera = t - k.chegou;
      this.st.atendidos++; this.st.somaEspera += espera;
      if (espera <= 1) this.st.noPrazo++;
    }
    const livres2 = this.mesas.filter((m) => m.nivel === 2 && m.ativo && !m.ticket);
    const fila2 = this.tickets.filter((k) => k.estado === 'fila2');
    for (const m of livres2) {
      const k = fila2.shift();
      if (!k) break;
      k.estado = 'n2'; k.mesa = m.i; k.inicio = t; k.fim = t + expo(TMA_N2); m.ticket = k;
    }
  }

  private novoDia() {
    this.minuto = 0;
    this.st = { atendidos: 0, noPrazo: 0, abandonos: 0, escalados: 0, resolvidosN2: 0, somaEspera: 0 };
    this.mesas.forEach((m) => { m.feitos = 0; });
    // a fila do N1 não passa a noite; a do N2 sim (chamados abertos)
    this.tickets = this.tickets.filter((k) => k.estado === 'fila2' || k.estado === 'n2');
    this.tickets.forEach((k) => { if (k.estado === 'n2') k.fim -= (FECHA - ABRE) * 60; k.chegou -= (FECHA - ABRE) * 60; });
  }

  private desenhar(dtReal: number) {
    const c = this.cores;
    const fila1 = this.tickets.filter((k) => k.estado === 'fila1');
    const fila2 = this.tickets.filter((k) => k.estado === 'fila2');
    fila1.forEach((k, i) => k.alvo.copy(posFila(1, i)));
    fila2.forEach((k, i) => k.alvo.copy(posFila(2, i)));
    let n = 0;
    const vivos: Ticket[] = [];
    for (const k of this.tickets) {
      if (k.estado === 'n1' || k.estado === 'n2') {
        const m = this.mesas.find((x) => x.nivel === (k.estado === 'n1' ? 1 : 2) && x.i === k.mesa)!;
        k.alvo.copy(m.pos).setY(1.15);
      }
      if (k.estado === 'resolvido' || k.estado === 'abandono') {
        k.anim += dtReal * 1.3;
        k.pos.y += dtReal * (k.estado === 'resolvido' ? 2.2 : 1.2);
        if (k.anim >= 1) continue; // terminou de subir: sai da cena
      } else {
        k.pos.lerp(k.alvo, Math.min(1, dtReal * 5));
      }
      vivos.push(k);
      if (n >= MAX_TICKETS) continue;
      const esc = k.estado === 'resolvido' || k.estado === 'abandono' ? 1 - k.anim * 0.8 : 1;
      this.dummy.position.copy(k.pos);
      this.dummy.scale.setScalar(esc);
      this.dummy.rotation.set(0, k.estado === 'resolvido' ? k.anim * 4 : 0, 0);
      this.dummy.updateMatrix();
      this.inst.setMatrixAt(n, this.dummy.matrix);
      const cor = k.estado === 'resolvido' ? c.ok : k.estado === 'abandono' ? c.ruim : k.estado === 'fila2' || k.estado === 'n2' ? c.alerta : c.destaque;
      this.inst.setColorAt(n, this.cor.set(cor));
      n++;
    }
    this.tickets = vivos;
    this.inst.count = n;
    this.inst.instanceMatrix.needsUpdate = true;
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;

    const pulso = 0.6 + 0.4 * Math.sin(performance.now() / 200);
    for (const m of this.mesas) {
      const estado: EstadoMesa = !m.ativo ? 'fora' : m.ticket ? 'atendendo' : 'livre';
      const pm = m.pessoa.material as THREE.MeshStandardMaterial;
      pm.color.set(estado === 'atendendo' ? (m.nivel === 1 ? c.destaque : c.alerta) : c.ok);
      const tm = m.tela.material as THREE.MeshStandardMaterial;
      tm.color.set(estado === 'fora' ? c.mesa2 : c.tela);
      tm.emissive.set(estado === 'atendendo' ? c.tela : '#000000');
      const am = m.anel.material as THREE.MeshStandardMaterial;
      m.anel.visible = estado === 'atendendo';
      if (m.ticket) {
        const prog = Math.min(1, (this.minuto - m.ticket.inicio) / Math.max(0.1, m.ticket.fim - m.ticket.inicio));
        m.anel.scale.setScalar(0.6 + 0.4 * prog);
        am.color.set(m.nivel === 1 ? c.destaque : c.alerta);
        am.emissive.set(m.nivel === 1 ? c.destaque : c.alerta);
        am.emissiveIntensity = 0.5 + pulso * 0.5;
      }
      (m.grupo.children[0] as THREE.Mesh).material = this.mat(estado === 'fora' ? 'mesa2' : m.nivel === 1 ? 'mesa' : 'mesaN2');
    }
  }

  private loop = (t: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (t - (this.ultimo || t)) / 1000);
    this.ultimo = t;
    if (!this.visivel || document.visibilityState === 'hidden') return;
    if (this.rodando) {
      let resto = dt * this.velocidade;
      while (resto > 0) { const d = Math.min(0.2, resto); this.passo(d); resto -= d; }
    }
    this.desenhar(this.rodando ? dt : 0.016);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  /* ---------- interação ---------- */
  private down = { x: 0, y: 0 };
  private onDown = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY }; };
  private onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 6) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = ray.intersectObjects(this.mesas.filter((m) => m.ativo).map((m) => m.grupo), true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && o.userData.nivel === undefined) o = o.parent;
    if (!o) { this.aoSelecionar(null); return; }
    this.selecionar(o.userData.nivel, o.userData.mesa);
  };
  selecionar(nivel: 1 | 2, mesa: number) {
    this.aoSelecionar({ nivel, mesa, nome: (nivel === 1 ? NOMES_N1 : NOMES_N2)[mesa] });
  }
  visaoGeral() {
    // no celular (tela em pé), olha mais de cima para a central inteira caber na largura
    if (this.el.clientWidth < 600) { this.controls.target.set(5, 0, 0); this.camera.position.set(5, 52, 16); }
    else { this.controls.target.set(5, 0, -1.2); this.camera.position.set(5, 35, 27); }
  }
  zoom(f: number) {
    const d = this.camera.position.clone().sub(this.controls.target).multiplyScalar(f);
    if (d.length() < this.controls.minDistance || d.length() > this.controls.maxDistance) return;
    this.camera.position.copy(this.controls.target.clone().add(d));
  }

  placar(): Placar {
    const h = Math.floor(this.hora()), m = Math.floor(this.minuto % 60);
    return {
      relogio: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      filaN1: this.tickets.filter((k) => k.estado === 'fila1').length,
      filaN2: this.tickets.filter((k) => k.estado === 'fila2').length,
      atendidos: this.st.atendidos, noPrazo: this.st.noPrazo, abandonos: this.st.abandonos, escalados: this.st.escalados, resolvidosN2: this.st.resolvidosN2,
      esperaMedia: this.st.atendidos ? this.st.somaEspera / this.st.atendidos : 0,
      mesas: this.mesas.map((x) => ({ nivel: x.nivel, nome: (x.nivel === 1 ? NOMES_N1 : NOMES_N2)[x.i], estado: !x.ativo ? 'fora' : x.ticket ? 'atendendo' : 'livre', feitos: x.feitos, ativo: x.ativo })),
    };
  }
  /** Posição na tela dos rótulos das áreas. */
  rotulos() {
    const r = this.renderer.domElement.getBoundingClientRect();
    return [new THREE.Vector3(-13.5, 0.1, 3.6), new THREE.Vector3(-8.6, 0.1, 5.6), new THREE.Vector3(4.8, 0.1, 5.6), new THREE.Vector3(14.3, 0.1, 4.9), new THREE.Vector3(21.6, 0.1, 4.9)].map((p) => {
      const v = p.clone().project(this.camera);
      return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height, visivel: v.z < 1 && v.x > -1.1 && v.x < 1.1 };
    });
  }

  private redimensionar() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < 600 ? 48 : 36;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onUp);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export function temWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
