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

const cv = document.getElementById('tela');
const ctx = cv.getContext('2d', { alpha: false });

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
function spriteColono(seed) {
  if (!spriteCache.has(seed)) spriteCache.set(seed, canvasDeMatriz(gerarSprite(seed), (v) => v));
  return spriteCache.get(seed);
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

// Bairro em espiral (igual a lib/mundo.ts e à casa_pos do banco): rua a cada 4 casas a partir do centro da base
const CENTRO = { x: 5, y: -8 }, ANEL_INICIAL = 10;
const ehRua = (x, y) => ((((x - CENTRO.x) % 4) + 4) % 4) === 3 || ((((y - CENTRO.y) % 4) + 4) % 4) === 3;
const loteDe = (d) => d - Math.floor((d + 1) / 4);
const anelDe = (x, y) => Math.max(Math.abs(loteDe(x - CENTRO.x)), Math.abs(loteDe(y - CENTRO.y)));

function retanguloDe(o) { return { x0: o.x * CASA, y0: o.y * CASA, x1: (o.x + o.w) * CASA, y1: (o.y + o.h) * CASA }; }

function prepararTerreno() {
  const m = EP.mundo;
  let minX = CENTRO.x, maxX = CENTRO.x, minY = CENTRO.y, maxY = CENTRO.y, anel = 0;
  for (const c of m.colonos) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    anel = Math.max(anel, anelDe(c.x, c.y));
  }
  EP.lotes = m.colonos.length ? { anel } : null;
  const noBairro = (x, y) => !!EP.lotes && (() => { const a = anelDe(x, y); return a >= ANEL_INICIAL && a <= EP.lotes.anel; })();

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
  }
  // bairro em espiral: lotes em xadrez e ruas de terra batida (igual ao site)
  if (EP.lotes) for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
    if (!noBairro(x, y)) continue;
    t.fillStyle = ehRua(x, y) ? '#cd8a62' : ((x + y) % 2 ? '#c4693f' : '#b85f39');
    t.fillRect((x - tx0) * CASA, (y - ty0) * CASA, CASA, CASA);
  }
  // praça da colônia
  if (m.praca) for (let y = m.praca.y; y < m.praca.y + m.praca.h; y++) for (let x = m.praca.x; x < m.praca.x + m.praca.w; x++) {
    t.fillStyle = (x + y) % 2 ? '#d9a47e' : '#cf9670';
    t.fillRect((x - tx0) * CASA, (y - ty0) * CASA, CASA, CASA);
  }
  // trilha da base, passando pela praça, até a primeira casa do bairro (ao sul)
  const b = m.base;
  for (let y = b.y + b.h; y < CENTRO.y + 13; y++) {
    t.fillStyle = '#cd7a52';
    t.fillRect((b.x + Math.floor(b.w / 2) - tx0) * CASA - 6, (y - ty0) * CASA, 12, CASA);
  }
  // crateras e pedras
  for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
    if (!livre(x, y)) continue;
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
}

function prepararVinheta() {
  vinheta = document.createElement('canvas'); vinheta.width = W; vinheta.height = H;
  const v = vinheta.getContext('2d');
  const g = v.createRadialGradient(W / 2, H * 0.45, H * 0.28, W / 2, H * 0.45, H * 0.78);
  g.addColorStop(0, 'rgba(20,15,38,0)'); g.addColorStop(1, 'rgba(20,15,38,0.72)');
  v.fillStyle = g; v.fillRect(0, 0, W, H);
}

