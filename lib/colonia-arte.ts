import { gerarSprite } from '@/lib/sprite';
import colonia from '@/fabrica/colonia.json';
/**
 * Desenho da colônia no site — o MESMO visual do vídeo (fabrica/diretor.js), adaptado para um mapa
 * interativo: tudo em "pixels do mundo" (1 casa = 16 px), o componente aplica a câmera com setTransform.
 * Mudou o desenho no diretor.js? Ajuste aqui também, para o site e o vídeo continuarem iguais.
 */
export const CASA = 16;

export const COR = {
  ceu: '#140f26', borda: '#3a2f63', areia: '#f6d7a7', texto: '#f3eefe',
  marte: '#e2603b', agua: '#3fd0c9', ouro: '#ffc83d', ok: '#4ed37a', alerta: '#ff4d4d',
};

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const hash = (x: number, y: number, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };

type Ctx = CanvasRenderingContext2D;
type Ret = { x0: number; y0: number; x1: number; y1: number };
type Geo = { x: number; y: number; w: number; h: number };

export function disco(c: Ctx, cx: number, cy: number, r: number, cor: string, achatado = 1) {
  c.fillStyle = cor;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy));
    c.fillRect(Math.round(cx - w), Math.round(cy + dy * achatado), 2 * w + 1, Math.max(1, Math.ceil(achatado)));
  }
}
const ret = (c: Ctx, x: number, y: number, w: number, h: number, cor: string) => { c.fillStyle = cor; c.fillRect(x, y, w, h); };
export const retanguloDe = (o: Geo): Ret => ({ x0: o.x * CASA, y0: o.y * CASA, x1: (o.x + o.w) * CASA, y1: (o.y + o.h) * CASA });

// ------------------------------------------------------------------ sprites fixos (fundadores e itens)
const PALETA: Record<string, string> = {
  K: '#1b1530', W: '#eef0f8', G: '#9aa0b5', g: '#6b6f86', V: '#3fd0c9', O: '#e2603b', o: '#a83d22',
  S: '#e0ac7e', s: '#c68642', H: '#5a3825', T: '#00b8a9', t: '#00796b', P: '#9b59b6', p: '#6c3483',
  Y: '#ffc83d', B: '#3a2f63', N: '#b5651d', R: '#e04f5f', L: '#3f8efc',
  C: '#f2b46a', c: '#9a5418', w: '#fff0d8',   // pet: caramelo claro, caramelo escuro e creme (destaca do chão vermelho)
};
const MAPAS: Record<string, string[]> = {
  vega: ['....GGGG....', '...GWWWWG...', '..GWVVVVWG..', '..GWVSSVWG..', '..GWVVVVWG..', '...GWWWWG...',
         '..oOOYYOOo..', '.SoOOOOOOoS.', '..oOGGGGOo..', '...OO..OO...', '...OO..OO...', '...BB..BB...'],
  lia: ['....pPPp....', '...PPPPPP...', '..PPSSSSPP..', '..PSKSSKSP..', '..PSSSSSSP..', '..P.SSSS.P..',
        '..WWTTTTWW..', '.SWWTTTTWWS.', '..WWTYTTWW..', '...TT..TT...', '...TT..TT...', '...BB..BB...'],
  // pet sentado: tirado da arte nova (fabrica/pet.js), para o ícone do item
  pet: ['...............', '...............', '.........CcCCC.', '.........ccCKC.', '.........ccCCwK', '.........ccwwww', '......CCCVV....', '.....NNCCCY....', '.....NNCCww....', '....CCCCCww....', '....CCCCCww....', '....CCCCCcC....', 'wCCCCCCC.cC....', '...wwww..ww....', '...............'],
  rover: ['........', '..GG....', '..GV....', '.WWWWWW.', 'WWWWWWWW', 'WOOWWOOW', '.KK..KK.', '........'],
  foguete: ['...WW...', '..WWWW..', '..WVVW..', '..WWWW..', '..WOOW..', '.OWWWWO.', '.O.YY.O.', '...YY...'],
  bandeira: ['KTTTTT..', 'KTTTTT..', 'KTYYTT..', 'KTTTTT..', 'K.......', 'K.......', 'K.......', 'KK......'],
  monumento: ['...YY...', '...YY...', '..YYYY..', '..YYYY..', '..YYYY..', '.YYYYYY.', '.GGGGGG.', 'GGGGGGGG'],
  capsula: ['........', '..WWWW..', '.WVVVVW.', 'WWWWWWWW', 'WWOOOOWW', 'WWWWWWWW', '.G....G.', '........'],
  outdoor: ['VVVVVVVV', 'VWVVWWVV', 'VVVVVVVV', 'VVVWWVVV', 'VVVVVVVV', '...GG...', '...GG...', '..GGGG..'],
  traje: ['..WWWW..', '.WVVVVW.', '.WVVVVW.', '..WWWW..', '.OOOOOO.', 'O.OOOO.O', '..O..O..', '..W..W..'],
  presente: ['...YY...', '..Y..Y..', 'PPPYYPPP', 'PPPYYPPP', 'PPPYYPPP', 'PPPYYPPP', 'PPPYYPPP', '........'],
};
const cache = new Map<string, HTMLCanvasElement>();

function canvasDeMatriz(linhas: string[]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = linhas[0].length; c.height = linhas.length;
  const x = c.getContext('2d')!;
  linhas.forEach((l, j) => [...l].forEach((ch, i) => { const v = PALETA[ch]; if (v) { x.fillStyle = v; x.fillRect(i, j, 1, 1); } }));
  return c;
}
export function spriteMapa(nome: string): HTMLCanvasElement {
  const k = 'mapa:' + nome;
  if (!cache.has(k)) cache.set(k, canvasDeMatriz(MAPAS[nome] ?? MAPAS.presente));
  return cache.get(k)!;
}
/** Item com contorno escuro de 1 px (senão some no chão vermelho). */
export function spriteContornado(nome: string): HTMLCanvasElement {
  const k = 'cont:' + nome;
  if (!cache.has(k)) {
    const s = spriteMapa(nome);
    const c = document.createElement('canvas'); c.width = s.width + 2; c.height = s.height + 2;
    const x = c.getContext('2d')!;
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) x.drawImage(s, dx, dy);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = '#1b1530'; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over'; x.drawImage(s, 1, 1);
    cache.set(k, c);
  }
  return cache.get(k)!;
}
const CACHE_ESTATUA = new Map<string, HTMLCanvasElement>();
// Monumento dourado: estátua do próprio colono (o boneco do seed dele, todo em ouro) sobre um pedestal.
const OURO_ESTATUA = ['#fff3c0', '#ffd85a', '#e0a920', '#b07d10', '#7e5206'];
function luminancia(hex: string) { const n = parseInt(hex.slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); }
/** Estátua dourada do colono (14x17 com contorno). */
export function spriteEstatua(seed: number): HTMLCanvasElement {
  const k = 'estatua:' + seed;
  if (!CACHE_ESTATUA.has(k)) {
    const m = gerarSprite(seed);
    const s = document.createElement('canvas'); s.width = 12; s.height = 15;
    const x = s.getContext('2d')!;
    m[7][9] = null; m[8][9] = null;                      // o braço direito sobe com a bandeira
    m.forEach((linha, j) => linha.forEach((v, i) => {
      if (!v) return;
      const claro = luminancia(v) > 170 ? 0 : 1;
      // cabeça clara, corpo médio, pernas escuras; borda direita na sombra; olhos e contorno no tom mais escuro
      let n = v === '#1b1530' ? 4 : (j <= 5 ? 0 : j <= 8 ? 1 : 2) + claro;
      if (i >= 8 && n < 4) n += 1;
      x.fillStyle = OURO_ESTATUA[n]; x.fillRect(i, j, 1, 1);
    }));
    x.fillStyle = OURO_ESTATUA[1]; x.fillRect(9, 4, 1, 3); x.fillRect(10, 2, 1, 3);
    x.fillStyle = OURO_ESTATUA[0]; x.fillRect(10, 0, 1, 2); x.fillStyle = OURO_ESTATUA[1]; x.fillRect(11, 0, 1, 2);
    x.fillStyle = '#b4a6c4'; x.fillRect(2, 12, 8, 1);   // pedestal em degraus
    x.fillStyle = '#9a8aab'; x.fillRect(1, 13, 10, 1);
    x.fillStyle = '#7a6a8a'; x.fillRect(0, 14, 12, 1);
    x.fillStyle = '#ffd85a'; x.fillRect(5, 13, 2, 1);   // plaquinha
    const c = document.createElement('canvas'); c.width = 14; c.height = 17;
    const y = c.getContext('2d')!;
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) y.drawImage(s, dx, dy);
    y.globalCompositeOperation = 'source-in'; y.fillStyle = '#1b1530'; y.fillRect(0, 0, 14, 17);
    y.globalCompositeOperation = 'source-over'; y.drawImage(s, 1, 1);
    CACHE_ESTATUA.set(k, c);
  }
  return CACHE_ESTATUA.get(k)!;
}

