// Operação Marte Zero · "Como se constrói ... em Marte?" — vídeo extra em 2,5D (pixel art em 3D de verdade).
// Roda DEPOIS do diretor.js (usa a fonte, texto(), COR, o canvas e o EP carregado). construcao.py chama:
//   carregarEpisodio(ep) → carregarConstrucao(info) → quadroConstrucao(i)
//
// Motor: um mini 3D feito à mão. Tudo é montado com caixas orientadas, prismas e polígonos; cada face é
// projetada (câmera orbital ortográfica), iluminada pelo sol (ou pela lua) e desenhada de trás para a frente.
// A cena é desenhada numa tela pequena (RW x RH) e ampliada 3x sem borrar: fica com cara de pixel art, mas gira
// e tem luz e sombra como 3D. Por cima, na resolução cheia: etapa, sol, título, barra de obra e o texto grande.

const RW = 360, RH = 640, RE = 3, QR = 1.5;   // coordenadas lógicas 360x640; a tela interna tem 1,5x (540x960)
const rc = document.createElement('canvas'); rc.width = RW * QR; rc.height = RH * QR;
const r = rc.getContext('2d');
r.imageSmoothingEnabled = false;
let OB = null;

// ------------------------------------------------------------------ vetores
const v3 = (x, y, z) => [x, y, z];
const soma = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norma = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const suave3 = (k) => { k = clamp(k); return k * k * (3 - 2 * k); };
const quique = (k) => {   // cai e quica (ease-out bounce)
  k = clamp(k);
  if (k < 0.6) return (k / 0.6) ** 2;
  const q = (k - 0.8) / 0.2;
  return 1 - 0.12 * (1 - q * q);
};

// ------------------------------------------------------------------ câmera e luz
const CAM = { tx: 0, ty: 0, tz: 0, yaw: 0.6, pitch: 0.5, zoom: 20, V: [0, 0, 1] };
let SOL = norma([-0.55, -0.45, 0.75]), NOITE = 0;
function prepCamOb() {
  const cy = Math.cos(CAM.yaw), sy = Math.sin(CAM.yaw), cp = Math.cos(CAM.pitch), sp = Math.sin(CAM.pitch);
  CAM.c = { cy, sy, cp, sp };
  CAM.V = [sy * cp, cy * cp, sp];   // direção de onde o espectador olha (cena → câmera)
}
function proj(p) {
  const { cy, sy, cp, sp } = CAM.c;
  const dx = p[0] - CAM.tx, dy = p[1] - CAM.ty, dz = p[2] - CAM.tz;
  const xr = dx * cy - dy * sy, yr = dx * sy + dy * cy;
  return { x: RW / 2 + xr * CAM.zoom, y: RH * 0.5 + (yr * sp - dz * cp) * CAM.zoom, d: yr * cp + dz * sp };
}

// cores: tom(hex, luz) com a noite puxando para o azul; quantizado (bandas de luz = cara de pixel art)
const corCache = new Map();
function tom(hex, k, emis = false) {
  k = Math.round(clamp(k, 0, 1.8) * 16) / 16;
  const nq = emis ? 0 : Math.round(NOITE * 10) / 10;
  const key = hex + '|' + k + '|' + nq;
  let c = corCache.get(key);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    let rr = (n >> 16) * k, gg = ((n >> 8) & 255) * k, bb = (n & 255) * k;
    if (nq) { rr = lerp(rr, rr * 0.62 + 10, nq); gg = lerp(gg, gg * 0.5 + 14, nq); bb = lerp(bb, bb * 0.62 + 44, nq); }
    c = `rgb(${Math.min(255, rr | 0)},${Math.min(255, gg | 0)},${Math.min(255, bb | 0)})`;
    corCache.set(key, c);
  }
  return c;
}

// ------------------------------------------------------------------ cena: lista de faces
let FACES = [], TAGS = [], FX = [], FOCO = { pessoas: [] };
// Marcas para a ordenação (a cena liga antes de desenhar um grupo de peças e desliga depois):
//  SOBRE = rente ao chão (desenhado depois do terreno e antes de tudo); MARCA = parte de um "bloco" (ex.: a estufa):
//  'dentro' = o que fica dentro dele; { r: vetor } = casca (vidro, arco), com r apontando para fora.
//  BLOCO = centro do bloco: ele entra na ordenação como uma peça só, desenhada por dentro na ordem
//  casca de trás → o que está dentro → casca da frente (sem isso, objetos grandes e transparentes se cruzam errado).
let SOBRE = false, MARCA = null, BLOCO = null;
function face(pts, cor, o = {}) { FACES.push({ pts, cor, n: o.n, duplo: o.duplo, emis: o.emis, alfa: o.alfa, fundo: o.fundo, sobre: o.sobre || SOBRE, cor2: o.cor2, est: MARCA }); }
function linha3(a, b, cor, larg = 1, emis = true) { FACES.push({ pts: [a, b], cor, linha: larg, emis, sobre: SOBRE, est: MARCA }); }

/** Caixa orientada: centro c e semi-eixos ux, uy, uz (vetores). */
function obox(c, ux, uy, uz, cor, o = {}) {
  const P = (a, b, d) => soma(soma(soma(c, mul(ux, a)), mul(uy, b)), mul(uz, d));
  const nx = norma(ux), ny = norma(uy), nz = norma(uz);
  const topo = o.topo || cor, lado = o.lado || cor;
  face([P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)], lado, { n: nx, emis: o.emis });
  face([P(-1, 1, -1), P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1)], lado, { n: mul(nx, -1), emis: o.emis });
  face([P(1, 1, -1), P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1)], cor, { n: ny, emis: o.emis });
  face([P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)], cor, { n: mul(ny, -1), emis: o.emis });
  face([P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], topo, { n: nz, emis: o.emis });
  if (o.baixo) face([P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1), P(-1, -1, -1)], cor, { n: mul(nz, -1), emis: o.emis });
}
function caixa3(x0, y0, z0, x1, y1, z1, cor, o) {
  obox([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [(x1 - x0) / 2, 0, 0], [0, (y1 - y0) / 2, 0], [0, 0, (z1 - z0) / 2], cor, o);
}
/** Viga de a até b, com espessura w. */
function viga(a, b, w, cor, o) {
  const d = sub3(b, a), meio = mul(soma(a, b), 0.5);
  const ref = Math.abs(d[2]) > 0.9 * Math.hypot(d[0], d[1], d[2]) ? [1, 0, 0] : [0, 0, 1];
  const ux = mul(norma(cruz(d, ref)), w / 2), uy = mul(norma(cruz(d, ux)), w / 2);
  obox(meio, ux, uy, mul(d, 0.5), cor, o);
}
/** Prisma (cilindro/cone de n lados) em pé. */
function prisma(cx, cy, z0, z1, r0, r1, n, cor, o = {}) {
  const fase = o.fase || 0;
  const pt = (i, z, rr) => { const a = fase + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z]; };
  for (let i = 0; i < n; i++) {
    const a = fase + ((i + 0.5) / n) * Math.PI * 2;
    face([pt(i, z0, r0), pt(i + 1, z0, r0), pt(i + 1, z1, r1), pt(i, z1, r1)], o.lados ? o.lados(i) : cor, { n: norma([Math.cos(a), Math.sin(a), (r0 - r1) / Math.max(0.01, z1 - z0)]), emis: o.emis });
  }
  if (r1 > 0.01) face(Array.from({ length: n }, (_, i) => pt(i, z1, r1)), o.topo || cor, { n: [0, 0, 1], emis: o.emis });
}

// ------------------------------------------------------------------ terreno: um pedaço de Marte flutuando (diorama)
const T = 6;   // de -T a T
const PLANO_R = () => (OB && OB.planoR) || 2.6;   // raio da área que a terraplanagem deixa plana
function alturaBruta(x, y) {
  const morro = 0.9 - (x * x + y * y) * 0.018;
  return morro + 0.18 * Math.sin(x * 1.3 + y * 0.7) + 0.14 * Math.cos(y * 1.1 - x * 0.45) + 0.08 * (hash(x, y, 5) - 0.5);
}
function altura(x, y, plano) {
  const h = alturaBruta(x, y), dist = Math.hypot(x, y);
  const dentro = 1 - suave3((dist - PLANO_R()) / 1.4);
  return lerp(h, 0, dentro * plano);
}
function chaoOb(plano) {
  const H = (x, y) => altura(x, y, plano) - 0.0001 * 0;
  for (let x = -T; x < T; x++) for (let y = -T; y < T; y++) {
    const a = [x, y, H(x, y)], b = [x + 1, y, H(x + 1, y)], c = [x + 1, y + 1, H(x + 1, y + 1)], d = [x, y + 1, H(x, y + 1)];
    const v = hash(x, y, 2);
    const cor = Math.hypot(x + 0.5, y + 0.5) < 2.4 && plano > 0.6 ? (v < 0.5 ? '#c98a5e' : '#c08257') : v < 0.33 ? '#c4643c' : v < 0.66 ? '#bb5a35' : '#cc6d43';
    face([a, b, c], cor, { fundo: true }); face([a, c, d], cor, { fundo: true });
  }
  // paredes do diorama: camadas de rocha
  const camadas = [[0, -0.5, '#a24c30'], [-0.5, -1.4, '#7e3a26'], [-1.4, -2.6, '#5e2c1b']];
  const borda = (p, q) => {
    const tp = H(p[0], p[1]), tq = H(q[0], q[1]);
    face([[p[0], p[1], camadas[0][1]], [q[0], q[1], camadas[0][1]], [q[0], q[1], tq], [p[0], p[1], tp]], camadas[0][2], { fundo: true });
    for (const [z0, z1, cor] of camadas.slice(1)) face([[p[0], p[1], z1], [q[0], q[1], z1], [q[0], q[1], z0], [p[0], p[1], z0]], cor, { fundo: true });
  };
  for (let i = -T; i < T; i++) {
    borda([i + 1, T], [i, T]); borda([i, -T], [i + 1, -T]);
    borda([T, i], [T, i + 1]); borda([-T, i + 1], [-T, i]);
  }
  // pedras espalhadas (fora da área da obra)
  for (let i = 0; i < 14; i++) {
    const x = -T + 0.6 + hash(i, 1, 7) * (2 * T - 1.2), y = -T + 0.6 + hash(i, 2, 7) * (2 * T - 1.2);
    if (Math.hypot(x, y) < 3.6 || (x < -1.5 && y > 0)) continue;
    const s = 0.15 + hash(i, 3, 7) * 0.3, z = altura(x, y, plano);
    obox([x, y, z + s * 0.6], [s, s * 0.3, 0], [-s * 0.25, s * 0.8, 0], [0, 0, s * 0.7], '#8f4129', { topo: '#a85a3a' });
  }
}

// ------------------------------------------------------------------ peças da antena
const BASE_Z = 0.55, ALT = 9, SEG = 6, LADO0 = 1.25, LADO1 = 0.55;
const ladoEm = (z) => lerp(LADO0, LADO1, (z - BASE_Z) / ALT);
const zSeg = (i) => BASE_Z + (i / SEG) * ALT;

function fundacao(n, dropK) {   // octógono em 8 cunhas; a cunha da vez cai do alto e quica
  const R = 2.2;
  for (let i = 0; i < 8; i++) {
    let dz = 0;
    if (i >= n) { if (i === n && dropK > 0) dz = (1 - quique(dropK)) * 4; else continue; }
    const a0 = (i / 8) * Math.PI * 2 + Math.PI / 8, a1 = ((i + 1) / 8) * Math.PI * 2 + Math.PI / 8;
    const p0 = [Math.cos(a0) * R, Math.sin(a0) * R], p1 = [Math.cos(a1) * R, Math.sin(a1) * R];
    const z0 = dz, z1 = BASE_Z + dz, cor = i % 2 ? '#a9aec0' : '#9aa0b5';
    face([[0, 0, z1], [p0[0], p0[1], z1], [p1[0], p1[1], z1]], cor, { n: [0, 0, 1] });
    const am = (a0 + a1) / 2;
    face([[p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1]], '#7a7f96', { n: [Math.cos(am), Math.sin(am), 0] });
    if (dz > 0.01) {   // laterais da cunha no ar
      face([[0, 0, z0], [p0[0], p0[1], z0], [p0[0], p0[1], z1], [0, 0, z1]], '#6b6f86', { n: norma([Math.sin(a0), -Math.cos(a0), 0]) });
      face([[p1[0], p1[1], z0], [0, 0, z0], [0, 0, z1], [p1[0], p1[1], z1]], '#6b6f86', { n: norma([-Math.sin(a1), Math.cos(a1), 0]) });
    }
  }
}

