// Operação Marte Zero · POV em primeira pessoa ("câmera do capacete").
// Roda DEPOIS do diretor.js: usa o mesmo terreno, prédios, sprites e fonte do episódio.
//
// O chão é desenhado em perspectiva linha a linha (estilo "Mode 7" dos games 16-bit) até o horizonte;
// prédios, casas, colonos, pet e criaturas ficam em pé (billboards). Tudo numa tela pequena
// (PW x PH) ampliada 4x sem borrar, para manter o visual pixel art. Por cima: luvas do traje,
// painel do capacete (REC, oxigênio, temperatura, bússola) e o diário em primeira pessoa.
//
//   pov.py chama: carregarEpisodio(ep) → carregarPOV(info, cena) → quadroPOV(i)

const PW = 270, PH = 480, ESC = 4;            // tela interna (ampliada 4x → 1080x1920)
const HZ = 196, F = 150, OLHO = 8.5;          // horizonte, distância focal, altura dos olhos (px do mundo)
const LONGE = 520;                            // até onde o chão é desenhado
const pc = document.createElement('canvas'); pc.width = PW; pc.height = PH;
const px = pc.getContext('2d');
px.imageSmoothingEnabled = false;
const objs = document.createElement('canvas');   // prédios desenhados de cima, recortados como billboards
const ox = objs.getContext('2d');
let OBJ = { x0: 0, y0: 0, esc: 2 };
let POV = null;
let CONSTRUCOES = [];

// ------------------------------------------------------------------ utilidades
const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const dirDe = (a) => ({ x: Math.cos(a), y: Math.sin(a) });
function angPara(de, para) { return Math.atan2(para.y - de.y, para.x - de.x); }
function mistura(a, b, k) { return a + ang(b - a) * k; }

// ------------------------------------------------------------------ cenário: céu, montanhas, chão
const ceuCache = new Map();
function ceu(t, noite) {
  const g = px.createLinearGradient(0, 0, 0, HZ);
  if (noite) { g.addColorStop(0, '#0d0a1c'); g.addColorStop(1, '#3a2342'); }
  else { g.addColorStop(0, '#b0704f'); g.addColorStop(0.6, '#d99a6c'); g.addColorStop(1, '#efc49a'); }
  px.fillStyle = g; px.fillRect(0, 0, PW, HZ);
  const a = POV.cam.a;
  // sol (de dia) ou estrelas (à noite), presos à direção do mundo
  const giro = (alvo) => { const d = ang(alvo - a); return Math.abs(d) < 1.2 ? PW / 2 + Math.tan(d) * F : null; };
  if (noite) {
    for (let i = 0; i < 70; i++) {
      const ax = hash(i, 7) * Math.PI * 2, y = hash(i, 8) * (HZ - 30);
      const x = giro(ax); if (x == null) continue;
      px.fillStyle = hash(i, 9) > 0.8 ? '#ffe9a8' : '#cfd6ff';
      px.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  } else {
    const xs = giro(-2.2);
    if (xs != null) { px.fillStyle = '#fff3d6'; px.beginPath(); px.arc(xs, 46, 7, 0, 7); px.fill(); px.fillStyle = '#fff3d633'; px.beginPath(); px.arc(xs, 46, 14, 0, 7); px.fill(); }
  }
  const xf = giro(0.9);   // Fobos
  if (xf != null) { px.fillStyle = noite ? '#d8c8b0' : '#c9a98c'; px.fillRect(Math.round(xf) - 2, 30, 4, 3); px.fillRect(Math.round(xf) - 1, 29, 3, 5); }
  // duas camadas de montanhas (paralaxe pela direção do olhar)
  for (const [cor, alt, fase, amp] of [[noite ? '#2a1a33' : '#b77a57', 30, 0, 1], [noite ? '#1f1428' : '#9c5e40', 18, 5, 0.6]]) {
    px.fillStyle = cor;
    for (let x = 0; x < PW; x++) {
      const w = a * 120 + (x - PW / 2) * 0.8 + fase * 100;
      const h = alt * (0.45 + 0.35 * Math.sin(w * 0.031) + 0.2 * Math.sin(w * 0.093 + fase)) * amp + 4;
      px.fillRect(x, HZ - h, 1, h + 1);
    }
  }
}

function chao(noite) {
  px.fillStyle = noite ? '#3b1e1c' : '#a94f33';
  px.fillRect(0, HZ, PW, PH - HZ);
  const P = POV.cam, d0 = dirDe(P.a), dir = d0, dir_ = d0, dirR = { x: -d0.y, y: d0.x };
  for (let y = HZ + 1; y < PH; y++) {
    const dist = OLHO * F / (y - HZ);
    if (dist > LONGE) continue;
    const meia = dist * (PW / 2) / F;
    const Q = { x: P.x + dist * dir.x - meia * dirR.x, y: P.y + dist * dir.y - meia * dirR.y };
    const s = F / dist;
    const a = s * dirR.x, c = s * dirR.y, b = s * dir_.x, d = s * dir_.y;
    px.save();
    px.beginPath(); px.rect(0, y, PW, 1); px.clip();
    px.setTransform(a, b, c, d, -(a * Q.x + c * Q.y), y - (b * Q.x + d * Q.y));
    px.drawImage(terreno, TER.x0 * CASA, TER.y0 * CASA);
    px.restore();
  }
  // névoa de poeira perto do horizonte
  const g = px.createLinearGradient(0, HZ, 0, HZ + 70);
  g.addColorStop(0, noite ? 'rgba(40,24,48,0.95)' : 'rgba(232,180,138,0.92)'); g.addColorStop(1, 'rgba(232,180,138,0)');
  px.fillStyle = g; px.fillRect(0, HZ, PW, 70);
  if (noite) { px.fillStyle = 'rgba(10,6,24,0.45)'; px.fillRect(0, HZ, PW, PH - HZ); }
}

// ------------------------------------------------------------------ objetos em pé (billboards)
function prepararObjetos(t) {
  // desenha prédios (de cima, arte em 3/4) numa tela transparente; cada prédio vira um recorte em pé
  const caixas = [EP.mundo.base, ...EP.mundo.obras.filter((o) => o.status !== 'planejada' || o.slug === EP.missao_obra)].map(retanguloDe);
  const x0 = Math.min(...caixas.map((c) => c.x0)) - 40, y0 = Math.min(...caixas.map((c) => c.y0)) - 60;
  const x1 = Math.max(...caixas.map((c) => c.x1)) + 40, y1 = Math.max(...caixas.map((c) => c.y1)) + 40;
  OBJ = { x0, y0, esc: 2 };
  objs.width = (x1 - x0) * OBJ.esc; objs.height = (y1 - y0) * OBJ.esc;
  ox.setTransform(1, 0, 0, 1, 0, 0); ox.clearRect(0, 0, objs.width, objs.height);
  ox.imageSmoothingEnabled = false;
  ox.setTransform(OBJ.esc, 0, 0, OBJ.esc, -x0 * OBJ.esc, -y0 * OBJ.esc);
  const antes = usarCtx(ox);
  const energia = EP.mundo.obras.some((o) => o.tipo === 'solar' && o.status === 'concluida');
  try { desenharObras(t); desenharBase(t, energia); } finally { usarCtx(antes); }
}

function predios() {
  const lista = [];
  const add = (r, margemTopo, nome) => lista.push({
    x: (r.x0 + r.x1) / 2, y: r.y1 - 2, larg: r.x1 - r.x0 + 8, alt: (r.y1 - r.y0 + margemTopo) * 0.85,
    img: objs, src: [(r.x0 - 4 - OBJ.x0) * OBJ.esc, (r.y0 - margemTopo - OBJ.y0) * OBJ.esc,
                     (r.x1 - r.x0 + 8) * OBJ.esc, (r.y1 - r.y0 + margemTopo) * OBJ.esc], nome,
  });
  add(retanguloDe(EP.mundo.base), 30, 'base');
  for (const o of EP.mundo.obras) if (o.status !== 'planejada' || o.slug === EP.missao_obra) add(retanguloDe(o), 18, o.slug);
  return lista;
}

const casaCache = new Map();
function casinha(seed) {   // casa dos colonos: domo pressurizado com faixa colorida e porta
  if (casaCache.has(seed)) return casaCache.get(seed);
  const c = document.createElement('canvas'); c.width = 16; c.height = 12;
  const x = c.getContext('2d');
  const cor = ROUPAS[Math.abs(seed) % ROUPAS.length];
  x.fillStyle = CONTORNO; x.beginPath(); x.ellipse(8, 11, 8, 10, 0, Math.PI, 0); x.fill();
  x.fillStyle = '#e9e6f2'; x.beginPath(); x.ellipse(8, 11, 7, 9, 0, Math.PI, 0); x.fill();
  x.fillStyle = cor; x.fillRect(1, 7, 14, 2);
  x.fillStyle = '#9fb6d8'; x.fillRect(4, 4, 2, 2); x.fillRect(10, 4, 2, 2);
  x.fillStyle = '#3a2f63'; x.fillRect(7, 8, 3, 4);
  casaCache.set(seed, c);
  return c;
}

const besouroCache = [];
function besouro(fase) {   // besouro-de-ferrugem: carapaça laranja enferrujada, olhos vermelhos
  const k = fase % 2;
  if (besouroCache[k]) return besouroCache[k];
  const c = document.createElement('canvas'); c.width = 10; c.height = 7;
  const x = c.getContext('2d');
  x.fillStyle = CONTORNO; x.fillRect(1, 1, 8, 5); x.fillRect(0, 2, 10, 3);
  x.fillStyle = '#b5651d'; x.fillRect(2, 1, 6, 4); x.fillStyle = '#8d4a12'; x.fillRect(5, 1, 1, 4);
  x.fillStyle = '#ff3b3b'; x.fillRect(1, 2, 1, 1); x.fillRect(8, 2, 1, 1);
  x.fillStyle = CONTORNO; for (let i = 0; i < 3; i++) x.fillRect(2 + i * 3, k ? 5 : 6, 1, 1);
  besouroCache[k] = c;
  return c;
}


// ------------------------------------------------------------------ mundo 2,5D: volumes extrudados
// Como nos jogos clássicos de primeira pessoa: prédios e casas são plantas baixas "levantadas" em paredes
// (cada parede em perspectiva, com sombra pelo lado do sol, janelas e detalhes); colonos, pets e criaturas
// continuam sprites chapados em pé. Domos viram anéis empilhados (degraus de pixel art).
const SOL = dirDe(-2.2);
const NEAR = 1.5;
function camEsp(p) {
  const P = POV.cam, d = dirDe(P.a), rx = p.x - P.x, ry = p.y - P.y;
  return { l: rx * -d.y + ry * d.x, z: rx * d.x + ry * d.y, h: p.h };
}
function proj(c) { const s = F / c.z; return [PW / 2 + c.l * s, HZ + (OLHO - c.h) * s]; }
function cortarPerto(poly) {   // recorta o polígono no plano perto da câmera (z = NEAR)
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ia = a.z >= NEAR, ib = b.z >= NEAR;
    if (ia) out.push(a);
    if (ia !== ib) { const k = (NEAR - a.z) / (b.z - a.z); out.push({ l: a.l + (b.l - a.l) * k, z: NEAR, h: a.h + (b.h - a.h) * k }); }
  }
  return out;
}
function poligono(pts3, cor, alfa = 1) {
  const c = cortarPerto(pts3.map(camEsp));
  if (c.length < 3) return false;
  px.globalAlpha = alfa; px.fillStyle = cor; px.beginPath();
  c.forEach((p, i) => { const [x, y] = proj(p); if (i) px.lineTo(x, y); else px.moveTo(x, y); });
  px.closePath(); px.fill(); px.globalAlpha = 1;
  return true;
}
function tom(hex, k) {   // escurece/clareia uma cor #rrggbb
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function anel(cx, cy, r, lados = 8, giro = Math.PI / 8) {
  const pts = [];
  for (let i = 0; i < lados; i++) { const a = giro + (i / lados) * Math.PI * 2; pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
  return pts;
}
function caixa(x0, y0, x1, y1) { return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]; }

// Um prisma: planta (pontos), alturas h0..h1, cor, estilo das paredes e enfeites.
function prisma(planta, h0, h1, cor, estilo = {}) { return { planta, h0, h1, cor, estilo }; }

function desenharPrisma(pr, noite) {
  const P = POV.cam, n = pr.planta.length;
  const cx = pr.planta.reduce((s, p) => s + p.x, 0) / n, cy = pr.planta.reduce((s, p) => s + p.y, 0) / n;
  const paredes = [];
  for (let i = 0; i < n; i++) {
    const A = pr.planta[i], B = pr.planta[(i + 1) % n];
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    let nx = B.y - A.y, ny = -(B.x - A.x);
    if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }
    const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    if (nx * (P.x - mx) + ny * (P.y - my) <= 0) continue;   // parede de costas para a câmera
    paredes.push({ A, B, nx, ny, dz: camEsp({ x: mx, y: my, h: 0 }).z });
  }
  paredes.sort((a, b) => b.dz - a.dz);
  const luz = noite ? 0.42 : 1, e = pr.estilo;
  for (const w of paredes) {
    const k = (0.6 + 0.4 * Math.max(0, w.nx * SOL.x + w.ny * SOL.y)) * luz;
    const q = (u0, u1, v0, v1, c, a = 1) => {
      const ax = w.A.x + (w.B.x - w.A.x) * u0, ay = w.A.y + (w.B.y - w.A.y) * u0;
      const bx = w.A.x + (w.B.x - w.A.x) * u1, by = w.A.y + (w.B.y - w.A.y) * u1;
      const h0 = pr.h0 + (pr.h1 - pr.h0) * v0, h1 = pr.h0 + (pr.h1 - pr.h0) * v1;
      poligono([{ x: ax, y: ay, h: h0 }, { x: bx, y: by, h: h0 }, { x: bx, y: by, h: h1 }, { x: ax, y: ay, h: h1 }], c, a);
    };
    q(0, 1, 0, 1, tom(pr.cor, k), e.alfa || 1);
    const largura = Math.hypot(w.B.x - w.A.x, w.B.y - w.A.y);
    if (e.faixa) q(0, 1, e.faixa[0], e.faixa[1], tom(e.faixaCor, k));
    if (e.janelas && largura > 6) {
      const nj = Math.max(1, Math.floor(largura / (e.janelas.passo || 9)));
      const acesa = noite ? '#ffd27a' : tom('#9fb6d8', k * 1.05);
      for (let j = 0; j < nj; j++) { const u = (j + 0.5) / nj, m = 0.18 / nj; q(u - m, u + m, e.janelas.v[0], e.janelas.v[1], acesa); }
    }
    if (e.colunas) for (let j = 1; j < e.colunas; j++) q(j / e.colunas - 0.012, j / e.colunas + 0.012, 0, 1, tom(e.colunasCor || CONTORNO, k));
    if (e.tijolos) for (let r = 1; r < e.tijolos; r++) q(0, 1, r / e.tijolos - 0.03, r / e.tijolos + 0.03, tom(pr.cor, k * 0.78));
    if (e.cruz && largura > 10) { q(0.44, 0.56, 0.3, 0.8, '#e04f5f'); q(0.32, 0.68, 0.48, 0.62, '#e04f5f'); }
    if (e.listrado) for (let j = 0; j < 8; j++) q(j / 8, j / 8 + 0.0625, 0, 0.12, j % 2 ? CONTORNO : tom('#ffc83d', k));
    // porta na parede virada para a frente (+y, para o bairro)
    if (e.porta && w.ny > 0.7 && largura > 5) q(0.38, 0.62, 0, Math.min(0.85, 6 / Math.max(1, pr.h1 - pr.h0)), tom('#3a2f63', k));
    q(0, 1, 0, 0.04, CONTORNO);   // rodapé escuro assenta a parede no chão
  }
  if (pr.h1 < OLHO - 0.3) {   // teto só aparece se estiver abaixo do olho
    poligono(pr.planta.map((p) => ({ ...p, h: pr.h1 })), tom(e.teto || pr.cor, noite ? 0.5 : 1.12), e.alfa || 1);
    if (e.grade) {   // painéis solares: frisos no teto
      const [a, , c] = pr.planta;
      for (let j = 1; j < 4; j++) {
        const x = a.x + (c.x - a.x) * j / 4;
        poligono([{ x: x - 0.3, y: a.y, h: pr.h1 }, { x: x + 0.3, y: a.y, h: pr.h1 }, { x: x + 0.3, y: c.y, h: pr.h1 }, { x: x - 0.3, y: c.y, h: pr.h1 }], '#8fb3ff');
      }
    }
  }
}