export function iconeDoProduto(slug: string): string {
  const s = (slug || '').toLowerCase();
  if (s.includes('comercio')) return 'comercio';
  for (const k of ['pet', 'rover', 'foguete', 'monumento', 'capsula', 'outdoor', 'traje']) if (s.includes(k)) return k;
  if (/bandeira|satelite|festa/.test(s)) return 'bandeira';
  return 'presente';
}

// ------------------------------------------------------------------ terreno (em blocos de 32x32 casas, com cache)
export const BLOCO = 32;
const SOLOS = ['#b85a37', '#bc5e3a', '#b35538', '#c0623d'];

export type Reservado = Ret;   // em casas: onde não nasce cratera (base, obras, lotes)

// Colina embaixo de uma obra (colonia.json → obras[].colina): degraus de terra vistos de cima, luz vindo do
// noroeste (borda de cima clara) e sombra no sudeste. MESMA arte em fabrica/diretor.js (colinaEm): mude as duas juntas.
function colinaEm(t: Ctx, cx: number, cy: number, rx: number, ry: number, semente: number) {
  const NIVEIS = ['#a95234', '#b8603a', '#c46c44', '#cf7a4f', '#d98a5c'];
  for (let i = 0; i < NIVEIS.length; i++) {
    const k = 1 - i * 0.19, ax = rx * k, ay = ry * k, oy = -i * 3;
    t.fillStyle = '#7e3a26'; t.beginPath(); t.ellipse(cx + 3, cy + oy + 5, ax, ay, 0, 0, Math.PI * 2); t.fill();     // sombra do degrau
    t.fillStyle = NIVEIS[i]; t.beginPath(); t.ellipse(cx, cy + oy, ax, ay, 0, 0, Math.PI * 2); t.fill();
    t.strokeStyle = '#e6a07a'; t.lineWidth = 2; t.beginPath(); t.ellipse(cx, cy + oy, ax - 1, ay - 1, 0, Math.PI * 1.05, Math.PI * 1.75); t.stroke();   // brilho
  }
  for (let i = 0; i < 26; i++) {   // pedrinhas e marcas na encosta
    const a = (i / 26) * Math.PI * 2 + semente, rr = 0.35 + ((i * 37) % 10) / 16;
    const x = Math.round(cx + Math.cos(a) * rx * rr), y = Math.round(cy + Math.sin(a) * ry * rr - 4);
    t.fillStyle = i % 3 ? '#8f4129' : '#e6a07a'; t.fillRect(x, y, i % 4 ? 2 : 3, 2);
  }
}

// Dunas do Norte (bioma): começam logo depois da última faixa do bairro (y < DUNAS_Y, em casas) e vão ficando
// mais fortes para o norte. Cristas onduladas iluminadas, vales em sombra e ondinhas de vento.
// MESMA arte em fabrica/diretor.js: mude os dois juntos.
const DUNAS_Y = -27, DUNAS_FADE = 7;
function dunaEm(wx: number, wy: number): string | null {   // wx, wy em casas (podem ser fracionários); devolve a cor ou null
  if (wy > DUNAS_Y) return null;
  const k = Math.min(1, (DUNAS_Y - wy) / DUNAS_FADE);
  if (k < 1 && hash(Math.floor(wx * 2), Math.floor(wy * 2), 31) > k * 1.3) return null;   // borda irregular
  const onda = Math.sin(wx * 0.32 + Math.sin(wy * 0.21 + wx * 0.05) * 2.2 + wy * 0.95);
  const fino = Math.sin(wx * 1.7 + wy * 3.1);
  if (onda > 0.86) return '#f2c08e';
  if (onda > 0.55) return '#e3a571';
  if (onda < -0.7) return '#b4683f';
  if (onda < -0.35) return '#c87b4d';
  return fino > 0.9 ? '#e8b07c' : '#d8955f';
}
function pintarDuna(t: Ctx, x: number, y: number, px: number, py: number) {   // a casa (x, y) em 4x4 pedacinhos de 4 px
  if (y > DUNAS_Y + 1) return;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const c = dunaEm(x + (i + 0.5) / 4, y + (j + 0.5) / 4);
    if (c) { t.fillStyle = c; t.fillRect(px + i * 4, py + j * 4, 4, 4); }
  }
}

export function blocoDeTerreno(bx: number, by: number, livre: (x: number, y: number) => boolean,
                               lote: (x: number, y: number) => boolean,
                               rua: (x: number, y: number) => boolean = () => false): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = BLOCO * CASA;
  const t = c.getContext('2d')!;
  const x0 = bx * BLOCO, y0 = by * BLOCO;
  for (let y = y0; y < y0 + BLOCO; y++) for (let x = x0; x < x0 + BLOCO; x++) {
    const px = (x - x0) * CASA, py = (y - y0) * CASA;
    if (lote(x, y)) {   // bairro: ruas de terra batida e lotes em xadrez
      if (rua(x, y)) {
        t.fillStyle = '#cd8a62'; t.fillRect(px, py, CASA, CASA);
        t.fillStyle = '#d99a72'; if (hash(x, y, 5) < 0.5) t.fillRect(px + Math.floor(hash(x, y, 6) * 13), py + Math.floor(hash(x, y, 7) * 13), 2, 1);
      } else { t.fillStyle = (x + y) % 2 ? '#c4693f' : '#b85f39'; t.fillRect(px, py, CASA, CASA); }
      continue;
    }
    t.fillStyle = SOLOS[Math.floor(hash(x, y) * SOLOS.length)];
    t.fillRect(px, py, CASA, CASA);
    for (let k = 0; k < 3; k++) {
      const h = hash(x, y, k + 1);
      if (h < 0.55) {
        t.fillStyle = h < 0.3 ? '#a24c30' : '#cf7650';
        t.fillRect(px + Math.floor(hash(x, y, k + 9) * 15), py + Math.floor(hash(x, y, k + 19) * 15), h < 0.12 ? 2 : 1, 1);
      }
    }
    pintarDuna(t, x, y, px, py);
  }
  // colinas embaixo das obras (podem passar da borda do bloco: cada bloco desenha a parte dele)
  for (const o of colonia.obras as Array<{ x: number; y: number; w: number; h: number; colina?: { dx?: number; dy?: number; rx: number; ry: number } }>) {
    if (!o.colina) continue;
    const k = o.colina, cx = (o.x + o.w / 2 + (k.dx || 0) - x0) * CASA, cy = (o.y + o.h / 2 + (k.dy || 0) - y0) * CASA;
    if (cx < -k.rx * CASA - 20 || cy < -k.ry * CASA - 20 || cx > BLOCO * CASA + k.rx * CASA + 20 || cy > BLOCO * CASA + k.ry * CASA + 20) continue;
    colinaEm(t, cx, cy, k.rx * CASA, k.ry * CASA, o.x);
  }
  // crateras e pedras (podem passar da borda do bloco: o vizinho desenha a parte dele)
  for (let y = y0 - 2; y < y0 + BLOCO + 2; y++) for (let x = x0 - 2; x < x0 + BLOCO + 2; x++) {
    if (!livre(x, y)) continue;
    if (y < DUNAS_Y - 1 && hash(x, y, 33) > 0.12) continue;   // nas dunas quase não há crateras/pedras
    const h = hash(x, y, 7), px = (x - x0) * CASA + 8, py = (y - y0) * CASA + 8;
    if (h < 0.012) {
      const r = 6 + Math.floor(hash(x, y, 8) * 16);
      disco(t, px, py + 1, r + 1, '#d98a62'); disco(t, px, py, r, '#8f4129'); disco(t, px + 1, py + 2, r - 2, '#a14b2f');
    } else if (h < 0.06) {
      ret(t, px - 3, py - 1, 6, 3, '#7a3a24'); ret(t, px - 2, py - 2, 3, 1, '#c9805c');
    }
  }
  return c;
}