function vergalhao(k) {   // grade de ferro laranja antes do concreto
  if (k <= 0) return;
  for (let i = -4; i <= 4; i++) {
    const s = i * 0.5, e = Math.sqrt(Math.max(0, 4.4 - s * s)) * clamp(k * 1.4 - (i + 4) * 0.05);
    if (e <= 0) continue;
    linha3([s, -e, 0.04], [s, e, 0.04], '#ff8a3d'); linha3([-e, s, 0.04], [e, s, 0.04], '#ff8a3d');
  }
}

function segmentoTorre(i, desloc = [0, 0, 0]) {   // um módulo de treliça (listras vermelho/branco)
  const za = zSeg(i), zb = zSeg(i + 1), la = ladoEm(za), lb = ladoEm(zb);
  const cor = i % 2 ? '#eef0f8' : '#e2603b', w = 0.13;
  const P = (sx, sy, z, l) => soma([sx * l, sy * l, z], desloc);
  const cantos = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (const [sx, sy] of cantos) viga(P(sx, sy, za, la), P(sx, sy, zb, lb), w * 1.4, cor);
  for (let k = 0; k < 4; k++) {
    const [ax, ay] = cantos[k], [bx, by] = cantos[(k + 1) % 4];
    viga(P(ax, ay, zb, lb), P(bx, by, zb, lb), w, cor);                          // anel do topo
    viga(P(ax, ay, za, la), P(bx, by, zb, lb), w * 0.8, '#c9ced9');               // X das faces
    viga(P(bx, by, za, la), P(ax, ay, zb, lb), w * 0.8, '#c9ced9');
  }
}

function plataforma() {
  const z = zSeg(SEG), l = ladoEm(z) + 0.35;
  caixa3(-l, -l, z, l, l, z + 0.12, '#6b6f86', { topo: '#9aa0b5' });
  for (const [ax, ay, bx, by] of [[-l, -l, l, -l], [l, -l, l, l], [l, l, -l, l], [-l, l, -l, -l]]) viga([ax, ay, z + 0.55], [bx, by, z + 0.55], 0.06, '#ffc83d');
  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) viga([sx * l, sy * l, z + 0.12], [sx * l, sy * l, z + 0.55], 0.06, '#ffc83d');
}

/** Prato parabólico: centro (fundo do prato), direção (az, el), raio, quantas das 12 pétalas já estão montadas. */
function prato(c, az, el, R, petalas, aceso) {
  const d = [Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), Math.sin(el)];
  const e1 = norma(cruz(d, [0, 0, 1])), e2 = cruz(e1, d), f = R * 0.55;
  const P = (rho, th) => soma(soma(soma(c, mul(d, (rho * rho) / (4 * f))), mul(e1, rho * Math.cos(th))), mul(e2, rho * Math.sin(th)));
  const ANEIS = 4, COLS = 24;
  for (let j = 0; j < COLS; j++) {
    if (Math.floor(j / 2) >= petalas) continue;
    for (let i = 0; i < ANEIS; i++) {
      const r0 = (i / ANEIS) * R, r1 = ((i + 1) / ANEIS) * R, a0 = (j / COLS) * Math.PI * 2, a1 = ((j + 1) / COLS) * Math.PI * 2;
      const q = [P(r0, a0), P(r1, a0), P(r1, a1), P(r0, a1)];
      const nn = norma(cruz(sub3(q[1], q[0]), sub3(q[3], q[0])));
      face(q, j % 2 ? '#e4e6f0' : '#f6f7fb', { n: dot(nn, d) < 0 ? nn : mul(nn, -1), duplo: true, cor2: '#8a8fa6' });
    }
  }
  if (petalas >= 12) {   // tripé do alimentador + corneta no foco
    const foco = soma(c, mul(d, f * 0.95));
    for (let k = 0; k < 3; k++) viga(P(R * 0.95, (k / 3) * Math.PI * 2 + 0.3), foco, 0.07, '#9aa0b5');
    obox(foco, mul(e1, 0.16), mul(e2, 0.16), mul(d, 0.22), '#6b6f86', { topo: aceso ? '#4ed37a' : '#3a2f63', emis: false });
  }
  return { d, foco: soma(c, mul(d, f)) };
}

function casaEquip(k, noite) {   // casa de equipamentos (cresce de baixo para cima)
  if (k <= 0) return;
  const x0 = -3.9, y0 = 0.6, x1 = -2.2, y1 = 1.9, z0 = altura(-3, 1.2, 1) - 0.05, h = 1.15 * suave3(k);
  caixa3(x0, y0, z0, x1, y1, z0 + h, '#eef0f8', { topo: '#c9ced9' });
  if (k > 0.7) {
    caixa3(x0 - 0.02, y0 + 0.02, z0 + h * 0.55, x1 + 0.02, y1 - 0.02, z0 + h * 0.7, '#e2603b');      // faixa laranja
    caixa3(x1 - 0.01, 1.0, z0, x1 + 0.03, 1.45, z0 + 0.85, '#3a2f63');                               // porta
    caixa3(x0 + 0.3, y0 + 0.3, z0 + h, x0 + 0.8, y0 + 0.8, z0 + h + 0.25, '#9aa0b5');                 // ar-condicionado
    caixa3(x1 + 0.02, 1.15, z0 + 0.95, x1 + 0.12, 1.3, z0 + 1.02, noite > 0.3 ? '#ffe58a' : '#c9ced9', { emis: noite > 0.3 });   // luz da porta
  }
}

function fazendaSolar(noite) {   // pontinha da Fazenda Solar no canto do diorama (de onde vem o cabo)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const x = -5.6 + i * 1.05, y = 3.6 + j * 1.1, z = altura(x, y, 1);
    viga([x, y, z], [x, y, z + 0.35], 0.08, '#6b6f86');
    const c = [x, y, z + 0.45];
    obox(c, [0.45, 0, 0], [0, 0.42, 0.18], [0, -0.03, 0.06], '#22357a', { topo: noite > 0.5 ? '#1b2a55' : '#3d5bd0' });
  }
}

function cabo(k, pulsosT) {   // canaleta da Fazenda Solar até a casa e da casa até a torre
  const rota = [[-5.0, 3.2], [-4.4, 2.4], [-3.6, 1.95], [-2.6, 1.2], [-1.6, 0.8], [-0.9, 0.5]];
  const tot = rota.length - 1;
  for (let i = 0; i < tot; i++) {
    const kk = clamp(k * tot - i);
    if (kk <= 0) break;
    const a = rota[i], b = rota[i + 1], fim = [lerp(a[0], b[0], kk), lerp(a[1], b[1], kk)];
    const za = altura(a[0], a[1], 1) + 0.06, zb = altura(fim[0], fim[1], 1) + 0.06;
    viga([a[0], a[1], za], [fim[0], fim[1], zb], 0.14, '#3a2f63', { topo: '#2a2140' });
  }
  if (pulsosT != null) for (let p = 0; p < 4; p++) {   // energia correndo pelo cabo
    const q = ((pulsosT * 0.6 + p / 4) % 1) * tot, i = Math.floor(q), f = q - i;
    const a = rota[i], b = rota[i + 1], x = lerp(a[0], b[0], f), y = lerp(a[1], b[1], f);
    FX.push({ tipo: 'brilho', p: [x, y, altura(x, y, 1) + 0.2], cor: '#ffe58a', r: 2 });
  }
}