function domo(cx, cy, r, h, cor, estilo = {}, base = 0) {   // domo em degraus: 4 anéis
  const deg = [[1, 0, 0.45], [0.84, 0.45, 0.72], [0.62, 0.72, 0.9], [0.34, 0.9, 1]];
  return deg.map(([kr, a, b], i) => prisma(anel(cx, cy, r * kr), base + h * a, base + h * b, cor, i === 0 ? estilo : { teto: estilo.teto }));
}

// Volumes de cada construção (planta em px do mundo; altura em px do mundo; o olho fica a 8.5)
function volumesDaObra(o) {
  const r = retanguloDe(o), x0 = r.x0 + 2, y0 = r.y0 + 2, x1 = r.x1 - 2, y1 = r.y1 - 2;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = x1 - x0, hh = y1 - y0;
  const st = progressoObra(o, EP.duracao), p = clamp(st.p);
  const v = [];
  const cresce = (h) => Math.max(0.6, h * p);
  switch (o.tipo) {
    case 'solar':
      for (let i = 0; i < 4; i++) {
        const ya = y0 + i * hh / 4 + 2, yb = ya + hh / 4 - 5;
        if (p > i / 4) v.push(prisma(caixa(x0, ya, x1, yb), 0, 3.2, '#2b3a78', { teto: '#3f5fbf', grade: true }));
      }
      break;
    case 'estufa':
      v.push(prisma(caixa(x0, y0, x1, y1), 0, cresce(12), '#9fe3dc', { alfa: 0.62, colunas: 6, colunasCor: '#e9e6f2', teto: '#c8f1ec', porta: true }));
      if (p > 0.7) v.push(prisma(caixa(x0 + w * 0.2, y0 + hh * 0.2, x1 - w * 0.2, y1 - hh * 0.2), 12, 16, '#9fe3dc', { alfa: 0.62, colunas: 4, colunasCor: '#e9e6f2' }));
      break;
    case 'antena':
      v.push(prisma(caixa(cx - 3, cy - 3, cx + 3, cy + 3), 0, cresce(42), '#9aa0b8', { tijolos: 8, colunas: 2 }));
      v.push(prisma(caixa(x0, y0 + hh * 0.5, x1, y1), 0, 6, '#c9c4da', { porta: true, janelas: { v: [0.45, 0.75] } }));
      break;
    case 'gelo':
      v.push(prisma(caixa(x0, y0, cx, y1), 0, cresce(10), '#c9c4da', { faixa: [0.6, 0.75], faixaCor: '#3fd0c9', porta: true }));
      v.push(prisma(caixa(cx + 4, cy - 3, cx + 10, cy + 3), 0, cresce(30), '#ffc83d', { listrado: true, tijolos: 6 }));
      v.push(prisma(anel(x1 - 6, y1 - 6, 6), 0, cresce(12), '#dff3ff', { faixa: [0.8, 0.9], faixaCor: '#3f8efc' }));
      break;
    case 'oxigenio':
      for (const [a, b] of [[x0 + 7, cy], [cx + 2, y0 + 7], [x1 - 7, y1 - 7]])
        v.push(prisma(anel(a, b, 6.5), 0, cresce(16), '#d8dbe8', { faixa: [0.55, 0.68], faixaCor: '#3fd0c9', tijolos: 3 }));
      break;
    case 'oficina':
      v.push(prisma(caixa(x0, y0, x1, y1), 0, cresce(14), '#8a8fa8', { listrado: true, porta: true, janelas: { v: [0.6, 0.8], passo: 12 } }));
      break;
    case 'cantina':
      v.push(...domo(cx, cy, Math.min(w, hh) / 2, cresce(18), '#f1c7a8', { faixa: [0.3, 0.42], faixaCor: '#ff7f50', janelas: { v: [0.5, 0.75], passo: 8 }, porta: true }));
      if (p > 0.6) v.push(prisma(caixa(cx + 8, cy - 2, cx + 12, cy + 2), 0, 24, '#7a6a8a'));
      break;
    case 'enfermaria':
      v.push(prisma(caixa(x0, y0, x1, y1), 0, cresce(14), '#f3eefe', { cruz: true, porta: true, faixa: [0.9, 1], faixaCor: '#e04f5f' }));
      break;
    case 'abrigo':
      v.push(prisma(caixa(x0, y0, x1, y1), 0, cresce(9), '#c9a274', { tijolos: 5, porta: true, teto: '#b08a60' }));
      break;
    case 'laboratorio':
      v.push(...domo(cx, cy, Math.min(w, hh) / 2, cresce(20), '#e9e6f2', { faixa: [0.25, 0.35], faixaCor: '#00b8a9', janelas: { v: [0.5, 0.8], passo: 8 }, porta: true }));
      if (p > 0.8) v.push(prisma(caixa(cx + 6, cy - 2, cx + 9, cy + 1), 18, 26, '#3a2f63'));
      break;
    default:
      v.push(prisma(caixa(x0, y0, x1, y1), 0, cresce(14), '#d8dbe8', { porta: true, janelas: { v: [0.5, 0.8] } }));
  }
  if (p < 1 && st.dem) {   // andaime: postes nos cantos até a altura final + tábua no meio
    const alto = { antena: 42, gelo: 30, solar: 4 }[o.tipo] || 16;
    for (const [a, b] of [[x0 - 1, y0 - 1], [x1 + 1, y0 - 1], [x1 + 1, y1 + 1], [x0 - 1, y1 + 1]])
      v.push(prisma(caixa(a - 0.7, b - 0.7, a + 0.7, b + 0.7), 0, alto, '#ffc83d'));
    if (alto > 6) v.push(prisma(caixa(x0 - 1.5, y1 + 0.5, x1 + 1.5, y1 + 1.6), alto * 0.5, alto * 0.5 + 1, '#b5651d'));
  }
  return v;
}
function volumesDaBase() {
  const b = EP.mundo.base, c = centro(b), r = Math.min(b.w, b.h) * CASA / 2 - 3;
  return [
    ...domo(c.x, c.y, r, 28, '#dcd6e8', { faixa: [0.32, 0.45], faixaCor: '#e2603b', janelas: { v: [0.55, 0.8], passo: 9 }, porta: true }),
    prisma(caixa(c.x - 1, c.y - 1, c.x + 1, c.y + 1), 28, 44, '#9aa0b8'),
  ];
}
function volumesDaCasa(c) {   // casa do colono: domo pressurizado pequeno com a faixa na cor dele
  const cor = ROUPAS[Math.abs(c.seed) % ROUPAS.length];
  return domo(c.x * CASA + 8, c.y * CASA + 9, 6.5, 11, '#e9e6f2', { faixa: [0.55, 0.75], faixaCor: cor, porta: true });
}
// cada construção vira um item do desenho, ordenado junto com os sprites pela distância
function construcoes() {
  const itens = [];
  const add = (vols, x, y) => itens.push({ x, y, vols });
  const b = centro(EP.mundo.base);
  add(volumesDaBase(), b.x, b.y);
  for (const o of EP.mundo.obras) if (o.status !== 'planejada' || o.slug === EP.missao_obra) { const c = centro(o); add(volumesDaObra(o), c.x, c.y); }
  for (const c of POV.info.colonos) if (c.codigo !== POV.info.prota.codigo) add(volumesDaCasa(c), c.x * CASA + 8, c.y * CASA + 9);
  for (let i = 0; i < 70; i++) {   // pedras soltas fora do bairro (volumes baixos) para dar profundidade ao chão
    const ar = hash(i, 31) * Math.PI * 2, dist = 300 + hash(i, 32) * 260;
    const x = b.x + Math.cos(ar) * dist, y = b.y + Math.sin(ar) * dist, r = 1.5 + hash(i, 33) * 3;
    itens.push({ x, y, pedra: true, vols: [prisma(anel(x, y, r, 5, hash(i, 34) * 6), 0, r * 0.9, '#8d4a32', { teto: '#a85a3c' })] });
  }
  return itens;
}