/** Cratera batizada (item "Nomeie sua Cratera"): mesma arte de crateraBatizada em fabrica/diretor.js. */
export function crateraBatizada(t: Ctx, px: number, py: number, r: number, id: number) {
  disco(t, px, py + 3, r + 4, '#d98a62', 0.62);
  disco(t, px, py + 2, r + 1, '#e7a17a', 0.6);
  disco(t, px, py, r, '#7d3722', 0.6);
  disco(t, px + 2, py + 3, r - 4, '#8f4129', 0.55);
  disco(t, px + 4, py + 5, Math.floor(r * 0.55), '#a14b2f', 0.5);
  disco(t, px - Math.floor(r * 0.35), py - 2, Math.floor(r * 0.18), '#6b2f1d', 0.5);
  for (let k = 0; k < 9; k++) {   // pedras na borda
    const a = k * 0.7 + hash(id, k, 3) * 0.5, d = r + 3 + hash(id, k, 4) * 6;
    const x = Math.round(px + Math.cos(a) * d), y = Math.round(py + Math.sin(a) * d * 0.62 + 2);
    ret(t, x - 2, y - 1, 4 + (k % 2) * 2, 3, '#7a3a24');
    ret(t, x - 1, y - 2, 2, 1, '#c9805c');
  }
  const mx = px + Math.round(r * 0.72), my = py - Math.round(r * 0.62) - 2;   // marco com bandeirinha
  ret(t, mx - 2, my + 1, 6, 2, 'rgba(0,0,0,0.25)');
  ret(t, mx, my - 14, 2, 15, '#d8dbe8');
  ret(t, mx + 2, my - 14, 8, 5, '#ffc83d');
  ret(t, mx + 2, my - 10, 8, 1, '#e2a82a');
}

// ------------------------------------------------------------------ módulo de pouso e obras
export function desenharBase(c: Ctx, b: Geo, t: number, energia: boolean) {
  const cx = (b.x + b.w / 2) * CASA, cy = (b.y + b.h / 2) * CASA, y = cy;
  disco(c, cx, cy + 22, 26, 'rgba(0,0,0,0.25)', 0.3);
  for (const s of [-1, 1]) { ret(c, cx + s * 17 - 1, y + 8, 3, 14, '#6b6f86'); ret(c, cx + s * 22 - 2, y + 20, 6, 3, '#4a4d60'); }
  disco(c, cx, y, 23, '#6b6f86'); disco(c, cx, y, 21, '#e4e6f0'); disco(c, cx + 3, y + 4, 17, '#d2d5e2');
  c.fillStyle = COR.marte;
  for (let dy = 3; dy <= 7; dy++) { const w = Math.floor(Math.sqrt(21 * 21 - dy * dy)); c.fillRect(cx - w, y + dy, 2 * w + 1, 1); }
  for (const dx of [-11, -3, 5]) {
    if (energia) { c.globalAlpha = 0.3 + 0.1 * Math.sin(t * 3 + dx); ret(c, cx + dx - 2, y - 10, 10, 10, '#ffd84a'); c.globalAlpha = 1; }
    ret(c, cx + dx, y - 8, 6, 6, energia ? '#ffe58a' : '#2b2350');
  }
  disco(c, cx, y - 14, 5, '#9aa0b5');
  ret(c, cx - 1, y - 28, 2, 14, '#9aa0b5');
  if (Math.floor(t * 1.5) % 2 === 0) ret(c, cx - 2, y - 30, 4, 3, '#ff4d4d');
  ret(c, cx - 5, y + 19, 10, 6, '#9aa0b5');   // rampa
}

export type EstadoObra = { p: number; dem: boolean; energia: boolean };

function demarcacao(c: Ctx, r: Ret, t: number) {
  c.globalAlpha = 0.75 + 0.25 * Math.sin(t * 5);
  c.fillStyle = COR.areia;
  for (let x = r.x0; x < r.x1; x += 8) { c.fillRect(x, r.y0, 4, 1); c.fillRect(x, r.y1 - 1, 4, 1); }
  for (let y = r.y0; y < r.y1; y += 8) { c.fillRect(r.x0, y, 1, 4); c.fillRect(r.x1 - 1, y, 1, 4); }
  c.globalAlpha = 1;
  for (const [x, y] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]]) { ret(c, x - 1, y - 6, 2, 7, '#6b4a2e'); ret(c, x - 2, y - 7, 4, 2, COR.ouro); }
}

function cabo(c: Ctx, r: Ret, base: Geo, t: number, energia: boolean) {
  const b = retanguloDe(base);
  const x0 = r.x0, y0 = Math.round((r.y0 + r.y1) / 2), x1 = b.x1 - 6, y1 = Math.round((b.y0 + b.y1) / 2) + 4;
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3);
  for (let i = 0; i <= n; i++) {
    const k = i / n, x = lerp(x0, x1, k), y = lerp(y0, y1, k) + Math.sin(k * Math.PI) * 6;
    ret(c, Math.round(x), Math.round(y), 2, 2, '#2a2140');
    if (energia && ((k * 6 - t * 1.6) % 1 + 1) % 1 < 0.08) ret(c, Math.round(x) - 1, Math.round(y) - 1, 4, 4, '#ffd84a');
  }
}