// ------------------------------------------------------------------ peças genéricas
/** Cilindro de a até b (raio r, n lados): rodas, tanques, pistões, maçarico. */
function cilindro(a, b, raio, n, cor, o = {}) {
  const d = sub3(b, a), ax = norma(d);
  const ref = Math.abs(ax[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const e1 = norma(cruz(ax, ref)), e2 = cruz(ax, e1);
  const P = (base, i) => { const ang = (i / n) * Math.PI * 2; return soma(base, soma(mul(e1, Math.cos(ang) * raio), mul(e2, Math.sin(ang) * raio))); };
  for (let i = 0; i < n; i++) {
    const am = ((i + 0.5) / n) * Math.PI * 2;
    face([P(a, i), P(a, i + 1), P(b, i + 1), P(b, i)], o.lados ? o.lados(i) : cor, { n: soma(mul(e1, Math.cos(am)), mul(e2, Math.sin(am))), emis: o.emis });
  }
  face(Array.from({ length: n }, (_, i) => P(b, n - 1 - i)), o.tampa || cor, { n: ax, emis: o.emis });
  face(Array.from({ length: n }, (_, i) => P(a, i)), o.tampa || cor, { n: mul(ax, -1), emis: o.emis });
}
/** Sistema local: origem o, frente u (horizontal); at(frente, lado, altura). */
function local(o, ang) {
  const u = [Math.cos(ang), Math.sin(ang), 0], v = [-u[1], u[0], 0];
  return { u, v, at: (a, b, c) => soma(o, soma(soma(mul(u, a), mul(v, b)), [0, 0, c])) };
}
/** Esteira: caixa escura + sapatas que andam (anim = distância percorrida) + roletes. */
function esteira(L, a0, lado, comp, alt, anim, cor = '#2a2140') {
  const { u, v, at } = L;
  obox(at(a0, lado, alt / 2), mul(u, comp / 2), mul(v, 0.11), [0, 0, alt / 2], cor, { topo: '#3a2f63' });
  const passo = 0.16, off = ((anim % passo) + passo) % passo;
  for (let x = -comp / 2 + off; x < comp / 2; x += passo) {
    obox(at(a0 + x, lado, alt + 0.012), mul(u, 0.035), mul(v, 0.12), [0, 0, 0.012], '#4a4466');
  }
  for (const k of [-0.36, 0, 0.36]) cilindro(at(a0 + k * comp, lado - 0.125, alt / 2), at(a0 + k * comp, lado + 0.125, alt / 2), alt * 0.32, 6, '#6b6f86', { tampa: '#9aa0b5' });
}
function giroflex(p, t, cor = '#ff8a3d') {   // luz giratória
  caixa3(p[0] - 0.07, p[1] - 0.07, p[2], p[0] + 0.07, p[1] + 0.07, p[2] + 0.1, cor, { emis: true });
  const a = t * 6;
  FX.push({ tipo: 'brilho', p: soma(p, [Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.06]), cor, r: 2.4 });
}
function operador(p, ang, cor) {   // colono sentado na cabine (tronco + capacete)
  const { at, u, v } = local(p, ang);
  obox(at(0, 0, 0.18), mul(u, 0.1), mul(v, 0.14), [0, 0, 0.16], cor);
  const c = at(0.02, 0, 0);
  prisma(c[0], c[1], p[2] + 0.36, p[2] + 0.58, 0.12, 0.1, 8, '#f3eefe');
  obox(at(0.11, 0, 0.47), mul(u, 0.02), mul(v, 0.08), [0, 0, 0.05], '#3fd0c9');
}

// ------------------------------------------------------------------ máquinas
function trator(x, y, dir, t, ativo) {
  const z = altura(x, y, 1);
  const L = local([x, y, z], dir), { u, v, at } = L;
  esteira(L, 0, -0.42, 1.3, 0.38, t * 1.1); esteira(L, 0, 0.42, 1.3, 0.38, t * 1.1);
  obox(at(-0.05, 0, 0.56), mul(u, 0.58), mul(v, 0.33), [0, 0, 0.18], '#ffc83d', { topo: '#ffd86a' });           // chassi
  obox(at(0.38, 0, 0.83), mul(u, 0.18), mul(v, 0.28), [0, 0, 0.1], '#e0a920', { topo: '#ffc83d' });              // capô
  for (let i = 0; i < 4; i++) obox(at(0.565, -0.18 + i * 0.12, 0.6), mul(u, 0.01), mul(v, 0.035), [0, 0, 0.1], '#3a2f63');   // grade
  const cx = -0.42, cz = 0.74, ch = 0.55;   // cabine: colunas, teto, vidros e operador
  for (const [a, b] of [[-0.2, -0.26], [-0.2, 0.26], [0.2, -0.26], [0.2, 0.26]]) viga(at(cx + a, b, cz), at(cx + a, b, cz + ch), 0.05, '#e0a920');
  obox(at(cx, 0, cz + ch + 0.03), mul(u, 0.26), mul(v, 0.31), [0, 0, 0.03], '#ffc83d', { topo: '#ffd86a' });
  operador(at(cx - 0.02, 0, cz), dir, '#3f8efc');
  face([at(cx + 0.2, -0.25, cz + 0.05), at(cx + 0.2, 0.25, cz + 0.05), at(cx + 0.2, 0.25, cz + ch - 0.04), at(cx + 0.2, -0.25, cz + ch - 0.04)], '#8fe6ff', { n: u, alfa: 0.5, duplo: true });
  giroflex(at(cx, 0, cz + ch + 0.06), t);
  // lâmina com faixas de alerta + braços e pistões
  for (let i = 0; i < 6; i++) obox(at(0.92, -0.55 + i * 0.22, 0.28), mul(u, 0.06), mul(v, 0.11), [0, 0, 0.24], i % 2 ? '#1b1530' : '#ffc83d', { topo: '#c9ced9' });
  obox(at(0.98, 0, 0.05), mul(u, 0.04), mul(v, 0.66), [0, 0, 0.05], '#c9ced9');
  for (const s of [-1, 1]) {
    viga(at(0.25, s * 0.38, 0.4), at(0.88, s * 0.38, 0.3), 0.07, '#6b6f86');
    cilindro(at(0.42, s * 0.25, 0.78), at(0.84, s * 0.25, 0.48), 0.045, 6, '#c9ced9');                            // haste do pistão
    cilindro(at(0.42, s * 0.25, 0.78), at(0.62, s * 0.25, 0.64), 0.065, 6, '#2a2140');                            // camisa do pistão
  }
  cilindro(at(0.25, 0.2, 0.92), at(0.25, 0.2, 1.42), 0.05, 6, '#4a4466', { tampa: '#1b1530' });                    // escapamento
  for (const s of [-1, 1]) {   // faróis
    obox(at(0.58, s * 0.24, 0.8), mul(u, 0.02), mul(v, 0.05), [0, 0, 0.04], '#fff4c2', { emis: true });
    if (ativo) FX.push({ tipo: 'brilho', p: at(0.62, s * 0.24, 0.8), cor: '#fff4c2', r: 1.6 });
  }
  if (ativo) {
    FX.push({ tipo: 'fumaca', p: at(0.25, 0.2, 1.48), t, semente: Math.abs(x * 7 + y) });
    FX.push({ tipo: 'poeira', p: at(1.02, 0, 0.1), t, semente: Math.abs(x * 3) });
    FX.push({ tipo: 'poeira', p: at(-0.7, 0.42, 0.05), t, semente: Math.abs(x * 5) + 0.3 });
  }
}

/** Guindaste de esteira: gira até mirar o gancho; lança treliçada, cabos, roldana, moitão e gancho. */
function guindaste(bx, by, gancho, t, carga) {
  const z = altura(bx, by, 1);
  const base = local([bx, by, z], 0);
  esteira(base, 0, -0.6, 1.8, 0.4, 0); esteira(base, 0, 0.6, 1.8, 0.4, 0);
  caixa3(bx - 0.7, by - 0.45, z + 0.3, bx + 0.7, by + 0.45, z + 0.48, '#3a2f63', { topo: '#4a4466' });
  const giro = Math.atan2(gancho[1] - by, gancho[0] - bx);
  const L = local([bx, by, z + 0.48], giro), { u, v, at } = L;
  cilindro(at(0, 0, 0), at(0, 0, 0.1), 0.45, 10, '#6b6f86');                                                     // anel de giro
  obox(at(-0.15, 0, 0.45), mul(u, 0.7), mul(v, 0.5), [0, 0, 0.32], '#ffc83d', { topo: '#ffd86a' });                // casa de máquinas
  for (let i = 0; i < 3; i++) obox(at(-0.95, 0, 0.3 + i * 0.2), mul(u, 0.16), mul(v, 0.46), [0, 0, 0.09], i % 2 ? '#4a4466' : '#6b6f86');   // contrapeso
  obox(at(0.45, 0.62, 0.5), mul(u, 0.22), mul(v, 0.17), [0, 0, 0.3], '#e0a920', { topo: '#ffc83d' });             // cabine
  operador(at(0.42, 0.62, 0.22), giro, '#e2603b');
  face([at(0.67, 0.47, 0.3), at(0.67, 0.77, 0.3), at(0.67, 0.77, 0.74), at(0.67, 0.47, 0.74)], '#8fe6ff', { n: u, alfa: 0.6, duplo: true });
  giroflex(at(-0.3, 0, 0.8), t);
  const topoA = at(-0.55, 0, 1.6);   // cavalete (A-frame)
  viga(at(-0.2, -0.35, 0.78), topoA, 0.07, '#e0a920'); viga(at(-0.2, 0.35, 0.78), topoA, 0.07, '#e0a920');
  const pe = at(0.4, 0, 0.75);
  const horiz = Math.hypot(gancho[0] - bx, gancho[1] - by);
  const ponta = soma([bx, by, 0], soma(mul(u, horiz), [0, 0, Math.max(gancho[2] + 2.4, 7.2)]));
  const lado = mul(v, 0.2), dir = sub3(ponta, pe);
  for (const s of [1, -1]) for (const h of [0, 0.22]) viga(soma(soma(pe, mul(lado, s)), [0, 0, h]), soma(soma(ponta, mul(lado, s * 0.35)), [0, 0, h * 0.4]), 0.06, '#ffc83d');
  for (let i = 1; i < 10; i++) {
    const a = soma(pe, mul(dir, i / 10)), b = soma(pe, mul(dir, (i - 0.5) / 10)), enc = 1 - i / 14;
    viga(soma(a, mul(lado, enc)), soma(b, mul(lado, -enc)), 0.035, '#e0a920');
  }
  cilindro(soma(ponta, mul(v, -0.12)), soma(ponta, mul(v, 0.12)), 0.14, 8, '#6b6f86', { tampa: '#c9ced9' });   // roldana
  linha3(topoA, ponta, '#1b1530', 1, false);                                                                      // pendente
  const moitao = soma(gancho, [0, 0, 0.42]);
  linha3(soma(ponta, mul(u, 0.05)), soma(moitao, [0.05, 0, 0.12]), '#1b1530', 1, false);
  linha3(soma(ponta, mul(u, -0.05)), soma(moitao, [-0.05, 0, 0.12]), '#1b1530', 1, false);
  obox(moitao, mul(u, 0.12), mul(v, 0.08), [0, 0, 0.13], '#ffc83d', { topo: '#e0a920' });
  for (let i = 0; i < 2; i++) obox(soma(moitao, [0, 0, -0.04 + i * 0.08]), mul(u, 0.125), mul(v, 0.085), [0, 0, 0.012], '#1b1530');
  viga(soma(moitao, [0, 0, -0.13]), soma(gancho, [0, 0, 0.12]), 0.05, '#9aa0b5');
  viga(soma(gancho, [0, 0, 0.12]), soma(gancho, mul(u, 0.08)), 0.05, '#9aa0b5');
  viga(soma(gancho, mul(u, 0.08)), soma(gancho, [0, 0, 0.06]), 0.05, '#9aa0b5');
  if (carga) for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) linha3(soma(gancho, [0, 0, 0.05]), soma(carga.c, [sx * carga.l, sy * carga.l, 0]), '#ffc83d', 1, false);
  if (Math.floor(t * 2) % 2) FX.push({ tipo: 'brilho', p: soma(ponta, [0, 0, 0.2]), cor: '#ff4d4d', r: 1.8 });
  return ponta;
}

/** Rover de carga 6x6 (traz as vigas da torre do Módulo de Pouso). */
function rover(x, y, dir, t, andando, carga) {
  const z = altura(x, y, 1);
  const L = local([x, y, z], dir), { u, v, at } = L, giro = andando ? Math.floor(t * 8) : 0;
  for (const a of [-0.55, 0, 0.55]) for (const s of [-1, 1]) {
    cilindro(at(a, s * 0.42, 0.2), at(a, s * 0.55, 0.2), 0.2, 8, '#2a2140', { tampa: '#6b6f86', lados: (i) => ((i + giro) % 2 ? '#2a2140' : '#4a4466') });
    viga(at(a, s * 0.3, 0.34), at(a, s * 0.44, 0.22), 0.06, '#9aa0b5');
  }
  obox(at(0, 0, 0.42), mul(u, 0.85), mul(v, 0.36), [0, 0, 0.1], '#eef0f8', { topo: '#c9ced9' });                    // chassi
  obox(at(0.62, 0, 0.75), mul(u, 0.25), mul(v, 0.34), [0, 0, 0.24], '#eef0f8', { topo: '#e2603b' });                // cabine
  operador(at(0.6, 0, 0.52), dir, '#4ed37a');
  face([at(0.875, -0.3, 0.62), at(0.875, 0.3, 0.62), at(0.875, 0.3, 0.94), at(0.875, -0.3, 0.94)], '#3fd0c9', { n: u, alfa: 0.7, duplo: true });
  viga(at(0.5, 0.3, 0.98), at(0.5, 0.3, 1.45), 0.03, '#9aa0b5');                                                      // antena
  if (Math.floor(t * 2.5) % 2) FX.push({ tipo: 'brilho', p: at(0.5, 0.3, 1.47), cor: '#4ed37a', r: 1.5 });
  for (const s of [-1, 1]) FX.push({ tipo: 'brilho', p: at(0.9, s * 0.22, 0.6), cor: '#fff4c2', r: 1.4 });
  if (carga) {
    for (let i = 0; i < 3; i++) viga(at(-0.75, -0.2 + i * 0.2, 0.6), at(0.3, -0.2 + i * 0.2, 0.6), 0.14, i % 2 ? '#eef0f8' : '#e2603b');
    viga(at(-0.3, -0.36, 0.7), at(-0.3, 0.36, 0.7), 0.03, '#ffc83d');
  }
  if (andando) FX.push({ tipo: 'poeira', p: at(-0.8, 0, 0.1), t, semente: Math.abs(x * 5) });
}

function pilhaVigas(x, y, n) {   // canteiro: vigas, caixas e cilindros de gás esperando a vez
  const z = altura(x, y, 1);
  for (let i = 0; i < n; i++) {
    const zz = z + 0.08 + Math.floor(i / 3) * 0.16, yy = y - 0.3 + (i % 3) * 0.2;
    viga([x - 0.7, yy, zz], [x + 0.7, yy, zz], 0.15, i % 2 ? '#eef0f8' : '#e2603b');
  }
  caixa3(x + 0.9, y - 0.2, z, x + 1.3, y + 0.2, z + 0.4, '#6b4a2e', { topo: '#8f6a45' });
  caixa3(x + 0.89, y - 0.21, z + 0.15, x + 1.31, y + 0.21, z + 0.2, '#ffc83d');
  caixa3(x - 1.1, y + 0.2, z, x - 0.8, y + 0.5, z + 0.5, '#3a2f63', { topo: '#4a4466' });
  for (let i = 0; i < 3; i++) prisma(x - 1.25 + i * 0.13, y - 0.4, z, z + 0.45, 0.06, 0.06, 6, '#e04f5f', { topo: '#c9ced9' });
}

// ------------------------------------------------------------------ gente: astronautas com o traje de cada colono
// Corpo arredondado (elipsoides e tubos afunilados, não caixas) e esqueleto de verdade: pernas e braços com IK de
// dois ossos (joelho e cotovelo dobram para o lado certo), ciclo de caminhada com o quadril subindo e descendo,
// tronco que inclina e gira contra o passo, braços balançando ao contrário das pernas, respiração e cabeça que
// olha em volta. Cada ação tem ferramenta e movimento próprios.
/** Elipsoide facetado: centro c e semi-eixos ex, ey, ez (vetores). */
function esferaO(c, ex, ey, ez, cor, n = 8, m = 5, o = {}) {
  const P = (i, j) => {
    const a = (i / n) * Math.PI * 2, b = -Math.PI / 2 + (j / m) * Math.PI;
    return soma(c, soma(soma(mul(ex, Math.cos(b) * Math.cos(a)), mul(ey, Math.cos(b) * Math.sin(a))), mul(ez, Math.sin(b))));
  };
  const N = (i, j) => {   // normal no meio da faceta (direção do centro para a superfície, corrigida pelos eixos)
    const a = ((i + 0.5) / n) * Math.PI * 2, b = -Math.PI / 2 + ((j + 0.5) / m) * Math.PI;
    const lx = Math.hypot(...ex) || 1, ly = Math.hypot(...ey) || 1, lz = Math.hypot(...ez) || 1;
    return norma(soma(soma(mul(ex, Math.cos(b) * Math.cos(a) / (lx * lx)), mul(ey, Math.cos(b) * Math.sin(a) / (ly * ly))), mul(ez, Math.sin(b) / (lz * lz))));
  };
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const pts = j === 0 ? [P(i, 0), P(i + 1, 1), P(i, 1)] : j === m - 1 ? [P(i, j), P(i + 1, j), P(i, j + 1)] : [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
    face(pts, o.cor ? o.cor(i, j) : cor, { n: N(i, j), emis: o.emis });
  }
}
const esfera = (c, rr, cor, n = 6, m = 4, o) => esferaO(c, [rr, 0, 0], [0, rr, 0], [0, 0, rr], cor, n, m, o);
/** Tubo afunilado de a (raio ra) até b (raio rb): membros do corpo. Sem tampas (as juntas são esferas). */
function tubo(a, b, ra, rb, n, cor) {
  const ax = norma(sub3(b, a)), ref = Math.abs(ax[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const e1 = norma(cruz(ax, ref)), e2 = cruz(ax, e1);
  const P = (base, rr, i) => { const g = (i / n) * Math.PI * 2; return soma(base, soma(mul(e1, Math.cos(g) * rr), mul(e2, Math.sin(g) * rr))); };
  for (let i = 0; i < n; i++) {
    const g = ((i + 0.5) / n) * Math.PI * 2;
    face([P(a, ra, i), P(a, ra, i + 1), P(b, rb, i + 1), P(b, rb, i)], cor, { n: soma(mul(e1, Math.cos(g)), mul(e2, Math.sin(g))) });
  }
}
/** IK de dois ossos: de a até alvo, ossos L1 e L2; a junta dobra para o lado de "dobra". Devolve [junta, alvo]. */
function ik2(a, alvo, L1, L2, dobra) {
  let d = sub3(alvo, a), dist = Math.hypot(d[0], d[1], d[2]) || 1e-6;
  const max = (L1 + L2) * 0.995, min = Math.abs(L1 - L2) + 0.01;
  if (dist > max) { alvo = soma(a, mul(d, max / dist)); d = sub3(alvo, a); dist = max; }
  if (dist < min) { alvo = soma(a, mul(d, min / dist)); d = sub3(alvo, a); dist = min; }
  const dn = mul(d, 1 / dist), x = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
  let p = sub3(dobra, mul(dn, dot(dobra, dn)));
  if (Math.hypot(p[0], p[1], p[2]) < 1e-4) p = cruz(dn, [0, 0, 1]);
  return [soma(soma(a, mul(dn, x)), mul(norma(p), h)), alvo];
}
const girarEm = (vec, eixo, ang) => {   // rotação de vec em volta de eixo (unitário)
  const c = Math.cos(ang), s = Math.sin(ang);
  return soma(soma(mul(vec, c), mul(cruz(eixo, vec), s)), mul(eixo, dot(eixo, vec) * (1 - c)));
};

/** mov (opcional) = { passo: distância já andada, v: 0..1 velocidade relativa }: com ele, o ciclo da perna segue a
 *  distância de verdade (o pé fica plantado no chão, sem patinar) e o passo encurta ao acelerar e frear. */
function pessoa(x, y, z, cor, olhar, acao, t, sem, mov) {
  const { u, v, at } = local([x, y, z], olhar), UP = [0, 0, 1];
  const claro = '#eef0f8', luva = '#c9ced9', bota = '#3a2f63', escuro = '#2a2140';
  const anda = acao === 'andar' || acao === 'carregar';
  const amp = mov ? 0.19 * clamp(mov.v, 0.25, 1) : 0.19;          // meia passada
  const fase = mov ? (mov.passo / (4 * 0.19)) * Math.PI * 2 + sem : t * (acao === 'carregar' ? 6.2 : 7.4) + sem;
  const s1 = Math.sin(fase), c1 = Math.cos(fase), forca = amp / 0.19;
  const golpe = (vel) => { const k = (((t * vel + sem) % 1) + 1) % 1; return k < 0.7 ? suave3(k / 0.7) : 1 - suave3((k - 0.7) / 0.3); };
  // ---- pose do corpo
  let pelvZ = 0.63 + Math.sin(t * 1.7 + sem) * 0.006, lean = 0.05, ladoQ = Math.sin(t * 0.9 + sem) * 0.012, giro = 0, pulo = 0;
  let cabYaw = Math.sin(t * 0.55 + sem * 2) * 0.45 * (acao === 'parar' ? 1 : 0.25), cabPitch = 0;
  let pes = [[0.02, 0.1, 0], [-0.02, -0.1, 0]];   // [frente, lado, ergue] do pé esquerdo (+v) e direito (-v)
  if (anda) {
    pes = [[-s1 * amp, 0.09, Math.max(0, -c1) * 0.09 * forca], [s1 * amp, -0.09, Math.max(0, c1) * 0.09 * forca]];
    pelvZ = 0.625 - Math.abs(s1) * 0.03 * forca; ladoQ = c1 * 0.018 * forca; giro = s1 * 0.16 * forca;
    lean = (acao === 'carregar' ? -0.04 : 0.1) * (0.4 + 0.6 * forca);
  } else if (acao === 'agachar') {
    pelvZ = 0.3 + Math.sin(t * 2 + sem) * 0.01; lean = 0.62; pes = [[0.12, 0.15, 0], [0.06, -0.15, 0]]; cabPitch = 0.35;
  } else if (acao === 'pa') { const g = golpe(0.9); lean = 0.25 + g * 0.3; pelvZ = 0.6 - g * 0.05; pes = [[0.12, 0.12, 0], [-0.14, -0.1, 0]]; giro = -0.2 + g * 0.3; cabPitch = 0.3; }
  else if (acao === 'martelar') { lean = 0.28; pelvZ = 0.6; pes = [[0.08, 0.12, 0], [-0.08, -0.12, 0]]; cabPitch = 0.4; }
  else if (acao === 'soldar') { lean = 0.22; cabPitch = 0.25; }
  else if (acao === 'chave') { lean = 0.42; pelvZ = 0.55; pes = [[0.1, 0.13, 0], [-0.04, -0.12, 0]]; cabPitch = 0.45; }
  else if (acao === 'plantar') { const g = golpe(0.7); lean = 0.25 + g * 0.2; pelvZ = 0.58 - g * 0.05; pes = [[0.08, 0.12, 0], [-0.06, -0.11, 0]]; cabPitch = 0.4; }
  else if (acao === 'tablet') { cabPitch = 0.35; lean = 0.08; }
  else if (acao === 'festa') { pulo = Math.max(0, Math.sin(t * 6 + sem)) * 0.22; giro = Math.sin(t * 3 + sem) * 0.25; pes = [[0, 0.11, 0], [0, -0.11, 0]]; }
  else if (acao === 'sinalizar') { giro = Math.sin(t * 1.2 + sem) * 0.1; }
  const pelv = at(0, ladoQ, pelvZ + pulo);
  const tdir = norma(soma(mul(UP, Math.cos(lean)), mul(u, Math.sin(lean))));   // coluna inclinada para frente
  const eixoOmb = norma(soma(mul(v, Math.cos(giro)), mul(u, -Math.sin(giro))));  // ombros giram contra o passo
  const frente = norma(cruz(eixoOmb, tdir));
  const resp = Math.sin(t * 1.8 + sem) * 0.008;
  const peito = soma(pelv, mul(tdir, 0.25 + resp)), pesc = soma(pelv, mul(tdir, 0.4 + resp)), cab = soma(pelv, mul(tdir, 0.52 + resp));
  const ombro = (s) => soma(soma(pelv, mul(tdir, 0.36 + resp)), mul(eixoOmb, s * 0.165));
  // ---- pernas (IK: o joelho dobra para frente)
  for (const [k, s] of [[0, 1], [1, -1]]) {
    const [pf, pl, pe] = pes[k];
    const quad = soma(pelv, mul(v, s * 0.085));
    const tornoz = at(pf, pl, 0.05 + pe + pulo);
    const [joelho, tz] = ik2(quad, tornoz, 0.3, 0.3, soma(u, [0, 0, 0.15]));
    tubo(quad, joelho, 0.072, 0.06, 7, cor); esfera(joelho, 0.064, claro, 6, 4);
    tubo(joelho, tz, 0.06, 0.05, 7, cor);
    esferaO(soma(tz, soma(mul(u, 0.04), [0, 0, -0.012])), mul(u, 0.095), mul(v, 0.058), [0, 0, 0.045], bota, 7, 4);   // bota
  }
  // ---- tronco: quadril, cintura, peito (elipsoides do macacão)
  esferaO(pelv, mul(frente, 0.12), mul(eixoOmb, 0.15), mul(tdir, 0.1), cor, 8, 5);
  tubo(pelv, peito, 0.13, 0.15, 8, cor);
  esferaO(soma(pelv, mul(tdir, 0.08)), mul(frente, 0.128), mul(eixoOmb, 0.158), mul(tdir, 0.025), escuro, 8, 3);   // cinto
  esferaO(peito, mul(frente, 0.135), mul(eixoOmb, 0.18), mul(tdir, 0.16), cor, 8, 5);
  const painel = soma(peito, mul(frente, 0.13));
  obox(painel, mul(frente, 0.01), mul(eixoOmb, 0.065), mul(tdir, 0.05), '#1b1530');
  const pisca = Math.floor(t * 3 + sem) % 3 === 0;
  obox(soma(soma(painel, mul(frente, 0.012)), mul(eixoOmb, -0.03)), mul(frente, 0.004), mul(eixoOmb, 0.012), mul(tdir, 0.012), pisca ? '#ff4d4d' : '#7a2a2a', { emis: pisca });
  obox(soma(soma(painel, mul(frente, 0.012)), mul(eixoOmb, 0.03)), mul(frente, 0.004), mul(eixoOmb, 0.012), mul(tdir, 0.012), '#4ed37a', { emis: true });
  // mochila com 2 tanques e mangueira
  const moch = soma(peito, mul(frente, -0.17));
  esferaO(moch, mul(frente, 0.07), mul(eixoOmb, 0.14), mul(tdir, 0.17), luva, 6, 4);
  for (const s of [-1, 1]) { const tq = soma(soma(moch, mul(frente, -0.07)), mul(eixoOmb, s * 0.07)); tubo(soma(tq, mul(tdir, -0.13)), soma(tq, mul(tdir, 0.13)), 0.045, 0.045, 6, s > 0 ? '#e2603b' : '#9aa0b5'); }
  tubo(soma(moch, mul(tdir, 0.16)), soma(pesc, mul(eixoOmb, 0.08)), 0.02, 0.02, 4, '#4a4466');
  // ---- capacete: bolha redonda, viseira espelhada que vira com a cabeça, antena com luz
  const fCab = norma(girarEm(girarEm(frente, tdir, cabYaw), norma(cruz(tdir, frente)), -cabPitch));
  const lCab = norma(cruz(tdir, fCab));
  esferaO(pesc, mul(frente, 0.1), mul(eixoOmb, 0.1), mul(tdir, 0.03), claro, 8, 3);                                   // anel do pescoço
  esferaO(cab, mul(fCab, 0.135), mul(lCab, 0.135), mul(tdir, 0.13), '#f3eefe', 10, 6);
  const solda = acao === 'soldar';
  esferaO(soma(cab, mul(fCab, 0.045)), mul(fCab, 0.1), mul(lCab, 0.105), mul(tdir, 0.085), solda ? '#2a2140' : '#2f8f9a', 8, 5,
          { cor: (i, j) => (solda ? '#2a2140' : j >= 3 && i % 4 === 1 ? '#bff8ff' : '#2f8f9a') });                       // viseira com reflexo
  const ant0 = soma(soma(cab, mul(lCab, 0.09)), mul(tdir, 0.09)), ant1 = soma(ant0, soma(mul(tdir, 0.15), mul(fCab, -0.04)));
  tubo(ant0, ant1, 0.01, 0.008, 4, '#9aa0b5');
  if (Math.floor(t * 2 + sem) % 2) FX.push({ tipo: 'brilho', p: ant1, cor: '#ff4d4d', r: 1 });
  // ---- braços (IK: o cotovelo dobra para trás e para fora)
  const balanco = (s) => (anda && acao === 'andar' ? s * s1 * 0.2 * forca : 0);
  const repouso = (s) => soma(soma(ombro(s), [0, 0, -0.44]), soma(mul(eixoOmb, s * 0.05), mul(frente, 0.04 + balanco(s))));
  let maoD = repouso(1), maoE = repouso(-1);
  const H = (c) => c + pulo;
  if (solda) { maoD = at(0.36, 0.08, H(0.84) + Math.sin(t * 22 + sem) * 0.012); maoE = at(0.3, -0.12, H(0.8)); }
  else if (acao === 'martelar') { const g = golpe(1.6); maoD = at(0.3 + g * 0.06, 0.12, H(0.42 + (1 - g) * 0.5)); maoE = at(0.3, -0.1, H(0.42)); }
  else if (acao === 'pa') { const g = golpe(0.9); maoD = at(0.22 + g * 0.16, 0.1, H(0.72 - g * 0.18)); maoE = at(0.4 + g * 0.2, 0.0, H(0.46 - g * 0.2)); }
  else if (acao === 'tablet') { maoD = at(0.28, 0.07, H(0.8)); maoE = at(0.28, -0.1, H(0.78)); }
  else if (acao === 'sinalizar') { const g = Math.sin(t * 3.5 + sem); maoD = at(0.12, 0.38, H(1.05 + g * 0.22)); maoE = at(0.12, -0.38, H(1.05 - g * 0.22)); }
  else if (acao === 'chave') { const g = Math.sin(t * 5 + sem) * 0.07; maoD = at(0.4, 0.06 + g, H(0.3)); maoE = at(0.36, -0.1, H(0.3)); }
  else if (acao === 'plantar') {   // pega a muda na mão esquerda e encaixa na calha com a direita
    const g = golpe(0.7);
    maoE = at(0.24, -0.1, H(0.62)); maoD = at(0.26 + g * 0.18, 0.04, H(0.66 - g * 0.16));
  }
  else if (acao === 'agachar') { const g = Math.sin(t * 4 + sem); maoD = at(0.44, 0.1, 0.1 + Math.max(0, g) * 0.1); maoE = at(0.42, -0.1, 0.1 + Math.max(0, -g) * 0.1); }
  else if (acao === 'carregar') { maoD = at(0.26, 0.14, H(0.7)); maoE = at(0.26, -0.14, H(0.7)); }
  else if (acao === 'lanterna') { maoD = at(0.36, 0.12, H(0.88)); }
  else if (acao === 'acenar' || acao === 'festa') {
    maoD = at(0.05, 0.3, H(1.32) + Math.sin(t * 10 + sem) * 0.07);
    if (acao === 'festa') maoE = at(0.05, -0.3, H(1.32) + Math.cos(t * 10 + sem) * 0.07);
  }
  const maos = [];
  for (const [s, m] of [[1, maoD], [-1, maoE]]) {
    const o = ombro(s);
    const [cot, mao] = ik2(o, m, 0.24, 0.23, soma(soma(mul(frente, -0.6), mul(eixoOmb, s * 0.5)), [0, 0, -0.5]));
    esfera(o, 0.066, claro, 6, 4);                                                                                       // ombreira
    tubo(o, cot, 0.055, 0.048, 6, cor); esfera(cot, 0.048, cor, 5, 3);
    tubo(cot, mao, 0.047, 0.04, 6, cor);
    esfera(mao, 0.05, luva, 6, 4);                                                                                       // luva
    maos.push(mao);
  }
  [maoD, maoE] = maos;
  // ---- ferramentas
  if (solda) {
    const bico = soma(maoD, soma(mul(u, 0.28), [0, 0, -0.07]));
    cilindro(maoD, soma(maoD, soma(mul(u, 0.25), [0, 0, -0.05])), 0.028, 6, '#6b6f86', { tampa: '#ff8a3d' });
    tubo(maoD, soma(moch, mul(eixoOmb, 0.12)), 0.018, 0.018, 4, '#e04f5f');
    FX.push({ tipo: 'faisca', p: bico, t, semente: sem });
    FX.push({ tipo: 'brilho', p: bico, cor: '#bfe8ff', r: 2.5 });
  } else if (acao === 'martelar') {
    const g = golpe(1.6), cabeca = soma(maoD, soma(mul(u, 0.16 + g * 0.08), [0, 0, 0.12 - g * 0.28]));
    tubo(maoD, cabeca, 0.018, 0.018, 4, '#6b4a2e');
    obox(cabeca, mul(u, 0.045), mul(v, 0.08), [0, 0, 0.045], '#9aa0b5');
    if (g > 0.95) FX.push({ tipo: 'faisca', p: cabeca, t, semente: sem + 3 });
  } else if (acao === 'pa') {
    const ponta = soma(maoE, soma(mul(u, 0.26), [0, 0, -0.3]));
    tubo(maoD, ponta, 0.018, 0.018, 4, '#6b4a2e');
    obox(ponta, mul(u, 0.08), mul(v, 0.075), [0, 0, 0.012], '#9aa0b5');
    if (golpe(0.9) > 0.9) FX.push({ tipo: 'poeira', p: ponta, t, semente: sem });
  } else if (acao === 'tablet') {
    const c = soma(mul(soma(maoD, maoE), 0.5), [0, 0, 0.05]);
    obox(c, mul(u, 0.012), mul(v, 0.12), [0, 0, 0.085], '#1b1530');
    obox(soma(c, mul(u, 0.014)), mul(u, 0.003), mul(v, 0.1), [0, 0, 0.07], '#3fd0c9', { emis: true });
    FX.push({ tipo: 'brilho', p: soma(c, mul(u, 0.03)), cor: '#3fd0c9', r: 1.3 });
  } else if (acao === 'sinalizar') {
    for (const m of [maoD, maoE]) { cilindro(m, soma(m, [0, 0, 0.26]), 0.025, 6, '#ff8a3d', { emis: true }); FX.push({ tipo: 'brilho', p: soma(m, [0, 0, 0.2]), cor: '#ff8a3d', r: 1.6 }); }
  } else if (acao === 'chave') {
    tubo(maoD, soma(maoD, soma(mul(u, 0.1), mul(v, 0.1))), 0.016, 0.016, 4, '#c9ced9');
  } else if (acao === 'plantar') {   // a muda na ponta dos dedos
    const g = golpe(0.7);
    if (g < 0.85) { const m = soma(maoD, [0, 0, 0.03]); caixa3(m[0] - 0.025, m[1] - 0.025, m[2] - 0.02, m[0] + 0.025, m[1] + 0.025, m[2] + 0.025, '#d9c7a0'); viga(soma(m, [0, 0, 0.025]), soma(m, [0, 0, 0.08]), 0.015, '#4ed37a'); obox(soma(m, [0, 0, 0.085]), [0.03, 0, 0], [0, 0.015, 0], [0, 0, 0.006], '#7be08f'); }
  } else if (acao === 'agachar') {   // amarrando: arame brilhando entre as mãos
    if (Math.floor(t * 4 + sem) % 2) FX.push({ tipo: 'brilho', p: mul(soma(maoD, maoE), 0.5), cor: '#ffc83d', r: 1.1 });
  } else if (acao === 'carregar') {
    const cx = soma(mul(soma(maoD, maoE), 0.5), soma(mul(u, 0.08), [0, 0, 0.04]));
    obox(cx, mul(u, 0.12), mul(v, 0.16), [0, 0, 0.08], '#6b4a2e', { topo: '#8f6a45' });
    obox(cx, mul(u, 0.125), mul(v, 0.03), [0, 0, 0.083], '#ffc83d');
    ULTIMA_CAIXA = soma(cx, [0, 0, 0.09]);
  } else if (acao === 'lanterna') {
    cilindro(maoD, soma(maoD, mul(u, 0.16)), 0.035, 6, '#4a4466', { tampa: '#fff4c2' });
    FX.push({ tipo: 'brilho', p: soma(maoD, mul(u, 0.18)), cor: '#fff4c2', r: 2.2 });
  }
  return soma(cab, [0, 0, 0.36]);   // ponto da etiqueta com o nome
}
let ULTIMA_CAIXA = null;   // onde ficou a caixa da última pessoa que carregava (a cena põe a carga em cima)
const TRAJES = ['#e2603b', '#3f8efc', '#4ed37a', '#9b59b6', '#ffc83d', '#00b8a9', '#e04f5f', '#f2b46a'];

// ------------------------------------------------------------------ céu e efeitos
const ESTRELAS = Array.from({ length: 130 }, (_, i) => ({ x: hash(i, 1, 3) * RW, y: hash(i, 2, 3) * RH * 0.75, b: hash(i, 3, 3) }));
function ceuFundo(t) {
  const g = r.createLinearGradient(0, 0, 0, RH);
  const dia = [['#c97a52', 0], ['#e8a678', 0.45], ['#b85a37', 1]], noite = [['#070512', 0], ['#1d1638', 0.5], ['#2e1c3a', 1]];
  for (let i = 0; i < 3; i++) {
    const a = dia[i][0], b = noite[i][0];
    g.addColorStop(dia[i][1], mistCor(a, b, NOITE));
  }
  r.fillStyle = g; r.fillRect(0, 0, RW, RH);
  if (NOITE > 0.2) {
    for (const s of ESTRELAS) {
      const pis = 0.5 + 0.5 * Math.sin(t * 3 + s.b * 40);
      r.globalAlpha = clamp((NOITE - 0.2) / 0.5) * (0.4 + 0.6 * s.b) * (0.6 + 0.4 * pis);
      r.fillStyle = s.b > 0.85 ? '#ffe9b0' : '#ffffff';
      r.fillRect(((s.x - CAM.yaw * 60) % RW + RW) % RW | 0, s.y | 0, 1, 1);
    }
    r.globalAlpha = 1;
  }
  // morros distantes (giram com a câmera)
  for (let camada = 0; camada < 2; camada++) {
    r.fillStyle = mistCor(camada ? '#8a3f25' : '#a24c30', camada ? '#1a1030' : '#24163c', NOITE);
    r.beginPath(); r.moveTo(0, RH);
    for (let x = 0; x <= RW; x += 6) {
      const k = (x / RW) * 6 + CAM.yaw * (camada ? 3 : 2);
      r.lineTo(x, RH * (camada ? 0.86 : 0.8) - (Math.sin(k) * 14 + Math.sin(k * 2.7) * 8 + 20) * (camada ? 0.8 : 1));
    }
    r.lineTo(RW, RH); r.fill();
  }
}
function mistCor(a, b, k) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const c = (s) => Math.round(lerp((A >> s) & 255, (B >> s) & 255, k));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
let TERRA_DIR = norma([0.35, -0.55, 0.75]);   // onde a Terra está no céu (carregarConstrucao ajusta para cair na tela)
function terraNoCeu(t, brilho) {
  if (NOITE < 0.3) return null;
  const p = proj(soma([CAM.tx, CAM.ty, CAM.tz], mul(TERRA_DIR, 10.5)));
  if (p.x < -10 || p.x > RW + 10 || p.y < -10 || p.y > RH) return p;
  r.globalAlpha = clamp((NOITE - 0.3) / 0.4);
  const gl = r.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10 + brilho * 26);
  gl.addColorStop(0, `rgba(120,180,255,${0.55 + brilho * 0.4})`); gl.addColorStop(1, 'rgba(120,180,255,0)');
  r.fillStyle = gl; r.fillRect(p.x - 40, p.y - 40, 80, 80);
  r.fillStyle = '#3f8efc'; r.fillRect(p.x - 2, p.y - 2, 4, 4); r.fillStyle = '#8fe6ff'; r.fillRect(p.x - 1, p.y - 2, 2, 1);
  r.globalAlpha = 1;
  return p;
}

function desenharFX(t) {
  for (const f of FX) {
    if (f.tipo === 'brilho') {
      const p = proj(f.p);
      const g = r.createRadialGradient(p.x, p.y, 0, p.x, p.y, f.r * 4);
      g.addColorStop(0, f.cor); g.addColorStop(1, 'rgba(0,0,0,0)');
      r.globalAlpha = 0.7; r.fillStyle = g; r.fillRect(p.x - f.r * 4, p.y - f.r * 4, f.r * 8, f.r * 8);
      r.globalAlpha = 1; r.fillStyle = f.cor; r.fillRect(Math.round(p.x - f.r / 2), Math.round(p.y - f.r / 2), Math.ceil(f.r), Math.ceil(f.r));
    } else if (f.tipo === 'faisca') {
      const p = proj(f.p);
      for (let i = 0; i < 9; i++) {
        const k = (((t * 2.6 + i / 9 + f.semente) % 1) + 1) % 1, a = hash(i, Math.floor(t * 2.6 + i / 9 + f.semente), 4) * Math.PI * 2;
        const vx = Math.cos(a) * 22, vy = Math.sin(a) * 14 - 16;
        r.globalAlpha = 1 - k; r.fillStyle = k < 0.3 ? '#ffffff' : '#ffc83d';
        r.fillRect(Math.round(p.x + vx * k), Math.round(p.y + vy * k + 40 * k * k), 1, 1);
      }
      r.globalAlpha = 0.5 + 0.5 * Math.sin(t * 50); r.fillStyle = '#e8f6ff'; r.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
      r.globalAlpha = 1;
    } else if (f.tipo === 'poeira' || f.tipo === 'fumaca') {
      const p = proj(f.p), fum = f.tipo === 'fumaca';
      for (let i = 0; i < 6; i++) {
        const k = (((t * (fum ? 0.7 : 1.2) + i / 6 + f.semente) % 1) + 1) % 1;
        const rr = (fum ? 2 : 3) + k * (fum ? 5 : 9);
        r.globalAlpha = (fum ? 0.45 : 0.55) * (1 - k);
        r.fillStyle = fum ? '#4a4466' : '#e8b48c';
        const x = p.x + (fum ? Math.sin(i * 2 + t) * 3 : (hash(i, 9, 1) - 0.5) * 30 * k), y = p.y - k * (fum ? 26 : 12);
        r.beginPath(); r.arc(x, y, rr, 0, 7); r.fill();
      }
      r.globalAlpha = 1;
    } else if (f.tipo === 'jato') {
      const a = proj(f.de), b = proj(f.para);
      r.strokeStyle = f.cor || '#8a8fa6'; r.lineWidth = f.larg || 3;
      r.beginPath(); r.moveTo(a.x, a.y);
      for (let i = 1; i <= 6; i++) { const k = i / 6; r.lineTo(lerp(a.x, b.x, k) + Math.sin(t * 20 + i * 2) * 0.8, lerp(a.y, b.y, k)); }
      r.stroke();
      for (let i = 0; i < 5; i++) {   // gotas espirrando na chegada
        const k = (((t * 2.2 + i / 5) % 1) + 1) % 1, an = hash(i, Math.floor(t * 2.2 + i / 5), 6) * Math.PI;
        r.globalAlpha = 1 - k; r.fillStyle = f.cor || '#8a8fa6';
        r.fillRect(Math.round(b.x + Math.cos(an) * 10 * k * (i % 2 ? 1 : -1)), Math.round(b.y - Math.sin(an) * 8 * k + 12 * k * k), 2, 2);
      }
      r.globalAlpha = 1;
    } else if (f.tipo === 'impacto') {   // anel de poeira quando a cunha da fundação cai
      const p = proj(f.p), k = f.k;
      r.globalAlpha = 0.6 * (1 - k); r.strokeStyle = '#e8b48c'; r.lineWidth = 3;
      r.beginPath(); r.ellipse(p.x, p.y, 10 + k * 60, (10 + k * 60) * Math.sin(CAM.pitch), 0, 0, 7); r.stroke();
      r.globalAlpha = 1;
    } else if (f.tipo === 'holofote') {   // facho de luz quente subindo do chão até a torre
      const a = proj(f.de), b = proj(f.para);
      r.globalCompositeOperation = 'lighter';
      const g = r.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0, `rgba(255,214,120,${0.42 * f.k})`); g.addColorStop(1, 'rgba(255,214,120,0)');
      r.fillStyle = g;
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2, abre = 26;
      r.beginPath(); r.moveTo(a.x, a.y);
      r.lineTo(b.x + Math.cos(ang) * abre, b.y + Math.sin(ang) * abre); r.lineTo(b.x - Math.cos(ang) * abre, b.y - Math.sin(ang) * abre);
      r.closePath(); r.fill();
      const p2 = r.createRadialGradient(a.x, a.y, 0, a.x, a.y, 22);
      p2.addColorStop(0, `rgba(255,220,140,${0.5 * f.k})`); p2.addColorStop(1, 'rgba(255,220,140,0)');
      r.fillStyle = p2; r.fillRect(a.x - 22, a.y - 22, 44, 44);
      r.globalCompositeOperation = 'source-over';
    } else if (f.tipo === 'feixe') {   // sinal subindo do prato até a Terra
      const a = proj(f.de), b = proj(soma([CAM.tx, CAM.ty, CAM.tz], mul(TERRA_DIR, 10.5)));
      const pul = 0.75 + 0.25 * Math.sin(t * 14);
      r.globalCompositeOperation = 'lighter';
      for (const [w, al] of [[9, 0.12], [5, 0.25], [2, 0.8]]) {
        r.globalAlpha = al * pul * f.k; r.strokeStyle = '#8fe6ff'; r.lineWidth = w;
        r.beginPath(); r.moveTo(a.x, a.y); r.lineTo(lerp(a.x, b.x, f.k), lerp(a.y, b.y, f.k)); r.stroke();
      }
      for (let i = 0; i < 5; i++) {   // ondas subindo
        const k = (t * 0.9 + i / 5) % 1;
        if (k > f.k) continue;
        const x = lerp(a.x, b.x, k), y = lerp(a.y, b.y, k);
        r.globalAlpha = (1 - k) * 0.8; r.strokeStyle = '#3fd0c9'; r.lineWidth = 2;
        r.beginPath(); r.ellipse(x, y, 8 + k * 26, 3 + k * 9, Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2, 0, 7); r.stroke();
      }
      r.globalCompositeOperation = 'source-over'; r.globalAlpha = 1;
    }
  }
}

// ------------------------------------------------------------------ desenho das faces
function desenharFaces() {
  const fundo = [], sobre = [], frente = [];
  const grupo = (f) => (f.fundo ? fundo : f.sobre ? sobre : frente);
  const L = SOL, amb = lerp(0.55, 0.42, NOITE), dif = lerp(0.75, 0.5, NOITE);
  for (const f of FACES) {
    const P = f.pts.map(proj);
    let d = 0;
    for (const p of P) d += p.d;
    d /= P.length;
    if (f.linha) { grupo(f).push({ f, P, d }); continue; }
    let n = f.n;
    if (!n) n = norma(cruz(sub3(f.pts[1], f.pts[0]), sub3(f.pts[2], f.pts[0])));
    let vis = dot(n, CAM.V), cor = f.cor;
    if (vis <= 0) { if (!f.duplo) continue; n = mul(n, -1); vis = -vis; cor = f.cor2 || f.cor; }
    const luz = f.emis ? 1.15 : amb + dif * Math.max(0, dot(n, L));
    grupo(f).push({ f, P, d, c: tom(cor, luz, f.emis) });
  }
  // o bloco (estufa) vira uma peça só na ordenação da frente
  if (BLOCO) {
    const tras = [], dentro = [], diante = [], resto = [];
    for (const it of frente) {
      const e = it.f.est;
      if (!e) resto.push(it);
      else if (e === 'dentro') dentro.push(it);
      else (dot(e.r, CAM.V) >= 0 ? diante : tras).push(it);
    }
    const ord = (l) => l.sort((a, b) => a.d - b.d);
    resto.push({ bloco: [...ord(tras), ...ord(dentro), ...ord(diante)], d: proj(BLOCO).d });
    frente.length = 0; frente.push(...resto);
  }
  const desenhar = ({ f, P, c }) => {
    if (f.linha) {
      r.strokeStyle = tom(f.cor, 1, f.emis); r.lineWidth = f.linha;
      r.beginPath(); r.moveTo(P[0].x, P[0].y); r.lineTo(P[1].x, P[1].y); r.stroke();
      return;
    }
    r.fillStyle = c; r.strokeStyle = c; r.lineWidth = 0.6;
    if (f.alfa) r.globalAlpha = f.alfa;
    r.beginPath(); r.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < P.length; i++) r.lineTo(P[i].x, P[i].y);
    r.closePath(); r.fill(); if (!f.alfa) r.stroke();   // stroke fino fecha as frestas (não no vidro: viraria linha opaca)
    r.globalAlpha = 1;
  };
  for (const g of [fundo, sobre, frente]) {
    g.sort((a, b) => a.d - b.d);
    for (const it of g) { if (it.bloco) it.bloco.forEach(desenhar); else desenhar(it); }
  }
}
// ------------------------------------------------------------------ roteiro da obra (antena)
function etapaEm(t) {
  const E = OB.etapas;
  for (let i = 0; i < E.length; i++) if (t < E[i].fim) return { e: E[i], i, k: clamp((t - E[i].ini) / (E[i].fim - E[i].ini)) };
  const i = E.length - 1;
  return { e: E[i], i, k: 1 };
}
const ORDEM = ['terraplanagem', 'fundacao', 'torre', 'prato', 'energia', 'alinhamento', 'sinal', 'voo', 'convite'];
/** Estado da obra no tempo de OBRA tc (segundos da linha do tempo; a abertura usa tc do fim e "rebobina"). */
function estadoObra(tc) {
  const s = { plano: 0, vergalhao: 0, cunhas: 0, cunhaK: 0, segs: 0, segK: 0, petalas: 0, petalaK: 0, casa: 0, cabo: 0,
              energia: false, noite: 0, az: 0.9, el: 1.2, feixe: 0, guindaste: false, trator: null, fase: '' };
  const E = Object.fromEntries(OB.etapas.map((e) => [e.id, e]));
  const k = (id) => (E[id] ? clamp((tc - E[id].ini) / (E[id].fim - E[id].ini)) : 0);
  const depois = (id) => E[id] && tc >= E[id].fim;
  s.plano = depois('terraplanagem') ? 1 : suave3(k('terraplanagem') * 1.15 - 0.1);
  if (E.terraplanagem && tc >= E.terraplanagem.ini && !depois('terraplanagem')) {
    const q = k('terraplanagem'), vai = (q * 3) % 1, ida = Math.floor(q * 3) % 2 === 0;
    const y = lerp(-1.8, 1.8, Math.floor(q * 3) / 2);
    s.trator = { x: ida ? lerp(-4, 4, suave3(vai)) : lerp(4, -4, suave3(vai)), y, dir: ida ? 0 : Math.PI };
  }
  const kf = k('fundacao');
  s.vergalhao = depois('fundacao') ? 0 : clamp(kf / 0.2);
  if (depois('fundacao')) s.cunhas = 8;
  else if (kf > 0.2) { const q = (kf - 0.2) / 0.75 * 8; s.cunhas = Math.min(8, Math.floor(q)); s.cunhaK = q - Math.floor(q); }
  const kt = k('torre');
  if (depois('torre')) s.segs = SEG; else { const q = kt * SEG * 1.02; s.segs = Math.min(SEG, Math.floor(q)); s.segK = q - Math.floor(q); }
  const kp = k('prato');
  if (depois('prato')) s.petalas = 12; else if (kp > 0) { const q = clamp(kp / 0.85) * 12; s.petalas = Math.floor(q); s.petalaK = q - Math.floor(q); }
  s.guindaste = tc >= (E.torre ? E.torre.ini - 0.6 : 0) && !depois('prato');
  const ke = k('energia');
  s.casa = depois('energia') ? 1 : clamp(ke / 0.45);
  s.cabo = depois('energia') ? 1 : clamp((ke - 0.4) / 0.45);
  s.energia = depois('energia') || ke > 0.88;
  const ka = k('alinhamento');
  s.noite = depois('alinhamento') ? 1 : suave3(ka / 0.45);
  // o prato procura a Terra: varre o céu e depois trava
  const azT = Math.atan2(TERRA_DIR[0], TERRA_DIR[1]), elT = Math.asin(TERRA_DIR[2]);
  if (depois('alinhamento')) { s.az = azT; s.el = elT; }
  else if (ka > 0.35) {
    const q = (ka - 0.35) / 0.65;
    const varre = q < 0.6 ? 0.9 + Math.sin(q / 0.6 * Math.PI * 1.5) * 1.2 : lerp(0.9 + Math.sin(Math.PI * 1.5) * 1.2, azT, suave3((q - 0.6) / 0.4));
    s.az = varre; s.el = lerp(1.2, elT, suave3(q));
  }
  s.feixe = E.sinal ? clamp((tc - E.sinal.ini - 0.6) / 1.4) : 0;
  return s;
}

