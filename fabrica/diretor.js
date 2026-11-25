/* Diretor da Operação Marte Zero: desenha o quadro do instante t (segundos).
 *
 * Tudo é função pura de t: nenhum estado muda entre quadros. Assim dá para filmar
 * em várias abas ao mesmo tempo (navegador.py) e repetir um quadro idêntico.
 *
 * API usada pelo navegador.py:
 *   await carregarEpisodio(ep)  → prepara terreno, sprites e câmera
 *   quadro(i, qualidade)        → desenha o quadro i e devolve um data URL JPEG
 *   desenhar(t)                 → só desenha (para prévias)
 */
'use strict';

const W = 1080, H = 1920, CASA = 16;
const FOCO_Y = 0.43;                         // onde fica o alvo na tela (acima da legenda)
const FONTE = '"Press Start 2P", monospace';
const COR = {
  ceu: '#140f26', ceu2: '#1e1838', borda: '#3a2f63', areia: '#f6d7a7', texto: '#f3eefe',
  marte: '#e2603b', marteEsc: '#a83d22', agua: '#3fd0c9', ouro: '#ffc83d', ok: '#4ed37a',
  alerta: '#ff4d4d', gelo: '#dff3ff',
};

// Clima da estação (fabrica/marte.json → "efeito"). Problema do dia de clima deixa tudo mais forte.
const CLIMA = {
  redemoinho: { n: 46, vel: 1, cor: '#f6d7a7', tinta: null, cai: false, risco: false },
  tempestade: { n: 170, vel: 2.2, cor: '#ffe2b8', tinta: ['#b5562b', 0.22], cai: false, risco: true },
  vento: { n: 95, vel: 3.2, cor: '#f6d7a7', tinta: ['#7a5a48', 0.08], cai: false, risco: true },
  geada: { n: 140, vel: 0.35, cor: '#ffffff', tinta: ['#a9d2f2', 0.24], cai: true, risco: false, grande: true },
};

// Acentos das MAIÚSCULAS desenhados à mão. A Press Start 2P desenha mal as maiúsculas acentuadas (o Ô
// vira um "8" e o til do Ã some em tamanho pequeno). Todo fillText/strokeText nessa fonte troca a letra
// acentuada pela letra simples e desenha o acento em blocos de pixel (grade de 8x8 da fonte).
(function () {
  const P = CanvasRenderingContext2D.prototype;
  const MARCA = {
    '̃': [[1, -3], [2, -3], [5, -3], [0, -2], [3, -2], [4, -2]],            // til
    '́': [[4, -3], [5, -3], [3, -2], [4, -2]],                              // agudo
    '̀': [[1, -3], [2, -3], [2, -2], [3, -2]],                              // grave
    '̂': [[2, -3], [3, -3], [4, -3], [1, -2], [2, -2], [4, -2], [5, -2]],    // circunflexo
  };
  const ACENTUADA = /[ÃÕÂÊÎÔÛÁÉÍÓÚÀ]/;
  const envolver = (orig, modo) => function (str, x, y) {
    str = String(str);
    if (!ACENTUADA.test(str) || !/Press Start 2P/.test(this.font)) return orig.apply(this, arguments);
    const tam = parseFloat((this.font.match(/([\d.]+)px/) || [0, 16])[1]);
    const letras = [...str].map((ch) => (ACENTUADA.test(ch) ? { base: ch.normalize('NFD')[0], marca: ch.normalize('NFD')[1] } : { base: ch, marca: null }));
    const simples = letras.map((l) => l.base).join('');
    const largura = this.measureText(simples).width, passo = largura / Math.max(1, letras.length);
    const x0 = this.textAlign === 'center' ? x - largura / 2 : (this.textAlign === 'right' || this.textAlign === 'end') ? x - largura : x;
    const topo = y - this.measureText('H').actualBoundingBoxAscent;   // topo das maiúsculas
    const alinhado = this.textAlign;
    this.textAlign = 'left';
    orig.call(this, simples, x0, y);
    this.textAlign = alinhado;
    const u = tam / 8, borda = modo === 'stroke' ? this.lineWidth / 2 : 0;
    const antes = this.fillStyle;
    if (modo === 'stroke') this.fillStyle = this.strokeStyle;
    letras.forEach((l, i) => {
      for (const [cx, cy] of MARCA[l.marca] || []) this.fillRect(x0 + i * passo + cx * u - borda, topo + cy * u - borda, u + borda * 2, u + borda * 2);
    });
    this.fillStyle = antes;
  };
  if (!P.__acentosPT) {
    P.fillText = envolver(P.fillText, 'fill');
    P.strokeText = envolver(P.strokeText, 'stroke');
    P.__acentosPT = true;
  }
})();

const cv = document.getElementById('tela');
let ctx = cv.getContext('2d', { alpha: false });   // 'let': o pov.js desenha prédios numa tela transparente
window.usarCtx = (c) => { const antes = ctx; ctx = c; return antes; };

let EP = null;
let terreno = null, TER = { x0: 0, y0: 0 };
let vinheta = null;
let cameraKeys = [];
let colonoPorCodigo = new Map();
let tempoEnergia = Infinity, tempoDemarcar = Infinity;
let cenaMissao = [];
const spriteCache = new Map();
const imagens = new Map();

// ------------------------------------------------------------------ utilidades
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const suave = (k) => (k = clamp(k), k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const saida = (k) => 1 - Math.pow(1 - clamp(k), 3);
const hash = (x, y, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };

// ------------------------------------------------------------------ sprites
// Mesmo gerador de lib/sprite.ts: o boneco do vídeo é igual ao do site.
const PELES = ['#f2c9a0', '#e0ac7e', '#c68642', '#8d5524', '#5c3a1e', '#ffdbac'];
const ROUPAS = ['#e04f5f', '#3f8efc', '#2bb673', '#f4b400', '#9b59b6', '#ff7f50', '#00b8a9', '#ec407a'];
const CABELOS = ['#2b1b10', '#5a3825', '#b5651d', '#e8c872', '#d9d9d9', '#c0392b', '#1e88e5', '#8e44ad'];
const CONTORNO = '#1b1530';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];

function gerarSprite(seed) {
  const r = rng(seed);
  const pele = pick(r, PELES), roupa = pick(r, ROUPAS), calca = pick(r, ROUPAS), cabelo = pick(r, CABELOS);
  const estiloCabelo = Math.floor(r() * 4);
  const temChapeu = r() < 0.25;
  const chapeu = pick(r, ROUPAS);
  const g = Array.from({ length: 12 }, () => Array(12).fill(null));
  const meia = (y, x, c) => { g[y][x] = c; g[y][11 - x] = c; };
  for (let y = 1; y <= 5; y++) for (let x = 3; x <= 5; x++) meia(y, x, pele);
  for (let x = 3; x <= 5; x++) meia(1, x, temChapeu ? chapeu : cabelo);
  if (temChapeu) { meia(0, 4, chapeu); meia(0, 5, chapeu); meia(1, 2, chapeu); }
  else {
    if (estiloCabelo >= 1) meia(2, 3, cabelo);
    if (estiloCabelo >= 2) { meia(3, 3, cabelo); meia(0, 5, cabelo); }
    if (estiloCabelo === 3) { meia(4, 2, cabelo); meia(5, 2, cabelo); meia(2, 2, cabelo); }
  }
  meia(3, 4, CONTORNO);
  for (let y = 6; y <= 8; y++) for (let x = 3; x <= 5; x++) meia(y, x, roupa);
  meia(7, 2, roupa); meia(8, 2, pele);
  if (r() < 0.5) meia(6, 5, CONTORNO);
  meia(9, 4, calca); meia(10, 4, calca); meia(9, 5, calca);
  meia(11, 4, CONTORNO); meia(11, 3, CONTORNO);
  return g;
}

// Fundadores e itens: desenhados à mão (cada letra é uma cor).
const PALETA = {
  K: '#1b1530', W: '#eef0f8', G: '#9aa0b5', g: '#6b6f86', V: '#3fd0c9', O: '#e2603b', o: '#a83d22',
  S: '#e0ac7e', s: '#c68642', H: '#5a3825', T: '#00b8a9', t: '#00796b', P: '#9b59b6', p: '#6c3483',
  Y: '#ffc83d', B: '#3a2f63', N: '#b5651d', R: '#e04f5f', L: '#3f8efc',
  C: '#f2b46a', c: '#9a5418', w: '#fff0d8',   // pet: caramelo claro, caramelo escuro e creme (destaca do chão vermelho)
};
const MAPAS = {
  vega: [
    '....GGGG....',
    '...GWWWWG...',
    '..GWVVVVWG..',
    '..GWVSSVWG..',
    '..GWVVVVWG..',
    '...GWWWWG...',
    '..oOOYYOOo..',
    '.SoOOOOOOoS.',
    '..oOGGGGOo..',
    '...OO..OO...',
    '...OO..OO...',
    '...BB..BB...',
  ],
  lia: [
    '....pPPp....',
    '...PPPPPP...',
    '..PPSSSSPP..',
    '..PSKSSKSP..',
    '..PSSSSSSP..',
    '..P.SSSS.P..',
    '..WWTTTTWW..',
    '.SWWTTTTWWS.',
    '..WWTYTTWW..',
    '...TT..TT...',
    '...TT..TT...',
    '...BB..BB...',
  ],
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

function canvasDeMatriz(linhas, cor) {
  const h = linhas.length, w = linhas[0].length;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  for (let j = 0; j < h; j++) {
    if (linhas[j].length !== w) throw new Error('sprite com largura errada: ' + linhas[j]);
    for (let i = 0; i < w; i++) {
      const v = cor(linhas[j][i]);
      if (v) { x.fillStyle = v; x.fillRect(i, j, 1, 1); }
    }
  }
  return c;
}
function spriteColono(seed, lideranca) {
  const lid = lideranca && EP.liderancas ? EP.liderancas[lideranca] : null, k = lid ? `${seed}:${lid.id}` : seed;
  if (!spriteCache.has(k)) spriteCache.set(k, canvasDeMatriz(lid ? vestirTraje(gerarSprite(seed), lid) : gerarSprite(seed), (v) => v));
  return spriteCache.get(k);
}
function spriteMapa(nome) {
  const k = 'mapa:' + nome;
  if (!spriteCache.has(k)) spriteCache.set(k, canvasDeMatriz(MAPAS[nome], (ch) => PALETA[ch] || null));
  return spriteCache.get(k);
}
// item com contorno escuro de 1 px (senão some no chão vermelho)
function spriteContornado(nome) {
  const k = 'cont:' + nome;
  if (!spriteCache.has(k)) {
    const s = spriteMapa(nome);
    const c = document.createElement('canvas'); c.width = s.width + 2; c.height = s.height + 2;
    const x = c.getContext('2d');
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) x.drawImage(s, dx, dy);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = CONTORNO; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over';
    x.drawImage(s, 1, 1);
    spriteCache.set(k, c);
  }
  return spriteCache.get(k);
}
// Monumento dourado: estátua do próprio colono (o boneco do seed dele, todo em ouro) sobre um pedestal.
const OURO_ESTATUA = ['#fff3c0', '#ffd85a', '#e0a920', '#b07d10', '#7e5206'];
function luminancia(hex) { const n = parseInt(hex.slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); }
function spriteEstatua(seed) {
  const k = 'estatua:' + seed;
  if (!CACHE_ESTATUA.has(k)) {
    const m = gerarSprite(seed);
    const s = document.createElement('canvas'); s.width = 12; s.height = 15;
    const x = s.getContext('2d');
    m[7][9] = null; m[8][9] = null;                      // o braço direito sobe com a bandeira
    m.forEach((linha, j) => linha.forEach((v, i) => {
      if (!v) return;
      const claro = (l => (l > 170 ? 0 : 1))(luminancia(v));
      // cabeça clara, corpo médio, pernas escuras; borda direita na sombra; olhos e contorno no tom mais escuro
      let n = v === CONTORNO ? 4 : (j <= 5 ? 0 : j <= 8 ? 1 : 2) + claro;
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
    const y = c.getContext('2d');
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) y.drawImage(s, dx, dy);
    y.globalCompositeOperation = 'source-in'; y.fillStyle = CONTORNO; y.fillRect(0, 0, 14, 17);
    y.globalCompositeOperation = 'source-over'; y.drawImage(s, 1, 1);
    CACHE_ESTATUA.set(k, c);
  }
  return CACHE_ESTATUA.get(k);
}
const CACHE_ESTATUA = new Map();

function iconeDoProduto(slug) {
  const s = (slug || '').toLowerCase();
  for (const k of ['pet', 'rover', 'foguete', 'monumento', 'capsula', 'outdoor', 'traje']) if (s.includes(k)) return k;
  if (/bandeira|satelite|festa/.test(s)) return 'bandeira';
  return 'presente';
}

// ------------------------------------------------------------------ preparação
function carregarImagem(url) {
  return new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';               // sem isso o canvas fica "sujo" e não exporta
    img.onload = () => { imagens.set(url, img); ok(); };
    img.onerror = () => ok();                    // sem arte final: usa o boneco gerado
    img.src = url;
  });
}

// Vilarejo espalhado em volta da base (igual a lib/mundo.ts, fabrica/bairro.py e à casa_pos do banco): células de
// 3x3 casas numa espiral, uma casa por célula; as posições vêm prontas do banco/bairro.py, aqui só o anel e a arte
const CENTRO = { x: 5, y: -8 }, ANEL_INICIAL = 2, MARGEM_CASA = 2, CEL = 3;
let RESERVAS = [];
function prepararReservas() {
  const m = EP.mundo, b = m.base, p = m.praca;
  RESERVAS = [b, ...(p ? [p] : []), ...m.obras].map((o) => ({ x0: o.x - MARGEM_CASA, y0: o.y - MARGEM_CASA, x1: o.x + o.w + MARGEM_CASA, y1: o.y + o.h + MARGEM_CASA }));
  if (p) RESERVAS.push({ x0: CENTRO.x, y0: b.y + b.h, x1: CENTRO.x + 1, y1: p.y });   // trilha do módulo até a praça
}
const reservadoCasa = (x, y) => RESERVAS.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
const anelDe = (x, y) => Math.max(Math.abs(Math.floor((x - CENTRO.x + 1) / CEL)), Math.abs(Math.floor((y - CENTRO.y + 1) / CEL)));
// Vilarejo: chão batido em volta de cada casa e uma trilha de terra torta da porta até o vizinho de onde vem o
// fio de energia (curva sorteada pela casa). MESMA arte em lib/colonia-arte.ts e fabrica/diretor.js.
function chaoDaCasa(t, px, py) {   // px, py = canto da casa em pixels
  t.fillStyle = '#c26d45'; t.beginPath(); t.ellipse(px + 8, py + 10, 13, 10, 0, 0, Math.PI * 2); t.fill();
  t.fillStyle = '#cd7a50'; t.beginPath(); t.ellipse(px + 8, py + 11, 9, 6, 0, 0, Math.PI * 2); t.fill();
}
function trilhaDaCasa(c, x, y, alvo) {   // casa (x, y) e alvo em casas
  const ax = x * CASA + 8, ay = y * CASA + 15, bx = alvo.x * CASA, by = alvo.y * CASA;
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 4) return;
  const nx = -(by - ay) / d, ny = (bx - ax) / d, curva = (hash(x, y, 41) - 0.5) * Math.min(30, d * 0.45);
  const mx = (ax + bx) / 2 + nx * curva, my = (ay + by) / 2 + ny * curva, n = Math.ceil(d / 2);
  c.fillStyle = '#c98058';
  for (let i = 0; i <= n; i++) {
    const k = i / n, q = 1 - k;
    c.fillRect(Math.round(q * q * ax + 2 * q * k * mx + k * k * bx) - 1, Math.round(q * q * ay + 2 * q * k * my + k * k * by) - 1, 3, 3);
  }
}


function retanguloDe(o) { return { x0: o.x * CASA, y0: o.y * CASA, x1: (o.x + o.w) * CASA, y1: (o.y + o.h) * CASA }; }

// Colina embaixo de uma obra (colonia.json → obras[].colina): degraus de terra vistos de cima, luz vindo do
// noroeste (borda de cima clara) e sombra no sudeste. MESMA arte em lib/colonia-arte.ts (colina): mude as duas juntas.
function colinaEm(t, cx, cy, rx, ry, semente) {
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
// MESMA arte em lib/colonia-arte.ts: mude os dois juntos.
const DUNAS_Y = -27, DUNAS_FADE = 7;
function dunaEm(wx, wy) {   // wx, wy em casas (podem ser fracionários); devolve a cor ou null
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
function pintarDuna(t, x, y, px, py) {   // a casa (x, y) em 4x4 pedacinhos de 4 px
  if (y > DUNAS_Y + 1) return;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const c = dunaEm(x + (i + 0.5) / 4, y + (j + 0.5) / 4);
    if (c) { t.fillStyle = c; t.fillRect(px + i * 4, py + j * 4, 4, 4); }
  }
}

function prepararTerreno() {
  const m = EP.mundo;
  prepararReservas();
  let minX = CENTRO.x, maxX = CENTRO.x, minY = CENTRO.y, maxY = CENTRO.y, anel = 0;
  for (const c of m.colonos) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    anel = Math.max(anel, anelDe(c.x, c.y));
  }
  EP.lotes = m.colonos.length ? { anel } : null;
  const noBairro = (x, y) => !!EP.lotes && !reservadoCasa(x, y) && (() => { const a = anelDe(x, y); return a >= ANEL_INICIAL && a <= EP.lotes.anel; })();

  const tx0 = Math.max(-200, Math.min(-48, minX - 40)), ty0 = Math.max(-220, Math.min(-64, minY - 40));
  const tx1 = Math.min(220, Math.max(80, maxX + 40));
  const ty1 = Math.min(220, Math.max(48, maxY + 48));
  TER = { x0: tx0, y0: ty0 };
  terreno = document.createElement('canvas');
  terreno.width = (tx1 - tx0) * CASA; terreno.height = (ty1 - ty0) * CASA;
  const t = terreno.getContext('2d');
  const reservados = [m.base, ...m.obras, ...(m.praca ? [m.praca] : [])].map((o) => ({ x0: o.x - 1, y0: o.y - 1, x1: o.x + o.w + 1, y1: o.y + o.h + 1 }));
  const livre = (x, y) => !reservados.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)
    && !(EP.lotes && (() => { const a = anelDe(x, y); return a >= ANEL_INICIAL - 1 && a <= EP.lotes.anel + 1; })());
  const solos = ['#b85a37', '#bc5e3a', '#b35538', '#c0623d'];

  for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
    const px = (x - tx0) * CASA, py = (y - ty0) * CASA;
    t.fillStyle = solos[Math.floor(hash(x, y) * solos.length)];
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
  // colinas embaixo das obras que pedem (ex.: a Antena no ponto mais alto)
  for (const o of m.obras) if (o.colina) {
    const c = o.colina, cx = (o.x + o.w / 2 + (c.dx || 0) - tx0) * CASA, cy = (o.y + o.h / 2 + (c.dy || 0) - ty0) * CASA;
    colinaEm(t, cx, cy, c.rx * CASA, c.ry * CASA, o.x);
  }
  // vilarejo: chão batido em volta de cada casa (igual ao site); quem foi para a Vila das Cápsulas deixa o lote
  for (const c of m.colonos) if (!c.vila) chaoDaCasa(t, (c.x - tx0) * CASA, (c.y - ty0) * CASA);
  void noBairro;
  // praça da colônia
  if (m.praca) for (let y = m.praca.y; y < m.praca.y + m.praca.h; y++) for (let x = m.praca.x; x < m.praca.x + m.praca.w; x++) {
    t.fillStyle = (x + y) % 2 ? '#d9a47e' : '#cf9670';
    t.fillRect((x - tx0) * CASA, (y - ty0) * CASA, CASA, CASA);
  }
  // trilha da base até a praça
  const b = m.base;
  for (let y = b.y + b.h; y < (m.praca ? m.praca.y : CENTRO.y + 6); y++) {
    t.fillStyle = '#cd7a52';
    t.fillRect((b.x + Math.floor(b.w / 2) - tx0) * CASA - 6, (y - ty0) * CASA, 12, CASA);
  }
  // crateras e pedras
  const batizadas = m.crateras || [];
  const longeDasBatizadas = (x, y) => !batizadas.some((c) => Math.hypot(x - c.x, y - c.y) * CASA < c.r + 34);
  for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
    if (!livre(x, y) || !longeDasBatizadas(x, y)) continue;
    if (y < DUNAS_Y - 1 && hash(x, y, 33) > 0.12) continue;   // nas dunas quase não há crateras/pedras
    const h = hash(x, y, 7), px = (x - tx0) * CASA + 8, py = (y - ty0) * CASA + 8;
    if (h < 0.012) {
      const r = 6 + Math.floor(hash(x, y, 8) * 16);
      discoEm(t, px, py + 1, r + 1, '#d98a62');
      discoEm(t, px, py, r, '#8f4129');
      discoEm(t, px + 1, py + 2, r - 2, '#a14b2f');
    } else if (h < 0.06) {
      t.fillStyle = '#7a3a24'; t.fillRect(px - 3, py - 1, 6, 3);
      t.fillStyle = '#c9805c'; t.fillRect(px - 2, py - 2, 3, 1);
    }
  }
  for (const c of batizadas) crateraBatizada(t, (c.x - tx0) * CASA + 8, (c.y - ty0) * CASA + 8, c.r, c.id);
}

// Cratera batizada (item "Nomeie sua Cratera"): maior e mais funda que as do terreno, com borda clara, pedras em
// volta e um marco com bandeirinha na borda. A mesma arte está em lib/colonia-arte.ts (crateraBatizada).
function crateraBatizada(t, px, py, r, id) {
  discoEm(t, px, py + 3, r + 4, '#d98a62', 0.62);
  discoEm(t, px, py + 2, r + 1, '#e7a17a', 0.6);
  discoEm(t, px, py, r, '#7d3722', 0.6);
  discoEm(t, px + 2, py + 3, r - 4, '#8f4129', 0.55);
  discoEm(t, px + 4, py + 5, Math.floor(r * 0.55), '#a14b2f', 0.5);
  discoEm(t, px - Math.floor(r * 0.35), py - 2, Math.floor(r * 0.18), '#6b2f1d', 0.5);
  for (let k = 0; k < 9; k++) {   // pedras na borda
    const a = k * 0.7 + hash(id, k, 3) * 0.5, d = r + 3 + hash(id, k, 4) * 6;
    const x = Math.round(px + Math.cos(a) * d), y = Math.round(py + Math.sin(a) * d * 0.62 + 2);
    t.fillStyle = '#7a3a24'; t.fillRect(x - 2, y - 1, 4 + (k % 2) * 2, 3);
    t.fillStyle = '#c9805c'; t.fillRect(x - 1, y - 2, 2, 1);
  }
  const mx = px + Math.round(r * 0.72), my = py - Math.round(r * 0.62) - 2;   // marco com bandeirinha
  t.fillStyle = 'rgba(0,0,0,0.25)'; t.fillRect(mx - 2, my + 1, 6, 2);
  t.fillStyle = '#d8dbe8'; t.fillRect(mx, my - 14, 2, 15);
  t.fillStyle = '#ffc83d'; t.fillRect(mx + 2, my - 14, 8, 5);
  t.fillStyle = '#e2a82a'; t.fillRect(mx + 2, my - 10, 8, 1);
}

function prepararVinheta() {
  vinheta = document.createElement('canvas'); vinheta.width = W; vinheta.height = H;
  const v = vinheta.getContext('2d');
  const g = v.createRadialGradient(W / 2, H * 0.45, H * 0.28, W / 2, H * 0.45, H * 0.78);
  g.addColorStop(0, 'rgba(20,15,38,0)'); g.addColorStop(1, 'rgba(20,15,38,0.72)');
  v.fillStyle = g; v.fillRect(0, 0, W, H);
}