function prepararTempos() {
  cenaMissao = EP.cenas.filter((c) => c.tipo === 'missao');
  const dem = cenaMissao.find((c) => c.acao === 'demarcar');
  tempoDemarcar = dem ? dem.fala_inicio + 0.4 : (cenaMissao[0] ? cenaMissao[0].inicio : Infinity);
  const lig = cenaMissao.find((c) => c.acao === 'ligar');
  if (lig) {
    const p = lig.palavras.find((w) => /energia|ligad|sinal|verde/i.test(w.p));
    tempoEnergia = p ? p.i : lig.fala_inicio + 0.55 * (lig.fim - lig.fala_inicio);
  }
  // fundadores: caminho por cena (posições em casas; o ponto é o pé do boneco)
  for (const f of EP.mundo.fundadores) {
    let pos = f.casa.slice();
    f.trechos = [];
    for (const c of EP.cenas) {
      const alvo = c.atores && c.atores[f.id];
      if (!alvo) continue;
      const dist = Math.hypot(alvo[0] - pos[0], alvo[1] - pos[1]);
      const dur = clamp(dist * 0.42, 0.8, (c.fim - c.inicio) * 0.8);
      f.trechos.push({ t0: c.inicio + 0.2, t1: c.inicio + 0.2 + dur, de: pos, para: alvo.slice() });
      pos = alvo.slice();
    }
  }
}

function prepararCamera() {
  cameraKeys = [];
  const zoomFoco = { colono: 7, fundador: 6.5, compra: 7, ator: 7 };
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
  }
  cameraKeys.sort((a, b) => a.t - b.t);
}