function montarCena(t, tc, s) {
  FACES = []; TAGS = []; FX = []; FOCO = { pessoas: [], trator: null };
  chaoOb(s.plano);
  fazendaSolar(s.noite);
  vergalhao(s.vergalhao);
  if (s.cunhas > 0 || s.cunhaK > 0) {
    fundacao(s.cunhas, s.cunhas < 8 ? s.cunhaK : 0);
    if (s.cunhas < 8 && s.cunhaK > 0.55 && s.cunhaK < 0.95) {
      const a = ((s.cunhas + 0.5) / 8) * Math.PI * 2 + Math.PI / 8;
      FX.push({ tipo: 'impacto', p: [Math.cos(a) * 1.4, Math.sin(a) * 1.4, 0.1], k: (s.cunhaK - 0.55) / 0.4 });
    }
  }
  for (let i = 0; i < s.segs; i++) segmentoTorre(i);
  let gancho = [3.5, 2.6, 1.2], carga = null;
  if (s.segs < SEG && s.segK > 0) {   // módulo da vez: sobe pendurado no gancho e encaixa
    const q = s.segK, zAlvo = zSeg(s.segs);
    const solo = [3.6, 2.8, altura(3.6, 2.8, 1)];
    let pos;
    if (q < 0.55) { const k2 = suave3(q / 0.55); pos = [lerp(solo[0], 0, k2), lerp(solo[1], 0, k2), lerp(solo[2], zAlvo + 1.4, Math.min(1, k2 * 1.3))]; }
    else if (q < 0.72) pos = [0, 0, lerp(zAlvo + 1.4, zAlvo, suave3((q - 0.55) / 0.17))];
    else pos = [0, 0, zAlvo];
    segmentoTorre(s.segs, [pos[0], pos[1], pos[2] - zAlvo]);
    gancho = [pos[0], pos[1], pos[2] + ALT / SEG + 0.9];
    carga = q < 0.72 ? { c: [pos[0], pos[1], pos[2] + ALT / SEG], l: ladoEm(zAlvo + ALT / SEG) } : null;
    if (q > 0.74) for (const [sx, sy] of [[1, 1], [-1, -1]]) FX.push({ tipo: 'faisca', p: [sx * ladoEm(zAlvo), sy * ladoEm(zAlvo), zAlvo], t, semente: sx });
  }
  if (s.segs >= SEG) plataforma();
  let pr = null;
  const topo = zSeg(SEG) + 0.6;
  if (s.segs >= SEG) {
    viga([0, 0, zSeg(SEG)], [0, 0, topo], 0.3, '#6b6f86');
    pr = prato([0, 0, topo], s.az, s.el, 2.1, s.petalas + (s.petalaK > 0.5 ? 1 : 0), s.energia);
    if (s.petalas < 12 && s.petalas + s.petalaK > 0) gancho = [0.4, 0.4, topo + 2.6];
    // farol vermelho no topo
    const pisca = Math.floor(t * 1.6) % 2 === 0;
    caixa3(-0.12, -0.12, topo + 0.2, 0.12, 0.12, topo + 0.45, pisca && s.energia ? '#ff4d4d' : '#7a2a2a', { emis: pisca && s.energia });
    if (pisca && s.energia) FX.push({ tipo: 'brilho', p: [0, 0, topo + 0.35], cor: '#ff4d4d', r: 3 });
  }
  if (s.guindaste) {
    guindaste(4.2, -2.6, gancho, t, carga);
  }
  if (s.noite > 0.3 && s.segs >= SEG) {
    for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      FX.push({ tipo: 'holofote', de: [sx * 1.9, sy * 1.9, BASE_Z + 0.1], para: [0, 0, 6.5], k: clamp((s.noite - 0.3) / 0.4) });
      caixa3(sx * 1.9 - 0.12, sy * 1.9 - 0.12, BASE_Z, sx * 1.9 + 0.12, sy * 1.9 + 0.12, BASE_Z + 0.22, '#ffe58a', { emis: true });
    }
    for (let i = 1; i < SEG; i += 2) {
      const z = zSeg(i), l = ladoEm(z), on = Math.floor(t * 1.6 + i * 0.3) % 2 === 0;
      if (on) for (const [sx, sy] of [[1, 1], [-1, -1]]) FX.push({ tipo: 'brilho', p: [sx * l, sy * l, z], cor: '#ff4d4d', r: 2 });
    }
  }
  const E = Object.fromEntries(OB.etapas.map((e) => [e.id, e]));
  if (s.guindaste) {
    pilhaVigas(3.4, 3.4, Math.max(0, (SEG - s.segs) * 2));
    const kr = E.torre ? clamp((tc - E.torre.ini) / 4) : 1;   // o rover chega pela borda e estaciona no canteiro
    rover(lerp(5.6, 1.9, suave3(kr)), lerp(5.4, 4.3, suave3(kr)), Math.PI * 1.15, t, kr > 0 && kr < 1, s.segs < SEG);
  }
  casaEquip(s.casa, s.noite);
  cabo(s.cabo, s.energia ? t : null);
  if (s.trator) { trator(s.trator.x, s.trator.y, s.trator.dir, t, true); FOCO.trator = [s.trator.x, s.trator.y, altura(s.trator.x, s.trator.y, 1) + 0.7]; }
  // colonos trabalhando (nomes de verdade)
  const gente = OB.colonos;
  const et = etapaEm(t).e.id;
  gente.forEach((c, i) => {
    const sem = i * 1.7, cor = TRAJES[i % TRAJES.length];
    let x = 0, y = 0, z = 0, acao = 'parar', olhar = 0;
    const no = (xx, yy, a, o) => { x = xx; y = yy; z = altura(x, y, s.plano) + (Math.hypot(x, y) < 2.2 && s.cunhas >= 8 ? BASE_Z - altura(x, y, s.plano) : 0); acao = a; olhar = o == null ? Math.atan2(-y, -x) : o; };
    const caminho = (pts, vel) => {   // anda de um ponto ao outro, em vai-e-volta
      const q = ((t * vel + i * 0.37) % 2 + 2) % 2, k = q < 1 ? q : 2 - q, a = pts[0], b = pts[1];
      no(lerp(a[0], b[0], suave3(k)), lerp(a[1], b[1], suave3(k)), 'carregar', Math.atan2(b[1] - a[1], b[0] - a[0]) + (q < 1 ? 0 : Math.PI));
    };
    if (et === 'terraplanagem') {
      const a = -2.4 + i * 0.55, acoes = ['sinalizar', 'tablet', 'pa', 'pa', 'tablet'];
      no(Math.cos(a) * 4.6, Math.sin(a) * 4.6, acoes[i % 5]);
      if (acao === 'sinalizar' && s.trator) olhar = Math.atan2(s.trator.y - y, s.trator.x - x);
    } else if (et === 'fundacao') {
      if (i < 3) {   // martelando os blocos já assentados
        const a = ((Math.min(i * 2, Math.max(0, s.cunhas - 1)) + 0.5) / 8) * Math.PI * 2 + Math.PI / 8;
        no(Math.cos(a) * 2.5, Math.sin(a) * 2.5, s.cunhas > 0 ? 'martelar' : 'tablet');
      } else caminho([[3.6, 3.2], [2.6, 1.2]], 0.35);
    } else if ((et === 'torre' && i === 0) || (et === 'prato' && i < 2)) {   // soldador lá em cima
      const zz = et === 'prato' ? zSeg(SEG) + 0.12 : zSeg(Math.max(0, s.segs));
      const l = ladoEm(zz) + 0.28;
      x = i ? -l : l; y = i ? -l * 0.4 : l * 0.4; z = zz; acao = 'soldar'; olhar = Math.atan2(-y, -x);
    } else if (et === 'torre' || et === 'prato') {
      const lugares = [[2.4, 0.6, 'sinalizar'], [2.8, 2.2, 'tablet'], [3.0, 3.0, 'carregar'], [1.2, 2.8, 'tablet']];
      const [lx, ly, a] = lugares[(i - 1 + lugares.length) % lugares.length];
      if (a === 'carregar') caminho([[3.2, 3.8], [1.8, 1.6]], 0.3); else no(lx, ly, a);
      if (acao === 'sinalizar') olhar = Math.atan2(4.2 - ly, -2.6 - lx) + 0.6;
    } else if (et === 'energia') {
      const lugares = [[-4.2, 2.6, 'pa'], [-3.0, 2.3, 'chave'], [-1.8, 1.4, 'pa'], [-3.6, 0.2, 'tablet'], [-2.0, 0.2, 'chave']];
      const [lx, ly, a] = lugares[i % lugares.length];
      no(lx, ly, a, a === 'tablet' ? Math.atan2(1.2 - ly, -3 - lx) : undefined);
    } else {
      no(-1.6 + (i % 3) * 0.75, 2.6 + Math.floor(i / 3) * 0.7, s.feixe > 0.3 ? 'festa' : (i % 2 ? 'lanterna' : 'tablet'),
         Math.atan2(-2.6, 1.6 - (i % 3) * 0.75));
    }
    const cabeca = pessoa(x, y, z, cor, olhar, acao, t, sem);
    TAGS.push({ p: cabeca, nome: c.nome, cor });
    FOCO.pessoas[i] = soma(cabeca, [0, 0, -0.75]);
  });
  if (pr && s.feixe > 0) {
    const de = soma([0, 0, topo], mul(pr.d, 1.2));
    FX.push({ tipo: 'feixe', de, k: s.feixe });
  }
  return { topo, pr };
}