function projetar(o) {
  const P = POV.cam, d = dirDe(P.a), dr = { x: -d.y, y: d.x };
  const rx = o.x - P.x, ry = o.y - P.y;
  const z = rx * d.x + ry * d.y;
  if (z < 2.5 || z > LONGE) return null;
  const lado = rx * dr.x + ry * dr.y;
  const s = F / z;
  return { sx: PW / 2 + lado * s, chaoY: HZ + OLHO * s, s, z };
}

function sombraDe(pr) {   // sombra no chão, para o lado contrário do sol
  const k = Math.min(pr.h1, 30) * 0.45;
  poligono(pr.planta.map((q) => ({ x: q.x - SOL.x * k, y: q.y - SOL.y * k, h: 0 })), 'rgba(40,10,10,0.22)');
}
function desenharBillboards(lista, noite) {
  const vis = [];
  for (const o of lista) {
    if (o.vols) {
      const z = camEsp({ x: o.x, y: o.y, h: 0 }).z;
      if (z > (o.pedra ? 14 : -80) && z < LONGE + 60) vis.push({ o, p: { z } });
      continue;
    }
    const p = projetar(o); if (p) vis.push({ o, p });
  }
  vis.sort((a, b) => b.p.z - a.p.z);
  for (const { o, p } of vis) {
    if (o.vols) {
      px.globalAlpha = 1;
      if (!noite) for (const pr of o.vols) if (pr.h0 === 0) sombraDe(pr);
      const ordem = o.vols.map((pr, i) => {
        const n = pr.planta.length;
        return { pr, i, z: camEsp({ x: pr.planta.reduce((s2, q) => s2 + q.x, 0) / n, y: pr.planta.reduce((s2, q) => s2 + q.y, 0) / n, h: 0 }).z };
      }).sort((a, b) => (Math.abs(a.z - b.z) > 1 ? b.z - a.z : a.pr.h0 - b.pr.h0));
      for (const { pr } of ordem) desenharPrisma(pr, noite);
      if (p.z > LONGE * 0.6) { px.globalAlpha = clamp((p.z - LONGE * 0.6) / (LONGE * 0.5)) * 0.8; }
      px.globalAlpha = 1;
      continue;
    }
    const w = o.larg * p.s, h = o.alt * p.s;
    if (p.sx + w / 2 < 0 || p.sx - w / 2 > PW) continue;
    const y = p.chaoY - h - (o.voo || 0) * p.s;
    px.globalAlpha = clamp(1.3 - p.z / LONGE);
    px.fillStyle = 'rgba(0,0,0,0.25)';
    px.fillRect(Math.round(p.sx - w * 0.35), Math.round(p.chaoY - Math.max(1, p.s * 0.6)), Math.round(w * 0.7), Math.max(1, Math.round(p.s * 1.1)));
    px.save(); px.translate(Math.round(p.sx), 0);
    if (o.virar) px.scale(-1, 1);
    if (o.src) px.drawImage(o.img, ...o.src, -w / 2, y, w, h);
    else px.drawImage(o.img, -w / 2, y, w, h);
    px.restore();
    if (noite && o.lanterna) { px.fillStyle = 'rgba(255,224,140,0.25)'; px.fillRect(p.sx - w, y - h * 0.2, w * 2, h * 1.4); }
    if (o.balao && p.z < 150) balaoPOV(p.sx, y - 4, o.balao, p.s);
    if (o.nome && p.z < 110 && o.pessoa) etiquetaPOV(p.sx, y - (o.balao ? 18 : 3), o.nome);
    px.globalAlpha = 1;
  }
}

function etiquetaPOV(x, y, nome) {
  px.font = `5px ${FONTE}`; px.textAlign = 'center'; px.textBaseline = 'bottom';
  const w = px.measureText(nome).width + 4;
  px.fillStyle = 'rgba(20,15,38,0.8)'; px.fillRect(Math.round(x - w / 2), Math.round(y - 7), Math.round(w), 7);
  px.fillStyle = '#ffc83d'; px.fillText(nome, Math.round(x), Math.round(y - 1));
}
function balaoPOV(x, y, emoji, s) {
  const tam = Math.max(7, Math.min(14, s * 6));
  px.fillStyle = '#f3eefe'; px.fillRect(Math.round(x - tam * 0.75), Math.round(y - tam * 1.6), Math.round(tam * 1.5), Math.round(tam * 1.3));
  px.fillRect(Math.round(x - 1), Math.round(y - tam * 0.3), 2, 2);
  px.font = `${tam}px "Segoe UI Emoji","Noto Color Emoji",sans-serif`; px.textAlign = 'center'; px.textBaseline = 'middle';
  px.fillText(emoji, Math.round(x), Math.round(y - tam * 0.95));
}

