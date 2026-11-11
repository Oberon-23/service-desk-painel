/*
 * Central de service desk em 3D (three.js): só o desenho.
 *
 * A simulação roda no motor (src/operacao/motor.ts). Aqui cada contato vira um cubo que sai do
 * totem do seu canal, espera na raia da fila, vai para a mesa de quem atende e, no fim, sobe em
 * verde (resolvido) ou some em vermelho (desistiu). Chamados do N2 ficam em laranja.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MAX_PA, ORDEM_CANAIS, type Canal, type EstadoAnalista, type Motor } from '../operacao/motor';
export type CoresCena = { fundo: string; chao: string; grade: string; mesa: string; mesa2: string; tela: string; ok: string; alerta: string; ruim: string; destaque: string; neutro: string; pele: string[] };

const MAX_CUBOS = 400;
const RAIA_Z: Record<Canal, number> = { telefone: -3.4, chat: 0, portal: 3.4 };
type Vis = { pos: THREE.Vector3; alvo: THREE.Vector3; anim: number; saida: null | 'resolvido' | 'abandono'; n2: boolean; visto: number };
type Mesa = { nivel: 1 | 2; i: number; grupo: THREE.Group; pessoa: THREE.Mesh; tela: THREE.Mesh; anel: THREE.Mesh; pos: THREE.Vector3 };

/** Posição das mesas: N1 em duas fileiras no centro, N2 numa ilha à direita. */
function posMesa(nivel: 1 | 2, i: number) {
  // alterna as fileiras: com poucas pessoas, as duas fileiras ficam equilibradas
  if (nivel === 1) { const col = Math.floor(i / 2), lin = i % 2; return new THREE.Vector3(-3 + col * 2.6, 0, lin === 0 ? -2.4 : 2.4); }
  const col = Math.floor(i / 2), lin = i % 2; return new THREE.Vector3(18 + col * 2.4, 0, lin === 0 ? -2.4 : 2.4);
}
/** Lugar na fila do N1: uma raia por canal, três por fileira, crescendo em direção à entrada. */
function posFila1(canal: Canal, k: number) { return new THREE.Vector3(-6.9 - Math.floor(k / 3) * 0.85, 0.45, RAIA_Z[canal] + ((k % 3) - 1) * 0.95); }
function posFila2(k: number) { const col = k % 8, lin = Math.floor(k / 8); return new THREE.Vector3(15.2 - lin * 0.9, 0.45, -3.5 + col * 1.0); }

export class Cena {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private mesas: Mesa[] = [];
  private vis = new Map<number, Vis>();
  private quadro = 0;
  private inst: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private cor = new THREE.Color();
  private mats: Record<string, THREE.MeshStandardMaterial> = {};
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private raf = 0;
  private ultimo = 0;
  private visivel = true;