// ------------------------------------------------------------------ câmera por etapa
const PLANOS = {
  abertura: { tz: 5.2, zoom: 21, pitch: 0.3 },
  terraplanagem: { tz: 0.6, zoom: 21, pitch: 0.62 },
  fundacao: { tz: 0.5, zoom: 31, pitch: 0.72 },
  torre: { tz: 3, zoom: 24, pitch: 0.42 },
  prato: { tz: 9.4, zoom: 40, pitch: 0.34 },
  energia: { tx: -3.2, ty: 1.6, tz: 0.9, zoom: 44, pitch: 0.5 },
  alinhamento: { tz: 6.5, zoom: 22, pitch: 0.28 },
  sinal: { tz: 9, zoom: 17, pitch: 0.2 },
  voo: { tz: 4.8, zoom: 19, pitch: 0.36 },
  convite: { tz: 4.8, zoom: 16.5, pitch: 0.42 },
};
const CLOSES = {
  terraplanagem: { alvo: 'trator', zoom: 74, de: 0.34, ate: 0.6, pitch: 0.34 },
  fundacao: { alvo: 0, zoom: 92, de: 0.5, ate: 0.74 },
  torre: { alvo: 0, zoom: 86, de: 0.42, ate: 0.66, pitch: 0.24 },
  prato: { alvo: 1, zoom: 82, de: 0.3, ate: 0.56, pitch: 0.26 },
  energia: { alvo: 1, zoom: 96, de: 0.55, ate: 0.8 },
  alinhamento: { alvo: 0, zoom: 84, de: 0.08, ate: 0.3, pitch: 0.26 },
};
function planoDe(id, s, k) {
  const p = { tx: 0, ty: 0, ...PLANOS[id] };
  if (id === 'torre') p.tz = 1.5 + zSeg(Math.min(SEG, s.segs + 0.6)) * 0.55;
  if (id === 'fundacao') p.zoom = lerp(28, 34, k);
  if (id === 'terraplanagem' && s.trator) { p.tx = s.trator.x * 0.6; p.ty = s.trator.y * 0.6; p.zoom = lerp(26, 34, k); }
  if (id === 'alinhamento') p.zoom = lerp(22, 25, k);
  return p;
}
// Cada obra tem o seu estado, cena, câmera e textos. A antena mora aqui; as outras em construcao_<obra>.js,
// que o construcao.py carrega depois deste arquivo e registra em OBRAS.
const OBRAS = {
  antena: {
    estado: estadoObra, montar: montarCena, planoDe, closes: CLOSES,
    pesos: { terraplanagem: 0.1, fundacao: 0.15, torre: 0.3, prato: 0.2, energia: 0.15, alinhamento: 0.1 },
    abertura: [['UMA ANTENA', 74], ['EM MARTE?', 74]],
    hudExtra(t, e) {
      if (e.id !== 'sinal') return;
      const a = clamp((t - e.ini - 1.6) / 0.4);
      if (a > 0 && Math.floor(t * 3) % 4 !== 0) {
        ctx.globalAlpha = a;
        texto('SINAL RECEBIDO', W / 2, 1150, 62, '#8fe6ff');
        texto('NA TERRA', W / 2, 1226, 44, '#ffffff');
        ctx.globalAlpha = 1;
      }
    },
  },
};
const OBR = () => OBRAS[OB.obra] || OBRAS.antena;