window.carregarEpisodio = async function (ep) {
  EP = ep;
  colonoPorCodigo = new Map(ep.mundo.colonos.map((c) => [c.codigo, c]));
  for (const c of ep.mundo.compras) if (!colonoPorCodigo.has(c.codigo)) colonoPorCodigo.set(c.codigo, c);
  prepararTerreno();
  prepararVinheta();
  prepararTempos();
  prepararCamera();
  await document.fonts.load(`40px ${FONTE}`);
  await document.fonts.ready;
  const urls = [...new Set(ep.mundo.colonos.map((c) => c.sprite_url).filter(Boolean))];
  await Promise.all(urls.map(carregarImagem));
  return { quadros: Math.ceil(ep.duracao * ep.fps), fonte: document.fonts.check(`40px ${FONTE}`) };
};

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
  return { x: pos[0] * CASA, y: pos[1] * CASA, andando, dir };
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
  if (tipo === 'colonia' || tipo === 'panorama') return caixaColonia();
  if (tipo === 'ator' || tipo === 'fundador') {
    const f = EP.mundo.fundadores.find((x) => x.id === id);
    const p = posFundador(f, t);
    return { x: p.x, y: p.y - 8 };
  }
  if (tipo === 'colono' || tipo === 'compra') {
    const c = colonoPorCodigo.get(id);
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

function desenharEstufa(o, st, t) {
  const r = retanguloDe(o);
  if (st.dem && st.p < 1) desenharDemarcacao(r, t);
  if (st.p <= 0) return;
  const colunas = o.w * 2, vis = Math.ceil(st.p * colunas);
  ret(r.x0 + 2, r.y1 - 6, r.x1 - r.x0 - 4, 4, '#6b6f86');
  for (let i = 0; i < vis; i++) {
    const x = r.x0 + 2 + i * ((r.x1 - r.x0 - 4) / colunas);
    ctx.globalAlpha = 0.55; ret(x, r.y0 + 6, (r.x1 - r.x0 - 4) / colunas - 1, r.y1 - r.y0 - 12, '#8fe6ff'); ctx.globalAlpha = 1;
    ret(x, r.y0 + 6, 1, r.y1 - r.y0 - 12, '#eef0f8');
    if (st.p > 0.6) for (let j = 0; j < 3; j++) ret(x + 3, r.y0 + 14 + j * 12, 4, 4, j % 2 ? '#2bb673' : '#4ed37a');
  }
}

function desenharAntena(o, st, t) {
  const r = retanguloDe(o);
  if (st.dem && st.p < 1) desenharDemarcacao(r, t);
  if (st.p <= 0) return;
  const cx = (r.x0 + r.x1) / 2, base = r.y1 - 4, alt = (r.y1 - r.y0 - 14) * clamp(st.p / 0.85);
  ret(cx - 10, base, 20, 4, '#6b6f86');
  for (let y = 0; y < alt; y += 2) {
    const w = lerp(8, 2, y / (r.y1 - r.y0));
    ret(cx - w, base - y, 1, 2, '#9aa0b5'); ret(cx + w, base - y, 1, 2, '#9aa0b5');
    if (y % 8 === 0) ret(cx - w, base - y, 2 * w, 1, '#6b6f86');
  }
  if (st.p > 0.85) { disco(cx + 6, base - alt - 2, 7, '#e4e6f0', 0.6); ret(cx + 5, base - alt - 2, 2, 2, '#6b6f86'); }
  if (st.energia && Math.floor(t * 2) % 2 === 0) ret(cx - 2, base - alt - 6, 4, 4, '#ff4d4d');
}

function desenharObras(t) {
  for (const o of EP.mundo.obras) {
    if (o.status === 'planejada' && o.slug !== EP.missao_obra) continue;
    const st = progressoObra(o, t);
    if (o.tipo === 'solar') desenharSolar(o, st, t);
    else if (o.tipo === 'antena') desenharAntena(o, st, t);
    else desenharEstufa(o, st, t);
  }
}

function desenharColonos(view, t) {
  for (const c of EP.mundo.colonos) {
    if (c.x < view.x0 - 1 || c.x > view.x1 + 1 || c.y < view.y0 - 1 || c.y > view.y1 + 1) continue;
    const x = c.x * CASA, y = c.y * CASA;
    ret(x + 4, y + 14, 8, 1.5, 'rgba(0,0,0,0.2)');
    const img = c.sprite_url && imagens.get(c.sprite_url);
    ctx.drawImage(img || spriteColono(c.seed), x + 2, y + 2, 12, 12);
    if (c.status === 'estreou') ret(x + 12.5, y + 0.5, 2.5, 2.5, '#ffd84a');
  }
}

function aparicaoCompra(c) {
  for (const cena of EP.cenas) for (const f of cena.focos) if (f.alvo === `compra:${c.codigo}:${c.produto_slug}`) return f.t;
  return -1;
}

function desenharCompras(t) {
  for (const c of EP.mundo.compras) {
    const t0 = aparicaoCompra(c);
    if (t < t0) continue;
    const k = clamp((t - t0) / 0.45);
    const esc = k < 1 ? saida(k) * 1.3 - Math.max(0, k - 0.7) : 1;
    const x = c.x * CASA + 4, y = c.y * CASA + 14, s = 10 * esc;   // logo abaixo da casa do comprador
    ctx.drawImage(spriteContornado(iconeDoProduto(c.produto_slug)), x + 4 - s / 2, y + 10 - s, s * 1.25, s * 1.25);
    const kb = clamp((t - t0) / 1.0);
    if (kb < 1) for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      ctx.globalAlpha = 1 - kb;
      ret(x + 4 + Math.cos(a) * 14 * kb, y + 4 + Math.sin(a) * 14 * kb, 2, 2, COR.ouro);
    }
    ctx.globalAlpha = 1;
  }
}

function desenharFundadores(t) {
  const cena = cenaEm(t);
  for (const f of EP.mundo.fundadores) {
    const p = posFundador(f, t);
    const pulo = p.andando && Math.floor(t * 8) % 2 ? -1 : 0;
    ret(p.x - 4, p.y - 1, 8, 2, 'rgba(0,0,0,0.25)');
    const spr = spriteMapa(f.sprite);
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y + pulo));
    if (p.dir < 0) ctx.scale(-1, 1);
    ctx.drawImage(spr, -6, -12, 12, 12);
    ctx.restore();
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