// ------------------------------------------------------------------ traje de cada colono
// Tudo sai do próprio colono (seed + cargo), então cada POV tem mãos diferentes e o mesmo colono
// sempre aparece com o mesmo traje: tecido, luva, faixa na cor do cargo, padrão da manga,
// remendo com a inicial, iniciais no punho, computador de pulso, poeira e cor do visor.
const CARGO_COR = {
  engenharia: '#f08a24', piloto: '#3f8efc', rover: '#c9a227', botanica: '#2bb673', medicina: '#e04f5f',
  ciencia: '#00b8a9', geologia: '#b0643a', robotica: '#7d8bb0', comunicacao: '#9b59b6', astronomia: '#5b6ee1',
  guarda: '#ff4d4d', cozinha: '#ffb74d', energia: '#f2d024',
};
const TECIDOS = [['#e9e6f2', '#c9c4da'], ['#e8d6b8', '#c4ad8a'], ['#cfd8e6', '#a5b1c6'], ['#b9c4a6', '#94a083'],
                 ['#f1c7a8', '#cfa080'], ['#6a7090', '#4c5170'], ['#f4f0e0', '#d6cfb5'], ['#d9c3e6', '#b49cc6']];
const LUVAS = [['#d8dbe8', '#e9ecf5'], ['#3a3a48', '#5a5a6c'], ['#f2c14e', '#f7d77e'], ['#b5562b', '#cf7447'],
               ['#3f8efc', '#7fb3ff'], ['#2bb673', '#5fd69a'], ['#e9e6f2', '#ffffff']];
const VISORES = [null, 'rgba(255,190,60,0.07)', 'rgba(80,170,255,0.07)', 'rgba(120,255,170,0.05)', 'rgba(255,110,180,0.05)'];
let TRAJE = null;
function trajeDe(c) {
  let s0 = Math.abs(c.seed || 0) || Math.floor(hash(c.codigo.length, 7) * 1e9);
  const pega = (n) => { const v = s0 % n; s0 = Math.floor(s0 / n) + 7919; return v; };
  const tecido = TECIDOS[pega(TECIDOS.length)];
  return {
    tecido, luva: LUVAS[pega(LUVAS.length)],
    faixa: CARGO_COR[c.cargo] || ROUPAS[Math.abs(c.seed || 0) % ROUPAS.length],
    padrao: pega(5), relogio: pega(3) > 0, remendo: pega(4) > 0, sujeira: pega(3),
    visor: VISORES[pega(VISORES.length)], dedos: pega(2) ? 'liso' : 'reforco',
    iniciais: (c.nome || '?').replace(/[^A-Za-zÀ-ú0-9]/g, '').slice(0, 2).toUpperCase(),
    letra: (c.cargo_nome || c.nome || '?')[0].toUpperCase(),
  };
}

// ------------------------------------------------------------------ luvas do traje (primeira pessoa)
function maos(t) {
  px.save(); px.translate(PW / 2, PH); px.scale(1.6, 1.6); px.translate(-PW / 2, -PH);
  try { maosNaTela(t); } finally { px.restore(); }
}
function maosNaTela(t) {
  const a = POV.estado(t);
  const passo = a.andando ? Math.sin(t * 9) : 0;
  const by = PH - 30 + Math.abs(passo) * 3;
  // braço do traje entrando pelo canto da tela, na diagonal, com a luva (dedos e polegar) na ponta
  const luva = (x, y, flip, giro = 0, segura = null) => {
    px.save(); px.translate(x, y); if (flip) px.scale(-1, 1); px.rotate(-0.42 + giro);
    const T = TRAJE;
    px.fillStyle = CONTORNO; px.fillRect(-12, -4, 26, 70);
    px.fillStyle = T.tecido[0]; px.fillRect(-10, -2, 22, 66);            // manga do traje
    px.fillStyle = T.tecido[1]; px.fillRect(6, -2, 6, 66);               // sombra da manga
    px.fillStyle = T.faixa;                                              // faixa na cor do cargo, em padrões diferentes
    if (T.padrao === 0) px.fillRect(-10, 16, 22, 5);
    else if (T.padrao === 1) { px.fillRect(-10, 12, 22, 3); px.fillRect(-10, 19, 22, 3); }
    else if (T.padrao === 2) for (let i = 0; i < 6; i++) { px.fillRect(-10 + i * 2, 14 + i, 2, 3); px.fillRect(10 - i * 2, 14 + i, 2, 3); }
    else if (T.padrao === 3) px.fillRect(-3, -2, 5, 66);
    else { px.fillRect(-10, 14, 22, 2); for (let i = 0; i < 4; i++) px.fillRect(-9 + i * 6, 18, 3, 3); }
    if (!flip && T.remendo) {                                            // remendo no braço esquerdo, com a inicial do cargo
      px.fillStyle = CONTORNO; px.fillRect(-8, 30, 15, 13);
      px.fillStyle = T.faixa; px.fillRect(-7, 31, 13, 11);
      px.fillStyle = '#fff'; px.font = `7px ${FONTE}`; px.textAlign = 'center'; px.textBaseline = 'middle';
      px.fillText(T.letra, -0.5, 37);
    }
    for (let i = 0; i < T.sujeira * 3; i++) { px.fillStyle = 'rgba(150,70,40,0.55)'; px.fillRect(-9 + hash(i, 41) * 18, 4 + hash(i, 42) * 55, 2, 1 + (i % 2)); }
    px.fillStyle = CONTORNO; px.fillRect(-13, -8, 28, 7);
    px.fillStyle = tom(T.tecido[1], 0.8); px.fillRect(-11, -7, 24, 5);    // punho
    if (!flip && T.iniciais) { px.fillStyle = CONTORNO; px.font = `4px ${FONTE}`; px.textAlign = 'center'; px.textBaseline = 'middle'; px.fillText(T.iniciais, 1, -4.5); }
    if (flip && T.relogio) {                                             // computador de pulso no braço direito
      px.fillStyle = CONTORNO; px.fillRect(-8, -1, 16, 10);
      px.fillStyle = '#1e1838'; px.fillRect(-7, 0, 14, 8);
      px.fillStyle = Math.floor(TEMPO_POV * 3) % 2 ? T.faixa : '#3fd0c9'; px.fillRect(-5, 2, 3, 2);
      px.fillStyle = '#4ed37a'; px.fillRect(0, 2, 5, 1); px.fillRect(0, 5, 3, 1);
    }
    px.fillStyle = CONTORNO; px.fillRect(-12, -26, 26, 20);
    px.fillStyle = T.luva[0]; px.fillRect(-10, -24, 22, 17);             // palma
    px.fillStyle = CONTORNO; for (let i = 0; i < 4; i++) px.fillRect(-10 + i * 6, -33, 6, 10);
    px.fillStyle = T.luva[1]; for (let i = 0; i < 4; i++) px.fillRect(-9 + i * 6, -32, 4, 8);   // dedos
    if (T.dedos === 'reforco') { px.fillStyle = T.faixa; for (let i = 0; i < 4; i++) px.fillRect(-9 + i * 6, -32, 4, 2); px.fillRect(-10, -16, 22, 2); }
    if (segura) segura();                                                // o que a mão segura (lanterna)
    px.fillStyle = CONTORNO; px.fillRect(12, -22, 8, 12); px.fillStyle = T.luva[1]; px.fillRect(13, -21, 6, 10);   // polegar
    px.restore();
  };
  const fer = a.ferramenta;
  if (fer === 'martelo') {   // martelada: a mão direita sobe e desce
    const k = a.trabalhando ? Math.abs(Math.sin(t * 6)) : 0;
    luva(PW - 62, by + 2 - k * 16, true, -k * 0.5);
    px.save(); px.translate(PW - 78, by - 30 - k * 26); px.rotate(-0.5 + k * 0.9);
    px.fillStyle = CONTORNO; px.fillRect(-3, -40, 7, 44); px.fillStyle = '#8d5524'; px.fillRect(-2, -39, 5, 42);
    px.fillStyle = CONTORNO; px.fillRect(-12, -50, 25, 13); px.fillStyle = '#9aa0b8'; px.fillRect(-11, -49, 23, 11);
    px.restore();
    if (a.trabalhando && Math.sin(t * 6) > 0.92) for (let i = 0; i < 6; i++) { px.fillStyle = '#ffc83d'; px.fillRect(PW / 2 + (hash(i, Math.floor(t * 6)) - 0.5) * 40, HZ + 120 + hash(i, 3) * 30, 2, 2); }
    luva(52, by + 12, false);
  } else if (fer === 'lanterna') {   // luz estroboscópica na mão esquerda
    luva(80, by + 4, false, 0.2, () => {   // a lanterna fica presa na mão
      px.fillStyle = CONTORNO; px.fillRect(-8, -58, 20, 34); px.fillStyle = '#3a2f63'; px.fillRect(-6, -56, 16, 30);
      px.fillStyle = a.flash ? '#fffbe0' : '#ffd84a'; px.fillRect(-7, -63, 18, 7);
      if (a.flash) { px.fillStyle = 'rgba(255,250,210,0.35)'; px.fillRect(-14, -78, 30, 16); }
    });
    luva(PW - 52, by + 14, true);
  } else if (fer === 'tablet') {
    px.fillStyle = CONTORNO; px.fillRect(PW / 2 - 48, by - 30, 96, 62); px.fillStyle = '#1e1838'; px.fillRect(PW / 2 - 45, by - 27, 90, 56);
    px.fillStyle = '#3fd0c9'; px.font = `6px ${FONTE}`; px.textAlign = 'center'; px.textBaseline = 'middle';
    px.fillText(a.tela || 'OBRA', PW / 2, by - 14);
    if (a.progresso != null) { px.fillStyle = '#3a2f63'; px.fillRect(PW / 2 - 36, by, 72, 8); px.fillStyle = '#ffc83d'; px.fillRect(PW / 2 - 36, by, 72 * a.progresso, 8); }
    luva(PW / 2 - 56, by + 30, false, 0.25); luva(PW / 2 + 56, by + 30, true, 0.25);
  } else if (fer === 'aceno') {
    const k = Math.sin(t * 10) * 0.35;
    luva(PW - 70, by - 10, true, k);
  } else {
    luva(46, by + 20 + passo * 3, false); luva(PW - 46, by + 20 - passo * 3, true);
  }
}