function cameraOb(t, s) {
  const { e, i, k } = etapaEm(t);
  const atual = OBR().planoDe(e.id, s, k), ant = i > 0 ? OBR().planoDe(OB.etapas[i - 1].id, s, 1) : atual;
  const m = suave3((t - e.ini) / 1.4);
  for (const key of ['tx', 'ty', 'tz', 'zoom', 'pitch']) CAM[key] = lerp(ant[key], atual[key], m);
  const voo = OB.etapas.find((x) => x.id === 'voo');
  const giroVoo = voo ? suave3((t - voo.ini) / (voo.fim - voo.ini)) * Math.PI * 2 : 0;
  CAM.yaw = 0.75 + t * 0.045 + giroVoo + (e.id === 'abertura' ? -0.9 + k * 0.6 : 0)
    + lerp(ant.yaw || 0, atual.yaw || 0, m);   // giro extra opcional do plano (a obra escolhe o lado bonito)
  // close no meio da etapa: a câmera chega pertinho de quem (ou do que) está trabalhando e volta
  const close = OBR().closes[e.id];
  if (close) {
    const alvo = close.alvo === 'trator' ? FOCO.trator : FOCO.pessoas[close.alvo];
    const w = suave3((k - close.de) / 0.09) * (1 - suave3((k - close.ate) / 0.09));
    if (alvo && w > 0) {
      CAM.tx = lerp(CAM.tx, alvo[0], w); CAM.ty = lerp(CAM.ty, alvo[1], w); CAM.tz = lerp(CAM.tz, alvo[2], w);
      CAM.zoom = lerp(CAM.zoom, close.zoom, w); CAM.pitch = lerp(CAM.pitch, close.pitch || 0.3, w);
    }
  }
  // tremidinha quando a cunha da fundação bate no chão
  if (e.id === 'fundacao' && s.cunhaK > 0.55 && s.cunhaK < 0.7) CAM.tz += Math.sin(t * 80) * 0.05;
  prepCamOb();
}