export function desenharObra(c: Ctx, o: Geo & { tipo: string }, st: EstadoObra, base: Geo, t: number) {
  const r = retanguloDe(o);
  if (st.dem && st.p < 1) demarcacao(c, r, t);
  if (o.tipo === 'solar') {
    const cols = o.w, linhas = o.h - 1, N = cols * linhas, vis = st.p * N;
    for (let k = 0; k < N && k < vis; k++) {
      const col = k % cols, l = Math.floor(k / cols);
      const x = r.x0 + col * CASA + 1, y = r.y0 + 8 + l * CASA;
      ret(c, x + 6, y + 10, 2, 3, '#3a2f63');
      ret(c, x, y, 14, 10, '#9aa0b5');
      const brilho = st.energia && ((t * 1.4 + col * 0.18 + l * 0.11) % 2.4) < 0.22;
      ret(c, x + 1, y + 1, 12, 8, brilho ? '#7d9cf0' : '#22357a');
      c.fillStyle = '#4766c8'; c.fillRect(x + 5, y + 1, 1, 8); c.fillRect(x + 9, y + 1, 1, 8); c.fillRect(x + 1, y + 5, 12, 1);
      if (st.energia && Math.floor(t * 2 + k) % 4 === 0) ret(c, x + 12, y + 1, 1, 1, COR.ok);
    }
    if (st.p >= 1) cabo(c, r, base, t, st.energia);
  } else if (o.tipo === 'antena') {
    if (st.p <= 0) return;
    const cx = (r.x0 + r.x1) / 2, chao = r.y1 - 4, alt = (r.y1 - r.y0 - 14) * clamp(st.p / 0.85);
    ret(c, cx - 10, chao, 20, 4, '#6b6f86');
    for (let y = 0; y < alt; y += 2) {
      const w = lerp(8, 2, y / (r.y1 - r.y0));
      ret(c, cx - w, chao - y, 1, 2, '#9aa0b5'); ret(c, cx + w, chao - y, 1, 2, '#9aa0b5');
      if (y % 8 === 0) ret(c, cx - w, chao - y, 2 * w, 1, '#6b6f86');
    }
    if (st.p > 0.85) { disco(c, cx + 6, chao - alt - 2, 7, '#e4e6f0', 0.6); ret(c, cx + 5, chao - alt - 2, 2, 2, '#6b6f86'); }
    if (st.energia && Math.floor(t * 2) % 2 === 0) ret(c, cx - 2, chao - alt - 6, 4, 4, '#ff4d4d');
  } else if (PINTORES[o.tipo]) {
    predioEmObra(c, r, st, t, PINTORES[o.tipo]);
  } else {   // estufa (e qualquer obra nova sem desenho próprio)
    if (st.p <= 0) return;
    const colunas = o.w * 2, larg = (r.x1 - r.x0 - 4) / colunas, H = r.y1 - r.y0 - 12;   // sobe de baixo para cima
    const alt = Math.max(2, st.p * H), topo = r.y1 - 6 - alt;
    ret(c, r.x0 + 2, r.y1 - 6, r.x1 - r.x0 - 4, 4, '#6b6f86');
    for (let i = 0; i < colunas; i++) {
      const x = r.x0 + 2 + i * larg;
      c.globalAlpha = 0.55; ret(c, x, topo, larg - 1, alt, '#8fe6ff'); c.globalAlpha = 1;
      ret(c, x, topo, 1, alt, '#eef0f8');
      for (let j = 0; j < 3; j++) { const y = r.y0 + 14 + j * 12; if (y >= topo) ret(c, x + 3, y, 4, 4, j % 2 ? '#2bb673' : '#4ed37a'); }
    }
    if (st.p < 1) ret(c, r.x0 + 2, topo - 1, r.x1 - r.x0 - 4, 2, '#ffc83d');
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// ------------------------------------------------------------------ obras 4 a 10 (mesmo código no site e no vídeo)
// Gerado a partir de um só texto: lib/colonia-arte.ts (TypeScript) e fabrica/diretor.js (sem os tipos).
// O prédio sobe de baixo para cima conforme o progresso, com andaime enquanto não termina.
const PR = (c: any, x: any, y: any, w: any, h: any, cor: any) => { c.fillStyle = cor; c.fillRect(Math.round(x), Math.round(y), w, h); };
function PD(c: any, cx: any, cy: any, r: any, cor: any, ach: any = 1, metade: any = false) {
  c.fillStyle = cor;
  for (let dy = -r; dy <= (metade ? 0 : r); dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy));
    c.fillRect(Math.round(cx - w), Math.round(cy + dy * ach), 2 * w + 1, Math.max(1, Math.ceil(ach)));
  }
}
function fumaca(c: any, x: any, y: any, t: any, n: any) {
  for (let i = 0; i < n; i++) {
    const k = (t * 0.5 + i / n) % 1;
    c.globalAlpha = 0.55 * (1 - k);
    PD(c, x + Math.sin(t * 2 + i) * 2, y - k * 18, 2 + Math.floor(k * 3), '#f3eefe');
  }
  c.globalAlpha = 1;
}

export function predioEmObra(c: any, r: any, st: any, t: any, pintar: any) {
  if (st.p <= 0) return;
  const W = r.x1 - r.x0, H = r.y1 - r.y0;
  PR(c, r.x0 + 1, r.y1 - 4, W - 2, 4, '#7a7f96');                       // fundação
  const topo = r.y1 - Math.max(4, st.p * H);
  c.save(); c.beginPath(); c.rect(r.x0 - 10, topo, W + 20, r.y1 - topo + 10); c.clip();
  pintar(c, r, st, t);
  c.restore();
  if (st.p < 1) {                                                        // andaime
    for (const x of [r.x0 + 1, r.x1 - 3]) PR(c, x, topo - 2, 2, r.y1 - topo + 2, '#6b4a2e');
    PR(c, r.x0 + 1, topo - 2, W - 2, 2, '#ffc83d');
    if (Math.floor(t * 4) % 2) PR(c, r.x0 + 4 + ((t * 30) % Math.max(1, W - 8)), topo - 4, 2, 2, '#ffe58a');
  }
}

function pintarGelo(c: any, r: any, st: any, t: any) {
  const x = r.x0, y = r.y0, cx = r.x0 + 50;
  PR(c, x + 4, y + 16, 22, 28, '#9aa0b5'); PR(c, x + 6, y + 18, 18, 24, '#c9ced9');
  if (st.energia) { PR(c, x + 6, y + 28 + Math.round(Math.sin(t * 2)), 18, 14, '#3fd0c9'); PR(c, x + 8, y + 30, 6, 1, '#8fe6ff'); }
  PD(c, x + 15, y + 16, 11, '#e4e6f0', 0.35);
  PR(c, x + 26, y + 36, 16, 3, '#6b6f86');
  for (let k = 0; k < 34; k += 2) {
    const w = 9 - k * 0.18;
    PR(c, cx - w, y + 6 + k, 1, 2, '#9aa0b5'); PR(c, cx + w, y + 6 + k, 1, 2, '#9aa0b5');
    if (k % 8 === 0) PR(c, cx - w, y + 6 + k, 2 * w, 1, '#6b6f86');
  }
  PR(c, cx - 4, y + 2, 8, 5, '#e2603b');
  PR(c, cx - 7, r.y1 - 12, 14, 8, '#6b6f86');
  if (st.energia) PR(c, cx - 1 + (Math.floor(t * 8) % 2), r.y1 - 4, 2, 4, '#ffc83d');
}

function pintarOxigenio(c: any, r: any, st: any, t: any) {
  PR(c, r.x0 + 2, r.y1 - 8, r.x1 - r.x0 - 4, 3, '#6b6f86');
  for (let i = 0; i < 3; i++) {
    const x = r.x0 + 4 + i * 14;
    PR(c, x, r.y0 + 14, 12, 28, '#e4e6f0'); PR(c, x + 1, r.y0 + 14, 2, 28, '#ffffff');
    PR(c, x, r.y0 + 26, 12, 4, '#3fd0c9');
    PD(c, x + 6, r.y0 + 14, 6, '#c9ced9', 0.4);
    if (st.energia && Math.floor(t * 2 + i) % 3 === 0) PR(c, x + 5, r.y0 + 32, 2, 2, '#4ed37a');
  }
  if (st.energia) for (let i = 0; i < 3; i++) fumaca(c, r.x0 + 10 + i * 14, r.y0 + 10, t + i * 0.7, 3);
}

function pintarOficina(c: any, r: any, st: any, t: any) {
  const x = r.x0, y = r.y0, W = r.x1 - r.x0;
  PR(c, x + 4, y + 16, W - 8, 28, '#9aa0b5'); PR(c, x + 2, y + 10, W - 4, 7, '#6b6f86');
  PR(c, x + 24, y + 22, 32, 22, '#2a2140');
  const aberto = st.energia ? 0.45 + 0.15 * Math.sin(t * 0.8) : 0;
  if (aberto) { c.globalAlpha = 0.5; PR(c, x + 26, r.y1 - 8, 28, 6, '#ffe58a'); c.globalAlpha = 1; }
  const alt = Math.round(22 * (1 - aberto));
  for (let k = 0; k < alt; k += 3) PR(c, x + 24, y + 22 + k, 32, 2, '#c9ced9');
  PR(c, x + 8, y + 22, 11, 7, '#ffc83d'); PR(c, x + 10, y + 24, 7, 3, '#1b1530');
  PR(c, x + 62, y + 22, 10, 8, st.energia ? '#ffe58a' : '#2b2350');
}