// ------------------------------------------------------------------ capacete (HUD) e diário — na tela grande
function hudCapacete(t) {
  const a = POV.estado(t);
  const W2 = W, H2 = H;
  // moldura do visor
  const g = ctx.createRadialGradient(W2 / 2, H2 * 0.46, H2 * 0.36, W2 / 2, H2 * 0.46, H2 * 0.68);
  g.addColorStop(0, 'rgba(10,8,22,0)'); g.addColorStop(1, 'rgba(10,8,22,0.92)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W2, H2);
  if (TRAJE && TRAJE.visor) { ctx.fillStyle = TRAJE.visor; ctx.fillRect(0, 0, W2, H2); }               // tom do visor de cada um
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = 0; y < H2; y += 8) ctx.fillRect(0, y, W2, 2);   // linhas do visor
  ctx.globalAlpha = 0.08; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(W2 * 0.28, H2 * 0.2, 140, 360, -0.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;   // reflexo
  // topo: REC + quem está filmando
  if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = COR.alerta; ctx.beginPath(); ctx.arc(80, 104, 14, 0, 7); ctx.fill(); }
  texto('REC', 108, 106, 24, '#fff', { alinhar: 'left' });
  texto(`POV: ${POV.info.prota.nome}`, W2 - 70, 92, 26, COR.ouro, { alinhar: 'right', maxW: 640 });
  if (POV.info.prota.cargo_nome) texto(POV.info.prota.cargo_nome.toUpperCase(), W2 - 70, 132, 16, COR.agua, { alinhar: 'right', contorno: false, maxW: 640 });
  // bússola
  const cx = W2 / 2, cy = 196;
  ctx.fillStyle = 'rgba(20,15,38,0.7)'; ctx.fillRect(cx - 230, cy - 26, 460, 52);
  ctx.save(); ctx.beginPath(); ctx.rect(cx - 230, cy - 26, 460, 52); ctx.clip();
  for (const [rot, ang0] of [['L', 0], ['S', Math.PI / 2], ['O', Math.PI], ['N', -Math.PI / 2]]) {
    for (const volta of [-2 * Math.PI, 0, 2 * Math.PI]) {
      const d = ang0 + volta - POV.cam.a;
      if (Math.abs(d) > 1.1) continue;
      texto(rot, cx + d * 200, cy + 2, rot === 'N' ? 26 : 20, rot === 'N' ? COR.alerta : '#fff', { contorno: false });
    }
  }
  ctx.restore();
  ctx.fillStyle = COR.ouro; ctx.fillRect(cx - 2, cy - 30, 4, 10);
  // oxigênio e temperatura
  const o2 = a.o2 != null ? a.o2 : 0.86 - t * 0.002;
  texto('O2', 70, 276, 22, COR.agua, { alinhar: 'left' });
  ctx.fillStyle = COR.borda; ctx.fillRect(130, 262, 220, 28);
  ctx.fillStyle = o2 < 0.3 ? COR.alerta : COR.agua; ctx.fillRect(134, 266, 212 * o2, 20);
  if (POV.info.estacao) texto(`${POV.info.estacao.temp}°C`, W2 - 70, 276, 24, COR.areia, { alinhar: 'right' });
  if (a.alerta && Math.floor(t * 3) % 2) { ctx.fillStyle = 'rgba(255,60,60,0.18)'; ctx.fillRect(0, 0, W2, H2); texto(a.alerta, W2 / 2, 300, 40, COR.alerta); }
  // diário em primeira pessoa (máquina de escrever)
  const fala = POV.falas.filter((f) => t >= f.t).pop();
  if (fala && t < fala.fim) {
    const n = Math.floor(clamp((t - fala.t) / Math.max(0.6, fala.voz ? fala.voz * 0.9 : fala.texto.length * 0.035)) * fala.texto.length);
    const linhas = quebrarFala(fala.texto, 34, W2 - 180);
    let feito = 0;
    const y0 = H2 - 900;
    ctx.fillStyle = 'rgba(20,15,38,0.82)'; ctx.fillRect(60, y0 - 20, W2 - 120, linhas.length * 54 + (fala.quem ? 70 : 30));
    ctx.fillStyle = fala.quem ? COR.ouro : COR.agua; ctx.fillRect(60, y0 - 20, 8, linhas.length * 54 + (fala.quem ? 70 : 30));
    let y = y0 + 18;
    if (fala.quem) { texto(fala.quem, 96, y, 22, fala.quem === POV.info.prota.nome ? COR.agua : COR.ouro, { alinhar: 'left', contorno: false }); y += 50; }
    for (const l of linhas) {
      const parte = l.slice(0, Math.max(0, n - feito)); feito += l.length + 1;
      texto(parte, 96, y, 30, '#fff', { alinhar: 'left', contorno: false, maxW: W2 - 200 }); y += 54;
    }
  }
  // título no começo e chamada no fim
  if (t < 3.2) {
    ctx.globalAlpha = clamp(3.2 - t);
    texto('OPERAÇÃO MARTE ZERO', W2 / 2, 380, 34, '#fff');
    texto(POV.titulo, W2 / 2, 450, 44, COR.ouro, { maxW: W2 - 100 });
    ctx.globalAlpha = 1;
  }
  if (t > POV.duracao - 3.6) {
    ctx.globalAlpha = clamp((t - (POV.duracao - 3.6)) / 0.5);
    ctx.fillStyle = 'rgba(20,15,38,0.75)'; ctx.fillRect(0, 560, W2, 340);
    texto('VIRE PERSONAGEM', W2 / 2, 640, 50, COR.ouro);
    texto('E VIVA EM MARTE', W2 / 2, 720, 40, '#fff');
    texto(EP.site_tela, W2 / 2, 820, 30, COR.agua);
    ctx.globalAlpha = 1;
  }
}
function quebrarFala(str, tam, maxW) {
  ctx.font = `${tam}px ${FONTE}`;
  const out = []; let at = '';
  for (const p of str.split(' ')) { const t2 = at ? at + ' ' + p : p; if (ctx.measureText(t2).width > maxW && at) { out.push(at); at = p; } else at = t2; }
  if (at) out.push(at);
  return out.slice(0, 4);
}

// ------------------------------------------------------------------ roteiro (caminho da câmera + falas)
// passos: {andar: ponto, vel} · {olhar: ponto, dur} · {parar: dur} · com estado (ferramenta, trabalhando...) e fala opcional
// Com voz (DURACOES vem do pov.py: "quem|texto" → segundos), um passo com fala só começa depois que a voz
// anterior terminou (a câmera fica parada esperando) e o encerramento espera a última fala.
let DURACOES = {};
function durVoz(f) { return DURACOES[(f.quem || '') + '|' + f.texto] || 0; }
function montarCaminho(inicio, angInicial, passos) {
  const trechos = [];
  let t = 0, pos = { ...inicio }, a = angInicial, livre = 0, livreOutro = 0;   // livreOutro: fim da fala de outra pessoa
  const falas = [];
  passos.forEach((p, idx) => {
    const lista = p.fala ? [].concat(p.fala) : [];
    const precisa = lista.length ? livre + 0.3 - (lista[0].atraso || 0.2)
      : idx === passos.length - 1 && livre ? livre + 0.5
      : livreOutro ? livreOutro + 0.3 : 0;   // não sai andando enquanto alguém ainda fala com você
    if (precisa > t + 0.05) {   // pausa: espera a voz anterior acabar
      const ant = trechos.length ? trechos[trechos.length - 1].st : {};
      trechos.push({ t0: t, t1: precisa, de: { ...pos }, para: { ...pos }, a0: a, a1: a, st: { ...ant, andando: false }, girar: 0.01 });
      t = precisa;
    }
    const st = { ...(p.estado || {}) };
    let dur, de = { ...pos }, para = { ...pos }, a0 = a, a1 = a;
    if (p.andar) {
      para = p.andar; a1 = angPara(pos, para);
      dur = Math.max(0.8, Math.hypot(para.x - pos.x, para.y - pos.y) / (p.vel || 22));
      st.andando = true;
    } else if (p.olhar) { a1 = angPara(pos, p.olhar); dur = p.dur || 1.2; }
    else dur = p.parar || 1;
    trechos.push({ t0: t, t1: t + dur, de, para, a0, a1, st, girar: p.andar ? Math.min(0.7, dur * 0.4) : dur * 0.8 });
    for (const f of lista) {
      const voz = durVoz(f);
      const ft = Math.max(t + (f.atraso || 0.2), livre ? livre + 0.3 : 0);
      falas.push({ t: ft, fim: ft + Math.max(2.4, voz ? voz + 0.6 : f.texto.length * 0.075), texto: f.texto, quem: f.quem || null, voz });
      if (voz) { livre = ft + voz; if (f.quem) livreOutro = livre; }
    }
    t += dur; pos = para; a = a1;
  });
  // cada fala some quando começa a próxima
  falas.sort((x, y) => x.t - y.t);
  for (let i = 0; i + 1 < falas.length; i++) falas[i].fim = Math.min(falas[i].fim, falas[i + 1].t - 0.1);
  return { trechos, falas, duracao: t };
}
function camEm(tr, t) {
  let T = tr[tr.length - 1];
  for (const x of tr) if (t < x.t1) { T = x; break; }
  const k = clamp((t - T.t0) / (T.t1 - T.t0));
  const kg = clamp((t - T.t0) / Math.max(0.01, T.girar));
  const balanço = T.st.andando ? Math.sin(t * 9) * 0.018 : Math.sin(t * 0.8) * 0.01;
  return {
    x: lerp(T.de.x, T.para.x, T.st.andando ? k : 0), y: lerp(T.de.y, T.para.y, T.st.andando ? k : 0),
    a: mistura(T.a0, T.a1, suave(kg)) + balanço, st: T.st,
  };
}

// ------------------------------------------------------------------ cenas
function spritePOV(c) { return (c.sprite_url && imagens.get(c.sprite_url)) || spriteColono(c.seed); }
function pontoDe(tx, ty) { return { x: tx * CASA, y: ty * CASA }; }
function frenteDe(c) { return { x: c.x * CASA + 8, y: c.y * CASA + 22 }; }

