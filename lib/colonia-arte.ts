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
};
const MAPAS: Record<string, string[]> = {
  vega: ['....GGGG....', '...GWWWWG...', '..GWVVVVWG..', '..GWVSSVWG..', '..GWVVVVWG..', '...GWWWWG...',
         '..oOOYYOOo..', '.SoOOOOOOoS.', '..oOGGGGOo..', '...OO..OO...', '...OO..OO...', '...BB..BB...'],
  lia: ['....pPPp....', '...PPPPPP...', '..PPSSSSPP..', '..PSKSSKSP..', '..PSSSSSSP..', '..P.SSSS.P..',
        '..WWTTTTWW..', '.SWWTTTTWWS.', '..WWTYTTWW..', '...TT..TT...', '...TT..TT...', '...BB..BB...'],
  pet: ['........', '......N.', '.....NNN', 'N....NKN', '.NNNNNN.', '.NNNNNN.', '.N.N.N.N', '........'],
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
export function iconeDoProduto(slug: string): string {
  const s = (slug || '').toLowerCase();
  for (const k of ['pet', 'rover', 'foguete', 'monumento', 'capsula', 'outdoor', 'traje']) if (s.includes(k)) return k;
  if (/bandeira|satelite|festa/.test(s)) return 'bandeira';
  return 'presente';
}

// ------------------------------------------------------------------ terreno (em blocos de 32x32 casas, com cache)
export const BLOCO = 32;
const SOLOS = ['#b85a37', '#bc5e3a', '#b35538', '#c0623d'];

export type Reservado = Ret;   // em casas: onde não nasce cratera (base, obras, lotes)

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
  }
  // crateras e pedras (podem passar da borda do bloco: o vizinho desenha a parte dele)
  for (let y = y0 - 2; y < y0 + BLOCO + 2; y++) for (let x = x0 - 2; x < x0 + BLOCO + 2; x++) {
    if (!livre(x, y)) continue;
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
  } else {   // estufa (e qualquer obra nova sem desenho próprio)
    if (st.p <= 0) return;
    const colunas = o.w * 2, vis = Math.ceil(st.p * colunas), larg = (r.x1 - r.x0 - 4) / colunas;
    ret(c, r.x0 + 2, r.y1 - 6, r.x1 - r.x0 - 4, 4, '#6b6f86');
    for (let i = 0; i < vis; i++) {
      const x = r.x0 + 2 + i * larg;
      c.globalAlpha = 0.55; ret(c, x, r.y0 + 6, larg - 1, r.y1 - r.y0 - 12, '#8fe6ff'); c.globalAlpha = 1;
      ret(c, x, r.y0 + 6, 1, r.y1 - r.y0 - 12, '#eef0f8');
      if (st.p > 0.6) for (let j = 0; j < 3; j++) ret(c, x + 3, r.y0 + 14 + j * 12, 4, 4, j % 2 ? '#2bb673' : '#4ed37a');
    }
  }
}

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