  constructor(private el: HTMLElement, private cores: CoresCena, private motor: Motor, private aoSelecionar: (nome: string | null) => void) {
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
    this.inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshStandardMaterial({ roughness: 0.4 }), MAX_CUBOS);
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
        this.mesas.push({ nivel, i, grupo: g, pessoa, tela, anel, pos: p.clone().setY(1.15).add(new THREE.Vector3(0, 0, 0.1 * voltada)) });
      }
    };
    add(1, MAX_PA[1]);
    add(2, MAX_PA[2]);
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

  private analistaDa(m: Mesa) { return this.motor.analistas.find((a) => a.nivel === m.nivel && a.pa === m.i); }

  private desenhar(dt: number) {
    const c = this.cores, mt = this.motor;
    this.quadro++;
    // contatos vivos: cada um vai para o seu lugar na fila ou para a mesa de quem atende
    const naFila: Record<Canal, number> = { telefone: 0, chat: 0, portal: 0 };
    const fila2 = mt.tickets.filter((k) => k.estado === 'fila2').sort((a, b) => a.prazo - b.prazo);
    for (const k of mt.tickets) {
      let v = this.vis.get(k.id);
      if (!v) {
        const p = k.estado === 'fila2' || k.estado === 'n2' ? posFila2(Math.max(0, fila2.indexOf(k))) : new THREE.Vector3(-13.5, 1.1, RAIA_Z[k.canal] * 0.65);
        v = { pos: p, alvo: p.clone(), anim: 0, saida: null, n2: false, visto: 0 };
        this.vis.set(k.id, v);
      }
      v.visto = this.quadro;
      v.n2 = k.estado === 'fila2' || k.estado === 'n2';
      if (k.estado === 'fila') v.alvo.copy(posFila1(k.canal, naFila[k.canal]++));
      else if (k.estado === 'fila2') v.alvo.copy(posFila2(fila2.indexOf(k)));
      else {
        const a = mt.analistas.find((x) => x.nome === k.com);
        const m = a && a.pa !== null ? this.mesas.find((x) => x.nivel === a.nivel && x.i === a.pa) : undefined;
        if (m) v.alvo.copy(m.pos).setY(1.15);
      }
    }
    for (const s of mt.saidas.splice(0)) { const v = this.vis.get(s.id); if (v) { v.saida = s.tipo; v.anim = 0; } }

    let n = 0;
    for (const [id, v] of this.vis) {
      if (v.saida) {
        v.anim += dt * 1.3;
        v.pos.y += dt * (v.saida === 'resolvido' ? 2.2 : 1.2);
        if (v.anim >= 1) { this.vis.delete(id); continue; }
      } else if (v.visto !== this.quadro) { this.vis.delete(id); continue; } // saiu sem aviso (virada do dia)
      else v.pos.lerp(v.alvo, Math.min(1, dt * 5));
      if (n >= MAX_CUBOS) continue;
      this.dummy.position.copy(v.pos);
      this.dummy.scale.setScalar(v.saida ? 1 - v.anim * 0.8 : 1);
      this.dummy.rotation.set(0, v.saida === 'resolvido' ? v.anim * 4 : 0, 0);
      this.dummy.updateMatrix();
      this.inst.setMatrixAt(n, this.dummy.matrix);
      this.inst.setColorAt(n, this.cor.set(v.saida === 'resolvido' ? c.ok : v.saida === 'abandono' ? c.ruim : v.n2 ? c.alerta : c.destaque));
      n++;
    }
    this.inst.count = n;
    this.inst.instanceMatrix.needsUpdate = true;
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;

    const pulso = 0.6 + 0.4 * Math.sin(performance.now() / 200);
    for (const m of this.mesas) {
      const a = this.analistaDa(m);
      const estado: EstadoAnalista = a?.estado ?? 'fora';
      m.grupo.visible = !!a;
      if (!a) continue;
      const corNivel = m.nivel === 1 ? c.destaque : c.alerta;
      (m.pessoa.material as THREE.MeshStandardMaterial).color.set(estado === 'atendendo' ? corNivel : estado === 'pausa' ? c.neutro : c.ok);
      const tm = m.tela.material as THREE.MeshStandardMaterial;
      tm.color.set(estado === 'pausa' ? c.mesa2 : c.tela);
      tm.emissive.set(estado === 'atendendo' ? c.tela : '#000000'); // design-ok: emissivo desligado, não é cor de interface
      const am = m.anel.material as THREE.MeshStandardMaterial;
      m.anel.visible = estado === 'atendendo' && !!a.ticket;
      if (a.ticket) {
        const prog = Math.min(1, (mt.minuto - a.ticket.inicio) / Math.max(0.1, a.ticket.fim - a.ticket.inicio));
        m.anel.scale.setScalar(0.6 + 0.4 * prog);
        am.color.set(corNivel);
        am.emissive.set(corNivel);
        am.emissiveIntensity = 0.5 + pulso * 0.5;
      }
    }
  }

  private loop = (t: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (t - (this.ultimo || t)) / 1000);
    this.ultimo = t;
    if (!this.visivel || document.visibilityState === 'hidden') return;
    this.desenhar(dt);
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
    const hit = ray.intersectObjects(this.mesas.filter((m) => m.grupo.visible).map((m) => m.grupo), true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && o.userData.nivel === undefined) o = o.parent;
    const m = o ? this.mesas.find((x) => x.nivel === o!.userData.nivel && x.i === o!.userData.mesa) : undefined;
    this.aoSelecionar(m ? this.analistaDa(m)?.nome ?? null : null);
  };
  visaoGeral() {
    // no celular (tela em pé), olha mais de cima para a central inteira caber na largura
    if (this.el.clientWidth < 600) { this.controls.target.set(5, 0, 0); this.camera.position.set(5, 52, 16); }
    else { this.controls.target.set(5, 0, -0.2); this.camera.position.set(5, 30, 24); }
  }
  zoom(f: number) {
    const d = this.camera.position.clone().sub(this.controls.target).multiplyScalar(f);
    if (d.length() < this.controls.minDistance || d.length() > this.controls.maxDistance) return;
    this.camera.position.copy(this.controls.target.clone().add(d));
  }

  private projetar(p: THREE.Vector3) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = p.project(this.camera);
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height, visivel: v.z < 1 && Math.abs(v.x) < 1.08 && Math.abs(v.y) < 1.08 };
  }
  /** Posição na tela dos rótulos: os três canais na entrada, as filas e as áreas do N1 e do N2. */
  rotulos() {
    return [...ORDEM_CANAIS.map((k) => new THREE.Vector3(-13.5, 2.9, RAIA_Z[k] * 0.65)), new THREE.Vector3(-8.6, 0.1, 5.9), new THREE.Vector3(4.8, 0.1, 5.6), new THREE.Vector3(14.3, 0.1, 4.9), new THREE.Vector3(21.6, 0.1, 4.9)].map((p) => this.projetar(p));
  }
  /** Posição na tela do crachá de cada PA ocupada (nome por cima da cabeça). */
  crachas() {
    return this.mesas.flatMap((m) => {
      const a = this.analistaDa(m);
      if (!a) return [];
      const cab = new THREE.Vector3();
      m.pessoa.getWorldPosition(cab);
      // mesas vizinhas alternam a altura do crachá
      return [{ nome: a.nome, alto: Math.floor(m.i / 2) % 2 === 1, ...this.projetar(cab.setY(2.5)) }];
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