function cenaObra(info) {
  const obra = obraDaMissao(), r = retanguloDe(obra), b = EP.mundo.base;
  const prota = info.prota;
  const casa = frenteDe(prota);
  const chegada = { x: (r.x0 + r.x1) / 2, y: r.y1 + 26 };
  const trilha = { x: (b.x + b.w / 2) * CASA, y: chegada.y + 40 };
  const pr = info.obra ? info.obra.progresso / 100 : 0.4;
  const nomeObra = obra.nome;
  return {
    titulo: `UM DIA DE OBRA: ${nomeObra.toUpperCase()}`,
    caminho: montarCaminho(casa, -Math.PI / 2, [
      { parar: 1.4, fala: { texto: `Diário de ${prota.nome}. Dia ${EP.numero} em Marte. Hoje é dia de obra.` } },
      { olhar: trilha, dur: 1 },
      { andar: trilha, vel: 26, fala: { texto: `Lá fora: ${info.estacao ? info.estacao.temp : -70} graus. O traje aguenta. Bora pra ${nomeObra}.`, atraso: 0.6 } },
      { olhar: chegada, dur: 0.8 },
      { andar: chegada, vel: 24, fala: { texto: `Olha a turma já trabalhando. Cada colono novo é mais uma mão na obra.`, atraso: 0.6 } },
      { olhar: { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }, dur: 1, estado: { ferramenta: 'tablet', tela: nomeObra.toUpperCase(), progresso: pr } ,
        fala: { texto: `${nomeObra}: ${Math.round(pr * 100)}% pronta. Vamos subir mais um pouco.` } },
      { parar: 2.2, estado: { ferramenta: 'tablet', tela: nomeObra.toUpperCase(), progresso: pr } },
      { parar: 5, estado: { ferramenta: 'martelo', trabalhando: true },
        fala: [{ texto: `Parafuso por parafuso. Aqui ninguém constrói sozinho.`, atraso: 0.4 },
               ...(info.vizinho ? [{ texto: `Valeu pela ajuda, ${prota.nome}! Amanhã tem mais.`, quem: info.vizinho.nome, atraso: 3 }] : [])] },
      { olhar: { x: (b.x + b.w / 2) * CASA, y: (b.y) * CASA }, dur: 1.4, fala: { texto: `O sol já vai se pôr. Fim de turno na colônia.`, atraso: 0.3 } },
      { parar: 3.8 },
    ]),
    pessoas: (t) => trabalhadores(info, r, t),
  };
}

function trabalhadores(info, r, t) {   // colonos e fundadores martelando em volta da obra
  const lista = [];
  const quem = [...EP.mundo.fundadores.map((f) => ({ img: spriteMapa(f.sprite), nome: f.curto })),
                ...info.colonos.filter((c) => c.codigo !== info.prota.codigo).slice(0, 8).map((c) => ({ img: spritePOV(c), nome: c.nome }))];
  quem.forEach((q, i) => {
    const p = pontoNaObra(r, i);
    const pulo = Math.floor(t * 4 + i) % 2 ? 1.2 : 0;
    lista.push({ x: p.x, y: p.y - 6, larg: 12, alt: 12, img: q.img, nome: q.nome, pessoa: true, voo: pulo, virar: i % 2 === 1,
                 balao: Math.floor(t / 2.5 + i) % 5 === 0 ? ['🔧', '💪', '🧱', '⚙️'][i % 4] : null });
  });
  return lista;
}

function cenaDefesa(info) {
  const b = EP.mundo.base, prota = info.prota;
  const porta = { x: (b.x + b.w / 2) * CASA, y: (b.y + b.h) * CASA + 30 };
  const cerca = { x: porta.x + 80, y: porta.y + 90 };
  const dunas = { x: cerca.x + 140, y: cerca.y + 120 };
  const perto = { x: cerca.x - 44, y: cerca.y - 52 };   // para a uns passos da cerca
  const caminho = montarCaminho(porta, Math.PI / 2, [
    { parar: 1.6, estado: { alerta: 'ALERTA!' }, fala: { texto: `Noite em Marte. O alarme tocou: alguma coisa está mexendo na cerca.` } },
    { olhar: cerca, dur: 0.9, estado: { alerta: 'ALERTA!' } },
    { parar: 0.6, estado: { ferramenta: 'lanterna' } },
    { andar: perto, vel: 34, estado: { ferramenta: 'lanterna' }, fala: { texto: `Besouros-de-ferrugem! Eles roem os cabos da colônia.`, atraso: 0.8 } },
    { parar: 1.2, estado: { ferramenta: 'lanterna' }, fala: { texto: `Sem machucar ninguém. Só luz.` } },
    { olhar: dunas, dur: 0.6, estado: { ferramenta: 'lanterna', flash: true } },
    { parar: 3.6, estado: { ferramenta: 'lanterna', flash: true, estrobo: true }, fala: { texto: `Luz estroboscópica neles!`, atraso: 0.1 } },
    { parar: 2.4, estado: { ferramenta: 'lanterna' }, fala: { texto: `Voltaram para as dunas. Cerca inteira, cabos salvos.` } },
    { olhar: porta, dur: 1.4, fala: { texto: `Mais uma noite tranquila na colônia. Boa noite, ${info.colonos.length + 2} colonos.`, atraso: 0.4 } },
    { parar: 3.8 },
  ]);
  const tFlash = caminho.trechos.find((x) => x.st.estrobo);
  const fuga0 = tFlash ? tFlash.t0 : 99;
  return {
    titulo: 'DEFENDENDO A BASE', noite: true, caminho,
    pessoas: (t) => {
      const lista = [];
      for (let i = 0; i < 9; i++) {
        const base = { x: cerca.x + 10 + (hash(i, 1) - 0.5) * 60, y: cerca.y + (hash(i, 2) - 0.5) * 24 };
        const fuga = clamp((t - fuga0 - hash(i, 3) * 0.8) / 2.5);
        const ida = { x: lerp(base.x, dunas.x + (hash(i, 4) - 0.5) * 120, fuga), y: lerp(base.y, dunas.y + hash(i, 5) * 60, fuga) };
        const treme = fuga > 0 ? 0 : Math.sin(t * 14 + i) * 1.2;
        if (fuga >= 1) continue;
        lista.push({ x: ida.x + treme, y: ida.y, larg: 14, alt: 10, img: besouro(Math.floor(t * 8 + i)), virar: fuga > 0 });
      }
      lista.push({ x: cerca.x + 20, y: cerca.y + 22, larg: 44, alt: 6, img: cercaImg() });
      return lista;
    },
  };
}
let _cerca = null;
function cercaImg() {
  if (_cerca) return _cerca;
  _cerca = document.createElement('canvas'); _cerca.width = 40; _cerca.height = 10;
  const x = _cerca.getContext('2d');
  x.fillStyle = '#5b6b8c'; for (let i = 0; i < 40; i += 8) x.fillRect(i, 0, 2, 10);
  x.fillRect(0, 2, 40, 1); x.fillRect(0, 6, 40, 1);
  return _cerca;
}

function cenaPasseio(info) {
  const prota = info.prota, b = EP.mundo.base;
  const vizinhos = info.colonos.filter((c) => c.codigo !== prota.codigo).slice(0, 4);
  const pontos = [];
  let at = frenteDe(prota);
  for (const v of vizinhos) pontos.push({ v, p: { x: v.x * CASA + 8, y: v.y * CASA + 34 } });
  const passos = [{ parar: 1.4, fala: { texto: `Diário de ${prota.nome}. Hora de dar uma volta pelo bairro.` } }];
  for (const { v, p } of pontos) {
    passos.push({ andar: p, vel: 24 });
    passos.push({ olhar: { x: v.x * CASA + 8, y: v.y * CASA + 12 }, dur: 0.8, estado: { ferramenta: 'aceno' },
                  fala: [{ texto: chegada(v, prota) },
                         { texto: saudacao(v, prota), quem: v.nome, atraso: 1.6 }] });
    passos.push({ parar: 2.6, estado: { ferramenta: 'aceno' } });
  }
  const praca = EP.mundo.praca ? centro(EP.mundo.praca) : centro(b);
  passos.push({ andar: { x: praca.x, y: praca.y + 30 }, vel: 26, fala: { texto: `Cada casa aqui é de um seguidor de verdade.`, atraso: 0.8 } });
  passos.push({ olhar: centro(b), dur: 1.4, fala: { texto: `E ainda tem muito lote livre. Quem vem morar com a gente?`, atraso: 0.3 } });
  passos.push({ parar: 3.8 });
  return {
    titulo: 'PASSEIO PELA COLÔNIA', caminho: montarCaminho(at, -Math.PI / 2, passos),
    pessoas: (t) => info.colonos.filter((c) => c.codigo !== prota.codigo).map((c, i) => ({
      x: c.x * CASA + 8, y: c.y * CASA + 18, larg: 12, alt: 12, img: spritePOV(c), nome: c.nome, pessoa: true,
      voo: Math.floor(t * 2 + i) % 3 === 0 ? 1 : 0, virar: Math.sin(t * 0.7 + i) > 0,
      balao: Math.floor(t / 2 + i) % 4 === 0 ? ['👋', '😄', '🚀', '❤️'][i % 4] : null,
    })),
  };
}
function escolhe(lista, seed, salto = 0) { return lista[(Math.abs(seed || 0) + EP.numero * 3 + salto) % lista.length]; }
function chegada(v, prota) {
  return escolhe([
    `Ó, ${v.nome} tá em casa. Vou dar um oi.`,
    `${v.nome}! Bom te ver por aqui.`,
    `Deixa eu passar na casa de ${v.nome} rapidinho.`,
    `Olha lá, ${v.nome} na porta.`,
    `Fala, ${v.nome}! Tudo certo aí?`,
  ], v.seed, 1);
}
function saudacao(v, prota) {
  return escolhe([
    `E aí, ${prota.nome}! Dormiu bem com aquele vento?`,
    `Opa! Cuidado com a poeira lá fora, viu?`,
    `${prota.nome}! Passa aqui mais tarde pra um café de estufa.`,
    `Tudo certo! Amanhã eu colo na obra com vocês.`,
    `Bom dia! Meu aquecedor fez barulho a noite toda, depois dá uma olhada?`,
    `Ô, ${prota.nome}! Guardei um pedaço de bolo de batata pra você.`,
    `Tudo ótimo. Já viu o pôr do sol azul de ontem? Que coisa linda.`,
  ], v.seed);
}