function pintarCantina(c: any, r: any, st: any, t: any) {
  const cx = (r.x0 + r.x1) / 2, chao = r.y1 - 4;
  PD(c, cx, chao, 24, '#6b6f86', 1, true); PD(c, cx, chao, 22, '#f4b46b', 1, true); PD(c, cx + 3, chao, 16, '#e89a55', 1, true);
  for (const dx of [-14, -2, 10]) PR(c, cx + dx, chao - 12, 5, 5, st.energia ? '#ffe58a' : '#2b2350');
  PR(c, cx - 4, chao - 9, 8, 9, '#3a2f63');
  PR(c, cx + 12, r.y0 + 4, 4, 14, '#6b6f86');
  if (st.energia) fumaca(c, cx + 14, r.y0 + 3, t, 3);
}

function pintarEnfermaria(c: any, r: any, st: any, t: any) {
  const cx = (r.x0 + r.x1) / 2;
  PR(c, r.x0 + 3, r.y0 + 12, 42, 32, '#b9bdcc'); PR(c, r.x0 + 4, r.y0 + 13, 40, 30, '#eef0f8');
  PR(c, r.x0 + 2, r.y0 + 9, 44, 4, '#c9ced9');
  PR(c, cx - 2, r.y0 + 16, 4, 12, '#e04f5f'); PR(c, cx - 6, r.y0 + 20, 12, 4, '#e04f5f');
  PR(c, cx - 4, r.y1 - 13, 8, 11, '#3fd0c9');
  if (st.energia && Math.floor(t * 1.5) % 2 === 0) PR(c, r.x1 - 9, r.y0 + 5, 4, 4, '#4ed37a');
}

function pintarAbrigo(c: any, r: any, st: any, t: any) {
  const cx = (r.x0 + r.x1) / 2, W = r.x1 - r.x0;
  for (let fila = 0; fila < 6; fila++) {
    const y = r.y1 - 8 - fila * 6, larg = W - 4 - fila * 9, x0 = cx - larg / 2;
    for (let x = x0; x < x0 + larg - 2; x += 8) {
      PR(c, x, y, 8, 6, '#5e2c1b');
      PR(c, x + 1, y + 1, 6, 4, (fila + Math.floor(x / 8)) % 2 ? '#a0613f' : '#b8754f');
    }
  }
  PR(c, cx - 6, r.y1 - 13, 12, 13, '#2a2140');
  for (let i = 0; i < 4; i++) PR(c, cx - 6 + i * 3, r.y1 - 16, 3, 3, i % 2 ? '#1b1530' : '#ffc83d');
  PR(c, cx + 10, r.y0 + 6, 3, 8, '#6b6f86');
  if (st.energia && Math.floor(t * 2) % 2 === 0) PR(c, cx + 10, r.y0 + 4, 3, 2, '#4ed37a');
}

function pintarLaboratorio(c: any, r: any, st: any, t: any) {
  const x = r.x0, chao = r.y1 - 2;
  PR(c, x + 4, chao - 14, 56, 14, '#c9ced9'); PR(c, x + 5, chao - 13, 54, 12, '#e4e6f0');
  PD(c, x + 22, chao - 14, 16, '#eef0f8', 1, true);
  c.globalAlpha = 0.75; PD(c, x + 22, chao - 14, 14, '#8fe6ff', 1, true); c.globalAlpha = 1;
  PR(c, x + 15, chao - 22, 2, 2, '#ffffff');
  PR(c, x + 47, chao - 30, 4, 16, '#9aa0b5');
  PR(c, x + 42, chao - 36, 16, 6, '#6b6f86'); PR(c, x + 56, chao - 35, 3, 4, '#3fd0c9');
  for (let i = 0; i < 5; i++) {
    const aceso = st.energia && Math.floor(t * 3 + i * 1.7) % 3 === 0;
    PR(c, x + 8 + i * 10, chao - 8, 3, 3, aceso ? (i % 2 ? '#4ed37a' : '#ffc83d') : '#6b6f86');
  }
}

export const PINTORES: any = {
  gelo: pintarGelo, oxigenio: pintarOxigenio, oficina: pintarOficina, cantina: pintarCantina,
  enfermaria: pintarEnfermaria, abrigo: pintarAbrigo, laboratorio: pintarLaboratorio,
};

/** Trilha do módulo de pouso, passando pela praça, até a primeira casa do bairro (ao sul). */
export function desenharTrilha(c: Ctx, b: Geo, ateY: number) {
  for (let y = b.y + b.h; y < ateY; y++) ret(c, (b.x + Math.floor(b.w / 2)) * CASA - 6, y * CASA, 12, CASA, '#cd7a52');
}

/** Praça da colônia: piso de placas, bancos e um mastro com a bandeira. */
export function desenharPraca(c: Ctx, p: Geo, t: number) {
  const r = retanguloDe(p);
  for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++)
    ret(c, x * CASA, y * CASA, CASA, CASA, (x + y) % 2 ? '#d9a47e' : '#cf9670');
  c.strokeStyle = '#8f5a3f'; c.lineWidth = 1; c.strokeRect(r.x0 + 0.5, r.y0 + 0.5, r.x1 - r.x0 - 1, r.y1 - r.y0 - 1);
  for (const bx of [r.x0 + 6, r.x1 - 18]) { ret(c, bx, r.y1 - 10, 12, 3, '#6b4a2e'); ret(c, bx + 1, r.y1 - 7, 2, 3, '#4a3020'); ret(c, bx + 9, r.y1 - 7, 2, 3, '#4a3020'); }
  const mx = (r.x0 + r.x1) / 2, my = r.y0 + 10;
  ret(c, mx - 1, my - 14, 2, 16, '#9aa0b5');
  const onda = Math.sin(t * 3) > 0 ? 1 : 0;
  ret(c, mx + 1, my - 14, 8, 5 + onda, COR.marte); ret(c, mx + 3, my - 13, 3, 2, COR.ouro);
  disco(c, mx, my + 3, 3, '#6b6f86');
}

// ------------------------------------------------------------------ clima (em coordenadas da TELA)
const CLIMA: Record<string, { n: number; vel: number; cor: string; tinta: [string, number] | null; cai: boolean; risco: boolean; grande?: boolean }> = {
  redemoinho: { n: 46, vel: 1, cor: '#f6d7a7', tinta: null, cai: false, risco: false },
  tempestade: { n: 170, vel: 2.2, cor: '#ffe2b8', tinta: ['#b5562b', 0.22], cai: false, risco: true },
  vento: { n: 95, vel: 3.2, cor: '#f6d7a7', tinta: ['#7a5a48', 0.08], cai: false, risco: true },
  geada: { n: 140, vel: 0.35, cor: '#ffffff', tinta: ['#a9d2f2', 0.24], cai: true, risco: false, grande: true },
};