// ------------------------------------------------------------------ HUD na resolução cheia
function progresso(t) {
  const pesos = OBR().pesos;
  let p = 0;
  for (const e of OB.etapas) {
    if (!pesos[e.id]) continue;
    p += pesos[e.id] * clamp((t - e.ini) / (e.fim - e.ini));
  }
  return clamp(p);
}
function chip(x, y, txt, fundo, cor, alinhar = 'left') {
  ctx.font = `24px ${FONTE}`;
  const w = ctx.measureText(txt).width + 36, x0 = alinhar === 'left' ? x : x - w;
  ret(x0 + 5, y + 5, w, 50, '#0008'); ret(x0, y, w, 50, fundo);
  texto(txt, x0 + w / 2, y + 27, 24, cor, { contorno: false });
}
function hud(t, tc) {
  const { e, k } = etapaEm(t);
  const entra = saida(clamp((t - e.ini) / 0.5));
  if (e.etapa) {
    ctx.globalAlpha = entra;
    chip(56 - (1 - entra) * 200, 150, `ETAPA ${e.etapa}`, COR.marte, '#ffffff');
    chip(W - 56 + (1 - entra) * 200, 150, `SOL ${String(e.sol).padStart(2, '0')}`, COR.ceu, COR.ouro, 'right');
    texto(e.titulo, W / 2, 268 + (1 - entra) * 30, 56, '#ffffff', { maxW: W - 100 });
    texto(e.sub, W / 2, 336 + (1 - entra) * 30, 24, COR.areia, { maxW: W - 140 });
    ctx.globalAlpha = 1;
  }
  if (e.id === 'abertura') {
    const a = clamp((t - 0.3) / 0.5) * (1 - clamp((t - (e.fim - 0.4)) / 0.4));
    ctx.globalAlpha = a;
    texto('COMO SE CONSTRÓI', W / 2, 250, 50, '#ffffff');
    OBR().abertura.forEach(([txt, tam], n) => texto(txt, W / 2, 330 + n * 80, tam, COR.ouro, { maxW: W - 80 }));
    ctx.globalAlpha = 1;
  }
  if (OBR().hudExtra) OBR().hudExtra(t, e, k, tc);
  if (e.id === 'convite') {
    ctx.globalAlpha = saida(k * 3);
    caixa(70, 420, W - 140, 300, 0.9, COR.ouro);
    texto('QUAL OBRA VOCÊ', W / 2, 500, 40, '#ffffff');
    texto('QUER VER AGORA?', W / 2, 560, 40, '#ffffff');
    texto('COMENTA AÍ', W / 2, 650, 44, COR.ouro);
    ctx.globalAlpha = 1;
  }
  // barra da obra (embaixo)
  if (e.id !== 'abertura') {
    const p = progresso(t), y = 1640;
    caixa(60, y, W - 120, 150, 0.88);
    texto(OB.nome.toUpperCase(), 96, y + 42, 24, '#ffffff', { alinhar: 'left', contorno: false });
    texto(`${Math.round(p * 100)}%`, W - 96, y + 42, 26, p >= 1 ? COR.ok : COR.ouro, { alinhar: 'right', contorno: false });
    ret(96, y + 68, W - 192, 20, COR.borda);
    ret(96, y + 68, (W - 192) * p, 20, p >= 1 ? COR.ok : COR.marte);
    if (p < 1) ret(96 + (W - 192) * p - 4, y + 66, 8, 24, '#ffe58a');
    texto('OPERAÇÃO MARTE ZERO · DIÁRIO DE OBRA', W / 2, y + 120, 18, COR.agua, { contorno: false });
  }
  // nomes dos colonos (etiquetas sobre a cabeça)
  const usados = [];
  if (CAM.zoom > 21 && e.id !== 'abertura' && NOITE < 0.5) for (const g of TAGS) {
    const p = proj(g.p);
    if (p.x < 10 || p.x > RW - 10 || p.y < 20 || p.y > RH - 80) continue;
    ctx.font = `16px ${FONTE}`;
    const w = ctx.measureText(g.nome).width + 16, x = p.x * RE;
    let y = p.y * RE - 14;
    while (usados.some((u) => Math.abs(u.x - x) < (u.w + w) / 2 + 4 && Math.abs(u.y - y) < 30)) y -= 30;
    usados.push({ x, y, w });
    ret(x - w / 2, y - 14, w, 26, '#140f26cc'); ret(x - w / 2, y + 12, w, 3, g.cor);
    texto(g.nome, x, y, 16, '#ffffff', { contorno: false });
  }
}