function cenaConversa(info) {
  const prota = info.prota;
  const v = info.colonos.find((c) => c.codigo !== prota.codigo) || null;
  const lia = EP.mundo.fundadores.find((f) => f.id === 'lia') || EP.mundo.fundadores[0];
  const quem = v ? { nome: v.nome, img: spritePOV(v), cargo: v.cargo_nome } : { nome: lia.curto, img: spriteMapa(lia.sprite), cargo: 'Cientista' };
  const praca = EP.mundo.praca ? centro(EP.mundo.praca) : centro(EP.mundo.base);
  const encontro = { x: praca.x, y: praca.y + 10 };
  const de = { x: encontro.x - 70, y: encontro.y + 70 };
  const linhas = conversa(info, quem);
  const passos = [
    { parar: 1.2, fala: { texto: `Diário de ${prota.nome}. Encontrei alguém na praça.` } },
    { andar: { x: encontro.x - 14, y: encontro.y + 22 }, vel: 22 },
    { olhar: encontro, dur: 0.8 },
  ];
  linhas.forEach((l, i) => passos.push({ parar: Math.max(2.6, l.texto.length * 0.07), estado: { ferramenta: l.quem === prota.nome ? 'aceno' : null }, fala: { ...l, atraso: 0.15 } }));
  passos.push({ parar: 3.8 });
  return {
    titulo: `PAPO NA PRAÇA COM ${quem.nome.toUpperCase()}`, caminho: montarCaminho(de, -Math.PI / 4, passos),
    pessoas: (t) => [{ x: encontro.x, y: encontro.y, larg: 12, alt: 12, img: quem.img, nome: quem.nome, pessoa: true,
                       voo: Math.floor(t * 3) % 4 === 0 ? 1 : 0, balao: Math.floor(t / 1.5) % 3 === 0 ? '💬' : null }],
  };
}
// Papo de amigos que trabalham juntos: começa leve, passa pelo trabalho do dia sem cerimônia e termina
// com um combinado. Varia por episódio e por dupla; ninguém fica anunciando o cargo do outro.
function conversa(info, quem) {
  const p = info.prota.nome, o = info.obra, est = info.estacao, seed = (info.prota.seed || 0) + (quem.nome || '').length;
  const l = [];
  const eu = (texto) => l.push({ quem: p, texto });
  const ele = (texto) => l.push({ quem: quem.nome, texto });
  ele(escolhe([`${p}! Senta aqui, tá sobrando banco.`, `Olha quem apareceu! Achei que tinha virado poeira.`,
               `E aí, ${p}? Que cara de sono é essa?`, `Opa, chegou na hora. Acabei de esquentar o café.`], seed));
  eu(escolhe([`Dormi mal, o vento não parou a noite inteira.`, `Saudade de um banco que não seja de metal, viu.`,
              `Vim só respirar um pouco. Quer dizer, respirar filtrado.`, `Café? Você é a melhor pessoa dessa colônia.`], seed, 1));
  if (o) {
    ele(escolhe([`E a ${o.nome}? Passei lá e já tá bonita.`, `Vi a ${o.nome} de longe. Tá subindo rápido, hein.`,
                 `Me conta da ${o.nome}. Vai dar pra terminar essa semana?`], seed, 2));
    eu(escolhe([`Tá indo. Mais um pouco e a gente inaugura. Você vai, né?`, `Se o tempo ajudar, sai logo. A turma tá animada.`,
                `Falta pouco. Só não pode faltar parafuso de novo.`], seed, 3));
  }
  if (info.problema) {
    ele(`E aquela confusão de hoje? ${info.problema.titulo}. Que susto.`);
    eu(escolhe([`Nem me fala. Mas resolveram rapidinho, ainda bem.`, `Pois é. Pelo menos todo mundo correu pra ajudar.`], seed, 4));
  } else if (est) {
    ele(`${est.temp} graus hoje. Nem o café esquenta direito.`);
    eu(`Põe mais uma camada no traje que passa.`);
  }
  ele(escolhe([`Bom, deixa eu ir que a estufa não se rega sozinha. Até mais tarde!`, `Amanhã cedo eu passo na obra. Guarda um martelo pra mim.`,
               `Já somos ${info.populacao} aqui, dá pra acreditar? Até amanhã, ${p}.`, `Vai lá. E dorme, hein! Até amanhã.`], seed, 5));
  return l;
}