export function desenharClima(c: Ctx, efeito: string, forte: boolean, t: number, W: number, H: number) {
  const base = CLIMA[efeito] ?? CLIMA.redemoinho;
  const k = forte ? 1.5 : 1;
  const n = Math.round(base.n * k * Math.min(2, (W * H) / (1080 * 1920) * 2.2));
  if (base.tinta) { c.globalAlpha = Math.min(0.35, base.tinta[1] * k); ret(c, 0, 0, W, H, base.tinta[0]); }
  for (let i = 0; i < n; i++) {
    const vel = (30 + hash(i, 1) * 70) * base.vel;
    let x: number, y: number;
    if (base.cai) {
      x = (hash(i, 2) * W + Math.sin(t * 0.9 + i) * 24 + W) % W;
      y = ((hash(i, 3) * H + t * (40 + hash(i, 6) * 60)) % (H + 20)) - 10;
    } else {
      x = ((hash(i, 2) * W + t * vel) % (W + 40)) - 20;
      y = (hash(i, 3) * H + Math.sin(t * 0.8 + i) * 30 + H) % H;
    }
    c.globalAlpha = base.grande ? 0.45 + hash(i, 4) * 0.4 : 0.18 + hash(i, 4) * 0.25;
    if (base.grande) { const s = 3 + Math.floor(hash(i, 5) * 3); ret(c, x, y, s, s, base.cor); continue; }
    const w = base.risco ? 8 + Math.floor(hash(i, 5) * 4) * 3 : 3 + Math.floor(hash(i, 5) * 3);
    ret(c, x, y, w, base.risco ? 1.5 : 3, base.cor);
  }
  c.globalAlpha = 1;
}

// ------------------------------------------------------------------ cápsulas (variantes da casa do colono)
// Quem compra a cápsula habitacional troca a casinha do lote pela cápsula escolhida. A MESMA arte está em
// fabrica/diretor.js (desenharCapsula): mude as duas juntas. Variantes: lib/mundo.ts → VARIANTES_CAPSULA.

/** Cápsula num lote de 16 px (x, y = canto do lote). `cor` = cor do colono (telhado), `luz` = janela acesa. */
export function desenharCapsula(c: Ctx, x: number, y: number, variante: string, cor: string, luz: boolean) {
  const R = (a: number, b: number, w: number, h: number, k: string) => { c.fillStyle = k; c.fillRect(x + a, y + b, w, h); };
  const D = (a: number, b: number, r: number, k: string) => disco(c, x + a, y + b, r, k);
  const janela = luz ? '#ffe58a' : '#2b2350';
  R(0, 13, 15, 2, 'rgba(0,0,0,0.25)');
  if (variante === 'estufa') {                     // cúpula de vidro cheia de plantas
    D(7, 8, 6, '#2f6b7e'); D(7, 8, 5, '#9fe7ff');
    D(4, 9, 2, '#2bb673'); D(10, 9, 2, '#2bb673'); D(7, 6, 2, '#5fd38a'); R(9, 5, 1, 1, '#ff7f50'); R(4, 7, 1, 1, '#ffd85a');
    R(4, 4, 2, 1, '#ffffff'); R(3, 5, 1, 1, '#ffffff');
    R(1, 11, 13, 2, '#6b6f86'); R(2, 11, 11, 1, cor); R(6, 10, 3, 3, '#3a2f63');
  } else if (variante === 'observatorio') {        // cúpula escura com a fenda aberta e o telescópio
    R(1, 10, 13, 3, '#6b6f86'); R(1, 10, 13, 1, cor);
    D(7, 8, 6, '#3b3f5c'); D(7, 8, 5, '#5a5f84');
    R(6, 2, 3, 7, '#22253a');
    c.fillStyle = '#c9cde0'; for (let i = 0; i < 4; i++) c.fillRect(x + 7 + i, y + 6 - i * 1.5, 2, 2);   // tubo do telescópio
    R(11, 0, 2, 2, '#ffe58a');
    R(3, 9, 2, 2, janela); R(10, 9, 2, 2, janela); R(6, 10, 3, 3, '#22253a');
  } else if (variante === 'dupla') {                // duas cúpulas ligadas por um túnel
    R(4, 9, 7, 3, '#b9bccc'); R(4, 9, 7, 1, '#e4e6f0');
    D(4, 9, 4, '#6b6f86'); D(4, 9, 3, '#e4e6f0'); D(11, 8, 4, '#6b6f86'); D(11, 8, 3, '#e4e6f0');
    R(1, 9, 7, 1, cor); R(8, 8, 7, 1, cor);
    R(3, 10, 2, 3, '#3a2f63'); R(10, 6, 2, 2, janela); R(3, 6, 1, 1, janela);
    R(13, 2, 1, 3, '#9a9db0'); R(13, 1, 1, 1, '#e04f5f');
  } else {                                          // clássica: cúpula maior, faixa dourada, antena e painel solar
    D(7, 8, 7, '#6b6f86'); D(7, 8, 6, '#f2f3f8');
    R(1, 8, 13, 2, cor); R(1, 10, 13, 1, '#ffd85a');
    R(6, 9, 3, 4, '#3a2f63'); R(3, 5, 2, 2, janela); R(10, 5, 2, 2, janela);
    R(7, -2, 1, 3, '#9a9db0'); R(7, -3, 1, 1, '#e04f5f');
    R(12, 11, 4, 2, '#3f5fae'); R(12, 11, 4, 1, '#8fb3ff');
  }
}

// ------------------------------------------------------------------ itens comprados no mapa (arte nova)
// Tudo em pixels do mundo (1 casa = 16 px). O colono tem 12 px de altura: o rover e o foguete são bem maiores.
const CONT = '#1b1530';
const cacheItens = new Map<string, HTMLCanvasElement>();
/** Desenha num canvas próprio e passa o contorno escuro de 1 px em volta (fica legível no chão vermelho). */
function comContorno(chave: string, w: number, h: number, pintar: (R: (x: number, y: number, w: number, h: number, k: string) => void, c: Ctx) => void) {
  let s = cacheItens.get(chave);
  if (s) return s;
  const base = document.createElement('canvas'); base.width = w; base.height = h;
  const b = base.getContext('2d')!;
  pintar((x, y, ww, hh, k) => { b.fillStyle = k; b.fillRect(x, y, ww, hh); }, b);
  s = document.createElement('canvas'); s.width = w; s.height = h;
  const x = s.getContext('2d')!;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) x.drawImage(base, dx, dy);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = CONT; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'source-over'; x.drawImage(base, 0, 0);
  cacheItens.set(chave, s);
  return s;
}

/** Rover (30x20, de lado, frente para a direita). `roda` = quadro do giro das rodas (0..3). */
function spriteRover(roda: number) {
  return comContorno(`rover:${roda}`, 30, 20, (R, c) => {
    R(5, 4, 1, 4, '#9aa0b5'); R(3, 3, 5, 1, '#c9cde0');                    // antena de prato
    R(10, 2, 1, 6, '#9aa0b5'); R(9, 1, 3, 2, '#eef0f8'); R(11, 1, 1, 1, '#2b2350');   // mastro da câmera
    R(3, 7, 11, 2, '#3f5fae'); R(3, 7, 11, 1, '#8fb3ff');                  // painel solar
    R(15, 3, 11, 6, '#eef0f8'); R(16, 4, 9, 4, '#3fd0c9'); R(17, 4, 3, 1, '#bff6f2');   // cabine e janela
    R(2, 9, 26, 5, '#eef0f8'); R(2, 13, 26, 1, '#9aa0b5');                 // carroceria
    R(2, 11, 26, 1, '#e2603b');                                            // faixa
    R(27, 10, 1, 1, '#ffd85a'); R(27, 12, 1, 1, '#ffd85a');                // faróis
    for (const cx of [7, 15, 23]) {                                        // três rodas
      disco(c, cx, 16, 3, '#2e323b'); disco(c, cx, 16, 1, '#c9cde0');
      const [dx, dy] = [[0, -2], [2, 0], [0, 2], [-2, 0]][(roda + cx) % 4];
      R(cx + dx, 16 + dy, 1, 1, '#6b6f86');
    }
  });
}
/** Onde fica a janela da cabine no rover (relativo aos pés do rover, virado para a direita). */
export const JANELA_ROVER = { x: 1, y: -15, w: 9, h: 4 };
/**
 * Rover com os pés (chão, no meio) em (x, y). `cabeca`: sprite 12x12 do colono dirigindo (só a cabeça aparece
 * na janela). Andando: rodas giram, chacoalha e solta poeira.
 */