// primeira palavra da fala (depois de "depois") que casa com re → instante em que é dita (ou null)
function palavraEm(c, re, depois = -Infinity) {
  const w = (c && c.palavras || []).find((x) => x.i >= depois && re.test(x.p));
  return w ? w.i : null;
}
// FUND: fundação da PRÓXIMA obra no fim do episódio (cena "fundacao"): ini/fim = a tomada da obra (tomadas.js);
// no mapa o buraco, a malha e o concreto avançam nesse intervalo. DUNAS_MAPA: resultado SIM do "mapear as dunas"
// (o mapa ganha a rota do rover e a trilha desconhecida a partir de t0).
let FUND = null, DUNAS_MAPA = null;
function prepararExtras() {
  const f = EP.cenas.find((c) => c.tipo === 'fundacao');
  FUND = null;
  if (f) {
    const ini = palavraEm(f, /^escavadeira/i) ?? f.fala_inicio + (f.fim - f.fala_inicio) * 0.3;
    const fim = palavraEm(f, /^fim\b/i, ini) ?? f.fim - (f.fim - f.fala_inicio) * 0.2;
    FUND = { c: f, ini: ini - 0.25, fim: Math.max(ini + 3, fim - 0.1), obra: EP.mundo.obras.find((o) => o.slug === f.obra) };
  }
  const r = EP.cenas.find((c) => c.tipo === 'resultado' && c.votacao && c.votacao.id === 'mapa-dunas' && c.votacao.resultado === 'sim');
  DUNAS_MAPA = null;
  if (r) {
    const marcas = palavraEm(r, /^marcas/i) ?? r.fala_inicio;
    DUNAS_MAPA = { c: r, t0: (palavraEm(r, /^mapa/i, marcas) ?? r.fala_inicio + (r.fim - r.fala_inicio) * 0.6) - 0.15 };
  }
}

function prepararTempos() {
  prepararExtras();
  cenaMissao = EP.cenas.filter((c) => c.tipo === 'missao');
  const dem = cenaMissao.find((c) => c.acao === 'demarcar');
  tempoDemarcar = dem ? dem.fala_inicio + 0.4 : (cenaMissao[0] ? cenaMissao[0].inicio : Infinity);
  const lig = cenaMissao.find((c) => c.acao === 'ligar');
  if (lig) {
    const p = lig.palavras.find((w) => /energia|ligad|sinal|verde/i.test(w.p));
    tempoEnergia = p ? p.i : lig.fala_inicio + 0.55 * (lig.fim - lig.fala_inicio);
  }
  // fundadores: caminho por cena (posições em casas; o ponto é o pé do boneco). Onde o roteiro marca a
  // posição (atores), vale o roteiro; nas outras cenas eles seguem a agenda de quem comanda (agendaFundador).
  EP.mundo.fundadores.forEach((f, i) => {
    let pos = f.casa.slice();
    f.trechos = [];
    for (const c of EP.cenas) {
      const marcado = c.atores && c.atores[f.id];
      const pontos = marcado ? [[marcado, 0]] : agendaFundador(f, i, c);
      for (const [alvo, quando] of pontos) {
        const t0 = c.inicio + 0.2 + (c.fim - c.inicio) * quando;
        const dist = Math.hypot(alvo[0] - pos[0], alvo[1] - pos[1]);
        if (dist < 0.15) continue;
        const dur = clamp(dist * 0.42, 0.8, Math.max(0.8, (c.fim - t0) * 0.8));
        f.trechos.push({ t0, t1: t0 + dur, de: pos, para: alvo.slice() });
        pos = alvo.slice();
      }
    }
  });
}

// Agenda dos fundadores nas cenas sem posição marcada: a Comandante Vega comanda (vai até onde está a ação,
// aponta e dá ordens) e a Dra. Lia organiza (recebe quem chega, junta o pessoal, confere tudo no tablet).
// Retorna [[ponto em casas, fração da cena em que sai], ...].
function agendaFundador(f, i, c) {
  const b = EP.mundo.base, praca = EP.mundo.praca, o = obraDaMissao();
  const porta = [b.x + b.w / 2, b.y + b.h + 0.6];
  const vega = i === 0;
  const casaDe = (cod, lado) => { const x = colonoPorCodigo.get(cod); return x ? [x.x + 0.5 + lado * 0.9, x.y + 1.7] : null; };
  const colonos = EP.mundo.colonos;
  const bairro = colonos.length ? [colonos.reduce((a, x) => a + x.x, 0) / colonos.length + 0.5, colonos.reduce((a, x) => a + x.y, 0) / colonos.length + 1.8] : [porta[0], porta[1] + 3];
  const obraP = (k) => (o ? [o.x + o.w * k, o.y + o.h + 1.1] : [porta[0] + (k - 0.5) * 3, porta[1] + 1]);
  const conserto = () => { const sol = EP.cenas.find((x) => x.tipo === 'solucao'); if (!sol) return null; const q = pontoDoConserto(sol.alvo || 'base'); return [q.x / CASA - 1.3, q.y / CASA + 0.3]; };
  switch (c.tipo) {
    case 'abertura':   // saem do módulo e olham o dia
      return vega ? [[[porta[0] - 1.2, porta[1] + 1.4], 0.25], [[bairro[0] - 1, bairro[1] - 0.6], 0.65]]
                  : [[[porta[0] + 1.3, porta[1] + 0.9], 0.35]];
    case 'populacao':   // a comandante passa pelo bairro; a doutora vai para a praça contar todo mundo
      return vega ? [[[bairro[0] + 1.5, bairro[1]], 0.05], [[bairro[0] - 1.5, bairro[1] + 0.4], 0.55]]
                  : [[praca ? [praca.x + praca.w / 2 + 1, praca.y - 0.4] : [porta[0] + 2, porta[1] + 3], 0.1]];
    case 'boas_vindas': case 'destaque': {   // cada uma recebe um dos novos (ou o destaque do dia) na porta de casa
      const cods = c.focos.filter((x) => x.alvo.startsWith('colono:')).map((x) => x.alvo.split(':')[1]);
      const alvo = casaDe(cods[vega ? 1 : 0] || cods[0], vega ? 1 : -1);
      return alvo ? [[alvo, 0]] : [];
    }
    case 'problema': {   // alarme: a comandante corre até o problema, a doutora junta o pessoal na porta
      const q = conserto();
      return vega ? [[q || [porta[0] - 2, porta[1]], 0]] : [[[porta[0] + 1.1, porta[1] + 0.5], 0]];
    }
    case 'missao':   // obra: a comandante percorre o canteiro dando ordens, a doutora confere no tablet
      return vega ? [[obraP(0.0), 0], [obraP(0.45), 0.5]] : [[obraP(1.0), 0.1], [obraP(0.75), 0.6]];
    case 'solucao': {   // a comandante acompanha o herói; a doutora fica na porta, pronta para receber
      const q = conserto();
      return vega ? [[q || porta, 0]] : [[[porta[0] + 1.1, porta[1] + 0.5], 0]];
    }
    default: return [];
  }
}

// Vila das Cápsulas (lib/mundo.ts → VILA): quem comprou a cápsula deixa a casinha grátis e mora num lote 2x2 na
// vila. Para o resto do diretor (porta, pet, itens, câmera, fio) ele passa a ter uma "casa" de 1x1 na frente da
// porta da cápsula; a cápsula em si é desenhada em c.vila e a casinha antiga (c.lote) some quando ela aparece.
function mudarParaAVila(ep) {
  const vila = new Map();
  for (const c of ep.mundo.colonos) {
    if (!c.capsula || !Array.isArray(c.vila)) continue;
    c.lote = { x: c.x, y: c.y };
    c.vila = { x: c.vila[0], y: c.vila[1] };
    c.x = c.vila.x + 0.5; c.y = c.vila.y + 1.2;
    vila.set(c.codigo, c);
  }
  for (const k of ep.mundo.compras) {
    const c = vila.get(k.codigo);
    if (c) { k.x = c.x; k.y = c.y; k.vila = c.vila; }
  }
}

function prepararCamera() {
  cameraKeys = [];
  const zoomFoco = { colono: 7, fundador: 6.5, compra: 7, ator: 7, cratera: 3.4, andarilho: 7 };
  for (const c of EP.cenas) {
    if (c.tipo === 'abertura') {
      cameraKeys.push({ t: 0, alvo: c.camera.alvo, zoom: 1.0, D: 0 });
      cameraKeys.push({ t: 0.15, alvo: c.camera.alvo, zoom: c.camera.zoom, D: Math.min(3.4, (c.fim - c.inicio) * 0.85) });
      continue;
    }
    cameraKeys.push({ t: c.inicio, alvo: c.camera.alvo, zoom: c.camera.zoom, D: c.tipo === 'gancho' ? 2.6 : 1.25 });
    for (const f of c.focos) {
      const tipo = f.alvo.split(':')[0];
      cameraKeys.push({ t: Math.max(c.inicio + 0.05, f.t - 0.35), alvo: f.alvo, zoom: zoomFoco[tipo] || 6, D: 0.8 });
    }
    // plantio das sementes: depois de dizer o nome, a câmera chega BEM perto (terceira pessoa)
    if (c.acao === 'plantar') {
      const tf = c.focos.length ? c.focos[c.focos.length - 1].t + 0.6 : c.inicio + 1;
      cameraKeys.push({ t: Math.min(tf, c.fim - 1.5), alvo: c.camera.alvo, zoom: 11, D: 1.1 });
    }
  }
  cameraKeys.sort((a, b) => a.t - b.t);
}

window.carregarEpisodio = async function (ep) {
  EP = ep;
  mudarParaAVila(ep);
  colonoPorCodigo = new Map(ep.mundo.colonos.map((c) => [c.codigo, c]));
  for (const c of ep.mundo.compras) if (!colonoPorCodigo.has(c.codigo)) colonoPorCodigo.set(c.codigo, c);
  prepararTerreno();
  prepararVinheta();
  prepararTempos();
  prepararLegendas();
  if (window.prepararTomadas) window.prepararTomadas();   // cortes cinematográficos (tomadas.js)
  prepararNoite();
  prepararFios();
  planejarVida();
  planejarDemarcacao();
  encadearTrechos();
  planejarAtaque();
  planejarNoite();
  prepararAndarilhos();
  prepararCamera();
  await document.fonts.load(`40px ${FONTE}`);
  await document.fonts.ready;
  const urls = [...new Set(ep.mundo.colonos.map((c) => c.sprite_url).filter(Boolean))];
  await Promise.all(urls.map(carregarImagem));
  return { quadros: Math.ceil(ep.duracao * ep.fps), fonte: document.fonts.check(`40px ${FONTE}`) };
};


// ------------------------------------------------------------------ vida dos colonos (e reação ao problema do dia)
// Cada colono tem trechos de caminhada como os fundadores: ajuda na obra durante a missão e, na solução do
// problema, reage: 'abrigar' (todos entram no módulo e saem quando o perigo passa), 'recolher' (cada um
// corre para a própria casa) ou 'heroi' (só quem resolve vai até o lugar do problema).
let VIDA = { reacao: null, alerta: null };
function pontoNaObra(r, i) {
  const cols = Math.max(2, Math.floor((r.x1 - r.x0) / 11));
  return { x: r.x0 + 6 + (i % cols) * ((r.x1 - r.x0 - 12) / Math.max(1, cols - 1)), y: r.y1 + 7 + Math.floor(i / cols) * 9 };
}
// onde o herói trabalha: ao lado do módulo (que é desenhado por cima dos colonos) ou na frente da obra
function pontoDoConserto(alvo) {
  const p = posAlvo(alvo, 0);
  if (alvo === 'base') return { x: p.x + 33, y: p.y + 13 };
  for (const o of EP.mundo.obras) {
    const r = retanguloDe(o);
    if (p.x >= r.x0 - 1 && p.x <= r.x1 + 1 && p.y >= r.y0 - 1 && p.y <= r.y1 + 1) return { x: (r.x0 + r.x1) / 2 + 6, y: r.y1 + 10 };
  }
  return { x: p.x + 14, y: p.y + 16 };
}
function planejarVida() {
  const sol = EP.cenas.find((c) => c.tipo === 'solucao');
  const prob = EP.cenas.find((c) => c.tipo === 'problema');
  const miss = EP.cenas.filter((c) => c.tipo === 'missao');
  const base = EP.mundo.base;
  const porta = { x: (base.x + base.w / 2) * CASA, y: (base.y + base.h) * CASA + 2 };
  let tEntra = Infinity, tSai = Infinity;
  if (sol) {
    const pal = sol.palavras || [];
    const w = pal.find((x) => x.i > sol.fala_inicio + 1.5 && /depois|passa|passou|acalma|perigo|salv/i.test(x.p));
    const e = pal.find((x) => /leva|junta|todos|todo|abrigo|m[oó]dulo|chama/i.test(x.p) && x.i > sol.fala_inicio + 0.8);
    tEntra = e ? e.i - 0.2 : sol.fala_inicio + 1.5;
    tSai = w ? w.i : sol.fala_inicio + 0.7 * (sol.fim - sol.fala_inicio);
  }
  VIDA = { reacao: sol ? (sol.reacao || 'heroi') : null, porta, tEntra, tSai,
           alerta: prob ? [prob.inicio, prob.fim] : null, sol };
  const obra = obraDaMissao();
  const r = obra ? retanguloDe(obra) : null;
  const perto = (c) => Math.hypot(c.x * CASA - (r ? (r.x0 + r.x1) / 2 : 0), c.y * CASA - (r ? r.y1 : 0));
  const ajudantes = r && miss.length ? EP.mundo.colonos.slice().sort((a, b) => perto(a) - perto(b)).slice(0, 10) : [];
  EP.mundo.colonos.forEach((c, k) => {
    const casa = { x: c.x * CASA + 11, y: c.y * CASA + 19 };   // na frente da porta (sem esconder a casinha)
    let pos = casa;
    const tr = [];
    const ir = (t0, para, vel = 0.3) => {
      const dur = clamp(Math.hypot(para.x - pos.x, para.y - pos.y) / CASA * vel, 0.6, 4.5);
      tr.push({ t0, t1: t0 + dur, de: pos, para }); pos = para; return t0 + dur;
    };
    c.casaPe = casa; c.dentro = null; c.trabalho = null;
    const i = ajudantes.indexOf(c);
    c.ajudante = i;
    if (i >= 0) {   // mutirão: cada colono é mais uma mão na obra
      const chega = ir(miss[0].inicio + 0.4 + i * 0.35, pontoNaObra(r, i));
      c.trabalho = [chega, miss[miss.length - 1].fim];
    }
    if (sol) {
      const h = hash(c.x, c.y, 3);
      if (VIDA.reacao === 'abrigar') {
        // corre até a fila na frente da porta (devagar o bastante para a câmera ver)
        const fila = { x: porta.x + 4 + (k % 3) * 5, y: porta.y + 10 + Math.floor(k / 3) * 5 + h * 2 };
        const dur = clamp(Math.hypot(fila.x - pos.x, fila.y - pos.y) / CASA * 0.45, 1.4, 4);
        tr.push({ t0: tEntra + Math.min(k, 14) * 0.12, t1: tEntra + Math.min(k, 14) * 0.12 + dur, de: pos, para: fila });
        c.filaChega = tEntra + Math.min(k, 14) * 0.12 + dur;
        c.filaPos = fila; pos = fila;
        c.saidaPara = { x: porta.x + (hash(c.x, c.y, 5) - 0.5) * 110, y: porta.y + 12 + hash(c.x, c.y, 6) * 34 };
      } else if (VIDA.reacao === 'recolher') {
        const chega = ir(tEntra + h * 0.8, casa, 0.24);
        c.dentro = [chega, tSai + h * 0.7];
      } else if (sol.heroi_codigo === c.codigo) {
        // sai ainda no fim da cena anterior para já estar no lugar quando o nome é dito
        const chega = ir(Math.max(0, sol.inicio - 2.2), pontoDoConserto(sol.alvo || 'base'), 0.22);
        c.conserto = [chega, sol.fim - 0.15];
      }
    }
    c.trechos = tr;
  });
  if (sol && VIDA.reacao === 'abrigar') {
    // um entra de cada vez, na ordem de chegada; depois saem um por um na mesma ordem
    const fila = EP.mundo.colonos.filter((c) => c.filaChega != null).sort((a, b) => a.filaChega - b.filaChega);
    let livre = tEntra + 0.8, sai = tSai + 0.6;
    for (const c of fila) {
      const entra = Math.max(c.filaChega, livre);
      c.trechos.push({ t0: entra, t1: entra + 0.35, de: c.filaPos, para: { x: porta.x, y: porta.y } });
      livre = entra + 0.35;
      c.dentro = [entra + 0.35, sai];
      c.trechos.push({ t0: sai, t1: sai + 1.3, de: { x: porta.x, y: porta.y }, para: c.saidaPara });
      sai += 0.3;
    }
    VIDA.portaAberta = [[tEntra + 0.6, livre + 0.3], [tSai, sai + 0.3]];
    VIDA.ultimaEntrada = livre;
  }
  // fundadores também entram no abrigo (a Dra. Lia na frente, guiando todo mundo)
  if (sol && VIDA.reacao === 'abrigar') EP.mundo.fundadores.forEach((f) => {
    const guia = (sol.heroi || '').toLowerCase().includes((f.curto || f.id).toLowerCase());
    const ult = f.trechos.length ? f.trechos[f.trechos.length - 1].para : f.casa;
    const ao_lado = [porta.x / CASA - 0.9, porta.y / CASA + 0.4];       // a guia fica do lado da porta
    const porta_c = [porta.x / CASA, porta.y / CASA];
    const destino = guia ? ao_lado : porta_c;
    const t0 = guia ? tEntra - 0.6 : tEntra + 0.2;
    const dur = clamp(Math.hypot(destino[0] - ult[0], destino[1] - ult[1]) * 0.4, 0.8, 3);
    f.trechos.push({ t0, t1: t0 + dur, de: ult.slice(), para: destino });
    let entra = t0 + dur;
    if (guia) {   // entra por último, depois do último colono
      entra = Math.max(entra, (VIDA.ultimaEntrada || entra) + 0.3);
      f.trechos.push({ t0: entra, t1: entra + 0.35, de: ao_lado, para: porta_c });
      entra += 0.35;
    }
    f.dentro = [entra, tSai + (guia ? 0 : 0.25)];
    const fora = [porta.x / CASA + (guia ? -1.3 : 1.3), porta.y / CASA + 1.3];
    f.trechos.push({ t0: f.dentro[1], t1: f.dentro[1] + 1.1, de: porta_c, para: fora });
  });
}

// Quando anoitece, todo mundo volta para o Módulo de Pouso: cada um anda até a fila na porta e entra, um de
// cada vez (o herói do problema do dia só vai depois de terminar o conserto). Ninguém sai mais no episódio.
function planejarNoite() {
  if (!isFinite(tNoite)) return;
  const porta = VIDA.porta, chegadas = [];
  EP.mundo.colonos.forEach((c, k) => {
    let t0 = tNoite + 0.5 + Math.min(k, 16) * 0.25;
    if (c.conserto) t0 = Math.max(t0, c.conserto[1] + 0.1);
    if (c.dentro && c.dentro[0] <= t0 && c.dentro[1] > t0) {
      if (VIDA.reacao === 'abrigar') { c.dentro[1] = Infinity; c.trechos = c.trechos.filter((tr) => tr.t0 < t0); return; }   // já está no módulo
      c.dentro[1] = t0;   // estava em casa: sai e vai para o módulo
    }
    c.trechos = c.trechos.filter((tr) => tr.t0 < t0);
    const ult = c.trechos[c.trechos.length - 1];
    if (ult && ult.t1 > t0) t0 = ult.t1;
    const de = ult ? ult.para : c.casaPe;
    if (c.trabalho) c.trabalho[1] = Math.min(c.trabalho[1], t0);
    const fila = { x: porta.x - 8 + (k % 4) * 5, y: porta.y + 9 + Math.floor(k / 4) * 5 + hash(c.x, c.y, 4) * 2 };
    const dur = clamp(Math.hypot(fila.x - de.x, fila.y - de.y) / CASA * 0.42, 1.2, 4.5);
    c.trechos.push({ t0, t1: t0 + dur, de, para: fila });
    chegadas.push({ c, chega: t0 + dur, fila });
  });
  chegadas.sort((a, b) => a.chega - b.chega);
  let livre = -Infinity, abre = Infinity;
  for (const { c, chega, fila } of chegadas) {
    const entra = Math.max(chega, livre);
    abre = Math.min(abre, entra);
    c.trechos.push({ t0: entra, t1: entra + 0.35, de: fila, para: { x: porta.x, y: porta.y } });
    c.noite = entra + 0.35;
    livre = c.noite + 0.05;
  }
  // fundadores entram por último (a comandante fecha a porta)
  const fimConserto = Math.max(0, ...EP.mundo.colonos.filter((c) => c.conserto).map((c) => c.conserto[1]));
  EP.mundo.fundadores.forEach((f, i) => {
    let t0 = Math.max(tNoite + 1.2 + i * 0.4, fimConserto ? fimConserto + 0.3 + i * 0.3 : 0);
    if (f.dentro && f.dentro[0] <= t0 && f.dentro[1] > t0) { f.dentro[1] = Infinity; return; }
    f.trechos = f.trechos.filter((tr) => tr.t0 < t0);
    const ult = f.trechos[f.trechos.length - 1];
    if (ult && ult.t1 > t0) t0 = ult.t1;
    const de = ult ? ult.para.slice() : f.casa.slice();
    const pc = [porta.x / CASA, porta.y / CASA], ao_lado = [pc[0] + (i ? 1 : -1), pc[1] + 0.6];
    const dur = clamp(Math.hypot(ao_lado[0] - de[0], ao_lado[1] - de[1]) * 0.42, 1, 4);
    f.trechos.push({ t0, t1: t0 + dur, de, para: ao_lado });
    const entra = Math.max(t0 + dur, livre);
    f.trechos.push({ t0: entra, t1: entra + 0.35, de: ao_lado, para: pc });
    f.noite = entra + 0.35;
    livre = f.noite + 0.05;
    abre = Math.min(abre, entra);
  });
  if (isFinite(abre)) (VIDA.portaAberta = VIDA.portaAberta || []).push([abre - 0.3, livre + 0.3]);
}

// ------------------------------------------------------------------ andarilhos
// Quem entrou pelos comentários dizendo a profissão e ainda não se cadastrou no site: não tem casa. Anda de um
// ponto a outro em volta da colônia (caminho fixo pelo seed) e, quando anoitece, vai para o Módulo de Pouso.
let ANDARILHOS = [];
function prepararAndarilhos() {
  const ctr = caixaColonia();
  ANDARILHOS = (EP.mundo.andarilhos || []).map((a, i) => {
    const s = (a.seed % 9973) + i * 17;
    const ponto = (k) => {
      const ang = hash(s, k, 11) * Math.PI * 2, d = (0.3 + 0.7 * hash(s, k, 12)) * 9 * CASA;
      return { x: ctr.x + Math.cos(ang) * d, y: ctr.y + Math.sin(ang) * d * 0.7 };
    };
    return { ...a, s, ponto, periodo: 6 + (s % 5), atraso: (s % 37) / 7, i };
  });
}
function posAndarilho(a, t) {
  const passeio = (tt) => {
    const x = tt + a.atraso, k = Math.floor(x / a.periodo), f = (x - k * a.periodo) / a.periodo;
    const de = a.ponto(k), para = a.ponto(k + 1), ka = clamp(f / 0.6);
    return { x: lerp(de.x, para.x, suave(ka)), y: lerp(de.y, para.y, suave(ka)), andando: ka > 0 && ka < 1, dir: para.x >= de.x ? 1 : -1 };
  };
  const sai = tNoite + 0.8 + Math.min(a.i, 12) * 0.25;
  if (!isFinite(tNoite) || t < sai) return { ...passeio(t), visivel: true };
  const de = passeio(sai), porta = VIDA.porta, dur = clamp(Math.hypot(porta.x - de.x, porta.y - de.y) / CASA * 0.4, 1.2, 4);
  const k = clamp((t - sai) / dur);
  return { x: lerp(de.x, porta.x, suave(k)), y: lerp(de.y, porta.y, suave(k)), andando: k < 1, dir: porta.x >= de.x ? 1 : -1, visivel: k < 1 };
}
function desenharAndarilhos(view, t) {
  for (const a of ANDARILHOS) {
    const p = posAndarilho(a, t);
    if (!p.visivel || p.x / CASA < view.x0 - 2 || p.x / CASA > view.x1 + 2 || p.y / CASA < view.y0 - 2 || p.y / CASA > view.y1 + 2) continue;
    const chamado = chamadoAndarilho(a, t);
    let pulo = p.andando && Math.floor(t * 8 + a.s) % 2 ? -1 : 0;
    if (chamado >= 0) pulo = -Math.abs(Math.sin(chamado * 7)) * 4;
    ret(p.x - 4, p.y - 1, 8, 1.5, 'rgba(0,0,0,0.22)');
    ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y + pulo));
    if (p.dir < 0) ctx.scale(-1, 1);
    ctx.drawImage(spriteColono(a.seed), -6, -12, 12, 12);
    ret(-6, -8, 3, 5, '#8a5a34'); ret(-6, -8, 3, 1, '#b07a48');   // mochila de quem ainda não tem casa
    ctx.restore();
    if (chamado >= 0 && Math.floor(chamado * 6) % 2) ret(p.x + 6, p.y - 12 + pulo, 2, 3, '#f2c9a0');
  }
}
function chamadoAndarilho(a, t) {
  for (const cena of EP.cenas) for (const f of cena.focos) {
    if (f.alvo === `andarilho:${a.handle}` && t >= f.t && t < f.t + 1.6) return t - f.t;
  }
  return -1;
}