// ------------------------------------------------------------------ cenas de trabalho (uma por cargo)
// Cada cargo tem um momento do dia dele: sai de casa, vai até o lugar de trabalho (a construção do cargo,
// ou o módulo se ela ainda não existe), confere o tablet, trabalha e fecha o diário. As falas são em
// primeira pessoa, sem anunciar o cargo.
function lugarDe(tipos) {
  for (const t of tipos) {
    const o = EP.mundo.obras.find((x) => x.tipo === t && (x.status !== 'planejada' || x.slug === EP.missao_obra));
    if (o) return { r: retanguloDe(o), nome: o.nome, obra: o };
  }
  return { r: retanguloDe(EP.mundo.base), nome: 'o Módulo de Pouso', obra: null };
}
function campoFora(info) {   // um ponto fora do bairro, para coletar amostras
  const b = centro(EP.mundo.base), a = (info.prota.seed % 628) / 100;
  const x = b.x + Math.cos(a) * 230, y = b.y + Math.abs(Math.sin(a)) * 160 + 60;
  return { r: { x0: x - 18, x1: x + 18, y0: y - 18, y1: y + 18 }, nome: 'as dunas', obra: null };
}
const tempPOV = (info) => (info.estacao ? info.estacao.temp : -60);
const TRABALHOS = {
  botanica: {
    titulo: 'TURNO NA ESTUFA', lugar: ['estufa'], tela: 'UMIDADE 78%', prog: 0.78,
    falas: (i, L) => [`Diário de ${i.prota.nome}. Dia ${EP.numero} em Marte. Hoje é dia de cuidar das plantas.`,
      `Lá fora, ${tempPOV(i)} graus. Lá dentro, sempre primavera.`, `Chegando: ${L}. Olha esse verde no meio do vermelho!`,
      `Umidade boa, luz boa. As mudas cresceram mais um pouquinho.`, `Um pouco de água, um pouco de adubo. Planta também gosta de carinho.`,
      `Logo, logo tem salada fresca para a colônia inteira.`],
    vizinho: (i) => `Guarda um tomate pra mim, ${i.prota.nome}!`,
  },
  medicina: {
    titulo: 'CHECK-UP DA COLÔNIA', lugar: ['enfermaria'], tela: 'SINAIS VITAIS OK', prog: 1,
    falas: (i, L) => [`Diário de ${i.prota.nome}. Dia ${EP.numero}. Hora da ronda de saúde.`,
      `Ar seco, poeira fina. Todo mundo tosse um pouco aqui.`, `Primeira parada: ${L}. Vamos ver como está a turma.`,
      `Pressão boa, oxigênio bom. Ninguém com saudade demais da Terra hoje.`, `Mais um copo d'água e menos café, combinado?`,
      `Colônia saudável é colônia que trabalha feliz.`],
    vizinho: () => `Tô novo em folha? Posso voltar pra obra?`,
  },
  energia: {
    titulo: 'LIMPANDO OS PAINÉIS', lugar: ['solar'], tela: 'GERAÇÃO 96%', prog: 0.96,
    falas: (i, L) => [`Diário de ${i.prota.nome}. Dia ${EP.numero}. A poeira não perdoa os painéis.`,
      `Sol baixo e vento forte. Dia perfeito para limpar tudo.`, `Chegando em ${L}. Que camada de poeira, hein.`,
      `Geração em noventa e seis por cento. Dá pra chegar nos cem.`, `Escova pra cá, escova pra lá. Cada painel limpo é mais luz de noite.`,
      `Prontinho. A colônia tem energia de sobra hoje.`],
  },
  rover: {
    titulo: 'CHECAGEM DO ROVER', lugar: ['oficina'], tela: 'BATERIA 100%', prog: 1,
    falas: (i, L) => [`Diário de ${i.prota.nome}. Dia ${EP.numero}. O rover precisa estar pronto antes da viagem.`,
      `Lá fora, ${tempPOV(i)} graus. Pneu frio é pneu duro.`, `Indo até ${L}, onde o rover passa a noite.`,
      `Bateria cheia, sensores limpos. Seis rodas prontas.`, `Aperta um parafuso aqui, calibra o pneu ali.`,
      `Amanhã cedo eu saio pra buscar gelo nas crateras.`],
  },
  piloto: {
    titulo: 'CHECAGEM DE VOO', lugar: ['antena'], tela: 'ÓRBITA LIVRE', prog: 1,
    falas: (i, L) => [`Diário de ${i.prota.nome}. Dia ${EP.numero}. Nave de carga chegando nos próximos dias.`,
      `Sem tempestade à vista. Bom sinal para pousar.`, `Passando por ${L} para falar com a órbita.`,
      `Órbita livre, rota calculada. Tudo pronto pra receber a carga.`, `Confere a pista, confere as luzes de pouso.`,
      `Quando a nave chegar, vai ter peça nova pra obra.`],
  },
  ciencia: {
    titulo: 'COLETA DE AMOSTRAS', fora: true, tela: 'AMOSTRA: GELO 12%', prog: 0.12,
    falas: (i, L) => [`Diário de ${i.prota.nome}. Dia ${EP.numero}. Hoje eu saio do bairro atrás de amostras.`,
      `Lá fora, ${tempPOV(i)} graus. O traje aguenta, eu aguento.`, `Chegando nas dunas. Ninguém pisou aqui antes.`,
      `Doze por cento de gelo nessa terra! Isso é muita água.`, `Pá, saquinho, etiqueta. Ciência é paciência.`,
      `Volto pra base com a mochila cheia de descobertas.`],
  },
  geologia: {
    titulo: 'COLETA DE ROCHAS', fora: true, tela: 'BASALTO + FERRO', prog: 0.6,
    falas: (i, L) => [`Diário de ${i.prota.nome}. Dia ${EP.numero}. Martelo na mão, vamos ver o que tem debaixo da poeira.`,
      `O chão aqui conta a história de Marte.`, `Chegando nas dunas. Rocha escura, bom sinal.`,
      `Basalto com ferro. É por isso que Marte é vermelho.`, `Toc, toc, toc. Essa vai pra coleção.`,
      `Amanhã eu mostro tudo pra turma na praça.`],
  },
  robotica: {
    titulo: 'CONSERTO DE ROBÔ', lugar: ['oficina'], tela: 'ROBÔ R-2: 70%', prog: 0.7,
    falas: (i, L) => [`Diário de ${i.prota.nome}. Dia ${EP.numero}. O robô de carga voltou mancando ontem.`,
      `Poeira nas juntas: o inimigo número um dos robôs.`, `Indo até ${L}. Ferramenta pronta.`,
      `Setenta por cento. Só falta a roda da esquerda.`, `Solda aqui, óleo ali. Aguenta firme, R-2.`,
      `Hoje à noite ele volta a carregar material para a obra.`],
  },
  comunicacao: {
    titulo: 'SINAL DA TERRA', lugar: ['antena'], tela: 'SINAL 4/5', prog: 0.8,
    falas: (i, L) => [`Diário de ${i.prota.nome}. Dia ${EP.numero}. Hora de conversar com a Terra.`,
      `A mensagem leva uns minutos pra chegar lá. Paciência.`, `Chegando em ${L}. Vamos ver a qualidade do sinal.`,
      `Quatro barrinhas. Dá até pra mandar foto.`, `Ajusta a direção, um grau pra esquerda... pronto.`,
      `Mensagem enviada: aqui é a Operação Marte Zero, e está tudo bem.`],
  },
  astronomia: {
    titulo: 'NOITE DE OBSERVAÇÃO', lugar: ['laboratorio', 'antena'], tela: 'FOBOS À VISTA', prog: 1, noite: true,
    falas: (i, L) => [`Diário de ${i.prota.nome}. Noite do dia ${EP.numero}. Céu limpo, sem poeira.`,
      `Daqui dá pra ver estrelas que a gente nunca via da Terra.`, `Indo até ${L}, longe das luzes do bairro.`,
      `Fobos passando rapidinho. Ele dá três voltas em Marte por dia.`, `Anota, fotografa, anota de novo.`,
      `E aquele pontinho azul ali? É a Terra. Boa noite, pessoal de lá.`],
  },
  cozinha: {
    titulo: 'CAFÉ DA COLÔNIA', lugar: ['cantina'], tela: 'CARDÁPIO: SOPA', prog: 1,
    falas: (i, L) => [`Diário de ${i.prota.nome}. Dia ${EP.numero}. A turma acorda com fome.`,
      `Com ${tempPOV(i)} graus lá fora, só uma sopa quentinha resolve.`, `Indo até ${L}. Panela grande hoje.`,
      `Cardápio do dia: sopa de batata da estufa.`, `Mexe, prova, um pouco de sal. Perfeito.`,
      `Quem trabalha na obra come primeiro!`],
    vizinho: (i) => `Que cheiro bom, ${i.prota.nome}! Guarda um prato pra mim.`,
  },
};
function cenaTrabalho(info, id) {
  const T = TRABALHOS[id], prota = info.prota;
  const L = T.fora ? campoFora(info) : lugarDe(T.lugar);
  const casa = frenteDe(prota);
  const chegada = { x: (L.r.x0 + L.r.x1) / 2, y: L.r.y1 + 26 };
  const meio = { x: (casa.x + chegada.x) / 2 + 24, y: (casa.y + chegada.y) / 2 + 10 };
  const f = T.falas(info, L.nome);
  const tela = { ferramenta: 'tablet', tela: T.tela, progresso: T.prog };
  const fim = [{ texto: f[4], atraso: 0.4 }];
  if (T.vizinho && info.vizinho) fim.push({ texto: T.vizinho(info), quem: info.vizinho.nome, atraso: 3 });
  const vizinhoPerto = T.vizinho && info.vizinho;
  return {
    titulo: T.titulo, noite: !!T.noite,
    caminho: montarCaminho(casa, -Math.PI / 2, [
      { parar: 1.4, fala: { texto: f[0] } },
      { olhar: meio, dur: 0.9 },
      { andar: meio, vel: 26, fala: { texto: f[1], atraso: 0.6 } },
      { olhar: chegada, dur: 0.7 },
      { andar: chegada, vel: 24, fala: { texto: f[2], atraso: 0.6 } },
      { olhar: { x: (L.r.x0 + L.r.x1) / 2, y: (L.r.y0 + L.r.y1) / 2 }, dur: 1, estado: tela, fala: { texto: f[3] } },
      { parar: 2.2, estado: tela },
      { parar: 5, estado: { ferramenta: 'martelo', trabalhando: true }, fala: fim },
      { olhar: centro(EP.mundo.base), dur: 1.4, fala: { texto: f[5], atraso: 0.3 } },
      { parar: 3.8 },
    ]),
    pessoas: (t) => {
      const lista = info.colonos.filter((c) => c.codigo !== prota.codigo).map((c, k) => ({
        x: c.x * CASA + 8, y: c.y * CASA + 18, larg: 12, alt: 12, img: spritePOV(c), nome: c.nome, pessoa: true,
        voo: Math.floor(t * 2 + k) % 3 === 0 ? 1 : 0, virar: Math.sin(t * 0.7 + k) > 0,
      }));
      if (vizinhoPerto) {   // quem fala com o protagonista fica do lado dele no trabalho
        const v = info.vizinho;
        lista.push({ x: chegada.x + 26, y: chegada.y - 30, larg: 12, alt: 12, img: spritePOV(v), nome: v.nome, pessoa: true,
                     voo: Math.floor(t * 3) % 4 === 0 ? 1 : 0, balao: Math.floor(t / 1.5) % 3 === 0 ? '💬' : null });
      }
      return lista;
    },
  };
}

const CENAS = { obra: cenaObra, defesa: cenaDefesa, passeio: cenaPasseio, conversa: cenaConversa };
for (const id of Object.keys(TRABALHOS)) CENAS[id] = (info) => cenaTrabalho(info, id);

// ------------------------------------------------------------------ API para o pov.py
window.carregarPOV = function (info, nome) {
  for (const c of info.colonos) if (!colonoPorCodigo.has(c.codigo)) colonoPorCodigo.set(c.codigo, c);
  DURACOES = info.duracoes || {};
  TRAJE = trajeDe(info.prota);
  const cena = CENAS[nome](info);
  POV = {
    info, nome, titulo: cena.titulo, noite: !!cena.noite, pessoas: cena.pessoas,
    trechos: cena.caminho.trechos, falas: cena.caminho.falas, duracao: cena.caminho.duracao,
    cam: { x: 0, y: 0, a: 0 },
    estado: (t) => camEm(POV.trechos, t).st,
  };
  CONSTRUCOES = construcoes();
  return { quadros: Math.ceil(POV.duracao * EP.fps), duracao: POV.duracao, titulo: POV.titulo,
           falas: POV.falas.map((f) => ({ t: f.t, texto: f.texto, quem: f.quem })) };
};

let TEMPO_POV = 0;
function desenharPOV(t) {
  TEMPO_POV = t;
  const c = camEm(POV.trechos, t);
  POV.cam = { x: c.x, y: c.y, a: c.a };
  px.setTransform(1, 0, 0, 1, 0, 0);
  ceu(t, POV.noite);
  chao(POV.noite);
  const pet = POV.info.pets.map((p, i) => ({ x: p.x * CASA + 8 + Math.sin(t * 0.9 + i) * 8, y: p.y * CASA + 26, larg: 10, alt: 8,
                                             img: spriteContornado('pet'), virar: Math.cos(t * 0.9 + i) < 0 }));
  desenharBillboards([...CONSTRUCOES, ...pet, ...POV.pessoas(t)], POV.noite);
  if (c.st.estrobo && Math.floor(t * 10) % 2 === 0) { px.fillStyle = 'rgba(255,250,220,0.55)'; px.fillRect(0, 0, PW, PH); }
  if (POV.noite && c.st.ferramenta === 'lanterna') {   // cone da lanterna
    const g = px.createRadialGradient(PW / 2, HZ + 70, 10, PW / 2, HZ + 70, 160);
    g.addColorStop(0, 'rgba(255,230,160,0.28)'); g.addColorStop(1, 'rgba(255,230,160,0)');
    px.fillStyle = g; px.fillRect(0, 0, PW, PH);
  }
  maos(t);
  // tela grande: amplia a cena pixel a pixel e põe o capacete por cima
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pc, 0, 0, PW, PH, 0, 0, W, H);
  hudCapacete(t);
  const preto = Math.max(1 - clamp(t / 0.5), clamp((t - (POV.duracao - 0.7)) / 0.7));
  if (preto > 0) { ctx.globalAlpha = preto; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}

window.quadroPOV = function (i, qualidade = 0.9) {
  desenharPOV(i / EP.fps);
  return cv.toDataURL('image/jpeg', qualidade);
};
window.desenharPOV = desenharPOV;