// texto grande da narração (mesmo estilo do episódio: blocos de até 3 palavras)
let BLOCOS_OB = [];
function prepararTextos() {
  BLOCOS_OB = [];
  for (const e of OB.etapas) {
    const pal = e.palavras || [];
    let atual = [], tam = 0;
    const fecha = () => { if (atual.length) BLOCOS_OB.push(atual); atual = []; tam = 0; };
    for (const w of pal) {
      if (atual.length && (tam + w.p.length + 1 > 22 || atual.length >= 3)) fecha();
      atual.push(w); tam += w.p.length + 1;
      if (/[.!?:,]$/.test(w.p) && tam >= 6) fecha();
    }
    fecha();
  }
  BLOCOS_OB = BLOCOS_OB.map((b, j, todos) => ({ b, ini: b[0].i, fim: Math.min(todos[j + 1] ? todos[j + 1][0].i : b[b.length - 1].f + 0.5, b[b.length - 1].f + 0.9) }));
}
function textoGrande(t) {
  const x = BLOCOS_OB.find((q) => t >= q.ini && t < q.fim);
  if (!x) return;
  const pulo = 1 + 0.22 * (1 - saida(clamp((t - x.ini) / 0.13)));
  const fala = x.b.filter((w) => t >= w.i).pop();
  const pal = x.b.map((w) => w.p.toUpperCase());
  ctx.font = `64px ${FONTE}`;
  const esp = ctx.measureText(' ').width;
  const larg = (ws) => ws.reduce((a, p) => a + ctx.measureText(p).width, 0) + esp * (ws.length - 1);
  let linhas = [x.b.map((_, i) => i)];
  if (larg(pal) > W - 120 && pal.length > 1) linhas = [[0], x.b.slice(1).map((_, i) => i + 1)];
  if (pal.length === 3 && larg(pal) > W - 120) linhas = [[0, 1], [2]].filter((l) => l.length);
  const y0 = 1430 - (linhas.length - 1) * 42;
  ctx.save(); ctx.translate(W / 2, y0); ctx.scale(pulo, pulo); ctx.translate(-W / 2, -y0);
  linhas.forEach((li, n) => {
    const ws = li.map((i) => pal[i]);
    let s = 64; ctx.font = `${s}px ${FONTE}`;
    while (larg(ws) > W - 100 && s > 30) { s -= 2; ctx.font = `${s}px ${FONTE}`; }
    let xx = W / 2 - larg(ws) / 2;
    const y = y0 + n * 84;
    li.forEach((i) => {
      ctx.font = `${s}px ${FONTE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0009'; ctx.fillText(pal[i], xx + 6, y + 7);
      texto(pal[i], xx, y, s, x.b[i] === fala ? COR.ouro : '#ffffff', { alinhar: 'left', maxW: 9999 });
      xx += ctx.measureText(pal[i]).width + esp;
    });
  });
  ctx.restore();
}

// ------------------------------------------------------------------ quadro
function desenharConstrucao(t) {
  const { e, k } = etapaEm(t);
  // abertura: mostra a antena pronta (à noite, com o sinal) e depois "rebobina" até o terreno vazio
  let tc = t;
  const fimObra = (OB.etapas.find((x) => x.id === 'voo') || OB.etapas[OB.etapas.length - 1]).ini + 1;
  const ini1 = (OB.etapas.find((x) => x.id === 'terraplanagem') || e).ini;
  const rebob = e.id === 'abertura' && k > 0.62;
  if (e.id === 'abertura') tc = rebob ? lerp(fimObra, ini1, suave3((k - 0.62) / 0.38)) : fimObra;
  const s = OBR().estado(tc);
  NOITE = s.noite;
  SOL = norma(lerp(0, 1, NOITE) > 0.5 ? [0.5, 0.6, 0.6] : [-0.55, -0.45, 0.75]);
  CAM.yaw = 0.75 + t * 0.045; prepCamOb();   // câmera provisória (a cena não depende dela)
  SOBRE = false; MARCA = null; BLOCO = null;
  OBR().montar(t, tc, s);
  SOBRE = false; MARCA = null;
  cameraOb(t, s);
  r.setTransform(QR, 0, 0, QR, 0, 0);
  ceuFundo(t);
  terraNoCeu(t, s.feixe);
  desenharFaces();
  desenharFX(t);
  // amplia sem borrar
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(rc, 0, 0, rc.width, rc.height, 0, 0, W, H);
  if (OBR().sobreCena) OBR().sobreCena(t, s);   // efeito da obra por cima da cena e por baixo do HUD (ex.: poeira)
  if (rebob) {   // efeito de fita voltando: listras e tremor
    ctx.globalAlpha = 0.35;
    for (let y = 0; y < H; y += 24) { ctx.fillStyle = (Math.floor(y / 24 + t * 30) % 3) ? '#ffffff22' : '#00000033'; ctx.fillRect(0, y, W, 12); }
    ctx.globalAlpha = 1;
    texto('◀◀ VOLTANDO NO TEMPO', W / 2, 560, 34, '#ffffff');
  }
  if (CAPA) return;   // capa: só a cena (o título é desenhado por desenharCapa)
  hud(t, tc);
  textoGrande(t);
  // flash nas viradas de etapa e quando o sinal sai
  const flash = Math.max(clamp(1 - (t - e.ini) / 0.25) * (e.id !== 'abertura' ? 0.5 : 0),
                         e.id === 'sinal' ? clamp(1 - Math.abs(t - e.ini - 2.0) / 0.3) * 0.8 : 0);
  if (flash > 0) { ctx.globalAlpha = flash; ctx.fillStyle = '#fff6d0'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  const preto = Math.max(1 - clamp(t / 0.5), clamp((t - (OB.duracao - 0.8)) / 0.8));
  if (preto > 0) { ctx.globalAlpha = preto; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}

window.carregarConstrucao = function (info) {
  OB = info;
  prepararTextos();
  // a Terra fica onde a câmera do sinal vai olhar: no alto, à direita do prato
  const sinal = OB.etapas.find((e) => e.id === 'sinal');
  if (sinal) {
    const yaw = 0.75 + (sinal.ini + 1.5) * 0.045, dir = [Math.cos(yaw), -Math.sin(yaw), 0], longe = [-Math.sin(yaw), -Math.cos(yaw), 0];
    TERRA_DIR = norma(soma(soma(mul(dir, 0.32), [0, 0, 0.9]), mul(longe, 0.25)));
  }
  return { quadros: Math.ceil(OB.duracao * EP.fps), duracao: OB.duracao };
};
window.quadroConstrucao = function (i, qualidade = 0.9) {
  desenharConstrucao(i / EP.fps);
  return cv.toDataURL('image/jpeg', qualidade);
};
window.desenharConstrucao = desenharConstrucao;

// Capa do post (IG/TikTok) e thumb do YouTube: a cena no instante t, sem legenda, com o título grande.
let CAPA = false;
function tituloEm(linhas, y0, x, alinhar) {   // linhas [texto, tamanho, cor], com espaço proporcional ao tamanho
  let y = y0;
  linhas.forEach(([txt, tam, cor], n) => {
    if (n) y += (linhas[n - 1][1] + tam) * 0.62;
    texto(txt, x, y, tam, cor || '#ffffff', { maxW: W - 70, alinhar });
  });
}
function cenaSemTexto(t, plano) {
  CAPA = true;
  const antes = OBR().planoDe;
  OBR().planoDe = (id, s, k) => ({ ...antes(id, s, k), ...plano });
  try { desenharConstrucao(t); } finally { CAPA = false; OBR().planoDe = antes; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
/** Thumb 16:9: só a faixa y0..y0+608 do quadro vira a imagem (o Python recorta e amplia para 1280x720). */
window.desenharThumb = function (t, plano, linhas, y0) {
  cenaSemTexto(t, plano);
  const g = ctx.createLinearGradient(0, y0, 0, y0 + 300);
  g.addColorStop(0, 'rgba(8,5,20,0.8)'); g.addColorStop(1, 'rgba(8,5,20,0)');
  ctx.fillStyle = g; ctx.fillRect(0, y0, W, 300);
  tituloEm(linhas, y0 + 60, W / 2, 'center');
};
window.desenharCapa = function (t, plano, linhas) {
  cenaSemTexto(t, plano);
  const g = ctx.createLinearGradient(0, 0, 0, 760);   // escurece o céu atrás do título
  g.addColorStop(0, 'rgba(8,5,20,0.85)'); g.addColorStop(1, 'rgba(8,5,20,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 760);
  tituloEm(linhas, 190, W / 2, 'center');
  const y = H - 230;
  caixa(70, y, W - 140, 130, 0.9, COR.ouro);
  texto('OPERAÇÃO MARTE ZERO', W / 2, y + 48, 34, COR.ouro, { contorno: false });
  texto('CADA SEGUIDOR VIRA COLONO', W / 2, y + 95, 24, '#ffffff', { contorno: false });
};