function posColono(c, t) {
  let pos = c.casaPe || { x: c.x * CASA + 11, y: c.y * CASA + 19 }, andando = false, dir = 1;
  for (const tr of c.trechos || []) {
    if (t < tr.t0) break;
    const k = clamp((t - tr.t0) / (tr.t1 - tr.t0));
    pos = { x: lerp(tr.de.x, tr.para.x, suave(k)), y: lerp(tr.de.y, tr.para.y, suave(k)) };
    andando = k > 0 && k < 1;
    dir = tr.para.x >= tr.de.x ? 1 : -1;
  }
  const h = hash(c.x, c.y, 9);
  const emCasa = !c.trechos || !c.trechos.length || t < c.trechos[0].t0;
  if (!andando && emCasa) {   // em casa: dá uns passinhos no quintal e olha para os lados
    const fase = t * 0.55 + h * 20;
    pos = { x: pos.x + Math.sin(fase) * 3, y: pos.y };
    andando = Math.abs(Math.cos(fase)) > 0.75;
    dir = Math.cos(fase) >= 0 ? 1 : -1;
  }
  const visivel = !(c.dentro && t >= c.dentro[0] && t < c.dentro[1]) && !(c.noite != null && t >= c.noite);
  const trabalhando = !!c.trabalho && !andando && t >= c.trabalho[0] && t < c.trabalho[1];
  return { x: pos.x, y: pos.y, andando, dir, visivel, trabalhando };
}

function chamadoEm(c, t) {   // quando o nome do colono é dito (boas-vindas / compras): pula e acena
  for (const cena of EP.cenas) for (const f of cena.focos) {
    const [tipo, id] = f.alvo.split(':');
    if ((tipo === 'colono' || tipo === 'compra') && id === c.codigo && t >= f.t && t < f.t + 1.6) return t - f.t;
  }
  return -1;
}

function desenharPortaAbrigo(t) {
  if (!VIDA.portaAberta || !VIDA.portaAberta.some(([a, b]) => t >= a && t < b)) return;
  const p = VIDA.porta;
  ret(p.x - 4, p.y - 9, 8, 8, '#140f26');
  ret(p.x - 4, p.y - 9, 8, 1, '#ffc83d');   // luz da porta
}

// Pet do Colono: arte e rotina em fabrica/pet.js (a MESMA do site). Brinca de bolinha, corre, senta, coça a
// orelha e pula no quintal do dono; quando o dono entra no módulo à noite, deita e dorme no quintal.
function desenharPet(c, t) {
  const t0 = aparicaoCompra(c);
  if (t0 >= 0 && t < t0) return;
  const dono = colonoPorCodigo.get(c.codigo);
  const seed = parseInt(String(c.codigo || '').replace(/\D/g, ''), 10) || 1;   // = id do dono (mesma pelagem do site)
  let r;
  if (dono && dono.noite != null && t >= dono.noite + 0.6) r = { x: c.x * CASA + 12, y: c.y * CASA + 17, dir: -1, pose: 'dormindo', pulo: 0, bola: null };
  else r = PetArte.rotinaVideo(c.x, c.y, t, seed);
  if (r.bola) PetArte.desenharBola(ctx, r.bola.x, r.bola.y, r.bola.alt);
  if (t0 >= 0 && t < t0 + 0.4) {   // chegou no episódio: aparece com um pulinho
    r = { ...r, pose: 'pulando', pulo: Math.sin(clamp((t - t0) / 0.4) * Math.PI) * 5 };
  }
  PetArte.desenhar(ctx, r.x, r.y, { pose: r.pose, dir: r.dir, t, seed, pulo: r.pulo, especie: c.especie });
}

// ------------------------------------------------------------------ posições
function centro(o) { return { x: (o.x + o.w / 2) * CASA, y: (o.y + o.h / 2) * CASA }; }
function obraDaMissao() { return EP.mundo.obras.find((o) => o.slug === EP.missao_obra); }

function posFundador(f, t) {
  let pos = f.casa, andando = false, dir = 1;
  for (const tr of f.trechos) {
    if (t < tr.t0) break;
    const k = clamp((t - tr.t0) / (tr.t1 - tr.t0));
    pos = [lerp(tr.de[0], tr.para[0], suave(k)), lerp(tr.de[1], tr.para[1], suave(k))];
    andando = k > 0 && k < 1;
    dir = tr.para[0] >= tr.de[0] ? 1 : -1;
  }
  const visivel = !(f.dentro && t >= f.dentro[0] && t < f.dentro[1]) && !(f.noite != null && t >= f.noite);
  return { x: pos[0] * CASA, y: pos[1] * CASA, andando, dir, visivel };
}

function caixaColonia() {
  const m = EP.mundo;
  const caixas = [m.base, ...m.obras.filter((o) => o.status !== 'planejada' || o.slug === EP.missao_obra)].map(retanguloDe);
  if (m.praca) caixas.push(retanguloDe(m.praca));
  // as casas mais perto do centro (o bairro inteiro não cabe na tela quando cresce)
  const perto = m.colonos.filter((c) => Math.abs(c.x - CENTRO.x) <= 16 && Math.abs(c.y - CENTRO.y) <= 16);
  if (perto.length) caixas.push({
    x0: Math.min(...perto.map((c) => c.x)) * CASA, y0: Math.min(...perto.map((c) => c.y)) * CASA,
    x1: (Math.max(...perto.map((c) => c.x)) + 1) * CASA, y1: (Math.max(...perto.map((c) => c.y)) + 1) * CASA,
  });
  return {
    x: (Math.min(...caixas.map((c) => c.x0)) + Math.max(...caixas.map((c) => c.x1))) / 2,
    y: (Math.min(...caixas.map((c) => c.y0)) + Math.max(...caixas.map((c) => c.y1))) / 2,
  };
}

function posAlvo(alvo, t) {
  const [tipo, id] = alvo.split(':');
  if (tipo === 'base') return centro(EP.mundo.base);
  if (tipo === 'obra') return centro((id && EP.mundo.obras.find((o) => o.slug === id)) || obraDaMissao());
  if (tipo === 'praca' && EP.mundo.praca) return centro(EP.mundo.praca);
  if (tipo === 'colonia' || tipo === 'panorama') return caixaColonia();
  if (tipo === 'dunas') return { x: 5 * CASA, y: (DUNAS_Y - 13) * CASA };   // Dunas do Norte
  if (tipo === 'cratera') {
    const c = (EP.mundo.crateras || []).find((x) => String(x.id) === id);
    if (c) return { x: c.x * CASA + 8, y: c.y * CASA + 8 };
  }
  if (tipo === 'ator' || tipo === 'fundador') {
    const f = EP.mundo.fundadores.find((x) => x.id === id);
    const p = posFundador(f, t);
    return { x: p.x, y: p.y - 8 };
  }
  if (tipo === 'andarilho') {
    const a = ANDARILHOS.find((x) => x.handle === alvo.slice('andarilho:'.length));
    if (a) { const p = posAndarilho(a, t); return { x: p.x, y: p.y - 6 }; }
  }
  if (tipo === 'colono' || tipo === 'compra') {
    const c = colonoPorCodigo.get(id);
    if (c && c.casaPe) { const p = posColono(c, t); return { x: p.x, y: p.y - 6 }; }
    if (c) return { x: c.x * CASA + 8, y: c.y * CASA + 8 };
  }
  return centro(EP.mundo.base);
}

function cameraNoKey(i, t) {
  const k = cameraKeys[i];
  const p = posAlvo(k.alvo, t);
  const alvo = { x: p.x, y: p.y, z: k.zoom * (1 + 0.06 * clamp((t - k.t) / 9)) };  // leve aproximação contínua
  if (i === 0 || k.D <= 0) return alvo;
  const a = suave((t - k.t) / k.D);
  if (a >= 1) return alvo;
  const de = cameraNoKey(i - 1, k.t);
  return { x: lerp(de.x, alvo.x, a), y: lerp(de.y, alvo.y, a), z: Math.exp(lerp(Math.log(de.z), Math.log(alvo.z), a)) };
}

function camera(t) {
  let i = 0;
  while (i + 1 < cameraKeys.length && cameraKeys[i + 1].t <= t) i++;
  return cameraNoKey(i, t);
}

function cenaEm(t) {
  for (const c of EP.cenas) if (t < c.fim) return c;
  return EP.cenas[EP.cenas.length - 1];
}

// ------------------------------------------------------------------ desenho do mundo (coordenadas do mundo)
function discoEm(c, cx, cy, r, cor, achatado = 1) {
  c.fillStyle = cor;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy));
    c.fillRect(Math.round(cx - w), Math.round(cy + dy * achatado), 2 * w + 1, Math.max(1, Math.ceil(achatado)));
  }
}
const disco = (cx, cy, r, cor, ach) => discoEm(ctx, cx, cy, r, cor, ach);
const ret = (x, y, w, h, cor) => { ctx.fillStyle = cor; ctx.fillRect(x, y, w, h); };

function desenharBase(t, energia) {
  const b = EP.mundo.base, { x: cx, y: cy } = centro(b);
  let alt = 0;
  if (EP.numero === 1) alt = 260 * Math.pow(1 - clamp(t / 3.0), 2);   // pouso no ep. 1
  disco(cx, cy + 22, 26 - Math.min(14, alt / 18), 'rgba(0,0,0,0.25)', 0.3);
  const y = cy - alt;
  // pernas
  for (const s of [-1, 1]) {
    ret(cx + s * 17 - 1, y + 8, 3, 14, '#6b6f86');
    ret(cx + s * 22 - 2, y + 20, 6, 3, '#4a4d60');
  }
  if (alt > 0.5) {  // chama do pouso
    const f = Math.floor(t * 20) % 2;
    ret(cx - 6, y + 22, 12, 6 + f * 3, '#ffc83d');
    ret(cx - 3, y + 26, 6, 8 + f * 4, '#e2603b');
  } else if (EP.numero === 1 && t < 4.2) {  // poeira do pouso
    const k = clamp((t - 3.0) / 1.2);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = 18 + k * 40;
      ctx.globalAlpha = 0.55 * (1 - k);
      ret(cx + Math.cos(a) * r - 3, cy + 18 + Math.sin(a) * r * 0.35 - 2, 6, 4, '#e7b48c');
    }
    ctx.globalAlpha = 1;
  }
  disco(cx, y, 23, '#6b6f86');
  disco(cx, y, 21, '#e4e6f0');
  disco(cx + 3, y + 4, 17, '#d2d5e2');
  ctx.fillStyle = COR.marte;
  for (let dy = 3; dy <= 7; dy++) { const w = Math.floor(Math.sqrt(21 * 21 - dy * dy)); ctx.fillRect(cx - w, y + dy, 2 * w + 1, 1); }
  for (const dx of [-11, -3, 5]) {
    if (energia) { ctx.globalAlpha = 0.3 + 0.1 * Math.sin(t * 3 + dx); ret(cx + dx - 2, y - 10, 10, 10, '#ffd84a'); ctx.globalAlpha = 1; }
    ret(cx + dx, y - 8, 6, 6, energia ? '#ffe58a' : '#2b2350');
  }
  disco(cx, y - 14, 5, '#9aa0b5');
  ret(cx - 1, y - 28, 2, 14, '#9aa0b5');
  if (Math.floor(t * 1.5) % 2 === 0) ret(cx - 2, y - 30, 4, 3, '#ff4d4d');
  if (alt < 0.5) ret(cx - 5, y + 19, 10, 6, '#9aa0b5');  // rampa
}

function progressoObra(o, t) {
  if (o.slug !== EP.missao_obra) return { p: o.status === 'concluida' ? 1 : o.progresso / 100, dem: o.status !== 'planejada', energia: o.status === 'concluida' };
  let p = o.progresso / 100;
  for (const c of cenaMissao) {
    if (t < c.inicio) break;
    const [a, b] = c.progresso;
    const k = clamp((t - c.inicio - 0.3) / ((c.fim - c.inicio) * 0.85));
    p = Math.max(p, lerp(a, b, suave(k)));
  }
  return { p, dem: t >= tempoDemarcar || p > 0, energia: t >= tempoEnergia };
}

function desenharDemarcacao(r, t) {
  const pisca = 0.75 + 0.25 * Math.sin(t * 5);
  ctx.globalAlpha = pisca;
  ctx.fillStyle = COR.areia;
  for (let x = r.x0; x < r.x1; x += 8) { ctx.fillRect(x, r.y0, 4, 1); ctx.fillRect(x, r.y1 - 1, 4, 1); }
  for (let y = r.y0; y < r.y1; y += 8) { ctx.fillRect(r.x0, y, 1, 4); ctx.fillRect(r.x1 - 1, y, 1, 4); }
  ctx.globalAlpha = 1;
  for (const [x, y] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]]) {
    ret(x - 1, y - 6, 2, 7, '#6b4a2e'); ret(x - 2, y - 7, 4, 2, COR.ouro);
  }
}

function desenharSolar(o, st, t) {
  const r = retanguloDe(o);
  if (st.dem && st.p < 1) desenharDemarcacao(r, t);
  const cols = o.w, linhas = o.h - 1, N = cols * linhas;
  const vis = st.p * N;
  for (let k = 0; k < N; k++) {
    const s = clamp(vis - k);
    if (s <= 0) break;
    const c = k % cols, l = Math.floor(k / cols);
    const x = r.x0 + c * CASA + 1, y = r.y0 + 8 + l * CASA - (1 - saida(s)) * 14;
    ctx.globalAlpha = clamp(s * 2);
    ret(x + 6, y + 10, 2, 3, '#3a2f63');
    ret(x, y, 14, 10, '#9aa0b5');
    const brilho = st.energia && ((t * 1.4 + c * 0.18 + l * 0.11) % 2.4) < 0.22;
    ret(x + 1, y + 1, 12, 8, brilho ? '#7d9cf0' : '#22357a');
    ctx.fillStyle = '#4766c8';
    ctx.fillRect(x + 5, y + 1, 1, 8); ctx.fillRect(x + 9, y + 1, 1, 8); ctx.fillRect(x + 1, y + 5, 12, 1);
    if (st.energia && (Math.floor(t * 2 + k) % 4 === 0)) ret(x + 12, y + 1, 1, 1, COR.ok);
    ctx.globalAlpha = 1;
  }
  if (st.p >= 1) desenharCabo(r, t, st.energia);
}

function desenharCabo(r, t, energia) {
  const b = retanguloDe(EP.mundo.base);
  const x0 = r.x0, y0 = Math.round((r.y0 + r.y1) / 2), x1 = b.x1 - 6, y1 = Math.round((b.y0 + b.y1) / 2) + 4;
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3);
  for (let i = 0; i <= n; i++) {
    const k = i / n, x = lerp(x0, x1, k), y = lerp(y0, y1, k) + Math.sin(k * Math.PI) * 6;
    ret(Math.round(x), Math.round(y), 2, 2, '#2a2140');
    if (energia && ((k * 6 - t * 1.6) % 1 + 1) % 1 < 0.08) ret(Math.round(x) - 1, Math.round(y) - 1, 4, 4, '#ffd84a');
  }
}

function desenharEstufa(o, st, t) {   // sobe de baixo para cima: vidro e canteiros fileira por fileira
  const r = retanguloDe(o);
  if (st.dem && st.p < 1) desenharDemarcacao(r, t);
  if (st.p <= 0) return;
  const colunas = o.w * 2, larg = (r.x1 - r.x0 - 4) / colunas, H = r.y1 - r.y0 - 12, alt = Math.max(2, st.p * H), topo = r.y1 - 6 - alt;
  ret(r.x0 + 2, r.y1 - 6, r.x1 - r.x0 - 4, 4, '#6b6f86');
  for (let i = 0; i < colunas; i++) {
    const x = r.x0 + 2 + i * larg;
    ctx.globalAlpha = 0.55; ret(x, topo, larg - 1, alt, '#8fe6ff'); ctx.globalAlpha = 1;
    ret(x, topo, 1, alt, '#eef0f8');
    for (let j = 0; j < 3; j++) { const y = r.y0 + 14 + j * 12; if (y >= topo) ret(x + 3, y, 4, 4, j % 2 ? '#2bb673' : '#4ed37a'); }
  }
  if (st.p < 1) ret(r.x0 + 2, topo - 1, r.x1 - r.x0 - 4, 2, '#ffc83d');   // borda da obra subindo
}

function desenharAntena(o, st, t) {
  const r = retanguloDe(o);
  if (st.dem && st.p < 1) desenharDemarcacao(r, t);
  if (st.p <= 0) return;
  // com colina (colonia.json), a torre fica no TOPO dela (mesma regra de lib/colonia-arte.ts)
  const cx = (r.x0 + r.x1) / 2, alt = (r.y1 - r.y0 - 14) * clamp(st.p / 0.85);
  const base = o.colina ? Math.round((o.y + o.h / 2 + (o.colina.dy || 0)) * CASA) - 10 : r.y1 - 4;
  ret(cx - 10, base, 20, 4, '#6b6f86');
  for (let y = 0; y < alt; y += 2) {
    const w = lerp(8, 2, y / (r.y1 - r.y0));
    ret(cx - w, base - y, 1, 2, '#9aa0b5'); ret(cx + w, base - y, 1, 2, '#9aa0b5');
    if (y % 8 === 0) ret(cx - w, base - y, 2 * w, 1, '#6b6f86');
  }
  if (st.p > 0.85) { disco(cx + 6, base - alt - 2, 7, '#e4e6f0', 0.6); ret(cx + 5, base - alt - 2, 2, 2, '#6b6f86'); }
  if (st.energia && Math.floor(t * 2) % 2 === 0) ret(cx - 2, base - alt - 6, 4, 4, '#ff4d4d');
}

// ------------------------------------------------------------------ obras 4 a 10 (mesmo código no site e no vídeo)
// Gerado a partir de um só texto: lib/colonia-arte.ts (TypeScript) e fabrica/diretor.js (sem os tipos).
// O prédio sobe de baixo para cima conforme o progresso, com andaime enquanto não termina.
const PR = (c, x, y, w, h, cor) => { c.fillStyle = cor; c.fillRect(Math.round(x), Math.round(y), w, h); };
function PD(c, cx, cy, r, cor, ach = 1, metade = false) {
  c.fillStyle = cor;
  for (let dy = -r; dy <= (metade ? 0 : r); dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy));
    c.fillRect(Math.round(cx - w), Math.round(cy + dy * ach), 2 * w + 1, Math.max(1, Math.ceil(ach)));
  }
}
function fumaca(c, x, y, t, n) {
  for (let i = 0; i < n; i++) {
    const k = (t * 0.5 + i / n) % 1;
    c.globalAlpha = 0.55 * (1 - k);
    PD(c, x + Math.sin(t * 2 + i) * 2, y - k * 18, 2 + Math.floor(k * 3), '#f3eefe');
  }
  c.globalAlpha = 1;
}

// Até 15% a obra é só a FUNDAÇÃO (como a do Extrator de Gelo no fim do ep. 6): vala → fôrmas e malha de aço → laje
// de concreto com os chumbadores da estrutura. MESMA arte em lib/colonia-arte.ts e fabrica/diretor.js.
const FUNDACAO = 0.16;
function fundacaoDaObra(c, r, p) {
  const k = Math.min(1, p / 0.15), x0 = r.x0 + 3, y0 = r.y0 + 6, w = r.x1 - r.x0 - 6, h = r.y1 - r.y0 - 9;
  PR(c, x0 - 1, y0 - 1, w + 2, h + 2, '#5a2a18'); PR(c, x0, y0, w, h, '#2a120a');
  if (k > 0.35) {
    c.fillStyle = '#c99a1f'; c.fillRect(x0, y0, w, 1); c.fillRect(x0, y0 + h - 1, w, 1); c.fillRect(x0, y0, 1, h); c.fillRect(x0 + w - 1, y0, 1, h);
    c.fillStyle = '#e2603b';
    for (let x = x0 + 5; x < x0 + w - 2; x += 5) c.fillRect(Math.round(x), y0 + 1, 1, h - 2);
    for (let y = y0 + 5; y < y0 + h - 2; y += 5) c.fillRect(x0 + 1, Math.round(y), w - 2, 1);
  }
  if (k > 0.6) {
    const cw = (w - 2) * Math.min(1, (k - 0.6) / 0.4);
    PR(c, x0 + 1, y0 + 1, cw, h - 2, '#9aa0b5'); PR(c, x0 + 1, y0 + 1, cw, 1, '#c9ced9');
  }
  if (k >= 1) for (let i = 0; i < 4; i++) PR(c, x0 + 3 + i * (w - 8) / 3, y0 + 3, 2, 2, '#e2603b');
}