export function desenharRover(c: Ctx, x: number, y: number, dir: 1 | -1, t: number, andando: boolean, cabeca?: HTMLCanvasElement | null) {
  const roda = andando ? Math.floor(t * 10) % 4 : 0, sacode = andando && Math.floor(t * 8) % 2 ? -1 : 0;
  c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(Math.round(x - 14), Math.round(y - 1), 28, 2);
  if (andando) for (let i = 0; i < 3; i++) {   // poeira atrás
    const k = (t * 2 + i / 3) % 1;
    c.globalAlpha = 0.5 * (1 - k); c.fillStyle = '#e8b48c';
    c.fillRect(Math.round(x - dir * (15 + k * 8)), Math.round(y - 3 - k * 4), 2 + Math.round(k * 2), 2); c.globalAlpha = 1;
  }
  c.save(); c.translate(Math.round(x), Math.round(y + sacode)); if (dir < 0) c.scale(-1, 1);
  c.drawImage(spriteRover(roda), -15, -20);
  if (cabeca) {   // motorista na janela (cabeça do boneco, linhas 0..5 do sprite)
    const j = JANELA_ROVER;
    c.save(); c.beginPath(); c.rect(j.x, j.y, j.w, j.h); c.clip();
    c.drawImage(cabeca, 0, 0, 12, 6, j.x + 1, j.y - 1, 12, 6);
    c.fillStyle = 'rgba(63,208,201,0.35)'; c.fillRect(j.x, j.y, j.w, j.h);
    c.restore();
  }
  c.restore();
}

/** Foguete na plataforma (14x30), com a cor do colono na faixa. Pés da plataforma em (x, y). */
export function desenharFoguete(c: Ctx, x: number, y: number, t: number, cor: string) {
  const s = comContorno(`foguete:${cor}`, 14, 30, (R) => {
    R(1, 27, 12, 2, '#5a5f84'); R(2, 26, 10, 1, '#9aa0b5'); R(2, 27, 1, 1, '#ffc83d'); R(11, 27, 1, 1, '#ffc83d');
    R(5, 8, 4, 17, '#eef0f8'); R(8, 8, 1, 17, '#c9cde0');               // corpo
    R(5, 5, 4, 3, '#e2603b'); R(6, 3, 2, 2, '#e2603b'); R(6, 2, 1, 1, '#ff9a73');   // bico
    R(6, 11, 2, 2, '#3fd0c9'); R(6, 11, 1, 1, '#bff6f2');               // janelinha
    R(5, 17, 4, 2, cor);                                                // faixa com a cor do dono
    R(3, 20, 2, 5, '#e2603b'); R(9, 20, 2, 5, '#e2603b'); R(6, 21, 2, 4, '#a83d22');   // aletas
    R(6, 25, 2, 1, '#6b6f86');
  });
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(Math.round(x - 7), Math.round(y - 1), 14, 2);
  c.drawImage(s, Math.round(x - 7), Math.round(y - 30));
  if (Math.floor(t * 1.5) % 2 === 0) { c.fillStyle = '#ff4d4d'; c.fillRect(Math.round(x - 1), Math.round(y - 29), 1, 1); }   // luz do bico
  if (Math.floor(t * 3) % 6 === 0) { c.fillStyle = '#ffffff66'; c.fillRect(Math.round(x - 3), Math.round(y - 3), 6, 1); }   // vapor
}

/** Outdoor holográfico (22 px de largura) com o texto do comprador; pés das colunas em (x, y). */
export function desenharOutdoor(c: Ctx, x: number, y: number, t: number, texto: string | null) {
  const x0 = Math.round(x - 11), y0 = Math.round(y - 22);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x0 + 1, Math.round(y - 1), 20, 2);
  c.fillStyle = CONT; c.fillRect(x0 + 4, y0 + 11, 3, 11); c.fillRect(x0 + 15, y0 + 11, 3, 11);
  c.fillStyle = '#6b6f86'; c.fillRect(x0 + 5, y0 + 11, 1, 11); c.fillRect(x0 + 16, y0 + 11, 1, 11);
  c.fillStyle = '#2e323b'; c.fillRect(x0 + 2, y0 + 20, 18, 2);                       // base com o projetor
  c.fillStyle = '#3fd0c9'; c.fillRect(x0 + 10, y0 + 19, 2, 1);
  const pisca = Math.floor(t * 6) % 23 === 0 ? 0.45 : 1;                              // falha de holograma de vez em quando
  c.globalAlpha = 0.85 * pisca;
  c.fillStyle = '#0b3a4a'; c.fillRect(x0, y0, 22, 11);
  c.fillStyle = '#3fd0c9'; c.fillRect(x0, y0, 22, 1); c.fillRect(x0, y0 + 10, 22, 1); c.fillRect(x0, y0, 1, 11); c.fillRect(x0 + 21, y0, 1, 11);
  c.fillStyle = '#3fd0c933'; for (let i = 2; i < 10; i += 2) c.fillRect(x0 + 1, y0 + i, 20, 1);   // linhas de varredura
  c.fillStyle = '#3fd0c955'; c.beginPath(); c.moveTo(x0 + 10, y0 + 19); c.lineTo(x0 + 3, y0 + 11); c.lineTo(x0 + 19, y0 + 11); c.fill();   // feixe
  c.globalAlpha = pisca;
  const msg = (texto || 'OPERAÇÃO MARTE ZERO').toUpperCase();
  c.font = '3px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#e8fffd';
  const largura = c.measureText(msg).width;
  if (largura <= 19) c.fillText(msg, x0 + 11, y0 + 5.6);
  else {   // texto comprido: corre da direita para a esquerda dentro do painel
    c.save(); c.beginPath(); c.rect(x0 + 1, y0 + 1, 20, 9); c.clip();
    const passo = (t * 6) % (largura + 22);
    c.textAlign = 'left'; c.fillText(msg, x0 + 21 - passo, y0 + 5.6); c.restore();
  }
  c.globalAlpha = 1;
}

// cores das bandeiras mais pedidas (listras na ordem); o resto usa duas cores sorteadas pelo código
const BANDEIRAS: Record<string, string[]> = {
  br: ['#229e45', '#f8e509', '#2b49a3'], pt: ['#046a38', '#da291c', '#da291c'], us: ['#b22234', '#ffffff', '#3c3b6e'],
  ar: ['#74acdf', '#ffffff', '#74acdf'], es: ['#aa151b', '#f1bf00', '#aa151b'], it: ['#009246', '#ffffff', '#ce2b37'],
  fr: ['#0055a4', '#ffffff', '#ef4135'], de: ['#000000', '#dd0000', '#ffce00'], jp: ['#ffffff', '#bc002d', '#ffffff'],
  mx: ['#006847', '#ffffff', '#ce1126'], co: ['#fcd116', '#003893', '#ce1126'], cl: ['#ffffff', '#0039a6', '#d52b1e'],
  uy: ['#ffffff', '#0038a8', '#ffffff'], py: ['#d52b1e', '#ffffff', '#0038a8'], gb: ['#012169', '#c8102e', '#ffffff'],
  ca: ['#d80621', '#ffffff', '#d80621'], ao: ['#cc092f', '#000000', '#cc092f'], mz: ['#007168', '#000000', '#fce100'],
  ve: ['#ffcc00', '#00247d', '#cf142b'], pe: ['#d91023', '#ffffff', '#d91023'], bo: ['#d52b1e', '#f9e300', '#007934'],
};
/** Bandeira tremulando no mastro (pé do mastro em x, y). opcao = código do país ou "cores". */
export function desenharBandeira(c: Ctx, x: number, y: number, t: number, opcao: string | null, cor: string) {
  const cores = BANDEIRAS[opcao ?? ''] ?? (opcao === 'cores' || !opcao ? [cor, '#ffffff', cor]
    : [`hsl(${Math.floor(hash(opcao.charCodeAt(0), opcao.charCodeAt(1) || 0) * 360)},70%,50%)`, '#ffffff', cor]);
  const px = Math.round(x), py = Math.round(y);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(px - 2, py - 1, 5, 2);
  c.fillStyle = CONT; c.fillRect(px - 1, py - 18, 3, 18);
  c.fillStyle = '#c9cde0'; c.fillRect(px, py - 18, 1, 18);
  c.fillStyle = '#ffd85a'; c.fillRect(px, py - 19, 1, 1);
  for (let i = 0; i < 10; i++) {   // tecido ondulando
    const onda = Math.round(Math.sin(t * 5 - i * 0.7) * 1.2 * (i / 10));
    const fx = px + 1 + i, fy = py - 17 + onda;
    c.fillStyle = CONT; c.fillRect(fx, fy - 1, 1, 8);
    for (let j = 0; j < 6; j++) { c.fillStyle = cores[Math.floor(j / 2)]; c.fillRect(fx, fy + j, 1, 1); }
  }
}