function desenharFocos(cam, t, cena) {
  // nome dos fundadores sempre visível de perto
  for (const f of EP.mundo.fundadores) {
    if (cam.z < 4.5) continue;
    const p = posFundador(f, t);
    const focado = cena.focos.some((x) => x.alvo === `fundador:${f.id}` && t >= x.t);
    etiqueta(cam, p.x, p.y - 13, f.curto, focado ? COR.ouro : COR.borda, t, focado ? cena.focos.find((x) => x.alvo === `fundador:${f.id}`).t : 0);
  }
  const ativos = cena.focos.filter((f) => t >= f.t);
  for (const [i, f] of ativos.entries()) {
    const [tipo, id] = f.alvo.split(':');
    if (tipo !== 'colono' && tipo !== 'compra') continue;
    const c = colonoPorCodigo.get(id);
    if (!c) continue;
    if (i !== ativos.length - 1) continue;   // só o foco atual (vizinhos colados se sobrepõem)
    anel(cam, c.x * CASA + 8, c.y * CASA + 8, t);
    etiqueta(cam, c.x * CASA + 8, c.y * CASA, c.nome, COR.ouro, t, f.t);
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

function alarme(t, cena) {   // luz vermelha pulsando durante o alerta do problema do dia
  if (!cena || cena.tipo !== 'problema') return;
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
  } else if (cena.tipo === 'boas_vindas' || cena.tipo === 'compras') {
    texto(cena.tipo === 'compras' ? 'NOVIDADES NA VIZINHANÇA' : 'BEM-VINDOS!', W / 2, 290 - sobe, cena.tipo === 'compras' ? 32 : 48, COR.ouro);
    const ativos = cena.focos.filter((f) => t >= f.t);
    ativos.slice(-4).forEach((f, i) => {
      const [, id, slug] = f.alvo.split(':');
      const c = colonoPorCodigo.get(id);
      if (!c) return;
      let rot = c.nome;
      if (slug) { const compra = EP.mundo.compras.find((x) => x.codigo === id && x.produto_slug === slug); if (compra) rot += ` · ${compra.produto_curto}`; }
      const k = clamp((t - f.t) / 0.3);
      ctx.globalAlpha = a * k;
      texto(rot, W / 2, 380 + i * 64 - sobe, 30, COR.texto, { maxW: W - 160 });
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
    caixa(70, 236 - sobe, W - 140, 250, 0.9, ok ? COR.ok : COR.alerta);
    const pisca = ok || Math.floor(t * 3) % 3 !== 0;   // aceso 2/3 do tempo
    if (pisca) texto(ok ? 'RESOLVIDO!' : 'ALERTA!', W / 2, 296 - sobe, 40, ok ? COR.ok : COR.alerta);
    texto((p.rotulo || '').toUpperCase(), W / 2, 356 - sobe, 22, COR.areia, { contorno: false, maxW: W - 220 });
    texto((p.titulo || '').toUpperCase(), W / 2, 408 - sobe, 26, COR.texto, { contorno: false, maxW: W - 200 });
    if (ok && cena.heroi) texto(`POR ${cena.heroi.toUpperCase()}`, W / 2, 452 - sobe, 20, COR.ouro, { contorno: false });
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
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ quadro
function desenhar(t) {
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
  desenharObras(t);
  desenharColonos(view, t);
  desenharCompras(t);
  desenharBase(t, energia);
  desenharFundadores(t);

  // tela
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  poeira(t);
  if (t >= tempoEnergia && t < tempoEnergia + 0.7) {   // clarão quando a energia liga
    ctx.globalAlpha = 0.45 * (1 - (t - tempoEnergia) / 0.7);
    ret(0, 0, W, H, '#fff6d0');
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(vinheta, 0, 0);
  alarme(t, cena);
  desenharFocos(cam, t, cena);
  hudTopo(t);
  cartao(cena, t, cam);

  // entra e sai do preto
  const preto = Math.max(1 - clamp(t / 0.6), clamp((t - (EP.duracao - 0.9)) / 0.9));
  if (preto > 0) { ctx.globalAlpha = preto; ret(0, 0, W, H, '#000'); ctx.globalAlpha = 1; }
}

window.desenhar = desenhar;
window.quadro = function (i, qualidade = 0.92) {
  desenhar(i / EP.fps);
  return cv.toDataURL('image/jpeg', qualidade);
};
window.pronto = true;