function predioEmObra(c, r, st, t, pintar) {
  if (st.p <= 0) return;
  if (st.p < FUNDACAO) { fundacaoDaObra(c, r, st.p); return; }
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

function pintarGelo(c, r, st, t) {
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

function pintarOxigenio(c, r, st, t) {
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

function pintarOficina(c, r, st, t) {
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

function pintarCantina(c, r, st, t) {
  const cx = (r.x0 + r.x1) / 2, chao = r.y1 - 4;
  PD(c, cx, chao, 24, '#6b6f86', 1, true); PD(c, cx, chao, 22, '#f4b46b', 1, true); PD(c, cx + 3, chao, 16, '#e89a55', 1, true);
  for (const dx of [-14, -2, 10]) PR(c, cx + dx, chao - 12, 5, 5, st.energia ? '#ffe58a' : '#2b2350');
  PR(c, cx - 4, chao - 9, 8, 9, '#3a2f63');
  PR(c, cx + 12, r.y0 + 4, 4, 14, '#6b6f86');
  if (st.energia) fumaca(c, cx + 14, r.y0 + 3, t, 3);
}

function pintarEnfermaria(c, r, st, t) {
  const cx = (r.x0 + r.x1) / 2;
  PR(c, r.x0 + 3, r.y0 + 12, 42, 32, '#b9bdcc'); PR(c, r.x0 + 4, r.y0 + 13, 40, 30, '#eef0f8');
  PR(c, r.x0 + 2, r.y0 + 9, 44, 4, '#c9ced9');
  PR(c, cx - 2, r.y0 + 16, 4, 12, '#e04f5f'); PR(c, cx - 6, r.y0 + 20, 12, 4, '#e04f5f');
  PR(c, cx - 4, r.y1 - 13, 8, 11, '#3fd0c9');
  if (st.energia && Math.floor(t * 1.5) % 2 === 0) PR(c, r.x1 - 9, r.y0 + 5, 4, 4, '#4ed37a');
}

function pintarAbrigo(c, r, st, t) {
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

function pintarLaboratorio(c, r, st, t) {
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

const PINTORES = {
  gelo: pintarGelo, oxigenio: pintarOxigenio, oficina: pintarOficina, cantina: pintarCantina,
  enfermaria: pintarEnfermaria, abrigo: pintarAbrigo, laboratorio: pintarLaboratorio,
};

// Obra do dia pronta → quatro colonos vão até o terreno da PRÓXIMA obra e cravam uma estaca em cada canto (a fita
// aparece quando as quatro estão de pé) e dois começam a cavar a fundação no meio. Depois sobe a placa.
let DEMARCA = null;
function planejarDemarcacao() {
  DEMARCA = null;
  const o = EP.proxima_obra && EP.mundo.obras.find((x) => x.slug === EP.proxima_obra);
  const lig = EP.cenas.filter((c) => c.tipo === 'missao').pop();
  if (!o || !lig) return;
  const quem = EP.mundo.colonos.filter((c) => c.ajudante != null && c.ajudante >= 0).slice(0, 6);
  if (!quem.length) return;
  const cantos = [[o.x - 0.3, o.y + 0.2], [o.x + o.w + 0.3, o.y + 0.2], [o.x - 0.3, o.y + o.h + 0.5], [o.x + o.w + 0.3, o.y + o.h + 0.5]];
  const meio = [[o.x + o.w / 2 - 0.7, o.y + o.h / 2 + 0.6], [o.x + o.w / 2 + 0.7, o.y + o.h / 2 + 0.8]];
  const estacas = [];
  quem.forEach((c, i) => {
    const alvo = i < 4 ? cantos[i] : meio[i - 4];
    const t0 = lig.inicio + 0.6 + i * 0.35;
    const de = c.trechos.length ? c.trechos[c.trechos.length - 1].para : c.casaPe;
    const para = { x: alvo[0] * CASA, y: alvo[1] * CASA };
    const dur = clamp(Math.hypot(para.x - de.x, para.y - de.y) / CASA * 0.22, 1.2, 3.2);
    c.trechos.push({ t0, t1: t0 + dur, de, para });
    c.demarca = { chega: t0 + dur, tipo: i < 4 ? 'estaca' : 'cava' };
    if (i < 4) estacas.push({ x: cantos[i][0] * CASA + (i % 2 ? -2 : 2), y: (cantos[i][1] - 0.2) * CASA, t: t0 + dur + 0.9 });
  });
  const fita = Math.max(...estacas.map((e) => e.t), 0) + 0.4;
  DEMARCA = { o, estacas, fita, cava: lig.inicio + 3, placa: fita + 1.2 };
}

function desenharProximaObra(o, t) {
  if (!DEMARCA) return;
  const r = retanguloDe(o);
  for (const e of DEMARCA.estacas) if (t >= e.t) {   // estaca cravada (cai do alto e para)
    const k = clamp((t - e.t) / 0.25);
    ret(e.x - 1, e.y - 7 * k, 2, 7 * k, '#6b4a2e'); ret(e.x - 2, e.y - 8 * k, 4, 2, COR.ouro);
  }
  if (t >= DEMARCA.fita) {                           // a fita entre as estacas
    ctx.globalAlpha = clamp((t - DEMARCA.fita) / 0.5) * (0.75 + 0.25 * Math.sin(t * 5));
    ctx.fillStyle = COR.areia;
    for (let x = r.x0; x < r.x1; x += 8) { ctx.fillRect(x, r.y0, 4, 1); ctx.fillRect(x, r.y1 - 1, 4, 1); }
    for (let y = r.y0; y < r.y1; y += 8) { ctx.fillRect(r.x0, y, 1, 4); ctx.fillRect(r.x1 - 1, y, 1, 4); }
    ctx.globalAlpha = 1;
  }
  if (FUND && FUND.obra === o && t >= FUND.ini) desenharFundacaoMapa(r, t);
  else if (t >= DEMARCA.cava) {                      // buraco da fundação crescendo no meio
    const k = clamp((t - DEMARCA.cava) / 8), cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2 + 6;
    const w = 6 + k * 20, h = 3 + k * 7;
    ret(cx - w / 2, cy - h / 2, w, h, '#5a2a18'); ret(cx - w / 2 + 1, cy - h / 2 + 1, w - 2, h - 2, '#2a120a');
    for (let i = 0; i < 5; i++) ret(cx + w / 2 + 2 + i * 2, cy + 2 - (i % 3) * 2 - k * 3, 3, 2 + k * 3, '#8f4129');
  }
  if (t < DEMARCA.placa) return;
  const k = clamp((t - DEMARCA.placa) / 0.8);
  ctx.globalAlpha = k;
  const px = (r.x0 + r.x1) / 2, py = r.y1 + 30;   // placa na frente do terreno (abaixo de quem cava)
  ret(px - 1.5, py, 3, 16, '#6b4a2e');
  ret(px - 64, py - 22, 128, 24, '#140f26'); ret(px - 64, py - 22, 128, 3, COR.ouro);
  ctx.fillStyle = COR.ouro; ctx.textAlign = 'center'; ctx.font = `7px ${FONTE}`;
  ctx.fillText('PRÓXIMA OBRA', px, py - 12);
  ctx.fillStyle = '#f3eefe'; ctx.font = `5px ${FONTE}`; ctx.fillText((o.nome || '').toUpperCase().slice(0, 24), px, py - 3);
  ctx.globalAlpha = 1;
}

// fundação da próxima obra vista de cima: vala do tamanho do terreno → fôrmas e malha de aço → concreto
function desenharFundacaoMapa(r, t) {
  const k = clamp((t - FUND.ini) / (FUND.fim - FUND.ini));
  const kc = clamp((k - 0.38) / 0.24), kk = clamp((k - 0.62) / 0.33);
  const x0 = r.x0 + 3, y0 = r.y0 + 6, w = r.x1 - r.x0 - 6, h = r.y1 - r.y0 - 9;
  const cava = saida(clamp(k / 0.38));
  const cw = Math.max(8, w * cava), ch = Math.max(4, h * cava), cx0 = x0 + (w - cw) / 2, cy0 = y0 + (h - ch) / 2;
  ret(cx0 - 1, cy0 - 1, cw + 2, ch + 2, '#5a2a18'); ret(cx0, cy0, cw, ch, '#2a120a');
  for (let i = 0; i < 7; i++) ret(r.x1 + 3 + (i % 3) * 3, r.y1 - 4 - i * 2 - cava * 3, 4, 3 + cava * 3, '#8f4129');   // monte de terra
  if (kc > 0) {   // fôrmas de madeira na borda + malha de aço laranja
    ctx.fillStyle = '#c99a1f';
    ctx.fillRect(cx0, cy0, cw, 1); ctx.fillRect(cx0, cy0 + ch - 1, cw, 1); ctx.fillRect(cx0, cy0, 1, ch); ctx.fillRect(cx0 + cw - 1, cy0, 1, ch);
    ctx.fillStyle = '#e2603b';
    const nx = Math.floor(cw / 5), ny = Math.floor(ch / 5), n = Math.floor((nx + ny) * kc);
    for (let i = 1; i < nx && i <= n; i++) ctx.fillRect(Math.round(cx0 + i * 5), cy0 + 1, 1, ch - 2);
    for (let j = 1; j < ny && nx + j <= n + nx * 0.5; j++) ctx.fillRect(cx0 + 1, Math.round(cy0 + j * 5), cw - 2, 1);
  }
  if (kk > 0) {   // concreto entrando de um lado ao outro
    const cwk = (cw - 2) * kk;
    ret(cx0 + 1, cy0 + 1, cwk, ch - 2, '#9aa0b5');
    ret(cx0 + 1, cy0 + 1, cwk, 1, '#c9ced9');
    if (kk < 1) ret(cx0 + cwk - 1, cy0 + 1, 2, ch - 2, '#6b6f86');
  }
  if (k >= 1) {   // laje pronta: chumbadores para a estrutura de amanhã
    for (let i = 0; i < 4; i++) ret(cx0 + 3 + i * (cw - 8) / 3, cy0 + 3, 2, 2, '#e2603b');
  }
}

// Mapa das Dunas do Norte (votação SIM): rota do rover saindo da base, a varredura em zigue-zague, a área
// mapeada em grade e, cruzando tudo, a trilha de pneus que não é nossa, com o "?" piscando.
const TRILHA_DUNAS_DESDE = 6;   // a partir do ep. 7 a trilha já está no mapa desde o começo (= site)
function desenharMapaDunas(t) {
  const M = DUNAS_MAPA || (EP.numero > TRILHA_DUNAS_DESDE ? { t0: -100 } : null);
  if (!M || t < M.t0) return;
  const D = posAlvo('dunas', t), b = EP.mundo.base, k = t - M.t0;
  const porta = { x: (b.x + b.w / 2) * CASA, y: b.y * CASA - 2 };
  const pts = [porta, { x: porta.x, y: D.y + 170 }, { x: D.x - 120, y: D.y + 110 }];
  for (let i = 0; i < 6; i++) {
    const y = D.y + 110 - i * 50, a = i % 2 ? D.x + 120 : D.x - 120, c = i % 2 ? D.x - 120 : D.x + 120;
    if (i) pts.push({ x: a, y });
    pts.push({ x: c, y });
  }
  // área mapeada (grade ciano)
  const ka = clamp(k / 0.6);
  ctx.globalAlpha = 0.1 * ka; ret(D.x - 135, D.y - 160, 270, 290, '#3fd0c9');
  ctx.globalAlpha = 0.22 * ka; ctx.fillStyle = '#8fe6ff';
  for (let x = D.x - 135; x <= D.x + 135; x += 30) ctx.fillRect(x, D.y - 160, 1, 290);
  for (let y = D.y - 160; y <= D.y + 130; y += 30) ctx.fillRect(D.x - 135, y, 270, 1);
  ctx.globalAlpha = ka; ctx.fillStyle = '#3fd0c9';
  for (let x = D.x - 135; x < D.x + 135; x += 8) { ctx.fillRect(x, D.y - 160, 4, 2); ctx.fillRect(x, D.y + 128, 4, 2); }
  for (let y = D.y - 160; y < D.y + 130; y += 8) { ctx.fillRect(D.x - 135, y, 2, 4); ctx.fillRect(D.x + 133, y, 2, 4); }
  ctx.globalAlpha = 1;
  // rota do rover (pontilhado se desenhando)
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let falta = L * saida(clamp(k / 1.8)), fim = pts[0];
  ctx.fillStyle = '#bff8ff';
  for (let i = 1; i < pts.length && falta > 0; i++) {
    const a = pts[i - 1], c = pts[i], d = Math.hypot(c.x - a.x, c.y - a.y), q = Math.min(1, falta / d);
    for (let s = 0; s <= d * q; s += 6) ctx.fillRect(Math.round(a.x + (c.x - a.x) * s / d) - 1, Math.round(a.y + (c.y - a.y) * s / d) - 1, 3, 3);
    fim = { x: a.x + (c.x - a.x) * q, y: a.y + (c.y - a.y) * q };
    falta -= d;
  }
  ret(fim.x - 5, fim.y - 3, 10, 6, '#eef0f8'); ret(fim.x - 4, fim.y + 3, 3, 2, '#2a2140'); ret(fim.x + 2, fim.y + 3, 3, 2, '#2a2140');   // o rover
  if (Math.floor(t * 3) % 2) ret(fim.x - 1, fim.y - 6, 2, 2, '#ff4d4d');
  // trilha desconhecida (vermelha, com sulcos em V), saindo da área para o norte
  const kt = clamp((k - 0.7) / 1.2);
  if (kt <= 0) return;
  const A = { x: D.x - 170, y: D.y + 80 }, B = { x: D.x + 190, y: D.y - 260 };
  const dl = Math.hypot(B.x - A.x, B.y - A.y), u = { x: (B.x - A.x) / dl, y: (B.y - A.y) / dl }, n = { x: -u.y, y: u.x };
  for (const lado of [-1, 1]) for (let s = 0; s < dl * kt; s += 7) {
    const cx = A.x + u.x * s + n.x * lado * 9, cy = A.y + u.y * s + n.y * lado * 9;
    for (const j of [-1, 1]) for (let m = 0; m < 3; m++) {
      ctx.fillStyle = m === 2 ? '#7a2030' : '#e04f5f';
      ctx.fillRect(Math.round(cx - u.x * m * 1.4 + n.x * j * m * 1.6), Math.round(cy - u.y * m * 1.4 + n.y * j * m * 1.6), 2, 2);
    }
  }
  // "?" no ponto onde a trilha cruza a área
  if (kt > 0.4) {
    const P = { x: A.x + u.x * dl * 0.42, y: A.y + u.y * dl * 0.42 }, pul = 1 + 0.25 * Math.sin(t * 6);
    ctx.globalAlpha = clamp((kt - 0.4) / 0.2);
    ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(P.x, P.y, 16 * pul, 0, Math.PI * 2); ctx.stroke();
    ret(P.x - 9, P.y - 36, 18, 18, '#140f26'); ret(P.x - 9, P.y - 36, 18, 2, '#ff4d4d');
    ctx.fillStyle = '#ff4d4d'; ctx.font = `12px ${FONTE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', P.x, P.y - 26);
    ctx.font = `5px ${FONTE}`; ctx.fillStyle = '#f3eefe';
    ctx.fillText('TRILHA DESCONHECIDA', P.x, P.y + 26);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
  }
}

// Redemoinho de poeira gigante (pixel art, em qualquer contexto): coluna que alarga para cima, faixas girando,
// grãos orbitando e a "saia" de poeira no chão. cx/base = pé da coluna; alt/larg em px do contexto.
function funilEm(c, cx, base, alt, larg, t, a = 1) {
  const passo = Math.max(2, Math.round(alt / 90));
  const curva = (f) => Math.sin(t * 1.3 + f * 3) * larg * 0.08 * f + f * larg * 0.07;
  for (let y = 0; y < alt; y += passo) {
    const f = y / alt, w = larg * (0.16 + 0.84 * Math.pow(f, 1.4)), x = cx + curva(f) - w / 2;
    const fase = ((f * 9 - t * 2.4) % 1 + 1) % 1;
    c.globalAlpha = a * (0.6 + 0.3 * f) * (f > 0.9 ? (1 - f) / 0.1 : 1);
    c.fillStyle = fase < 0.5 ? '#c98a5e' : '#a8643f';
    c.fillRect(Math.round(x), Math.round(base - y - passo), Math.round(w), passo);
    c.fillStyle = '#e8b48c';
    c.fillRect(Math.round(x), Math.round(base - y - passo), Math.max(1, Math.round(w * 0.12)), passo);
  }
  const s = Math.max(1, Math.round(larg / 40));
  for (let i = 0; i < 70; i++) {
    const f = hash(i, 71), ang = t * (5 - f * 2) + i * 2.4, w = larg * (0.16 + 0.84 * Math.pow(f, 1.4));
    c.globalAlpha = a * (Math.sin(ang) > 0 ? 0.9 : 0.4);
    c.fillStyle = i % 3 ? '#8f4129' : '#f2c08e';
    c.fillRect(Math.round(cx + curva(f) + Math.cos(ang) * w * 0.62), Math.round(base - f * alt + Math.sin(ang) * w * 0.08), s, s);
  }
  for (let i = 0; i < 26; i++) {
    const q = (t * 0.6 + hash(i, 72)) % 1, lado = hash(i, 73) > 0.5 ? 1 : -1, r = larg * (0.15 + q * 0.6);
    c.globalAlpha = a * 0.5 * (1 - q);
    c.fillStyle = '#b8754f';
    c.fillRect(Math.round(cx + lado * r - r * 0.3), Math.round(base - 2 - q * larg * 0.15), Math.round(r * 0.6), Math.max(2, Math.round(larg * 0.06)));
  }
  c.globalAlpha = 1;
}
// o redemoinho atravessando a tela do mapa: ao longe no alerta, cruzando a colônia na solução até o vento passar
function redemoinhoNoMapa(t) {
  const ini = EP.cenas.find((c) => c.tipo === 'problema'), sol = EP.cenas.find((c) => c.tipo === 'solucao');
  let x = 0, a = 0, esc = 1;
  if (ini && t >= ini.inicio && t < ini.fim) {
    const k = (t - ini.inicio) / (ini.fim - ini.inicio);
    a = clamp((t - ini.inicio) / 0.6) * clamp((ini.fim - t) / 0.4); x = W + 60 - k * 300; esc = 0.75 + k * 0.25;
  } else if (sol && t >= sol.inicio && t < sol.fim) {
    const fim = isFinite(VIDA.tSai) ? VIDA.tSai : sol.fim, k = clamp((t - sol.inicio) / Math.max(1, fim - sol.inicio));
    a = clamp((t - sol.inicio) / 0.5) * clamp((fim + 0.8 - t) / 0.8); x = W * 0.8 - k * W * 1.3; esc = 1.15;
  }
  if (a <= 0) return;
  funilEm(ctx, x, H * 0.68, 1150 * esc, 270 * esc, t, a * 0.9);
  ctx.globalAlpha = a * 0.16; ret(0, 0, W, H, '#c98a5e'); ctx.globalAlpha = 1;
}

function desenharObras(t) {
  for (const o of EP.mundo.obras) {
    if (o.slug === EP.proxima_obra && o.status === 'planejada') { desenharProximaObra(o, t); continue; }
    if (o.status === 'planejada' && o.slug !== EP.missao_obra) continue;
    const st = progressoObra(o, t);
    if (o.tipo === 'solar') desenharSolar(o, st, t);
    else if (o.tipo === 'antena') desenharAntena(o, st, t);
    else if (PINTORES[o.tipo]) {
      const r = retanguloDe(o);
      if (st.dem && st.p < 1) desenharDemarcacao(r, t);
      predioEmObra(ctx, r, st, t, PINTORES[o.tipo]);
    } else desenharEstufa(o, st, t);
  }
}

// ------------------------------------------------------------------ mutirão da obra em fases
// Toda Missão do Dia mostra as três etapas, uma por cena: 2ª cena CAVAR (buraco da fundação, terra voando),
// 3ª LEVANTAR A ESTRUTURA (vigas no ombro, guindaste subindo viga) e 4ª/5ª MONTAR (gente no andaime soldando
// no topo do que já subiu). O prédio sobe de baixo para cima (predioEmObra), com o esqueleto de vigas por cima.
function faseDaObra(t) {
  const o = obraDaMissao();
  if (!o) return null;
  const cena = EP.cenas.find((c) => c.tipo === 'missao' && t >= c.inicio && t < c.fim);
  if (!cena || cena.acao === 'ligar' || cena.acao === 'apresentar') return null;
  const fase = cena.passo <= 2 ? 'cavar' : cena.passo === 3 ? 'levantar' : 'montar';
  const r = retanguloDe(o), st = progressoObra(o, t);
  const topo = r.y1 - Math.max(4, st.p * (r.y1 - r.y0));
  return { fase, r, p: st.p, topo, k: clamp((t - cena.inicio) / Math.max(0.1, cena.fim - cena.inicio)), solar: o.tipo === 'solar' };
}

// buraco da fundação (cavar), pilha de vigas e guindaste (levantar): desenhados ANTES dos colonos
function desenharCanteiro(t) {
  const f = faseDaObra(t);
  if (!f) return;
  const { r } = f, W = r.x1 - r.x0, cx = (r.x0 + r.x1) / 2;
  if (f.fase === 'cavar') {
    const larg = Math.max(12, (W - 6) * (0.3 + 0.7 * f.k)), x0 = cx - larg / 2;
    ret(x0, r.y1 + 1, larg, 6, '#5a2a18'); ret(x0 + 1, r.y1 + 2, larg - 2, 4, '#2a120a');   // vala da fundação
    for (let i = 0; i < 6; i++) ret(r.x1 + 2 + i * 2, r.y1 + 6 - (i % 3) * 2 - f.k * 5, 3, 2 + f.k * 5, '#8f4129');   // monte de terra
  }
  if (f.fase !== 'cavar') {   // pilha de vigas ao lado da obra
    for (let i = 0; i < 4; i++) ret(r.x0 - 16, r.y1 - 2 - i * 2, 12, 1.5, i % 2 ? '#9aa0b5' : '#c9ced9');
  }
  if (f.fase === 'levantar' && !f.solar) {   // guindaste: torre, braço e a viga subindo no cabo
    const gx = r.x1 + 4, alto = r.y0 - 12;
    ret(gx, alto, 2, r.y1 - alto, '#ffc83d');
    for (let y = alto + 3; y < r.y1; y += 4) ret(gx - 1, y, 4, 1, '#c99a1f');
    ret(gx - W * 0.55, alto, W * 0.55 + 6, 2, '#ffc83d');
    const ciclo = (t * 0.35) % 1, bx = gx - W * 0.4, by = r.y1 - 4 - (r.y1 - f.topo + 6) * Math.min(1, ciclo * 1.4);
    ret(bx, alto + 2, 1, by - alto - 2, '#2b2350');
    ret(bx - 6, by, 13, 2, '#9aa0b5');
  }
}

// esqueleto de vigas da obra inteira, por cima do que ainda não subiu (some quando a obra termina)
function desenharEsqueleto(t) {
  const f = faseDaObra(t);
  if (!f || f.solar || f.fase === 'cavar' || f.p >= 1) return;
  const { r } = f;
  ctx.globalAlpha = 0.5;
  for (const x of [r.x0 + 2, (r.x0 + r.x1) / 2, r.x1 - 3]) ret(x, r.y0 + 4, 1, f.topo - r.y0 - 4, '#c9ced9');
  for (let y = f.topo - 6; y > r.y0 + 4; y -= 7) ret(r.x0 + 2, y, r.x1 - r.x0 - 4, 1, '#c9ced9');
  ctx.globalAlpha = 1;
}

// posição e ferramenta de cada ajudante na fase atual
function poseDeTrabalho(c, p, t) {
  const f = faseDaObra(t);
  if (!f || c.ajudante == null || c.ajudante < 0) return null;
  const i = c.ajudante, h = hash(c.x, c.y, 13);
  if (f.fase === 'levantar' && i % 2 === 0) {   // carrega viga da pilha até a obra, e volta
    const vai = 0.5 - 0.5 * Math.cos(t * 1.1 + h * 6);
    return { fase: f.fase, x: lerp(f.r.x0 - 10, p.x, vai), y: p.y, dir: Math.sin(t * 1.1 + h * 6) >= 0 ? 1 : -1, anda: true, viga: true };
  }
  if (f.fase === 'montar' && i % 3 === 0 && !f.solar) {   // sobe no andaime e solda no topo
    return { fase: f.fase, x: Math.min(f.r.x1 - 6, Math.max(f.r.x0 + 6, p.x)), y: f.topo + 1, dir: i % 2 ? 1 : -1, solda: true };
  }
  return { fase: f.fase, x: p.x, y: p.y, dir: p.dir };
}

function ferramenta(pose, x, y, t, h) {
  if (pose.fase === 'cavar') {   // pá: cabo + lâmina, cavando no ritmo, com terra voando
    const k = (t * 2.2 + h * 3) % 1, a = k < 0.5 ? k * 2 : 2 - k * 2;
    ret(x + 4, y - 11 + a * 4, 1, 9, '#b07a3a'); ret(x + 3, y - 2 + a * 4, 3, 3, '#e4e6f0'); ret(x + 3, y - 12 + a * 4, 3, 1, '#b07a3a');
    if (k > 0.55) for (let j = 0; j < 3; j++) {
      const q = (k - 0.55) / 0.45;
      ret(x + 6 + j * 3 * q * 2, y - 4 - Math.sin(q * Math.PI) * (6 + j * 2), 2, 2, j % 2 ? '#8f4129' : '#a14b2f');
    }
  } else if (pose.viga) {
    ret(x - 7, y - 14, 14, 2, '#9aa0b5'); ret(x - 7, y - 14, 14, 1, '#e4e6f0');   // viga no ombro
  } else if (pose.solda) {
    if (Math.floor(t * 12 + h * 5) % 2) { ret(x + 5, y - 6, 2, 2, '#ffffff'); ret(x + 7, y - 8, 1, 1, '#ffe58a'); ret(x + 4, y - 9, 1, 1, '#8fe6ff'); }
  } else {   // chave/martelo batendo
    const bate = Math.floor(t * 4 + h * 4) % 2;
    ret(x + 5, y - 8 + bate * 2, 1, 4, '#9aa0b5'); ret(x + 4, y - 9 + bate * 2, 3, 2, '#6b6f86');
  }
}

function desenharColonos(view, t) {
  const alerta = VIDA.alerta && t >= VIDA.alerta[0] && t < VIDA.alerta[1];
  for (const c of EP.mundo.colonos) {
    const p = posColono(c, t);
    if (p.x / CASA < view.x0 - 2 || p.x / CASA > view.x1 + 2 || p.y / CASA < view.y0 - 2 || p.y / CASA > view.y1 + 2) continue;
    if (!p.visivel) continue;
    const h = hash(c.x, c.y, 9);
    const chamado = chamadoEm(c, t);
    let pose = p.trabalhando ? poseDeTrabalho(c, p, t) : null;
    if (!pose && c.demarca && t >= c.demarca.chega && !p.andando) pose = { fase: c.demarca.tipo === 'cava' ? 'cavar' : 'martelo', x: p.x, y: p.y, dir: p.dir };
    if (pose) { p.x = pose.x; p.y = pose.y; p.dir = pose.dir; if (pose.anda) p.andando = true; }
    let pulo = p.andando && Math.floor(t * 8 + h * 4) % 2 ? -1 : 0;
    if (chamado >= 0) pulo = -Math.abs(Math.sin(chamado * 7)) * 4;                      // pula de alegria
    else if (p.trabalhando) pulo = Math.floor(t * 4 + h * 4) % 2 ? -1 : 0;              // martelando
    else if (c.conserto && t >= c.conserto[0] && t < c.conserto[1] && !p.andando) pulo = Math.floor(t * 6) % 2 ? -1 : 0;   // consertando
    else if (alerta) pulo = t - VIDA.alerta[0] < 0.5 ? -2 : 0;                           // susto com o alarme
    else if (!p.andando && Math.floor(t * 1.4 + h * 7) % 4 === 0) pulo = -0.5;           // respirando
    ret(p.x - 4, p.y - 1, 8, 1.5, 'rgba(0,0,0,0.22)');
    const img = c.sprite_url && imagens.get(c.sprite_url);
    ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y + pulo));
    if (p.dir < 0) ctx.scale(-1, 1);
    ctx.drawImage(img || spriteColono(c.seed, c.lideranca), -6, -12, 12, 12); ctx.restore();
    if (c.status === 'estreou') ret(p.x + 4.5, p.y - 13.5 + pulo, 2.5, 2.5, '#ffd84a');
    if (chamado >= 0 && Math.floor(chamado * 6) % 2) ret(p.x + 6, p.y - 12 + pulo, 2, 3, '#f2c9a0');   // mãozinha acenando
    if (pose) ferramenta(pose, p.x, p.y + pulo, t, h);
    else if (p.trabalhando && Math.floor(t * 4 + h * 4) % 3 === 0) ret(p.x + 6, p.y - 8, 2, 2, COR.ouro);   // faísca
    const kc = c.conserto && !p.andando && t >= c.conserto[0] && t < c.conserto[1] ? (t - c.conserto[0]) / (c.conserto[1] - c.conserto[0]) : -1;
    if (kc >= 0) desenharConserto(p, t, kc);
    if (alerta && !p.andando) { ret(p.x - 0.5, p.y - 19, 1.5, 3.5, COR.alerta); ret(p.x - 0.5, p.y - 14.5, 1.5, 1.5, COR.alerta); }
  }
}

// o herói do problema do dia trabalhando: cada TIPO de problema tem a sua cena (e mais de uma variante, que
// alterna entre episódios), para o conserto nunca ficar igual ao de outro dia.
//   oxigênio → troca o cartucho do filtro (ar sujo some, bolhas limpas sobem) ou liga o purificador
//   água → cano pingando aquecido com o maçarico (vapor) ou bomba sendo destravada
//   manutenção → chave inglesa e faíscas ou solda com máscara
//   clima → pá tirando poeira/gelo do lugar ou escova nos painéis
//   saúde → maleta médica com scanner e corações · ataque → lanterna espantando bichinhos
//   descoberta → scanner varrendo uma amostra brilhante
const CONSERTOS = {
  oxigenio: ['filtro', 'purificador'], agua: ['cano', 'bomba'], manutencao: ['chave', 'solda'],
  clima: ['pa', 'escova'], saude: ['kit'], ataque: ['lanterna'], descoberta: ['scanner'],
};
function tipoDeConserto() {
  const p = EP.problema || {};
  const v = CONSERTOS[p.categoria] || ['chave'];
  return v[(EP.numero + (p.id || '').length) % v.length];
}
function desenharConserto(p, t, k) {
  const tipo = tipoDeConserto(), f = Math.floor(t * 10), bx = p.x - 15, by = p.y - 6;
  const caixaFerr = () => { ret(bx, by + 1, 7, 5, '#e04f5f'); ret(bx, by + 1, 7, 1, '#ff8a8a'); ret(bx + 2, by - 1, 3, 2, '#9aa0b5'); };
  if (tipo === 'filtro') {   // unidade de filtro: cartucho velho sai, novo entra, ar limpa
    ret(bx - 2, by - 6, 9, 12, '#9aa0b5'); ret(bx - 1, by - 5, 7, 10, '#6b6f86');
    const sai = clamp(k / 0.45), entra = clamp((k - 0.5) / 0.35);
    if (k < 0.5) ret(bx + 1, by - 4 - sai * 9, 3, 7, '#6b4a2e');                    // cartucho sujo subindo
    else { ret(bx + 7 + (1 - entra) * 4, by + 4, 3, 3, '#6b4a2e'); ret(bx + 1, by - 4 - (1 - entra) * 9, 3, 7, '#eef0f8'); ret(bx + 1, by - 2 - (1 - entra) * 9, 3, 1, COR.agua); }
    for (let i = 0; i < 7; i++) {   // ar sujo (marrom) vira bolhas limpas (azul-claras)
      const q = ((t * 0.6 + i / 7) % 1), x = bx + 3 + Math.sin(i * 2 + t) * 6, y = by - 6 - q * 16;
      ctx.globalAlpha = 1 - q;
      ret(x, y, 1.5, 1.5, k < 0.55 ? '#8a6a52' : '#bff8ff');
    }
    ctx.globalAlpha = 1;
    ret(p.x + 7, p.y - 9, 2, 1.5, '#d8dbe8');                                          // mão com o cartucho
  } else if (tipo === 'purificador') {   // purificador portátil girando, névoa sumindo
    ret(bx, by - 2, 8, 8, '#eef0f8'); ret(bx + 1, by - 1, 6, 6, '#3a2f63');
    const g = t * 18;
    for (let i = 0; i < 4; i++) ret(bx + 4 + Math.cos(g + i * 1.57) * 2 - 0.5, by + 2 + Math.sin(g + i * 1.57) * 2 - 0.5, 1.5, 1.5, COR.agua);
    for (let i = 0; i < 10; i++) {
      const a = i * 0.63 + t * 0.4, rr = 10 + (i % 3) * 4 - k * 8;
      ctx.globalAlpha = Math.max(0, 0.55 * (1 - k * 1.1));
      ret(bx + 4 + Math.cos(a) * rr, by + Math.sin(a) * rr * 0.5, 2, 2, '#a88a6a');
    }
    ctx.globalAlpha = 1;
  } else if (tipo === 'cano') {   // cano rachado pingando; o maçarico aquece e o vapor sai
    ret(bx - 4, by + 1, 16, 3, '#9aa0b5'); ret(bx - 4, by + 1, 16, 1, '#c9ced9');
    if (k < 0.6) for (let i = 0; i < 2; i++) { const q = (t * 1.6 + i * 0.5) % 1; ret(bx + 3, by + 4 + q * 6, 1.2, 1.5, COR.agua); }
    ret(p.x + 5, p.y - 8, 4, 1.5, '#6b6f86');
    if (f % 2) { ret(p.x + 9, p.y - 8, 2, 1.5, '#ffc83d'); ret(p.x + 10.5, p.y - 8, 1.5, 1.5, '#ff8a3d'); }
    for (let i = 0; i < 4; i++) { const q = (t * 0.8 + i / 4) % 1; ctx.globalAlpha = (1 - q) * 0.7; ret(bx + 3 + Math.sin(i + t * 3) * 2, by - q * 12, 2, 2, '#f3eefe'); }
    ctx.globalAlpha = 1;
  } else if (tipo === 'bomba') {   // bomba d'água: manivela girando, água volta a correr
    ret(bx, by - 2, 8, 7, '#3f8efc'); ret(bx, by - 2, 8, 1, '#8fc2ff');
    const a = t * 7;
    ret(bx + 4 + Math.cos(a) * 3, by + 1 + Math.sin(a) * 3, 2, 2, '#d8dbe8');
    if (k > 0.5) for (let i = 0; i < 4; i++) ret(bx - 6 + ((t * 20 + i * 4) % 12), by + 5, 2, 1, COR.agua);
    caixaFerr();
  } else if (tipo === 'solda') {   // máscara de solda e clarão
    ret(p.x + 1, p.y - 11, 5, 4, '#2a2140');
    caixaFerr();
    if (f % 3 !== 0) { brilhoEm(p.x + 9, p.y - 7, 7, '#bff8ff', 0.6); ret(p.x + 8, p.y - 8, 2, 2, '#ffffff'); }
    for (let i = 0; i < 6; i++) if ((f + i) % 2 === 0) ret(p.x + 9 + (hash(i, f) - 0.5) * 10, p.y - 7 + hash(i, f, 2) * 6, 1.2, 1.2, i % 2 ? COR.ouro : '#ffffff');
  } else if (tipo === 'pa') {   // pá tirando poeira / gelo do lugar: o monte diminui
    const alt = 6 * (1 - k);
    ret(bx - 2, by + 6 - alt, 9, alt, EP.estacao && EP.estacao.id === 'inverno' ? '#dff3ff' : '#c98a5e');
    const g = (t * 1.4) % 1, sobe = g < 0.5 ? g * 2 : 2 - g * 2;
    ret(p.x + 5, p.y - 6 - sobe * 4, 1.2, 7, '#6b4a2e'); ret(p.x + 4, p.y + 1 - sobe * 4, 4, 2, '#9aa0b5');
    if (g > 0.5) for (let i = 0; i < 3; i++) ret(p.x + 8 + i * 2 + (g - 0.5) * 12, p.y - 6 - Math.sin((g - 0.5) * 6.28) * 6 - i, 1.5, 1.5, '#c98a5e');
  } else if (tipo === 'escova') {   // escova eletrostática varrendo
    const vai = Math.sin(t * 6) * 5;
    ret(p.x + 4 + vai, p.y - 7, 6, 2, '#ffc83d'); ret(p.x + 4 + vai, p.y - 5, 6, 1, '#6b4a2e');
    for (let i = 0; i < 4; i++) { const q = (t * 1.5 + i / 4) % 1; ctx.globalAlpha = (1 - q) * 0.8; ret(p.x + 10 + q * 8, p.y - 6 - q * 4 + i, 1.5, 1.5, '#e8b48c'); }
    ctx.globalAlpha = 1;
  } else if (tipo === 'kit') {   // maleta médica + scanner verde + corações
    ret(bx, by + 1, 8, 6, '#eef0f8'); ret(bx + 3, by + 2, 2, 4, '#e04f5f'); ret(bx + 2, by + 3, 4, 2, '#e04f5f');
    const s = Math.sin(t * 4) * 4;
    ret(p.x + 6, p.y - 10 + s, 6, 1, COR.ok);
    for (let i = 0; i < 2; i++) { const q = (t * 0.7 + i / 2) % 1; ctx.globalAlpha = 1 - q; ret(p.x - 2 + i * 5, p.y - 16 - q * 10, 2, 2, '#ff8fa3'); ret(p.x - 3 + i * 5, p.y - 15 - q * 10, 4, 1, '#ff8fa3'); }
    ctx.globalAlpha = 1;
  } else if (tipo === 'lanterna') {   // lanterna varrendo; bichinhos fogem
    const a = Math.sin(t * 2) * 0.5;
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff4c2';
    ctx.beginPath(); ctx.moveTo(p.x + 7, p.y - 7); ctx.lineTo(p.x + 30, p.y - 7 + Math.tan(a - 0.25) * 23); ctx.lineTo(p.x + 30, p.y - 7 + Math.tan(a + 0.25) * 23); ctx.fill(); ctx.globalAlpha = 1;
    ret(p.x + 5, p.y - 8, 3, 2, '#4a4466');
    for (let i = 0; i < 3; i++) ret(p.x + 18 + k * 30 + i * 4, p.y - 2 + Math.sin(t * 9 + i) * 1.5, 2, 1.5, '#8f4129');
  } else if (tipo === 'scanner') {   // amostra brilhante escaneada
    ret(bx + 2, by + 3, 4, 3, '#8fe6ff'); brilhoEm(bx + 4, by + 4, 6, '#8fe6ff', 0.5);
    ret(p.x + 5, p.y - 9, 3, 4, '#3a2f63'); ret(p.x + 5.5, p.y - 8.5, 2, 2, COR.agua);
    const y = by + 2 + Math.sin(t * 5) * 3;
    ctx.globalAlpha = 0.6; ret(bx, y, 8, 1, COR.agua); ctx.globalAlpha = 1;
    for (let i = 0; i < 3; i++) if ((f + i) % 3 === 0) ret(p.x - 2 + i * 4, p.y - 18 - hash(i, f) * 4, 1.5, 1.5, COR.agua);
  } else {   // chave inglesa batendo + faíscas (o conserto clássico)
    caixaFerr();
    const a = Math.round(Math.sin(t * 14) * 1.5);
    ret(p.x + 5, p.y - 8 + a, 4, 1.5, '#d8dbe8'); ret(p.x + 8, p.y - 10 + a, 1.5, 4, '#d8dbe8');
    for (let i = 0; i < 4; i++) if ((f + i) % 3 === 0) ret(p.x + 9 + hash(i, f) * 7, p.y - 6 - hash(i, f, 2) * 8, 1.5, 1.5, i % 2 ? COR.ouro : COR.agua);
  }
}
// barra de progresso e ✓ ao lado do herói (desenhados depois da noite, para não escurecer, e fora da etiqueta do nome)
function desenharHudConserto(t) {
  for (const c of EP.mundo.colonos) {
    if (!c.conserto || t < c.conserto[0] || t >= c.conserto[1]) continue;
    const p = posColono(c, t);
    if (p.andando || !p.visivel) continue;
    const k = (t - c.conserto[0]) / (c.conserto[1] - c.conserto[0]);
    ret(p.x + 11, p.y - 16, 18, 5, CONTORNO); ret(p.x + 12, p.y - 15, 16, 3, '#3a2f63');
    ret(p.x + 12, p.y - 15, 16 * Math.min(1, k * 1.15), 3, COR.ok);
    if (k > 0.86) {   // pronto!
      ret(p.x + 15, p.y - 29, 11, 10, CONTORNO); ret(p.x + 16, p.y - 28, 9, 8, '#f3eefe');
      ctx.fillStyle = COR.ok; for (const [x, y] of [[17, -24], [18, -23], [19, -22], [20, -23], [21, -24], [22, -25], [23, -26]]) ctx.fillRect(p.x + x, p.y + y, 1.3, 1.3);
    }
  }
}

// ------------------------------------------------------------------ noite
// Quando a narração diz que o sol se põe, o mapa escurece (tom azulado) e acendem as luzes: janelas e
// farol do módulo, brilho das construções, lâmpadas da obra e a luz do capacete de cada colono.
let tNoite = Infinity;
function prepararNoite() {
  const c = EP.cenas.find((x) => /sol se p[õo]e|anoitec|cai a noite|a noite chega/i.test(x.fala || ''));
  const w = c && (c.palavras || []).find((x) => /p[õo]e|anoitec|noite/i.test(x.p));
  tNoite = c ? (w ? w.i : c.fala_inicio + 0.6) : Infinity;
}
// nas Dunas do Norte a noite é de lua cheia: escurece menos, para as dunas aparecerem
const escuridao = (t) => { const e = clamp((t - tNoite) / 2.4), c = cenaEm(t); return c && c.camera && c.camera.alvo === 'dunas' ? e * 0.5 : e; };
function brilhoEm(x, y, r, cor, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, cor); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
}
function desenharNoite(cam, t, view, tx, ty, energia) {
  const k = escuridao(t);
  if (k <= 0) return;
  // escurece tudo (multiplica por um azul de noite)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  const m = (a, b2) => Math.round(a + (b2 - a) * k);
  ctx.fillStyle = `rgb(${m(255, 52)},${m(255, 58)},${m(255, 120)})`;
  ctx.fillRect(0, 0, W, H);
  // luzes somam por cima (no espaço do mundo)
  ctx.globalCompositeOperation = 'lighter';
  ctx.setTransform(cam.z, 0, 0, cam.z, tx, ty);
  const b = EP.mundo.base, { x: cx, y: cy } = centro(b);
  if (energia) {
    brilhoEm(cx, cy, 70, '#ffb45a', 0.32 * k);
    for (const dx of [-11, -3, 5]) brilhoEm(cx + dx + 3, cy - 5, 12, '#ffe08a', 0.8 * k);
    brilhoEm(cx, cy + 24, 26, '#ffd27a', 0.45 * k);                                  // rampa
  }
  if (Math.floor(t * 1.5) % 2 === 0) brilhoEm(cx, cy - 29, 14, '#ff4d4d', 0.9 * k);   // farol
  for (const o of EP.mundo.obras) {
    if (o.status === 'planejada' && o.slug !== EP.missao_obra) continue;
    const r = retanguloDe(o), oc = centro(o), pr = progressoObra(o, t).p;
    const cor = o.tipo === 'estufa' ? '#7dff9a' : o.tipo === 'solar' ? '#7fb3ff' : o.tipo === 'antena' ? '#ff6a6a' : '#ffd27a';
    brilhoEm(oc.x, oc.y, Math.max(r.x1 - r.x0, r.y1 - r.y0) * 0.75, cor, (0.12 + 0.3 * pr) * k);
    if (pr < 1) for (const [x, y] of [[r.x0, r.y1], [r.x1, r.y1], [r.x0, r.y0], [r.x1, r.y0]]) brilhoEm(x, y, 16, '#fff0b0', 0.55 * k);   // lâmpadas da obra
  }
  const helmo = (x, y, forte) => (forte ? brilhoEm(x + 11, y - 6, 26, '#bff8ff', 0.42 * k)   // luz de trabalho no ponto do conserto
                                       : brilhoEm(x, y - 9, 11, '#eaf2ff', 0.45 * k));
  for (const c of EP.mundo.colonos) {
    const p = posColono(c, t);
    if (!p.visivel || p.x / CASA < view.x0 - 2 || p.x / CASA > view.x1 + 2 || p.y / CASA < view.y0 - 2 || p.y / CASA > view.y1 + 2) continue;
    helmo(p.x, p.y, !!(c.conserto && t >= c.conserto[0] && t < c.conserto[1]));
  }
  for (const f of EP.mundo.fundadores) { const p = posFundador(f, t); if (p.visivel) helmo(p.x, p.y, false); }
  if (energia) for (const c of EP.mundo.colonos) {   // casas ligadas na rede: janela e lampião da porta
    if (c.x < view.x0 - 2 || c.x > view.x1 + 2 || c.y < view.y0 - 2 || c.y > view.y1 + 2) continue;
    brilhoEm(c.x * CASA + 5, c.y * CASA + 6, 8, '#ffe08a', 0.55 * k);
    brilhoEm(c.x * CASA + 7, c.y * CASA + 13, 10, '#ffd27a', 0.3 * k);
  }
  ctx.globalCompositeOperation = 'source-over';
  // pontinhos acesos nítidos por cima do brilho (janelas, lâmpadas)
  if (energia) for (const dx of [-11, -3, 5]) { ctx.globalAlpha = k; ret(cx + dx, cy - 8, 6, 6, '#ffe58a'); ctx.globalAlpha = 1; }
  for (const o of EP.mundo.obras) {
    if (o.status === 'planejada' && o.slug !== EP.missao_obra) continue;
    const r = retanguloDe(o);
    if (progressoObra(o, t).p < 1) for (const [x, y] of [[r.x0, r.y1], [r.x1, r.y1], [r.x0, r.y0], [r.x1, r.y0]]) { ctx.globalAlpha = k; ret(x - 1, y - 1, 2, 2, '#fff6d0'); ctx.globalAlpha = 1; }
  }
}

// ------------------------------------------------------------------ casas do bairro e fios de energia
// Casinha igual à do site (components/Mundo.tsx). O fio de cada casa vai até a casa vizinha mais perto do
// módulo (mesmo anel ou até dois para dentro) ou até a borda do módulo / de uma construção ligada, o que for
// mais perto (mesma regra de lib/mundo.ts → fioDaCasa). Um pulsinho de luz corre da fonte até a casa.
const TELHADOS = ['#e04f5f', '#3f8efc', '#2bb673', '#f4b400', '#9b59b6', '#ff7f50', '#00b8a9', '#ec407a'];
function prepararFios() {
  const m = EP.mundo;
  const fontes = [m.base, ...m.obras.filter((o) => o.status !== 'planejada')].map((o) => ({ x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h }));
  const dB = (x, y) => Math.hypot(x - CENTRO.x, y - CENTRO.y);
  for (const c of m.colonos) {
    const eu = { x: c.x + 0.5, y: c.y + 0.5 }, r = anelDe(c.x, c.y);
    let melhor = { x: CENTRO.x, y: CENTRO.y }, dm = Infinity;
    for (const f of fontes) {
      const x = clamp(eu.x, f.x0, f.x1), y = clamp(eu.y, f.y0, f.y1), d = Math.hypot(x - eu.x, y - eu.y);
      if (d < dm) { dm = d; melhor = { x, y }; }
    }
    for (const o of m.colonos) {
      const ro = anelDe(o.x, o.y);
      if (o === c || ro < Math.max(ANEL_INICIAL, r - 2) || ro > r || dB(o.x, o.y) >= dB(c.x, c.y)) continue;
      const d = Math.hypot(o.x + 0.5 - eu.x, o.y + 0.5 - eu.y);
      if (d < dm) { dm = d; melhor = { x: o.x + 0.5, y: o.y + 0.5 }; }
    }
    c.fio = melhor;
  }
}
const FIOS_NAS_CASAS = false;
function desenharCasas(view, t, energia) {
  const fora = (x, y) => x < view.x0 - 3 || x > view.x1 + 3 || y < view.y0 - 3 || y > view.y1 + 3;
  for (const c of EP.mundo.colonos) if (c.fio && !c.vila && !(fora(c.x, c.y) && fora(c.fio.x, c.fio.y))) trilhaDaCasa(ctx, c.x, c.y, c.fio);
  for (const c of EP.mundo.colonos) {   // fios das casas desligados (pedido do dono: ficava bagunçado); só a trilha
    if (FIOS_NAS_CASAS === false || !c.fio || (fora(c.x, c.y) && fora(c.fio.x, c.fio.y))) continue;
    const ax = c.x * CASA + 8, ay = c.y * CASA + 12, bx = c.fio.x * CASA, by = c.fio.y * CASA;
    const dist = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(dist / 1.2));
    ctx.fillStyle = 'rgba(46,30,48,0.5)';
    for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(ax + (bx - ax) * i / n), Math.round(ay + (by - ay) * i / n), 1, 1);
    if (energia) {
      const k = ((((t * 28) / Math.max(dist, 1) + c.x * 0.37 + c.y * 0.71) % 1) + 1) % 1;
      ret(Math.round(bx + (ax - bx) * k), Math.round(by + (ay - by) * k), 1, 1, 'rgba(255,216,90,0.8)');
    }
  }
  if (EP.mundo.colonos.some((c) => c.vila)) placaDaVila(view);
  for (const c of EP.mundo.colonos) {
    if (c.vila) {   // mora na Vila das Cápsulas
      if (t >= trocaDaCapsula(c)) {
        if (!fora(c.vila.x + 1, c.vila.y + 1)) desenharCapsulaGrande(ctx, c.vila.x * CASA, c.vila.y * CASA, c.capsula, TELHADOS[c.seed % TELHADOS.length], energia, t);
      } else if (!fora(c.lote.x, c.lote.y)) casinha(c.lote.x * CASA, c.lote.y * CASA, c, energia);   // comprou neste episódio: a casinha some quando a cápsula aparece
      continue;
    }
    if (fora(c.x, c.y)) continue;
    const x = c.x * CASA, y = c.y * CASA;
    if (c.capsula && t >= trocaDaCapsula(c)) { desenharCapsula(ctx, x, y, c.capsula, TELHADOS[c.seed % TELHADOS.length], energia); continue; }
    casinha(x, y, c, energia);
  }
}
function casinha(x, y, c, energia) {
  ret(x + 1, y + 12, 12, 2, 'rgba(0,0,0,0.22)');
  disco(x + 7, y + 8, 6, '#6b6f86');
  disco(x + 7, y + 8, 5, '#e4e6f0');
  ret(x + 2, y + 8, 11, 2, TELHADOS[c.seed % TELHADOS.length]);
  ret(x + 6, y + 9, 3, 4, '#3a2f63');
  ret(x + 4, y + 5, 2, 2, energia ? '#ffe58a' : '#2b2350');
}
// placa na entrada da vila (como no Mundo ao vivo)
function placaDaVila(view) {
  const vx = CENTRO.x + 27, vy = CENTRO.y - 7;
  if (vx < view.x0 - 4 || vx > view.x1 + 4 || vy < view.y0 - 4 || vy > view.y1 + 4) return;
  const x = vx * CASA - 46, y = vy * CASA + 2;
  ret(x + 10, y + 6, 2, 12, '#5a3a20'); ret(x + 30, y + 6, 2, 12, '#5a3a20');
  ret(x, y - 4, 42, 11, CONTORNO); ret(x + 1, y - 3, 40, 9, '#f3ece0');
  ctx.fillStyle = '#1a1020'; ctx.font = '4px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('VILA DAS', x + 21, y - 0.5); ctx.fillText('CÁPSULAS', x + 21, y + 3.5);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// Cápsula da Vila (2x2 casas): MESMA arte de lib/colonia-arte.ts → desenharCapsulaGrande. Mude as duas juntas.
function desenharCapsulaGrande(c, x, y, variante, cor, luz, t) {
  const R = (a, b, w, h, k) => { c.fillStyle = k; c.fillRect(x + a, y + b, w, h); };
  const D = (a, b, r, k) => discoEm(c, x + a, y + b, r, k);
  const janela = luz ? '#ffe58a' : '#2b2350';
  R(0, 0, 32, 32, '#9a4a2e'); R(1, 1, 30, 30, '#b05a3a');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) R(1 + i * 7.5, 1 + j * 7.5, 7, 7, '#a95536');
  R(13, 27, 6, 5, '#cd8a62');
  R(2, 29, 28, 3, 'rgba(0,0,0,0.25)');
  if (variante === 'estufa') {
    D(16, 18, 13, '#2f6b7e'); D(16, 18, 12, '#9fe7ff');
    for (let i = 0; i < 6; i++) D(6 + i * 4, 20 + (i % 2) * 2, 2, i % 2 ? '#2bb673' : '#5fd38a');
    R(9, 15, 1, 1, '#ff7f50'); R(20, 14, 1, 1, '#ffd85a'); R(15, 12, 1, 1, '#ff7f50');
    for (const a of [10, 16, 22]) R(a, 7, 1, 16, '#2f6b7ecc');
    R(9, 8, 3, 1, '#ffffff'); R(7, 10, 2, 1, '#ffffff');
    R(2, 24, 28, 4, '#6b6f86'); R(2, 24, 28, 1, cor); R(13, 21, 6, 7, '#3a2f63'); R(14, 22, 4, 5, '#2b2350');
  } else if (variante === 'observatorio') {
    R(2, 21, 28, 7, '#6b6f86'); R(2, 21, 28, 1, cor);
    D(16, 17, 12, '#3b3f5c'); D(16, 17, 11, '#5a5f84');
    R(14, 5, 5, 13, '#22253a');
    c.fillStyle = '#c9cde0'; for (let i = 0; i < 7; i++) c.fillRect(x + 15 + i, y + 13 - i * 1.6, 3, 3);
    R(23, 1, 2, 2, '#ffe58a');
    if (Math.floor(t * 2) % 2) R(27, 3, 1, 1, '#ffffff');
    R(5, 22, 3, 3, janela); R(24, 22, 3, 3, janela); R(13, 21, 6, 7, '#22253a'); R(14, 22, 4, 5, '#3a2f63');
  } else if (variante === 'dupla') {
    R(8, 17, 16, 6, '#b9bccc'); R(8, 17, 16, 1, '#e4e6f0');
    D(9, 17, 8, '#6b6f86'); D(9, 17, 7, '#e4e6f0'); D(23, 15, 8, '#6b6f86'); D(23, 15, 7, '#e4e6f0');
    R(2, 17, 14, 2, cor); R(16, 15, 14, 2, cor);
    R(6, 20, 5, 7, '#3a2f63'); R(7, 21, 3, 5, '#2b2350');
    R(5, 11, 3, 3, janela); R(21, 9, 3, 3, janela); R(25, 9, 3, 3, janela);
    R(27, 2, 1, 6, '#9a9db0'); R(27, 1, 1, 1, Math.floor(t * 1.5) % 2 ? '#e04f5f' : '#7a2030');
  } else {
    D(16, 18, 14, '#6b6f86'); D(16, 18, 13, '#f2f3f8');
    R(3, 17, 26, 3, cor); R(3, 20, 26, 1, '#ffd85a');
    R(2, 24, 28, 4, '#6b6f86'); R(2, 24, 28, 1, '#9aa0b5');
    R(13, 19, 6, 9, '#3a2f63'); R(14, 20, 4, 7, '#2b2350'); R(17, 23, 1, 1, '#ffd85a');
    R(7, 10, 4, 4, '#3a2f63'); R(8, 11, 2, 2, janela); R(21, 10, 4, 4, '#3a2f63'); R(22, 11, 2, 2, janela);
    R(10, 6, 3, 1, '#ffffff'); R(8, 7, 2, 1, '#ffffff');
    R(16, 0, 1, 5, '#9a9db0'); R(15, 0, 3, 1, '#c9cde0'); R(16, -1, 1, 1, Math.floor(t * 1.5) % 2 ? '#e04f5f' : '#7a2030');
  }
  R(26, 25, 6, 3, '#3f5fae'); R(26, 25, 6, 1, '#8fb3ff');
}

// Cápsulas compradas (variantes da casa): MESMA arte de lib/colonia-arte.ts → desenharCapsula. Mude as duas juntas.
function desenharCapsula(c, x, y, variante, cor, luz) {
  const R = (a, b, w, h, k) => { c.fillStyle = k; c.fillRect(x + a, y + b, w, h); };
  const D = (a, b, r, k) => discoEm(c, x + a, y + b, r, k);
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

// cápsula comprada NESTE episódio: a casinha vira cápsula no momento em que a câmera chega (antes, a de sempre)
function trocaDaCapsula(colono) {
  const c = EP.mundo.compras.find((k) => k.codigo === colono.codigo && k.produto_slug === 'capsula-habitacional');
  return c ? Math.max(0, aparicaoCompra(c)) : -1;
}

function aparicaoCompra(c) {
  for (const cena of EP.cenas) for (const f of cena.focos) if (f.alvo === `compra:${c.codigo}:${c.produto_slug}`) return f.t;
  return -1;
}

function desenharCompras(t) {
  // pets comprados em episódios anteriores moram no quintal do dono para sempre
  const novos = new Set(EP.mundo.compras.filter((c) => /pet/.test(c.produto_slug)).map((c) => c.codigo));
  for (const c of EP.mundo.colonos) if (c.pet && !novos.has(c.codigo)) desenharPet({ codigo: c.codigo, x: c.x, y: c.y, produto_slug: 'pet-do-colono', especie: typeof c.pet === 'string' ? c.pet : 'cachorro' }, t);
  for (const c of EP.mundo.compras) {
    if (/pet/.test(c.produto_slug)) {   // espécie: macaco é produto próprio; no Pet do Colono a opção escolhe
      desenharPet({ ...c, especie: c.especie || (/macaco/.test(c.produto_slug) ? 'macaco' : c.opcao === 'gato' ? 'gato' : 'cachorro') }, t);
      continue;
    }
    const t0 = aparicaoCompra(c);
    if (t < t0) continue;
    const k = clamp((t - t0) / 0.45);
    const esc = k < 1 ? saida(k) * 1.3 - Math.max(0, k - 0.7) : 1;
    const x = c.vila ? c.vila.x * CASA + 36 : c.x * CASA + 4, y = c.vila ? c.vila.y * CASA + 20 : c.y * CASA + 14, s = 10 * esc;   // logo abaixo da casa (vila: ao lado da cápsula)
    if (c.produto_slug === 'capsula-habitacional') { /* a própria casa vira a cápsula (desenharCasas) */ }
    else if (iconeDoProduto(c.produto_slug) === 'monumento') {   // estátua do próprio colono
      const seed = (colonoPorCodigo.get(c.codigo) || c).seed || 1, w = s * 1.1, h = w * 17 / 14;
      ctx.drawImage(spriteEstatua(seed), x + 4 - w / 2, y + 12 - h, w, h);
    } else ctx.drawImage(spriteContornado(iconeDoProduto(c.produto_slug)), x + 4 - s / 2, y + 10 - s, s * 1.25, s * 1.25);
    const kb = clamp((t - t0) / 1.0);
    if (kb < 1) for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      ctx.globalAlpha = 1 - kb;
      const cy = c.produto_slug === 'capsula-habitacional' ? (c.vila ? c.vila.y * CASA + 16 : y - 6) : y + 4;   // cápsula: o brilho sai da casa
      const cx = c.produto_slug === 'capsula-habitacional' && c.vila ? c.vila.x * CASA + 12 : x, raio = c.vila && c.produto_slug === 'capsula-habitacional' ? 24 : 14;
      ret(cx + 4 + Math.cos(a) * raio * kb, cy + Math.sin(a) * raio * kb, 2, 2, COR.ouro);
    }
    ctx.globalAlpha = 1;
  }
}

// Parada, a Vega aponta para onde está a ação e de vez em quando dá uma ordem (balão com "!"); a Lia confere
// tudo num tablet holográfico e marca um "✓" quando termina.
function alvoDoGesto(cena, t) {
  if (cena.tipo === 'missao' && obraDaMissao()) return centro(obraDaMissao());
  if (cena.tipo === 'solucao' || cena.tipo === 'problema') {
    const h = EP.mundo.colonos.find((c) => c.conserto);
    if (h && cena.tipo === 'solucao') { const q = posColono(h, t); return { x: q.x, y: q.y - 6 }; }
    return centro(EP.mundo.base);
  }
  const f = cena.focos.find((x) => x.alvo.startsWith('colono:'));
  return f ? posAlvo(f.alvo, t) : null;
}
function gestoDeComando(f, p, t, cena) {
  const fase = (t + (f.id === 'lia' ? 1.1 : 0)) % 2.6;
  if (f.id !== 'lia') {
    const a = alvoDoGesto(cena, t);
    if (a) {   // braço apontando
      const d = Math.hypot(a.x - p.x, a.y - (p.y - 7)) || 1, ux = (a.x - p.x) / d, uy = (a.y - (p.y - 7)) / d;
      for (let k = 2; k <= 7; k++) ret(p.x + ux * k - 0.75, p.y - 7 + uy * k - 0.75, 1.5, 1.5, k > 5 ? '#f2c9a0' : '#e4e6f0');
    }
    if (fase < 0.9) {   // ordem!
      ret(p.x - 4, p.y - 23, 8, 8, CONTORNO); ret(p.x - 3, p.y - 22, 6, 6, '#f3eefe'); ret(p.x - 1, p.y - 18.5, 2, 1.5, '#1b1530');
      ret(p.x - 0.5, p.y - 21, 1.5, 3, COR.alerta); ret(p.x - 0.5, p.y - 17.4, 1.5, 1.2, COR.alerta);
    }
  } else {
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 9);
    ret(p.x + 4, p.y - 17, 8, 5, COR.agua);
    ctx.fillStyle = '#eef0f8';
    for (let k = 0; k < 2; k++) ctx.fillRect(p.x + 5, p.y - 16 + k * 2, 1 + ((Math.floor(t * 5) + k) % 5), 1);
    ctx.globalAlpha = 1;
    if (fase > 1.9) {   // conferido
      ret(p.x - 4, p.y - 23, 8, 8, CONTORNO); ret(p.x - 3, p.y - 22, 6, 6, '#f3eefe');
      ctx.fillStyle = COR.ok; for (const [x, y] of [[-2, -18], [-1, -17], [0, -18], [1, -19], [2, -20]]) ctx.fillRect(p.x + x, p.y + y, 1.2, 1.2);
    }
  }
}

function desenharFundadores(t) {
  const cena = cenaEm(t);
  for (const f of EP.mundo.fundadores) {
    const p = posFundador(f, t);
    if (!p.visivel) continue;
    const plantando = cena && cena.tipo === 'missao' && cena.acao === 'plantar' && cena.camera.alvo === `ator:${f.id}` && !p.andando;
    const pulo = plantando ? 2 + (Math.floor(t * 5) % 2) : p.andando && Math.floor(t * 8) % 2 ? -1 : 0;
    ret(p.x - 4, p.y - 1, 8, 2, 'rgba(0,0,0,0.25)');
    const spr = spriteMapa(f.sprite);
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y + pulo));
    if (p.dir < 0) ctx.scale(-1, 1);
    ctx.drawImage(spr, -6, -12, 12, 12);
    ctx.restore();
    const naCenaDoPlantio = cena && cena.acao === 'plantar' && cena.camera.alvo === `ator:${f.id}`;
    if (!p.andando && !naCenaDoPlantio && cena.tipo !== 'abertura' && cena.tipo !== 'gancho') gestoDeComando(f, p, t, cena);
    // plantio das primeiras sementes (cena "plantar"): ajoelhada, a mão sobe e desce, as sementes caem na terra
    // e os brotos nascem um a um numa fileira na frente dela (câmera bem perto, em terceira pessoa)
    if (cena.tipo === 'missao' && cena.acao === 'plantar' && cena.camera.alvo === `ator:${f.id}` && !p.andando) {
      const k = clamp((t - cena.inicio - 0.8) / Math.max(1, cena.fim - cena.inicio - 1.2));
      const covas = 6, x0 = p.x - 11, y0 = p.y - 9;   // canteiro DENTRO da estufa, atrás dela (ninguém tampa)
      for (let i = 0; i < covas; i++) {
        const xi = x0 + i * 4.5, ki = clamp(k * covas - i);
        ret(xi - 1, y0, 3, 1.5, '#5a2a18');                       // cova
        if (ki > 0.35) ret(xi, y0 - 0.5, 1, 1, '#c8a26b');        // semente
        if (ki > 0.55) {                                           // broto crescendo
          const alt = Math.round(1 + (ki - 0.55) / 0.45 * 4);
          ret(xi, y0 - alt, 1, alt, '#2bb673');
          if (alt >= 3) { ret(xi - 1, y0 - alt, 1, 1, '#4ed37a'); ret(xi + 1, y0 - alt + 1, 1, 1, '#4ed37a'); }
        }
      }
      const atual = Math.min(covas - 1, Math.floor(k * covas)), fase = (t * 2.4) % 1;
      const mx = x0 + atual * 4.5, my = y0 - 6 + Math.abs(Math.sin(t * 7.5)) * 4;
      ret(mx - 1, my, 3, 2, '#f2c9a0');                            // a mão
      if (fase < 0.45) ret(mx, my + 2 + fase * 10, 1, 1, '#c8a26b'); // semente caindo
      ret(p.x - 9, p.y - 2, 4, 3, '#9aa0b5'); ret(p.x - 10, p.y - 3, 2, 1, '#9aa0b5');   // regador ao lado
      if (Math.floor(t * 3) % 4 === 0) ret(x0 + atual * 4.5 + 1, y0 - 8, 2, 2, '#ffd84a');   // brilho
      ret(x0 - 2, y0 + 1.5, covas * 4.5 + 2, 1, '#3a1a10');                                       // borda do canteiro
    }
    // holograma da Dra. Lia quando ela confere os cálculos
    if (cena.tipo === 'missao' && cena.camera.alvo === `ator:${f.id}` && cena.acao === 'construir' && !p.andando) {
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 9);
      ret(p.x + 5, p.y - 20, 9, 6, COR.agua);
      ctx.fillStyle = '#eef0f8';
      for (let i = 0; i < 3; i++) ctx.fillRect(p.x + 6, p.y - 19 + i * 2, 2 + ((Math.floor(t * 6) + i) % 6), 1);
      ctx.globalAlpha = 1;
    }
  }
}

// ------------------------------------------------------------------ tela (coordenadas da tela)
function texto(str, x, y, tam, cor, opc = {}) {
  const maxW = opc.maxW || W - 120;
  let s = tam;
  ctx.font = `${s}px ${FONTE}`;
  while (ctx.measureText(str).width > maxW && s > 12) { s -= 2; ctx.font = `${s}px ${FONTE}`; }
  ctx.textAlign = opc.alinhar || 'center';
  ctx.textBaseline = 'middle';
  if (opc.contorno !== false) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(6, s * 0.3);
    ctx.strokeStyle = COR.ceu;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = cor;
  ctx.fillText(str, x, y);
  return ctx.measureText(str).width;
}

function caixa(x, y, w, h, alfa = 0.86, borda = COR.borda) {
  ctx.globalAlpha *= alfa;
  ret(x, y, w, h, COR.ceu);
  ctx.globalAlpha /= alfa;
  ctx.fillStyle = borda;
  ctx.fillRect(x, y, w, 6); ctx.fillRect(x, y + h - 6, w, 6); ctx.fillRect(x, y, 6, h); ctx.fillRect(x + w - 6, y, 6, h);
}

function aTela(cam, wx, wy) {
  return { x: (wx - cam.x) * cam.z + W / 2, y: (wy - cam.y) * cam.z + H * FOCO_Y };
}

function etiqueta(cam, wx, wy, nome, cor, t, t0) {
  const k = clamp((t - t0) / 0.3);
  if (k <= 0) return;
  const p = aTela(cam, wx, wy);
  ctx.globalAlpha = k;
  ctx.font = `26px ${FONTE}`;
  const w = ctx.measureText(nome).width + 36;
  const y = p.y - 26 - 10 * (1 - saida(k));
  caixa(p.x - w / 2, y - 26, w, 52, 0.92, cor);
  ret(p.x - 8, y + 26, 16, 10, cor);
  texto(nome, p.x, y + 2, 26, COR.texto, { contorno: false });
  ctx.globalAlpha = 1;
}

function anel(cam, wx, wy, t) {
  const p = aTela(cam, wx, wy);
  const r = 11 * cam.z + 6 * Math.sin(t * 6);
  ctx.strokeStyle = COR.agua; ctx.lineWidth = 6;
  ctx.globalAlpha = 0.9;
  ctx.strokeRect(p.x - r, p.y - r, 2 * r, 2 * r);
  ctx.globalAlpha = 1;
}

// nome das crateras batizadas: sempre que a cratera está na tela e a câmera está perto. A cratera nova do
// episódio só ganha a placa quando o nome é dito na narração (antes disso ela já existe, mas sem nome).
function desenharCrateras(cam, t) {
  if (cam.z < 2.2) return;
  for (const c of EP.mundo.crateras || []) {
    const p = aTela(cam, c.x * CASA + 8, c.y * CASA + 8);
    if (p.x < 230 || p.x > W - 230 || p.y < 260 || p.y > H - 80) continue;   // só com a placa inteira na tela
    let t0 = -1;
    if (c.nova) {
      t0 = Infinity;
      for (const cena of EP.cenas) for (const f of cena.focos) if (f.alvo === `cratera:${c.id}`) t0 = Math.min(t0, f.t);
    }
    etiqueta(cam, c.x * CASA + 8, c.y * CASA + 8 - c.r * 0.62 - 24, c.nome, COR.ouro, t, t0);
  }
}

function desenharFocos(cam, t, cena) {
  // nome dos fundadores sempre visível de perto
  for (const f of EP.mundo.fundadores) {
    if (cam.z < 4.5) continue;
    const p = posFundador(f, t);
    if (!p.visivel) continue;
    const focado = cena.focos.some((x) => x.alvo === `fundador:${f.id}` && t >= x.t);
    etiqueta(cam, p.x, p.y - 13, f.curto, focado ? COR.ouro : COR.borda, t, focado ? cena.focos.find((x) => x.alvo === `fundador:${f.id}`).t : 0);
  }
  // tag dos cargos de liderança (LÍDER, VICE...) sempre visível de perto, na cor do cargo
  // (a mais importante primeiro: ordem do liderancas.json; tag que encavalaria em outra vira só um pontinho)
  const ocupadas = [];
  const ordem = EP.liderancas ? Object.keys(EP.liderancas) : [];
  const lideres = EP.mundo.colonos.filter((c) => c.lideranca && EP.liderancas && EP.liderancas[c.lideranca])
    .sort((a, b) => ordem.indexOf(a.lideranca) - ordem.indexOf(b.lideranca));
  if (cam.z >= 4.5) for (const c of lideres) {
    const lid = EP.liderancas[c.lideranca];
    let pc = c.casaPe ? posColono(c, t) : { x: c.x * CASA + 8, y: c.y * CASA + 14, visivel: true };
    if (!pc.visivel) continue;
    const pose = pc.trabalhando ? poseDeTrabalho(c, pc, t) : null;
    if (pose) pc = { ...pc, x: pose.x, y: pose.y };
    const s = aTela(cam, pc.x, pc.y - 13);
    if (s.x < -50 || s.x > W + 50 || s.y < 0 || s.y > H) continue;
    ctx.font = `20px ${FONTE}`;
    const w = ctx.measureText(lid.tag).width + 20, caixaTag = { x0: s.x - w / 2, x1: s.x + w / 2, y0: s.y - 34, y1: s.y - 4 };
    if (ocupadas.some((o) => o.x0 < caixaTag.x1 && caixaTag.x0 < o.x1 && o.y0 < caixaTag.y1 && caixaTag.y0 < o.y1)) {
      ret(pc.x - 1, pc.y - 16, 2, 2, lid.cor);   // sem espaço: só o pontinho na cor do cargo
      continue;
    }
    ocupadas.push(caixaTag);
    caixa(caixaTag.x0, caixaTag.y0, w, 30, 0.9, lid.cor);
    texto(lid.tag, s.x, s.y - 19, 20, lid.cor, { contorno: false });
  }
  const ativos = cena.focos.filter((f) => t >= f.t);
  for (const [i, f] of ativos.entries()) {
    const [tipo, id] = f.alvo.split(':');
    if (tipo !== 'colono' && tipo !== 'compra') continue;
    const c = colonoPorCodigo.get(id);
    if (!c) continue;
    if (i !== ativos.length - 1) continue;   // só o foco atual (vizinhos colados se sobrepõem)
    const pc = c.casaPe ? posColono(c, t) : { x: c.x * CASA + 8, y: c.y * CASA + 14 };
    anel(cam, pc.x, pc.y - 6, t);
    etiqueta(cam, pc.x, pc.y - 14, c.nome, COR.ouro, t, f.t);
  }
}

function climaAtual() {
  const c = CLIMA[(EP.estacao && EP.estacao.efeito) || 'redemoinho'] || CLIMA.redemoinho;
  const forte = EP.problema && EP.problema.categoria === 'clima' ? 1.5 : 1;
  return { ...c, n: Math.round(c.n * forte), forte };
}

function poeira(t) {
  const c = climaAtual();
  if (c.tinta) { ctx.globalAlpha = Math.min(0.35, c.tinta[1] * c.forte); ret(0, 0, W, H, c.tinta[0]); }
  for (let i = 0; i < c.n; i++) {
    const vel = (30 + hash(i, 1) * 70) * c.vel;
    let x, y;
    if (c.cai) {   // neve de gelo seco: cai devagar, balançando
      x = (hash(i, 2) * W + Math.sin(t * 0.9 + i) * 24 + W) % W;
      y = ((hash(i, 3) * H + t * (40 + hash(i, 6) * 60)) % (H + 20)) - 10;
    } else {
      x = ((hash(i, 2) * W + t * vel) % (W + 40)) - 20;
      y = (hash(i, 3) * H + Math.sin(t * 0.8 + i) * 30 + H) % H;
    }
    ctx.globalAlpha = c.grande ? 0.45 + hash(i, 4) * 0.4 : 0.18 + hash(i, 4) * 0.25;
    if (c.grande) { const s = 6 + Math.floor(hash(i, 5) * 3) * 2; ret(x, y, s, s, c.cor); continue; }
    const w = c.risco ? 12 + Math.floor(hash(i, 5) * 4) * 4 : 4 + Math.floor(hash(i, 5) * 3) * 2;
    ret(x, y, w, c.risco ? 2 : 4, c.cor);
  }
  ctx.globalAlpha = 1;
}

// Eventos que só a Fúria de Marte traz: chuva de meteoros (riscos caindo na diagonal) e a nave desconhecida
// (disco com luzes atravessando o céu devagar). Aparecem do alerta até o fim da solução.
// Os passeios de cada colono são planejados por assunto (obra, problema do dia, abrigo...). Com o problema
// resolvido ANTES da obra, a ordem no tempo muda: aqui eles ficam em ordem e cada trecho sai de onde o anterior
// terminou (e nunca antes de o anterior acabar).
function encadearTrechos() {
  for (const c of EP.mundo.colonos) {
    if (!c.trechos || c.trechos.length < 2) continue;
    c.trechos.sort((a, b) => a.t0 - b.t0);
    for (let i = 1; i < c.trechos.length; i++) {
      const ant = c.trechos[i - 1], tr = c.trechos[i];
      tr.de = ant.para;
      if (tr.t0 < ant.t1) { const d = tr.t1 - tr.t0; tr.t0 = ant.t1; tr.t1 = tr.t0 + d; }
    }
    if (c.trabalho && c.trechos.length) {   // começa a trabalhar quando chega de fato na obra
      const ida = c.trechos.find((tr) => Math.abs(tr.t1 - c.trabalho[0]) < 0.01 || tr.t0 >= c.trabalho[0] - 5);
      if (ida && ida.t1 > c.trabalho[0]) c.trabalho[0] = ida.t1;
    }
  }
}

// ------------------------------------------------------------------ ataque de criaturas (problema do dia)
// Besouros, vermes, ácaros ou o lagarto VÊM de fora e cercam a base durante o alerta (roendo os cabos). Na
// solução, conforme a fala: "isca/sucata" → a heroína vai longe da base, larga o ferro-velho e o enxame corre
// para lá; "cerca" → anel de faíscas em volta dos cabos e as criaturas dão meia-volta; senão, fogem.
let ATAQUE = null;
const CRIATURAS = {
  'besouros-ferrugem': { n: 46, tipo: 'besouro' }, 'vermes-areia': { n: 5, tipo: 'verme' },
  'acaros-gelo': { n: 70, tipo: 'acaro' }, 'lagarto-duna': { n: 1, tipo: 'lagarto' },
};
function planejarAtaque() {
  ATAQUE = null;
  const pr = EP.problema, cfg = pr && CRIATURAS[pr.id];
  const ini = EP.cenas.find((c) => c.tipo === 'problema'), sol = EP.cenas.find((c) => c.tipo === 'solucao');
  if (!cfg || !ini || !sol) return;
  const b = EP.mundo.base, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };   // centro da base (casas)
  const fala = (sol.fala || '').toLowerCase();
  const modo = /isca|sucata|ferro velho/.test(fala) ? 'isca' : /cerca|volt/.test(fala) ? 'cerca' : 'fuga';
  const isca = { x: bc.x - 9, y: bc.y + 5 };                                  // longe da base, longe das casas
  const heroi = EP.mundo.fundadores.find((f) => (sol.heroi || '').toLowerCase().includes((f.curto || f.id).toLowerCase()));
  const pal = sol.palavras || [];
  const w = pal.find((x) => /espalh|isca|liga|cerca|joga|larg/i.test(x.p) && x.i >= sol.fala_inicio);
  let tAcao = w ? w.i + 0.8 : sol.fala_inicio + 0.45 * (sol.fim - sol.fala_inicio);
  if (heroi && modo === 'isca') {   // a heroína (fundadora) caminha até o ponto da isca e fica lá
    const ult = heroi.trechos.filter((tr) => tr.t0 < sol.inicio);
    const de = ult.length ? ult[ult.length - 1].para.slice() : heroi.casa.slice();
    const t0 = Math.max(sol.inicio + 0.2, tAcao - 2.6);
    const dur = clamp(Math.hypot(isca.x + 0.8 - de[0], isca.y - 0.3 - de[1]) * 0.28, 1.2, 2.6);
    // depois da solução ela segue a agenda (ex.: plantar as sementes na estufa): volta de onde estava a isca
    const depois = heroi.trechos.filter((tr) => tr.t0 >= sol.fim);
    const naIsca = [isca.x + 0.8, isca.y - 0.3], volta = sol.fim + 0.2;
    const proximo = depois.length ? depois[0].para : de;
    const dv = clamp(Math.hypot(proximo[0] - naIsca[0], proximo[1] - naIsca[1]) * 0.3, 1.2, 3.5);
    heroi.trechos = [...ult, { t0, t1: t0 + dur, de, para: naIsca }, { t0: volta, t1: volta + dv, de: naIsca, para: proximo },
                     ...depois.slice(1).map((tr, i, arr) => ({ ...tr, de: i ? arr[i - 1].para : proximo,
                                                               t0: Math.max(tr.t0, volta + dv), t1: Math.max(tr.t1, volta + dv + (tr.t1 - tr.t0)) }))];
    tAcao = t0 + dur + 0.3;
  }
  if (!heroi && modo === 'isca') {   // herói colono: a isca fica onde ele trabalha
    const h = EP.mundo.colonos.find((c) => c.conserto);
    if (h) { const q = pontoDoConserto(sol.alvo || 'base'); isca.x = q.x / CASA - 1; isca.y = q.y / CASA; }
  }
  const bichos = Array.from({ length: cfg.n }, (_, i) => {
    const a = -0.9 + (i / Math.max(1, cfg.n - 1)) * 2.6 + (hash(i, 31) - 0.5) * 0.3;   // chegam pelo leste/sul
    const r0 = 15 + hash(i, 32) * 5, r1 = 2.2 + hash(i, 33) * 1.6;
    return { de: { x: bc.x + Math.cos(a) * r0, y: bc.y + Math.sin(a) * r0 * 0.8 },
             cabo: { x: bc.x + Math.cos(a) * r1 * 1.3, y: bc.y + 0.6 + Math.sin(a) * r1 },
             fim: modo === 'isca' ? { x: isca.x + (hash(i, 34) - 0.5) * 3, y: isca.y + 0.4 + (hash(i, 35) - 0.5) * 1.6 }
                : { x: bc.x + Math.cos(a) * (r0 + 6), y: bc.y + Math.sin(a) * (r0 + 6) * 0.8 },
             atraso: hash(i, 36) * 0.35, fase: hash(i, 37) * 6.28 };
  });
  const tCome = tAcao + 3.2, tVai = tCome + 4.5, tSome = tVai + 7;   // comem o ferro e depois vão embora devagar
  bichos.forEach((bi, i) => {   // destino da saída: para longe da base, do lado oposto à colônia
    const ang = Math.atan2(bi.fim.y - bc.y, bi.fim.x - bc.x) + (hash(i, 38) - 0.5) * 0.5;
    bi.sai = { x: bi.fim.x + Math.cos(ang) * 22, y: bi.fim.y + Math.sin(ang) * 22 * 0.8 };
  });
  ATAQUE = { cfg, ini, sol, modo, isca, bc, tAcao, bichos, tCome, tVai, tSome };
}

function posBicho(bi, t) {
  const A = ATAQUE;
  const durA = A.ini.fim - A.ini.inicio;
  if (t < A.ini.inicio + 0.5) return null;
  if (t > A.tSome) return null;
  let p, anda = true;
  const kA = clamp((t - A.ini.inicio - 0.5 - bi.atraso * durA * 0.4) / (durA * 0.75));
  if (t < A.tAcao) { p = { x: lerp(bi.de.x, bi.cabo.x, suave(kA)), y: lerp(bi.de.y, bi.cabo.y, suave(kA)) }; anda = kA < 1; }
  else if (t < A.tVai + bi.atraso * 2) {
    const kB = clamp((t - A.tAcao - bi.atraso * 1.2) / 2.4);
    p = { x: lerp(bi.cabo.x, bi.fim.x, suave(kB)), y: lerp(bi.cabo.y, bi.fim.y, suave(kB)) };
    anda = kB < 1;   // parados na isca = comendo o ferro (tremidinha)
  } else {   // barriga cheia: vão embora em fila, para longe da colônia
    const kC = clamp((t - A.tVai - bi.atraso * 2) / 5.5);
    p = { x: lerp(bi.fim.x, bi.sai.x, kC), y: lerp(bi.fim.y, bi.sai.y, kC) };
  }
  const tremo = anda ? 0.18 : 0.07;   // roendo: tremidinha no lugar
  return { x: p.x * CASA + Math.sin(t * 9 + bi.fase) * tremo * CASA, y: p.y * CASA + Math.cos(t * 7 + bi.fase) * tremo * CASA * 0.6,
           anda, dir: Math.cos(t * 3 + bi.fase) >= 0 ? 1 : -1 };
}

function desenharAtaque(t) {
  const A = ATAQUE;
  if (!A) return;
  const vis = t >= A.ini.inicio && t <= A.tSome;
  if (!vis) return;
  // a isca de ferro-velho (aparece quando a heroína larga)
  if (A.modo === 'isca' && t >= A.tAcao - 0.2 && t <= A.tVai + 0.5) {
    const x = A.isca.x * CASA, y = A.isca.y * CASA;
    const k = clamp((t - A.tAcao + 0.2) / 0.4) * (1 - clamp((t - A.tCome) / (A.tVai - A.tCome)));   // comida acabando
    ctx.globalAlpha = k;
    ret(x - 14, y + 6, 28, 3, 'rgba(0,0,0,0.25)');
    [[-10, 2, '#8f4129'], [-4, -1, '#9aa0b5'], [3, 1, '#a14b2f'], [8, -2, '#6b6f86'], [-1, 4, '#c1673e'], [5, 5, '#9aa0b5']]
      .forEach(([dx, dy, cor]) => ret(x + dx, y + dy, 7, 4, cor));
    ret(x - 2, y - 6, 2, 8, '#6b6f86'); ret(x + 4, y - 4, 6, 2, '#a14b2f');
    if (Math.floor(t * 6) % 2) ret(x + 6, y - 7, 2, 2, '#fff6d0');
    ctx.globalAlpha = 1;
  }
  // cerca de baixa voltagem: anel de faíscas em volta dos cabos
  if (A.modo === 'cerca' && t >= A.tAcao) {
    const cx = A.bc.x * CASA, cy = (A.bc.y + 0.6) * CASA;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * 6.283, r = 5.2 * CASA;
      if ((Math.floor(t * 10) + i) % 3) continue;
      ret(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, 2, 2, i % 2 ? '#8fe6ff' : '#fff6d0');
    }
  }
  const fadeFim = clamp((A.tSome - t) / 1.5);   // somem só lá longe, já fora da colônia
  for (const bi of A.bichos) {
    const p = posBicho(bi, t);
    if (!p) continue;
    ctx.globalAlpha = fadeFim * clamp((t - A.ini.inicio - 0.5) / 0.5);
    const x = Math.round(p.x), y = Math.round(p.y), pata = p.anda && Math.floor(t * 14 + bi.fase) % 2;
    const tipo = A.cfg.tipo;
    if (tipo === 'besouro') {
      ret(x - 2, y - 1, 5, 3, '#5a2a18'); ret(x - 1, y - 2, 3, 1, '#a14b2f'); ret(x + (p.dir > 0 ? 3 : -2), y - 1, 1, 1, '#ffc83d');
      ret(x - 2 + pata, y + 2, 1, 1, '#2a120a'); ret(x + 2 - pata, y + 2, 1, 1, '#2a120a');
    } else if (tipo === 'acaro') {
      ret(x, y, 2, 2, '#dff3ff'); ret(x + (pata ? 1 : 0), y + 2, 1, 1, '#8fe6ff');
    } else if (tipo === 'verme') {
      for (let k = 0; k < 6; k++) { const ox = -p.dir * k * 3, oy = Math.sin(t * 6 + k + bi.fase) * 1.5; ret(x + ox, y + oy, 4, 4, k ? '#c8a26b' : '#e8c872'); }
      ret(x + p.dir * 2, y + 1, 1, 1, '#2a120a');
    } else {   // lagarto
      ret(x - 9, y - 3, 18, 6, '#4e7a3a'); ret(x + p.dir * 9, y - 4, 6, 5, '#5f9147'); ret(x - p.dir * 16, y - 1, 8, 2, '#4e7a3a');
      ret(x - 6, y + 3 + pata, 2, 3, '#3a5a2a'); ret(x + 5, y + 3 - pata, 2, 3, '#3a5a2a'); ret(x + p.dir * 11, y - 3, 1, 1, '#ffc83d');
    }
  }
  ctx.globalAlpha = 1;
}

// Na cena "plantar", depois de dizer o nome, a tela vira uma CENA ESPECIAL em 2,5D (perspectiva isométrica) dentro da
// estufa: a Vega ajoelhada no canteiro cava cada cova com a pazinha (terra voando), tira uma semente da bolsinha,
// solta na cova, cobre com terra e o broto nasce. Cova por cova, andando de lado no canteiro.
function desenharPlantio25D(t) {
  const c = EP.cenas.find((x) => x.acao === 'plantar');
  if (!c) return;
  const ini = (c.focos.length ? c.focos[c.focos.length - 1].t : c.fala_inicio) + 0.9, fim = c.fim - 0.6;
  if (t < ini - 0.01 || t > fim + 0.6) return;
  const a = clamp((t - ini) / 0.5) * clamp((fim + 0.6 - t) / 0.6);
  const vega = EP.mundo.fundadores.find((f) => f.id === 'vega') || EP.mundo.fundadores[0];
  ctx.save();
  ctx.globalAlpha = a;
  const u = 84, ox = W / 2 - 40, oy = 900;
  const iso = (x, y, z) => ({ x: ox + (x - y) * u, y: oy + (x + y) * u * 0.5 - z * u });
  const poli = (pts, cor) => { ctx.fillStyle = cor; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); };
  const caixa = (x0, y0, x1, y1, z0, z1, topo, frente, lado) => {
    poli([iso(x0, y1, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x0, y1, z1)], frente);   // face da frente (y = y1)
    poli([iso(x1, y0, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x1, y0, z1)], lado);     // face do lado (x = x1)
    poli([iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)], topo);     // tampo
  };
  // fundo: luz quente da estufa, vidro com reflexo
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1d3b3a'); g.addColorStop(0.45, '#2f5e4b'); g.addColorStop(1, '#2a1a14');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = -4; i < 14; i++) {   // vidraças da parede de trás (em perspectiva)
    const p0 = iso(i * 0.9, -3.2, 0), p1 = iso(i * 0.9, -3.2, 4.2);
    ctx.fillStyle = '#9fe7ff22'; ctx.fillRect(p1.x, p1.y, u * 0.82, p0.y - p1.y);
    ctx.fillStyle = '#eef0f855'; ctx.fillRect(p1.x, p1.y, 3, p0.y - p1.y);
  }
  ctx.globalAlpha = a * 0.18;   // fachos de luz
  for (let i = 0; i < 5; i++) poli([{ x: 120 + i * 230, y: 0 }, { x: 220 + i * 230, y: 0 }, { x: -60 + i * 230 + 420, y: H }, { x: -160 + i * 230 + 420, y: H }], '#fff6d0');
  ctx.globalAlpha = a;
  // câmera da cena: 2,1x de perto, acompanhando a cova da vez (a Vega anda de lado no canteiro)
  const kk0 = clamp((t - ini) / (fim - ini - 0.4)), foco = iso(Math.min(4, kk0 * 5) * 1.15 - 0.3, 1.1, 0.4);
  ctx.save();
  ctx.translate(W / 2, H * 0.6); ctx.scale(2.1, 2.1); ctx.translate(-foco.x, -foco.y);
  for (let x = -7; x < 13; x++) for (let y = -6; y < 8; y++) {   // piso em ladrilhos
    poli([iso(x, y, 0), iso(x + 1, y, 0), iso(x + 1, y + 1, 0), iso(x, y + 1, 0)], (x + y) % 2 ? '#5d6177' : '#53566b');
  }
  // canteiros de trás já com plantas
  for (const yb of [-2.6, -1.3]) {
    caixa(-1.5, yb, 6.5, yb + 0.9, 0, 0.45, '#5a2a18', '#7a7f96', '#6b6f86');
    for (let i = 0; i < 9; i++) { const p = iso(-1.1 + i * 0.85, yb + 0.45, 0.45); ctx.fillStyle = '#2bb673'; ctx.fillRect(p.x - 6, p.y - 26, 12, 26); ctx.fillStyle = '#4ed37a'; ctx.fillRect(p.x - 14, p.y - 30, 12, 8); ctx.fillRect(p.x + 2, p.y - 36, 12, 8); }
  }
  // o canteiro da frente (onde ela planta)
  const N = 5, x0b = -0.5, x1b = 5.5, y0b = 0, y1b = 1.2, zb = 0.55;
  caixa(x0b, y0b, x1b, y1b, 0, zb, '#6b3a22', '#9aa0b5', '#7a7f96');
  for (let i = 0; i < 40; i++) { const p = iso(x0b + hash(i, 41) * (x1b - x0b), y0b + hash(i, 42) * (y1b - y0b), zb); ctx.fillStyle = i % 3 ? '#5a2a18' : '#8f4129'; ctx.fillRect(p.x, p.y, 6, 4); }
  const dur = (fim - ini - 0.4) / N, kk = clamp((t - ini) / (fim - ini - 0.4));
  const idx = Math.min(N - 1, Math.floor(kk * N)), fase = clamp(kk * N - idx);
  const cova = (i) => iso(0 + i * 1.15, 0.6, zb);
  for (let i = 0; i < N; i++) {   // covas: abertas, com semente, cobertas, broto
    const p = cova(i), done = i < idx || (i === idx && fase >= 0.999);
    const f = i < idx ? 1 : i === idx ? fase : 0;
    if (f <= 0) continue;
    const prof = f < 0.35 ? f / 0.35 : f < 0.6 ? 1 : 1 - clamp((f - 0.6) / 0.15);
    ctx.fillStyle = '#2a120a'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 22 * Math.max(0.3, prof), 10 * Math.max(0.3, prof), 0, 0, 7); ctx.fill();
    if (f >= 0.6) { ctx.fillStyle = '#8f4129'; ctx.beginPath(); ctx.ellipse(p.x, p.y - 4, 20, 9, 0, 3.14, 6.28); ctx.fill(); }   // montinho
    if (f >= 0.75 || done) {   // broto
      const k = done ? 1 : clamp((f - 0.75) / 0.25), alt = 10 + k * 46;
      ctx.fillStyle = '#2bb673'; ctx.fillRect(p.x - 3, p.y - 6 - alt, 6, alt);
      ctx.fillStyle = '#4ed37a'; ctx.fillRect(p.x - 3 - 20 * k, p.y - 6 - alt, 20 * k, 10); ctx.fillRect(p.x + 3, p.y - 14 - alt, 20 * k, 10);
    }
  }
  // a Vega ajoelhada na frente do canteiro, andando de lado até a cova da vez
  const andando = fase < 0.08 && idx > 0, alvoX = 0 + idx * 1.15 + (andando ? -1.15 * (1 - fase / 0.08) : 0);
  const pv = iso(alvoX - 0.55, 1.75, 0), esc = 13;
  const spr = spriteMapa(vega.sprite);
  ctx.globalAlpha = a * 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(pv.x, pv.y + 6, 70, 18, 0, 0, 7); ctx.fill(); ctx.globalAlpha = a;
  const sh = spr.height, swd = spr.width, corpo = Math.round(sh * 0.72);
  ctx.drawImage(spr, 0, 0, swd, corpo, pv.x - swd * esc / 2, pv.y - sh * esc + (sh - corpo) * esc * 0.55, swd * esc, corpo * esc);   // tronco
  ctx.drawImage(spr, 0, corpo, swd, sh - corpo, pv.x - swd * esc / 2, pv.y - (sh - corpo) * esc * 0.45, swd * esc, (sh - corpo) * esc * 0.45);   // pernas dobradas
  const topoB = pv.y - sh * esc + (sh - corpo) * esc * 0.55;
  ret(pv.x - 3.6 * esc, topoB + 8.2 * esc, 22, 18, '#c8a26b'); ret(pv.x - 3.6 * esc + 2, topoB + 8.2 * esc - 6, 18, 6, '#a07a4a');   // bolsinha na cintura
  // braço + pazinha / semente, conforme a fase da cova
  // ombro = onde o braço do próprio boneco fica (linha 7 do sprite, lado direito do corpo), não na cabeça
  const topo = pv.y - sh * esc + (sh - corpo) * esc * 0.55;
  const pc = cova(idx), ombro = { x: pv.x + 2.6 * esc, y: topo + 7.2 * esc };
  let mao;
  if (fase < 0.35) {   // cavando: três golpes
    const g3 = (fase / 0.35 * 3) % 1, desce = g3 < 0.5 ? g3 * 2 : 2 - g3 * 2;
    mao = { x: lerp(ombro.x + 20, pc.x, desce), y: lerp(pc.y - 70, pc.y - 8, desce) };
    ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(mao.x, mao.y); ctx.lineTo(mao.x + 18, mao.y - 30); ctx.stroke();   // cabo
    poli([{ x: mao.x - 10, y: mao.y }, { x: mao.x + 10, y: mao.y }, { x: mao.x, y: mao.y + 26 }], '#c9ced9');   // lâmina
    if (g3 > 0.5) for (let j = 0; j < 6; j++) {   // terra voando
      const q = (g3 - 0.5) / 0.5;
      ret(pc.x + 10 + j * 14 * q, pc.y - 10 - Math.sin(q * Math.PI) * (40 + j * 10), 8, 8, j % 2 ? '#8f4129' : '#5a2a18');
    }
  } else if (fase < 0.6) {   // pega a semente na bolsinha e solta na cova
    const q = (fase - 0.35) / 0.25;
    const bolsa = { x: pv.x - 3.6 * esc + 11, y: pv.y - sh * esc + (sh - corpo) * esc * 0.55 + 8.2 * esc };
    mao = q < 0.4 ? { x: lerp(ombro.x, bolsa.x, q / 0.4), y: lerp(ombro.y, bolsa.y, q / 0.4) }
                  : { x: lerp(bolsa.x, pc.x, (q - 0.4) / 0.6), y: lerp(bolsa.y, pc.y - 50, (q - 0.4) / 0.6) };
    if (q > 0.4 && q < 0.95) ret(mao.x - 4, mao.y + 8, 8, 10, '#e8c872');
    if (q >= 0.95) { const qq = (fase - 0.585) / 0.015; ret(pc.x - 4, lerp(pc.y - 40, pc.y - 4, clamp(qq)), 8, 10, '#e8c872'); }
  } else if (fase < 0.75) {   // cobre com terra (tapinhas)
    const bate = Math.abs(Math.sin((fase - 0.6) / 0.15 * Math.PI * 3));
    mao = { x: pc.x, y: pc.y - 10 - bate * 26 };
  } else mao = { x: lerp(pc.x, ombro.x + 10, (fase - 0.75) / 0.25), y: lerp(pc.y - 20, ombro.y + 10, (fase - 0.75) / 0.25) };
  ctx.lineCap = 'round';   // braço na cor do traje, com contorno escuro (como o resto do boneco)
  ctx.strokeStyle = '#1b1530'; ctx.lineWidth = 17; ctx.beginPath(); ctx.moveTo(ombro.x, ombro.y); ctx.lineTo(mao.x, mao.y); ctx.stroke();
  ctx.strokeStyle = '#e2603b'; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(ombro.x, ombro.y); ctx.lineTo(mao.x, mao.y); ctx.stroke();
  ret(mao.x - 9, mao.y - 9, 18, 18, '#f2c9a0');
  ctx.restore();   // fim da câmera de perto
  // título e contador
  texto('PLANTANDO AS PRIMEIRAS SEMENTES', W / 2, 330, 34, COR.ouro, { maxW: W - 120 });
  texto(`SEMENTE ${Math.min(N, idx + 1)} DE ${N}`, W / 2, 390, 26, '#f3eefe', { contorno: false });
  ctx.restore();
}

function eventoNoCeu(t) {
  const id = EP.problema && EP.problema.id;
  if (id === 'redemoinho') { redemoinhoNoMapa(t); return; }
  if (id !== 'chuva-meteoros' && id !== 'nave-alienigena') return;
  const ini = EP.cenas.find((c) => c.tipo === 'problema'), fim = EP.cenas.find((c) => c.tipo === 'solucao');
  if (!ini) return;
  const naCena = (c) => (c ? clamp((t - c.inicio) / 0.6) * clamp((c.fim - t) / 0.8) : 0);
  const a = Math.max(naCena(ini), naCena(fim));   // só no alerta e na solução (na missão a obra segue normal)
  if (a <= 0) return;
  // na solução o perigo passa: os meteoros rareiam e a nave vai embora
  const calma = fim && t > fim.fala_inicio ? clamp((t - fim.fala_inicio) / Math.max(1, fim.fim - fim.fala_inicio)) : 0;
  ctx.globalAlpha = a;
  if (id === 'chuva-meteoros') {
    const n = Math.round(11 * (1 - 0.8 * calma));
    for (let i = 0; i < n; i++) {
      const per = 1.3 + hash(i, 11) * 1.4, k = ((t + hash(i, 12) * per) % per) / per;
      const x0 = hash(i, 13) * (W + 600) - 50, y0 = -200 + hash(i, 14) * 500;
      const x = x0 - k * 700, y = y0 + k * 1500, L = 200 + hash(i, 15) * 140, tam = 12 + Math.floor(hash(i, 16) * 6);
      for (let j = 0; j < 12; j++) {   // rastro: do branco quente ao laranja, afinando
        ctx.globalAlpha = a * (1 - j / 12);
        const q = Math.max(4, tam - j);
        ret(x + j * L / 12 * 0.47 - q / 2, y - j * L / 12 - q / 2, q, q, j < 2 ? '#fff6d0' : j < 6 ? '#ffc83d' : '#e2603b');
      }
      ctx.globalAlpha = a * 0.35; ret(x - tam, y - tam, tam * 2, tam * 2, '#fff6d0');   // brilho em volta da pedra
    }
  } else {
    const vai = calma > 0 ? saida(calma) : 0;
    const x = W / 2 + Math.sin(t * 0.7) * 160 + vai * (W + 300), y = 640 + Math.sin(t * 1.7) * 18 - vai * 500;   // abaixo do cartão do alerta
    ctx.globalAlpha = a * 0.25; ret(x - 70, y + 30, 140, Math.max(0, 560 - vai * 560), '#9ff7ff');   // feixe de luz
    ctx.globalAlpha = a;
    disco(x, y + 6, 70, '#6b6f86', 0.28); disco(x, y, 66, '#b8bcd4', 0.26); disco(x, y - 14, 30, '#9ff7ff', 0.7);
    for (let i = 0; i < 6; i++) { const on = Math.floor(t * 6 + i) % 3 === 0; ret(x - 55 + i * 21, y + 3, 9, 6, on ? '#ffe58a' : '#4ed37a'); }
  }
  ctx.globalAlpha = 1;
}

function alarme(t, cena) {   // luz vermelha pulsando durante o alerta do problema do dia
  if (!cena || cena.tipo !== 'problema' || (cena.problema && cena.problema.categoria === 'descoberta')) return;
  const a = fadeCena(cena, t, 0.2, 0.4) * (0.10 + 0.10 * Math.max(0, Math.sin(t * 7)));
  ctx.globalAlpha = a;
  ret(0, 0, W, H, COR.alerta);
  ctx.globalAlpha = 1;
}

function fadeCena(c, t, entra = 0.35, sai = 0.3) {
  return clamp((t - c.inicio) / entra) * clamp((c.fim - t) / sai);
}

function hudTopo(t) {
  const a = clamp((t - 2.6) / 0.5);
  if (a <= 0) return;
  ctx.globalAlpha = a;
  const ep = `EP ${String(EP.numero).padStart(2, '0')}`;
  const e = EP.estacao;
  // do episódio 2 em diante o selo leva a estação e a temperatura do dia (no lugar do nome, que já está na abertura)
  const rot = e && EP.numero >= 2 ? `${ep} · ${e.nome.toUpperCase()} · DIA ${e.dia} · ${e.temp}°C` : `OPERAÇÃO MARTE ZERO · ${ep}`;
  ctx.font = `24px ${FONTE}`;
  const w = ctx.measureText(rot).width + 44;
  const frio = e && EP.numero >= 2 && e.efeito === 'geada';
  caixa(54, 132, Math.min(w, W - 108), 62, 0.8, frio ? '#4f7fa8' : COR.borda);
  texto(rot, 54 + Math.min(w, W - 108) / 2, 165, 24, frio ? COR.gelo : COR.areia, { contorno: false, maxW: W - 150 });
  ctx.globalAlpha = 1;
}

function cartao(cena, t, cam) {
  const a = fadeCena(cena, t);
  if (a <= 0) return;
  ctx.globalAlpha = a;
  const sobe = (1 - saida(clamp((t - cena.inicio) / 0.45))) * 40;
  if (cena.tipo === 'abertura') {
    const k = clamp((t - 0.6) / 0.8);
    ctx.globalAlpha = a * k;
    texto('OPERAÇÃO', W / 2, 400 + (1 - saida(k)) * 50, 60, COR.texto);
    texto('MARTE ZERO', W / 2, 490 + (1 - saida(k)) * 50, 84, COR.ouro);
    texto(`EPISÓDIO ${EP.numero}`, W / 2, 600, 36, COR.texto);
    const sub = EP.missao_titulo.toUpperCase();
    const n = Math.floor(clamp((t - 1.6) / 1.4) * sub.length);
    if (n > 0) texto(sub.slice(0, n), W / 2, 680, 26, COR.agua);
  } else if (cena.tipo === 'populacao') {
    const [de, para] = cena.contagem;
    const k = clamp((t - cena.fala_inicio - 0.2) / 1.6);
    const n = Math.round(lerp(de, para, saida(k)));
    caixa(W / 2 - 300, 250 - sobe, 600, 250);
    texto('POPULAÇÃO', W / 2, 315 - sobe, 30, COR.agua, { contorno: false });
    const pulso = 1 + 0.08 * Math.max(0, Math.sin((k * Math.max(1, para - de)) * Math.PI)) * (k < 1);
    texto(n.toLocaleString('pt-BR'), W / 2, 418 - sobe, Math.round(92 * pulso), COR.ouro);
  } else if (cena.tipo === 'boas_vindas' || cena.tipo === 'compras' || cena.tipo === 'destaque') {
    const tit = { compras: 'NOVIDADES NA VIZINHANÇA', destaque: 'DESTAQUE DO DIA' }[cena.tipo] || 'BEM-VINDOS!';
    if (cena.tipo === 'destaque') for (let i = 0; i < 2; i++) {   // estrelinhas douradas em volta do título
      const x = W / 2 + (i ? 1 : -1) * (300 + 8 * Math.sin(t * 5)), y = 282 - sobe;
      ret(x - 3, y - 12, 6, 24, COR.ouro); ret(x - 12, y - 3, 24, 6, COR.ouro);
    }
    texto(tit, W / 2, 290 - sobe, cena.tipo === 'boas_vindas' ? 48 : 32, COR.ouro);
    const ativos = cena.focos.filter((f) => t >= f.t);
    ativos.slice(-4).forEach((f, i) => {
      const [, id, slug] = f.alvo.split(':');
      const c = colonoPorCodigo.get(id);
      if (!c) return;
      let rot = c.nome;
      if (slug) { const compra = EP.mundo.compras.find((x) => x.codigo === id && x.produto_slug === slug); if (compra) rot += ` · ${compra.produto_curto}`; }
      const k = clamp((t - f.t) / 0.3);
      ctx.globalAlpha = a * k;
      // boas-vindas com profissão: nome + cargo embaixo (linhas mais espaçadas)
      const comCargo = cena.tipo !== 'compras' && cena.focos.some((x) => (colonoPorCodigo.get(x.alvo.split(':')[1]) || {}).cargo_nome);
      const passo = comCargo ? 92 : 64;
      texto(rot, W / 2, 380 + i * passo - sobe, 30, COR.texto, { maxW: W - 160 });
      if (comCargo && c.cargo_nome) texto(c.cargo_nome.toUpperCase(), W / 2, 380 + i * passo + 36 - sobe, 18, COR.agua, { contorno: false, maxW: W - 160 });
    });
  } else if (cena.tipo === 'andarilhos') {   // entraram pelos comentários (ainda sem casa)
    const nAnd = Math.min(3, cena.focos.filter((f) => t >= f.t).length);
    caixa(70, 230 - sobe, W - 140, 130 + Math.max(1, nAnd) * 92, 0.9, COR.agua);
    texto('CHEGARAM PELOS', W / 2, 270 - sobe, 30, COR.agua, { contorno: false });
    texto('COMENTÁRIOS!', W / 2, 318 - sobe, 44, COR.ouro);
    const ativos = cena.focos.filter((f) => t >= f.t);
    ativos.slice(-3).forEach((f, i) => {
      const a = ANDARILHOS.find((x) => `andarilho:${x.handle}` === f.alvo);
      if (!a) return;
      ctx.globalAlpha = a ? fadeCena(cena, t) * clamp((t - f.t) / 0.3) : 0;
      texto(`@${a.handle}`, W / 2, 400 + i * 92 - sobe, 30, COR.texto, { maxW: W - 160 });
      if (a.cargo_nome) texto(a.cargo_nome.toUpperCase(), W / 2, 436 + i * 92 - sobe, 18, COR.agua, { contorno: false, maxW: W - 160 });
    });
  } else if (cena.tipo === 'cratera') {
    texto('NOME NOVO NO MAPA', W / 2, 290 - sobe, 32, COR.ouro);
    const ativos = cena.focos.filter((f) => t >= f.t);
    ativos.slice(-3).forEach((f, i) => {
      const c = (EP.mundo.crateras || []).find((x) => `cratera:${x.id}` === f.alvo);
      if (!c) return;
      ctx.globalAlpha = a * clamp((t - f.t) / 0.3);
      texto(c.nome.toUpperCase(), W / 2, 380 + i * 92 - sobe, 30, COR.texto, { maxW: W - 160 });
      texto(`BATIZADA POR ${c.dono.toUpperCase()}`, W / 2, 416 + i * 92 - sobe, 18, COR.agua, { contorno: false, maxW: W - 160 });
    });
  } else if (cena.tipo === 'missao') {
    caixa(70, 236 - sobe, W - 140, 286);
    texto('MISSÃO DO DIA', W / 2, 296 - sobe, 30, COR.agua, { contorno: false });
    texto(EP.missao_titulo.toUpperCase(), W / 2, 360 - sobe, 32, COR.texto, { contorno: false, maxW: W - 220 });
    for (let i = 1; i <= 5; i++) {
      const x = W / 2 + (i - 3) * 64;
      ret(x - 20, 404 - sobe, 40, 40, i <= cena.passo ? COR.ouro : COR.borda);
      if (i === cena.passo && Math.floor(t * 3) % 2) ret(x - 12, 412 - sobe, 24, 24, COR.ceu);
    }
    const st = progressoObra(obraDaMissao(), t);
    ret(140, 470 - sobe, W - 280, 22, COR.borda);
    ret(140, 470 - sobe, (W - 280) * st.p, 22, st.energia ? COR.ok : COR.marte);
    texto(`${Math.round(st.p * 100)}%`, W - 150, 481 - sobe, 18, COR.texto, { alinhar: 'right', contorno: false });
  } else if (cena.tipo === 'problema' || cena.tipo === 'solucao') {
    const p = cena.problema || {};
    const ok = cena.tipo === 'solucao';
    caixa(70, 236 - sobe, W - 140, 250, 0.9, ok ? COR.ok : (p.categoria === 'descoberta' ? COR.agua : COR.alerta));
    const desc = p.categoria === 'descoberta';
    const pisca = ok || desc || Math.floor(t * 3) % 3 !== 0;   // aceso 2/3 do tempo
    const titulo = desc ? (ok ? 'REGISTRADO!' : 'DESCOBERTA!') : (ok ? 'RESOLVIDO!' : 'ALERTA!');
    if (pisca) texto(titulo, W / 2, 296 - sobe, 40, ok ? COR.ok : (desc ? COR.agua : COR.alerta));
    texto(p.furia ? 'FÚRIA DE MARTE' : (p.rotulo || '').toUpperCase(), W / 2, 356 - sobe, 22, p.furia ? COR.ouro : COR.areia, { contorno: false, maxW: W - 220 });
    if (!ok && p.furia) texto(`CHAMADA POR ${p.furia.toUpperCase()}`, W / 2, 452 - sobe, 20, COR.ouro, { contorno: false, maxW: W - 220 });
    texto((p.titulo || '').toUpperCase(), W / 2, 408 - sobe, 26, COR.texto, { contorno: false, maxW: W - 200 });
    if (ok && cena.heroi) texto(`POR ${cena.heroi.toUpperCase()}`, W / 2, 452 - sobe, 20, COR.ouro, { contorno: false });
  } else if (cena.tipo === 'votacao') {   // SIM ou NÃO nos comentários: decide o começo do próximo episódio
    const v = cena.votacao || {};
    caixa(60, 220 - sobe, W - 120, 400, 0.9, COR.ouro);
    texto('VOTAÇÃO DA COLÔNIA', W / 2, 282 - sobe, 30, COR.ouro, { contorno: false });
    texto(v.tela || '', W / 2, 352 - sobe, 34, COR.texto, { contorno: false, maxW: W - 200 });
    const pisca = Math.floor(t * 2) % 2;
    [['SIM', COR.ok, -1], ['NÃO', COR.alerta, 1]].forEach(([rot, cor, lado], i) => {
      const x = W / 2 + lado * 190, y = 450 - sobe, aceso = pisca === i, s = aceso ? 1.08 : 1;
      const w = 300 * s, h = 110 * s;
      ret(x - w / 2 + 8, y - h / 2 + 8, w, h, '#0008');
      ret(x - w / 2, y - h / 2, w, h, aceso ? cor : COR.borda);
      texto(rot, x, y + 2, Math.round(56 * s), aceso ? COR.ceu : cor, { contorno: false });
    });
    texto('COMENTE + A SUA PROFISSÃO', W / 2, 568 - sobe, 24, COR.agua, { contorno: false });
  } else if (cena.tipo === 'resultado' && DUNAS_MAPA && cena === DUNAS_MAPA.c && t >= DUNAS_MAPA.t0) {   // mapa atualizado
    const k = saida(clamp((t - DUNAS_MAPA.t0) / 0.35));
    ctx.globalAlpha = a * k;
    caixa(90, 200, W - 180, 180, 0.9, COR.alerta);
    texto('MAPA ATUALIZADO', W / 2, 252, 34, COR.agua, { contorno: false });
    if (Math.floor(t * 3) % 3) texto('TRILHA DESCONHECIDA', W / 2, 318, 26, COR.alerta, { contorno: false });
  } else if (cena.tipo === 'fundacao') {   // a próxima obra já começou: só a fundação hoje
    caixa(70, 236 - sobe, W - 140, 270, 0.9, COR.ouro);
    texto('A PRÓXIMA OBRA JÁ COMEÇOU', W / 2, 292 - sobe, 26, COR.agua, { contorno: false, maxW: W - 200 });
    texto((cena.obra_nome || '').toUpperCase(), W / 2, 350 - sobe, 34, COR.texto, { contorno: false, maxW: W - 200 });
    const [p0, p1] = cena.progresso || [0, 0.15];
    const k = FUND ? clamp((t - FUND.ini) / (FUND.fim - FUND.ini)) : 1, p = lerp(p0, p1, k);
    texto(k >= 1 ? 'FUNDAÇÃO PRONTA!' : 'FUNDAÇÃO', W / 2, 404 - sobe, 24, k >= 1 ? COR.ok : COR.ouro, { contorno: false });
    ret(140, 446 - sobe, W - 280, 22, COR.borda);
    ret(140, 446 - sobe, (W - 280) * p, 22, k >= 1 ? COR.ok : COR.marte);
    texto(`${Math.round(p * 100)}%`, W - 150, 457 - sobe, 18, COR.texto, { alinhar: 'right', contorno: false });
  } else if (cena.tipo === 'resultado') {   // decisão da votação do episódio anterior
    const v = cena.votacao || {}, sim = v.resultado === 'sim', pl = cena.placar;
    caixa(60, 220 - sobe, W - 120, pl ? 460 : 330, 0.9, sim ? COR.ok : COR.alerta);
    texto('A COLÔNIA DECIDIU', W / 2, 282 - sobe, 30, COR.ouro, { contorno: false });
    texto(v.tela || '', W / 2, 340 - sobe, 26, COR.texto, { contorno: false, maxW: W - 200 });
    const k = saida(clamp((t - cena.fala_inicio - 0.3) / 0.35)), s = 1 + (1 - k) * 0.6;
    ctx.globalAlpha = a * clamp(k * 2);
    texto(sim ? 'SIM!' : 'NÃO!', W / 2, 452 - sobe, Math.round(96 * s), sim ? COR.ok : COR.alerta);
    if (pl) {   // placar dos comentários: SIM 3 × 1 NÃO e quem votou (até 3 nomes de cada lado)
      ctx.globalAlpha = a;
      texto(`SIM ${pl.sim}  ×  ${pl.nao} NÃO`, W / 2, 540 - sobe, 30, COR.texto, { contorno: false });
      const nomes = (l) => l.slice(0, 3).map((x) => `@${x}`).join(' ') + (l.length > 3 ? ` +${l.length - 3}` : '');
      if (pl.nomes_sim.length) texto(nomes(pl.nomes_sim), W / 2, 580 - sobe, 16, COR.ok, { contorno: false, maxW: W - 160 });
      if (pl.nomes_nao.length) texto(nomes(pl.nomes_nao), W / 2, 608 - sobe, 16, COR.alerta, { contorno: false, maxW: W - 160 });
      if (pl.desempate) texto(`DESEMPATE: @${pl.desempate}`, W / 2, 636 - sobe, 18, COR.ouro, { contorno: false, maxW: W - 160 });
    }
  } else if (cena.tipo === 'pedido') {   // pedido do dia: a ideia de alguém dos comentários vira cena
    caixa(70, 236 - sobe, W - 140, 230, 0.9, COR.agua);
    texto('PEDIDO DA COLÔNIA', W / 2, 292 - sobe, 30, COR.agua, { contorno: false });
    texto((cena.pedido?.tela || '').toUpperCase(), W / 2, 350 - sobe, 28, COR.texto, { contorno: false, maxW: W - 200 });
    texto(`@${cena.pedido?.autor || ''}`, W / 2, 410 - sobe, 22, COR.ouro, { contorno: false, maxW: W - 200 });
  } else if (cena.tipo === 'gancho') {
    texto('PROCURE SEU NOME', W / 2, 330 - sobe, 50, COR.ouro);
    ctx.font = `38px ${FONTE}`;
    const w = Math.min(W - 100, ctx.measureText(EP.site_tela).width + 70);
    const pulso = Math.sin(t * 4) > 0 ? 0 : 4;
    ret(W / 2 - w / 2 + 8, 432 - sobe + 8, w, 96, '#0008');
    ret(W / 2 - w / 2 + pulso, 432 - sobe + pulso, w, 96, COR.marte);
    ret(W / 2 - w / 2 + pulso, 432 - sobe + pulso + 88, w, 8, COR.marteEsc);
    texto(EP.site_tela, W / 2 + pulso, 478 - sobe + pulso, 38, '#ffffff', { contorno: false, maxW: w - 50 });
    texto(`PRÓXIMO EPISÓDIO: ${EP.proxima.toUpperCase()}`, W / 2, 610 - sobe, 24, COR.agua, { maxW: W - 120 });
  } else if (cena.tipo === 'youtube') {   // cortes do Instagram/TikTok: chamada para o episódio completo no YouTube
    texto('EPISÓDIO COMPLETO', W / 2, 300 - sobe, 48, COR.ouro);
    const w = 560, x0 = W / 2 - w / 2, y0 = 360 - sobe, pulso = Math.sin(t * 4) > 0 ? 0 : 4;
    ret(x0 + 8, y0 + 8, w, 120, '#0008');
    ret(x0 + pulso, y0 + pulso, w, 120, '#e62117');
    ret(x0 + pulso, y0 + pulso + 112, w, 8, '#9e1510');
    // triângulo de "play" desenhado em blocos (pixel art)
    for (let i = 0; i < 9; i++) ret(x0 + 48 + pulso + i * 5, y0 + 24 + pulso + i * 4, 6, 72 - i * 8, '#ffffff');
    texto('NO YOUTUBE', W / 2 + 66 + pulso,  y0 + 62 + pulso, 46, '#ffffff', { contorno: false });
    texto(`OPERAÇÃO MARTE ZERO #${EP.numero}`, W / 2, y0 + 190, 28, COR.texto, { maxW: W - 120 });
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ texto grande
// A narração aparece na tela em blocos curtos (até 3 palavras), em MAIÚSCULAS e grandes, um bloco por vez: o
// bloco entra com um pulo e a palavra que está sendo falada fica dourada. Dá para entender o vídeo sem som.
// (Desenhado aqui e não no ffmpeg porque a fonte só acerta os acentos das maiúsculas com o desenho à mão.)
const LEG = { tam: 64, linha: 13, bloco: 22, palavras: 3, y: 1345, entre: 84 };
let BLOCOS_LEG = [];
function prepararLegendas() {
  BLOCOS_LEG = [];
  for (const c of EP.cenas) {
    const pal = (c.palavras || []).filter((w) => w.p && w.p.trim());
    const blocos = [];
    let atual = [], tam = 0;
    for (const w of pal) {
      const extra = w.p.length + (atual.length ? 1 : 0);
      if (atual.length && (tam + extra > LEG.bloco || atual.length >= LEG.palavras)) { blocos.push(atual); atual = []; tam = 0; }
      atual.push(w); tam += atual.length > 1 ? w.p.length + 1 : w.p.length;
      if (/[.!?:,]$/.test(w.p) && tam >= 6) { blocos.push(atual); atual = []; tam = 0; }
    }
    if (atual.length) blocos.push(atual);
    blocos.forEach((b, j) => {
      const prox = blocos[j + 1];
      const fim = Math.min(c.fim - 0.05, prox ? prox[0].i : b[b.length - 1].f + 0.5);
      // até 2 linhas equilibradas
      const comp = (ws) => ws.reduce((a, w) => a + w.p.length, 0) + ws.length - 1;
      let linhas = [b];
      if (comp(b) > LEG.linha && b.length > 1) {
        let melhor = Infinity;
        for (let k = 1; k < b.length; k++) { const n = Math.max(comp(b.slice(0, k)), comp(b.slice(k))); if (n < melhor) { melhor = n; linhas = [b.slice(0, k), b.slice(k)]; } }
      }
      BLOCOS_LEG.push({ ini: b[0].i, fim, linhas });
    });
  }
}

function legendaGrande(t) {
  const b = BLOCOS_LEG.find((x) => t >= x.ini && t < x.fim);
  if (!b) return;
  const pulo = 1 + 0.22 * (1 - saida(clamp((t - b.ini) / 0.13)));
  const fala = [].concat(...b.linhas).filter((w) => t >= w.i).pop();
  ctx.save();
  const y0 = LEG.y - (b.linhas.length - 1) * LEG.entre / 2;
  ctx.translate(W / 2, y0); ctx.scale(pulo, pulo); ctx.translate(-W / 2, -y0);
  b.linhas.forEach((linha, li) => {
    const y = y0 + li * LEG.entre;
    const pal = linha.map((w) => w.p.toUpperCase());
    ctx.font = `${LEG.tam}px ${FONTE}`;
    const esp = ctx.measureText(' ').width;
    let tam = LEG.tam;
    const larg = () => pal.reduce((a, p) => a + ctx.measureText(p).width, 0) + esp * (pal.length - 1);
    while (larg() > W - 100 && tam > 30) { tam -= 2; ctx.font = `${tam}px ${FONTE}`; }
    let x = W / 2 - larg() / 2;
    const e = ctx.measureText(' ').width;
    linha.forEach((w, i) => {
      // sombra dura + contorno grosso, igual ao estilo dos títulos
      ctx.font = `${tam}px ${FONTE}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0009'; ctx.fillText(pal[i], x + 6, y + 7);
      texto(pal[i], x, y, tam, w === fala ? COR.ouro : '#ffffff', { alinhar: 'left', maxW: 9999 });
      x += ctx.measureText(pal[i]).width + e;
    });
  });
  ctx.restore();
}

// ------------------------------------------------------------------ quadro
function desenhar(t) {
  // corte para uma tomada (cena de lado, em close) — tomadas.js; a narração continua por cima
  const tm = window.tomadaEm && window.tomadaEm(t);
  if (tm) {
    window.desenharTomada(tm, t);
    legendaGrande(t);
    const pr = Math.max(1 - clamp(t / 0.6), clamp((t - (EP.duracao - 0.9)) / 0.9));
    if (pr > 0) { ctx.globalAlpha = pr; ret(0, 0, W, H, '#000'); ctx.globalAlpha = 1; }
    return;
  }
  const cam = camera(t);
  const cena = cenaEm(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#a94f33';
  ctx.fillRect(0, 0, W, H);

  // mundo
  const tx = Math.round(W / 2 - cam.x * cam.z), ty = Math.round(H * FOCO_Y - cam.y * cam.z);
  ctx.setTransform(cam.z, 0, 0, cam.z, tx, ty);
  ctx.drawImage(terreno, TER.x0 * CASA, TER.y0 * CASA);
  const view = {
    x0: Math.floor(-tx / cam.z / CASA), x1: Math.ceil((W - tx) / cam.z / CASA),
    y0: Math.floor(-ty / cam.z / CASA), y1: Math.ceil((H - ty) / cam.z / CASA),
  };
  const energia = t >= tempoEnergia || EP.mundo.obras.some((o) => o.tipo === 'solar' && o.status === 'concluida');
  desenharCanteiro(t);
  desenharObras(t);
  desenharMapaDunas(t);
  desenharEsqueleto(t);
  desenharCasas(view, t, energia);
  desenharColonos(view, t);
  desenharAndarilhos(view, t);
  desenharCompras(t);
  desenharBase(t, energia);
  desenharPortaAbrigo(t);
  desenharFundadores(t);
  desenharAtaque(t);
  desenharNoite(cam, t, view, tx, ty, energia);
  ctx.setTransform(cam.z, 0, 0, cam.z, tx, ty);
  desenharHudConserto(t);

  // tela
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  poeira(t);
  if (t >= tempoEnergia && t < tempoEnergia + 0.7) {   // clarão quando a energia liga
    ctx.globalAlpha = 0.45 * (1 - (t - tempoEnergia) / 0.7);
    ret(0, 0, W, H, '#fff6d0');
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(vinheta, 0, 0);
  eventoNoCeu(t);
  alarme(t, cena);
  desenharCrateras(cam, t);
  desenharFocos(cam, t, cena);
  hudTopo(t);
  cartao(cena, t, cam);
  desenharPlantio25D(t);   // cena especial em 2,5D por cima de tudo
  legendaGrande(t);        // texto grande da narração (por cima de tudo)

  // entra e sai do preto
  // corte curto (Instagram/TikTok) começa já na ação: sem entrar do preto
  const preto = Math.max(EP.curto ? 0 : 1 - clamp(t / 0.6), clamp((t - (EP.duracao - 0.9)) / 0.9));
  if (preto > 0) { ctx.globalAlpha = preto; ret(0, 0, W, H, '#000'); ctx.globalAlpha = 1; }
}

window.desenhar = desenhar;
window.quadro = function (i, qualidade = 0.92) {
  desenhar(i / EP.fps);
  return cv.toDataURL('image/jpeg', qualidade);
};
window.pronto = true;