/** Quiosque de comércio (16x14): toldo listrado com a cor do dono, balcão e luz acesa. Pés em (x, y). */
export function desenharComercio(c: Ctx, x: number, y: number, t: number, cor: string) {
  const s = comContorno(`comercio:${cor}`, 18, 16, (R) => {
    R(2, 6, 14, 9, '#cfd3dc'); R(2, 14, 14, 1, '#9aa0b5');              // casinha
    R(4, 8, 10, 3, '#2b2350');                                          // vitrine
    R(1, 11, 16, 2, '#a0613f'); R(1, 11, 16, 1, '#c98a5e');             // balcão
    for (let i = 0; i < 8; i++) R(1 + i * 2, 3, 2, 3, i % 2 ? '#ffffff' : cor);   // toldo
    R(1, 6, 16, 1, '#00000033');
    R(6, 0, 6, 3, '#ffd85a'); R(8, 1, 2, 1, '#a83d22');                 // plaquinha
  });
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(Math.round(x - 8), Math.round(y - 1), 16, 2);
  c.drawImage(s, Math.round(x - 9), Math.round(y - 16));
  const luz = 0.6 + 0.4 * Math.sin(t * 2);
  c.globalAlpha = luz; c.fillStyle = '#ffe58a'; c.fillRect(Math.round(x - 4), Math.round(y - 8), 2, 2); c.fillRect(Math.round(x + 1), Math.round(y - 8), 3, 2); c.globalAlpha = 1;
}

/**
 * Cápsula habitacional GRANDE (2x2 casas = 32x32) na Vila das Cápsulas. (x, y) = canto do lote.
 * Variantes iguais às da loja: clássica, estufa, observatório, dupla. `cor` = cor do colono, `luz` = tem gente.
 */
export function desenharCapsulaGrande(c: Ctx, x: number, y: number, variante: string, cor: string, luz: boolean, t: number) {
  const R = (a: number, b: number, w: number, h: number, k: string) => { c.fillStyle = k; c.fillRect(x + a, y + b, w, h); };
  const D = (a: number, b: number, r: number, k: string) => disco(c, x + a, y + b, r, k);
  const janela = luz ? '#ffe58a' : '#2b2350';
  // lote: piso de placas e calçada
  R(0, 0, 32, 32, '#9a4a2e'); R(1, 1, 30, 30, '#b05a3a');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) R(1 + i * 7.5, 1 + j * 7.5, 7, 7, '#a95536');
  R(13, 27, 6, 5, '#cd8a62');                                          // caminho até a porta
  R(2, 29, 28, 3, 'rgba(0,0,0,0.25)');
  if (variante === 'estufa') {                                          // grande cúpula de vidro com horta
    D(16, 18, 13, '#2f6b7e'); D(16, 18, 12, '#9fe7ff');
    for (let i = 0; i < 6; i++) D(6 + i * 4, 20 + (i % 2) * 2, 2, i % 2 ? '#2bb673' : '#5fd38a');
    R(9, 15, 1, 1, '#ff7f50'); R(20, 14, 1, 1, '#ffd85a'); R(15, 12, 1, 1, '#ff7f50');
    for (const a of [10, 16, 22]) R(a, 7, 1, 16, '#2f6b7ecc');           // armação
    R(9, 8, 3, 1, '#ffffff'); R(7, 10, 2, 1, '#ffffff');
    R(2, 24, 28, 4, '#6b6f86'); R(2, 24, 28, 1, cor); R(13, 21, 6, 7, '#3a2f63'); R(14, 22, 4, 5, '#2b2350');
  } else if (variante === 'observatorio') {                             // cúpula escura, fenda aberta e telescópio
    R(2, 21, 28, 7, '#6b6f86'); R(2, 21, 28, 1, cor);
    D(16, 17, 12, '#3b3f5c'); D(16, 17, 11, '#5a5f84');
    R(14, 5, 5, 13, '#22253a');
    c.fillStyle = '#c9cde0'; for (let i = 0; i < 7; i++) c.fillRect(x + 15 + i, y + 13 - i * 1.6, 3, 3);   // tubo
    R(23, 1, 2, 2, '#ffe58a');
    if (Math.floor(t * 2) % 2) R(27, 3, 1, 1, '#ffffff');                // estrela piscando no céu
    R(5, 22, 3, 3, janela); R(24, 22, 3, 3, janela); R(13, 21, 6, 7, '#22253a'); R(14, 22, 4, 5, '#3a2f63');
  } else if (variante === 'dupla') {                                    // duas cúpulas ligadas por um túnel
    R(8, 17, 16, 6, '#b9bccc'); R(8, 17, 16, 1, '#e4e6f0');
    D(9, 17, 8, '#6b6f86'); D(9, 17, 7, '#e4e6f0'); D(23, 15, 8, '#6b6f86'); D(23, 15, 7, '#e4e6f0');
    R(2, 17, 14, 2, cor); R(16, 15, 14, 2, cor);
    R(6, 20, 5, 7, '#3a2f63'); R(7, 21, 3, 5, '#2b2350');
    R(5, 11, 3, 3, janela); R(21, 9, 3, 3, janela); R(25, 9, 3, 3, janela);
    R(27, 2, 1, 6, '#9a9db0'); R(27, 1, 1, 1, Math.floor(t * 1.5) % 2 ? '#e04f5f' : '#7a2030');
  } else {                                                              // clássica: cúpula grande, faixa dourada, antena
    D(16, 18, 14, '#6b6f86'); D(16, 18, 13, '#f2f3f8');
    R(3, 17, 26, 3, cor); R(3, 20, 26, 1, '#ffd85a');
    R(2, 24, 28, 4, '#6b6f86'); R(2, 24, 28, 1, '#9aa0b5');
    R(13, 19, 6, 9, '#3a2f63'); R(14, 20, 4, 7, '#2b2350'); R(17, 23, 1, 1, '#ffd85a');
    R(7, 10, 4, 4, '#3a2f63'); R(8, 11, 2, 2, janela); R(21, 10, 4, 4, '#3a2f63'); R(22, 11, 2, 2, janela);
    R(10, 6, 3, 1, '#ffffff'); R(8, 7, 2, 1, '#ffffff');                // brilho
    R(16, 0, 1, 5, '#9a9db0'); R(15, 0, 3, 1, '#c9cde0'); R(16, -1, 1, 1, Math.floor(t * 1.5) % 2 ? '#e04f5f' : '#7a2030');
  }
  R(26, 25, 6, 3, '#3f5fae'); R(26, 25, 6, 1, '#8fb3ff');               // painel solar no canto
}
