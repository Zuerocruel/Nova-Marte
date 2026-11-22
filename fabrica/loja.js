// Operação Marte Zero · imagens da loja (um card por item, 1080x1080). Sem IA. Fotos de perfil: perfil.js.
// Roda DEPOIS do diretor.js (cores, hash, fonte). Desenho numa tela de 360x360 ampliada 3x: pixel art
// fina, com volume (cilindros, esferas e caixas sombreados com pontilhado) e contorno de 1 px.
// Os textos são escritos na tela final (1080) e os acentos são desenhados à mão (escreverPT), porque a
// fonte em pixel não mostra o til/acento das maiúsculas.
//
//   loja.py chama: carregarEpisodio(ep) → gerarLoja() → [{nome, url}]

const PX = 360, AMPLIA = 3, HZ_L = 222;
const base = document.createElement('canvas'); base.width = PX; base.height = PX;
const bctx = base.getContext('2d');
const camada = document.createElement('canvas'); camada.width = PX; camada.height = PX;
const lctx = camada.getContext('2d');
const FINAL = document.createElement('canvas'); FINAL.width = PX * AMPLIA; FINAL.height = PX * AMPLIA;
const fx = FINAL.getContext('2d');
let g = lctx;
const TEXTOS = [];   // textos a escrever na tela final: [str, x, y, tam, cor, opc] (x,y na tela pequena)

// ------------------------------------------------------------------ paletas (claro → escuro)
const TOM = {
  branco: ['#ffffff', '#eef0f8', '#d6d4e4', '#b2aec6', '#86829e'],
  laranja: ['#ffb07a', '#ff8a5c', '#e2603b', '#b8482a', '#7e2c16'],
  ouro: ['#fff6c8', '#ffd85a', '#efb22a', '#c38512', '#7e5206'],
  metal: ['#eef1f8', '#c3c8d8', '#9aa0b8', '#6a7090', '#454a66'],
  azul: ['#cfe6ff', '#7fb3ff', '#3f8efc', '#2a5cbf', '#1a3778'],
  painel: ['#6f8fe8', '#3f5fbf', '#2b3a88', '#1d2660', '#121840'],
  caramelo: ['#f6c48a', '#e09a52', '#c8782e', '#9a5418', '#62320a'],
  vidro: ['#effffe', '#a8ece6', '#3fd0c9', '#1f8a8a', '#0f5050'],
  verde: ['#c8ff9a', '#7ee06a', '#3fb84a', '#22803a', '#105020'],
  pedra: ['#c9b8c4', '#a898ae', '#857796', '#62587a', '#433c5a'],
  rocha: ['#d68a62', '#b4643f', '#8d4a32', '#6a3422', '#442012'],
  roxo: ['#c8a0e8', '#9b6ccf', '#6c3fa8', '#4a2878', '#2e1650'],
  vermelho: ['#ff9a9a', '#ff5a5a', '#d83a3a', '#a02424', '#621010'],
  escuro: ['#5a4f7e', '#3a2f63', '#2a2248', '#1d1734', '#120e22'],
};
const BAYER = [[0, 0.5], [0.75, 0.25]];
const tomEm = (tons, f, x, y) => tons[Math.max(0, Math.min(tons.length - 1, Math.floor(f + BAYER[y & 1][x & 1] - 0.4)))];

// ------------------------------------------------------------------ primitivas
const D = {
  r(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
  px(x, y, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); },
  // forma qualquer pintada pixel a pixel: dentro(x,y) → bool; cor(x,y) → cor
  forma(x0, y0, x1, y1, dentro, cor) {
    for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) if (dentro(x, y)) { const c = cor(x, y); if (c) D.px(x, y, c); }
  },
  // cilindro em pé: luz da esquerda (brilho estreito, meio-tom, sombra à direita)
  cil(x, y, w, h, tons) {
    D.forma(x, y, x + w - 1, y + h - 1, () => true, (px, py) => {
      const t = (px - x + 0.5) / w;
      const f = t < 0.1 ? 1.6 : t < 0.25 ? 0.3 : t < 0.55 ? 1 : t < 0.8 ? 2 : t < 0.94 ? 3 : 3.6;
      return tomEm(tons, f, px, py);
    });
  },
  // cilindro deitado: luz de cima
  cilH(x, y, w, h, tons) {
    D.forma(x, y, x + w - 1, y + h - 1, () => true, (px, py) => {
      const t = (py - y + 0.5) / h;
      const f = t < 0.12 ? 1.4 : t < 0.3 ? 0.3 : t < 0.6 ? 1 : t < 0.85 ? 2 : 3.2;
      return tomEm(tons, f, px, py);
    });
  },
  esfera(cx, cy, r, tons, so = null, lx = -0.55, ly = -0.6) {
    D.forma(cx - r, cy - r, cx + r, cy + r, (x, y) => {
      const dx = (x - cx + 0.5) / r, dy = (y - cy + 0.5) / r;
      if (so === 'cima' && y > cy) return false;
      return dx * dx + dy * dy <= 1;
    }, (x, y) => {
      const dx = (x - cx + 0.5) / r, dy = (y - cy + 0.5) / r, dz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
      const luz = dx * lx + dy * ly + dz * 0.65;
      const f = luz > 0.95 ? 0 : luz > 0.7 ? 0.9 : luz > 0.35 ? 1.6 : luz > 0 ? 2.5 : 3.5;
      return tomEm(tons, f, x, y);
    });
  },
  elipse(cx, cy, rx, ry, c, so = null) {
    D.forma(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => {
      if (so === 'cima' && y > cy) return false;
      if (so === 'baixo' && y < cy) return false;
      const dx = (x - cx + 0.5) / rx, dy = (y - cy + 0.5) / ry; return dx * dx + dy * dy <= 1;
    }, () => c);
  },
  // caixa com frente iluminada e, se p > 0, lateral direita na sombra e topo claro (profundidade p)
  caixa(x, y, w, h, tons, p = 0) {
    D.forma(x, y, x + w - 1, y + h - 1, () => true, (px, py) => tomEm(tons, py - y < 2 ? 0.4 : (px - x) < 2 ? 0.6 : 1.2, px, py));
    if (p) {
      D.forma(x + w, y - p, x + w + p - 1, y + h - 1, (px, py) => py >= y - (px - x - w + 1) && py <= y + h - 1 - (px - x - w + 1) + p, (px, py) => tomEm(tons, 2.6, px, py));
      D.forma(x, y - p, x + w + p - 1, y - 1, (px, py) => px >= x + (y - py) && px <= x + w - 1 + (y - py), (px, py) => tomEm(tons, 0.2, px, py));
    }
  },
  poligono(pts, c) {
    g.fillStyle = c; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
  },
  linha(x0, y0, x1, y1, c, w = 1) {
    const n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) D.r(x0 + (x1 - x0) * i / n - (w - 1) / 2, y0 + (y1 - y0) * i / n - (w - 1) / 2, w, w, c);
  },
  brilho(x, y, c = '#fff8d0', t = 3) { D.r(x, y - t, 1, t * 2 + 1, c); D.r(x - t, y, t * 2 + 1, 1, c); D.r(x - 1, y - 1, 3, 3, c); },
  rebite(x, y) { D.px(x, y, '#ffffff'); D.px(x + 1, y + 1, '#6a7090'); },
};

// ------------------------------------------------------------------ texto com acento desenhado à mão
// Press Start 2P: grade de 8x8; as maiúsculas usam as linhas 0-6. O acento vai 2 a 3 "pixels" acima.
const MARCAS = {
  '̃': [[1, -3], [2, -3], [5, -3], [0, -2], [3, -2], [4, -2]],            // til
  '́': [[4, -3], [5, -3], [3, -2], [4, -2]],                              // agudo
  '̀': [[1, -3], [2, -3], [2, -2], [3, -2]],                              // grave
  '̂': [[2, -3], [3, -3], [4, -3], [1, -2], [2, -2], [4, -2], [5, -2]],    // circunflexo
};
function escreverPT(ctx, str, x, y, tam, cor, opc = {}) {
  const letras = [];
  for (const ch of str.toUpperCase().normalize('NFD')) {
    if (MARCAS[ch] && letras.length) letras[letras.length - 1].marcas.push(ch);
    else if (/[̀-ͯ]/.test(ch) && letras.length) letras[letras.length - 1].base += ch;   // cedilha: a fonte resolve
    else letras.push({ base: ch, marcas: [] });
  }
  letras.forEach((l) => { l.base = l.base.normalize('NFC'); });
  ctx.font = `${tam}px ${FONTE}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  const total = letras.length * tam;
  const x0 = opc.alinhar === 'left' ? x : opc.alinhar === 'right' ? x - total : x - total / 2;
  const y0 = y - tam * 0.45;
  const u = tam / 8;
  const pinta = (dx, dy, c) => {
    ctx.fillStyle = c;
    letras.forEach((l, i) => {
      ctx.fillText(l.base, x0 + i * tam + dx, y0 + dy);
      for (const m of l.marcas) for (const [cx, cy] of MARCAS[m]) ctx.fillRect(x0 + i * tam + cx * u + dx, y0 + cy * u + dy, u, u);
    });
  };
  if (opc.brilhoCor) { ctx.save(); ctx.shadowColor = opc.brilhoCor; ctx.shadowBlur = tam * 0.8; pinta(0, 0, cor); ctx.restore(); }
  if (opc.contorno) for (const [dx, dy] of [[-u, 0], [u, 0], [0, -u], [0, u], [-u, -u], [u, -u], [-u, u], [u, u]]) pinta(dx, dy, opc.contorno);
  if (opc.sombra !== false) pinta(u * (opc.contorno ? 2 : 1), u * (opc.contorno ? 2 : 1), opc.sombraCor || CONTORNO);
  pinta(0, 0, cor);
}
function rotulo(str, x, y, tam, cor, opc = {}) { TEXTOS.push([str, x, y, tam, cor, opc]); }

// contorno escuro de 1 px em volta do que está na camada
function contornar() {
  const tmp = document.createElement('canvas'); tmp.width = PX; tmp.height = PX;
  const t = tmp.getContext('2d');
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) t.drawImage(camada, dx, dy);
  t.globalCompositeOperation = 'source-in'; t.fillStyle = CONTORNO; t.fillRect(0, 0, PX, PX);
  t.globalCompositeOperation = 'source-over'; t.drawImage(camada, 0, 0);
  return tmp;
}

// ------------------------------------------------------------------ cenário de Marte
function misturaCor(a, b2, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b2.slice(1), 16);
  const c = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
function gradV(y0, y1, cores) {   // gradiente vertical com pontilhado (pixel art)
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / (y1 - y0) * (cores.length - 1);
    for (let x = 0; x < PX; x++) {
      const tt = Math.max(0, Math.min(cores.length - 1.001, t + (BAYER[y & 1][x & 1] - 0.4) * 0.35));
      const i = Math.floor(tt);
      D.px(x, y, misturaCor(cores[i], cores[i + 1], Math.round((tt - i) * 4) / 4));
    }
  }
}
function cenario(opc = {}) {
  g = bctx; bctx.clearRect(0, 0, PX, PX);
  const ceu = opc.noite ? ['#07051a', '#140f33', '#2a1a4a', '#4a2a52'] : opc.alerta ? ['#2a0a10', '#6a1a1a', '#a8402a', '#d07040'] : ['#5a3a6a', '#a06a5a', '#d99a6c', '#f2cfa2'];
  gradV(0, HZ_L, ceu);
  if (opc.noite || opc.alerta) for (let i = 0; i < 160; i++) {
    const x = hash(i, 3) * PX, y = hash(i, 4) * HZ_L * 0.85, k = hash(i, 5);
    if (k > 0.94) D.brilho(x, y, '#fff6d8', 2); else D.px(x, y, k > 0.6 ? '#ffe9a8' : '#bfc6ff');
  }
  if (!opc.noite && !opc.alerta) {   // sol com halo
    for (const [r, a] of [[30, 0.12], [20, 0.2], [13, 0.35]]) { bctx.globalAlpha = a; D.elipse(282, 60, r, r, '#fff3d6'); }
    bctx.globalAlpha = 1; D.elipse(282, 60, 9, 9, '#fffaf0');
  }
  D.esfera(64, 46, 6, ['#efe2cc', '#d0bea4', '#b09e86', '#8a7a66', '#665848']);   // Fobos
  // montanhas: três camadas, com a crista iluminada
  const camadas = opc.noite ? [['#2a1a3a', 46], ['#22142e', 30], ['#1a1024', 16]] : [['#b8826a', 48], ['#a2644a', 32], ['#8c5038', 18]];
  camadas.forEach(([cor, alt], k) => {
    const altura = (x) => alt * (0.5 + 0.28 * Math.sin(x * 0.028 + k * 2) + 0.14 * Math.sin(x * 0.083 + k) + 0.08 * Math.sin(x * 0.21 + k * 3)) + 4;
    for (let x = 0; x < PX; x++) {
      const h = altura(x);
      D.r(x, HZ_L - h, 1, h + 1, cor);
      if (altura(x + 1) < h && !opc.noite) D.px(x, HZ_L - h, misturaCor(cor, '#ffffff', 0.25));
    }
  });
  // chão: gradiente, crateras pequenas e pedras com luz
  gradV(HZ_L, PX, opc.noite ? ['#3a1e22', '#4a2420', '#5a2c24'] : ['#a2502f', '#b65d39', '#c76d45']);
  for (let i = 0; i < 14; i++) {
    const x = hash(i, 17) * PX, y = HZ_L + 10 + hash(i, 18) * (PX - HZ_L - 14), r = 3 + hash(i, 19) * 6 * (y - HZ_L) / 90;
    D.elipse(x, y, r, Math.max(1, r * 0.35), opc.noite ? '#2a1418' : '#8e4228'); D.elipse(x, y - r * 0.1, r * 0.8, Math.max(1, r * 0.22), opc.noite ? '#22101a' : '#7a3620');
  }
  for (let i = 0; i < 90; i++) {
    const x = hash(i, 11) * PX, y = HZ_L + 4 + hash(i, 12) * (PX - HZ_L - 6), s = 1 + Math.floor(hash(i, 13) * 2 + (y - HZ_L) / 50);
    D.r(x, y, s + 1, s, opc.noite ? '#2a1414' : '#7e3e28'); D.r(x, y, s, 1, opc.noite ? '#5a3a34' : '#e09a72');
  }
  g = lctx;
}
function sombra(cx, cy, rx, ry = 6) { g = bctx; bctx.globalAlpha = 0.3; D.elipse(cx, cy, rx, ry, '#3a1410'); bctx.globalAlpha = 0.2; D.elipse(cx, cy, rx * 0.7, ry * 0.6, '#2a0a08'); bctx.globalAlpha = 1; g = lctx; }

// ------------------------------------------------------------------ montagem final
function compor(nome, desenhar, opc = {}) {
  TEXTOS.length = 0;
  cenario(opc);
  lctx.clearRect(0, 0, PX, PX); g = lctx;
  const efeitos = desenhar() || (() => {});
  bctx.drawImage(contornar(), 0, 0);
  g = bctx; efeitos(); g = lctx;
  fx.setTransform(1, 0, 0, 1, 0, 0); fx.imageSmoothingEnabled = false;
  fx.drawImage(base, 0, 0, PX * AMPLIA, PX * AMPLIA);
  const v = fx.createRadialGradient(540, 560, 420, 540, 560, 800);
  v.addColorStop(0, 'rgba(20,15,38,0)'); v.addColorStop(1, 'rgba(20,15,38,0.4)');
  fx.fillStyle = v; fx.fillRect(0, 0, 1080, 1080);
  for (const [str, x, y, tam, cor, o] of TEXTOS) escreverPT(fx, str, x * AMPLIA, y * AMPLIA, tam, cor, o);
  // selo da marca no canto
  fx.fillStyle = 'rgba(20,15,38,0.78)'; fx.fillRect(28, 26, 19 * 19 + 40, 56);
  fx.fillStyle = COR.ouro; fx.fillRect(28, 26, 6, 56);
  escreverPT(fx, 'OPERAÇÃO MARTE ZERO', 52, 58, 19, COR.ouro, { alinhar: 'left' });
  return { nome, url: FINAL.toDataURL('image/png') };
}

// ------------------------------------------------------------------ colono em traje (estátua e palco)
function colonoTraje(x, y, k, tons, opc = {}) {   // x,y = pés (centro); k = escala (1 ≈ 120 px de altura)
  const s = (v) => v * k;
  const visor = opc.visor || TOM.azul;
  D.cil(x - s(24), y - s(64), s(14), s(34), tons);                         // mochila
  D.cil(x - s(18), y - s(36), s(15), s(36), tons); D.cil(x + s(3), y - s(36), s(15), s(36), tons);   // pernas
  D.r(x - s(18), y - s(18), s(15), s(3), tomEm(tons, 2.5, 0, 0)); D.r(x + s(3), y - s(18), s(15), s(3), tomEm(tons, 2.5, 0, 0));
  D.caixa(x - s(20), y - s(6), s(18), s(7), opc.bota || TOM.escuro); D.caixa(x + s(2), y - s(6), s(18), s(7), opc.bota || TOM.escuro);
  D.cil(x - s(22), y - s(74), s(44), s(42), tons);                          // tronco
  D.r(x - s(22), y - s(46), s(44), s(5), opc.faixa || TOM.laranja[2]);
  D.caixa(x - s(10), y - s(70), s(20), s(14), opc.dourado ? [tons[2], tons[3], tons[3], tons[4], tons[4]] : TOM.escuro);   // painel do peito
  if (!opc.dourado) { D.r(x - s(7), y - s(66), s(3), s(3), '#4ed37a'); D.r(x - s(2), y - s(66), s(3), s(3), '#ffc83d'); D.r(x + s(3), y - s(66), s(3), s(3), '#ff4d4d'); D.r(x - s(7), y - s(61), s(14), s(2), '#3fd0c9'); }
  D.cil(x - s(34), y - s(72), s(12), s(32), tons);                          // braço esquerdo (abaixado)
  D.esfera(x - s(28), y - s(38), s(7), opc.luva || TOM.metal);
  // braço direito levantado
  D.poligono([[x + s(20), y - s(72)], [x + s(32), y - s(76)], [x + s(44), y - s(108)], [x + s(34), y - s(112)]], tomEm(tons, 1, 0, 0));
  D.poligono([[x + s(30), y - s(75)], [x + s(32), y - s(76)], [x + s(44), y - s(108)], [x + s(41), y - s(110)]], tomEm(tons, 2.4, 0, 0));
  D.esfera(x + s(40), y - s(114), s(7), opc.luva || TOM.metal);
  if (opc.bandeira) {   // a mão levantada segura uma bandeira
    D.cil(x + s(39), y - s(160), s(3), s(54), opc.bandeira);
    for (let i = 0; i < s(36); i++) { const dy = Math.round(Math.sin(i / s(36) * 5) * s(2)); D.r(x + s(42) + i, y - s(158) + dy, 1, s(22), tomEm(opc.bandeira, 1 + Math.cos(i / s(36) * 5) * 0.8, i, 0)); }
  }
  D.r(x - s(14), y - s(80), s(28), s(6), tomEm(tons, 2, 0, 0));             // gola
  D.esfera(x, y - s(96), s(20), tons);                                       // capacete
  D.esfera(x + s(2), y - s(95), s(13), visor, null, -0.4, -0.7);             // visor
  D.r(x - s(5), y - s(103), s(5), s(2), '#ffffffcc');
}

// ------------------------------------------------------------------ itens
const ITENS = {
  'nomeie-sua-cratera': () => {
    sombra(170, 300, 134, 14);
    D.elipse(170, 290, 128, 36, TOM.rocha[1]);                               // borda levantada
    D.elipse(170, 286, 124, 30, TOM.rocha[0], 'cima');
    D.forma(56, 262, 284, 318, (x, y) => ((x - 170) / 108) ** 2 + ((y - 291) / 25) ** 2 <= 1,
      (x, y) => tomEm(['#d48058', '#b0603e', '#7e3c24', '#5e2a1a', '#46200f'], (y - 266) / 50 * 4.2, x, y));
    D.elipse(170, 298, 60, 10, '#3e1a0c');
    for (let i = 0; i < 7; i++) { const x = 110 + hash(i, 81) * 120, y = 290 + hash(i, 82) * 12; D.esfera(x, y, 2 + Math.floor(hash(i, 83) * 3), TOM.rocha); }
    D.cil(168, 252, 3, 40, TOM.metal); for (let i = 0; i < 14; i++) D.r(171 + i, 253 + Math.round(Math.sin(i * 0.5)), 1, 9, tomEm(TOM.ouro, 1 + Math.sin(i * 0.5), i, 0));   // bandeirinha
    // placa
    D.cil(274, 200, 7, 96, TOM.metal);
    D.caixa(190, 108, 166, 96, TOM.metal, 4); D.caixa(197, 115, 152, 82, TOM.escuro);
    for (const [x, y] of [[193, 111], [351, 111], [193, 199], [351, 199]]) D.rebite(x, y);
    rotulo('SEU NOME', 273, 140, 50, COR.ouro, { contorno: CONTORNO }); rotulo('AQUI', 273, 174, 50, '#ffffff', { contorno: CONTORNO });
    return () => { D.brilho(120, 278); D.brilho(214, 286); D.brilho(150, 300, '#ffe9a8', 2); rotulo('GRÁTIS', 170, 336, 52, '#7dff9a', { brilhoCor: '#4ed37a' }); };
  },
  bandeira: () => {
    sombra(118, 318, 44, 8);
    D.caixa(88, 296, 60, 22, TOM.pedra, 6); D.caixa(98, 286, 40, 10, TOM.pedra, 4);
    for (const x of [92, 140]) D.rebite(x, 300);
    D.cil(112, 64, 10, 226, TOM.metal);
    D.esfera(117, 60, 8, TOM.ouro);
    for (let x = 0; x < 150; x++) {   // bandeira tremulando, com dobras iluminadas e o anel do "0"
      const dy = Math.round(Math.sin(x * 0.075) * 8 * (x / 150 + 0.25));
      const luz = 1.4 - Math.cos(x * 0.075) * 1.1;
      for (let y = 0; y < 88; y++) {
        const dd = Math.hypot((x - 72) * 0.95, y - 44);
        const tons = dd < 30 && dd > 18 ? TOM.branco : dd <= 9 ? TOM.ouro : TOM.laranja;
        D.px(122 + x, 70 + y + dy, tomEm(tons, (tons === TOM.laranja ? luz : luz * 0.7) + (y > 82 ? 0.8 : 0), x, y));
      }
    }
    // satélite
    D.caixa(268, 34, 26, 20, TOM.ouro, 3);
    for (const sx of [222, 300]) { D.caixa(sx, 38, 42, 12, TOM.painel); for (let i = 1; i < 6; i++) D.r(sx + i * 7, 38, 1, 12, '#8fb3ff'); D.r(sx, 43, 42, 1, '#8fb3ff'); }
    D.cil(279, 54, 3, 10, TOM.metal); D.elipse(281, 66, 8, 3, TOM.branco[1], 'baixo');
    return () => {
      for (let i = 0; i < 70; i++) { const c = ['#ffc83d', '#3fd0c9', '#ec407a', '#4ed37a', '#7fb3ff'][i % 5]; const x = 40 + hash(i, 21) * 300, y = 30 + hash(i, 22) * 180; D.r(x, y, 3, 2, c); D.px(x, y, '#ffffff'); }
      D.brilho(110, 52); D.brilho(300, 28, '#cfe8ff');
    };
  },
  'eventos-furia-marte': () => {
    sombra(258, 312, 66, 9);
    D.esfera(256, 300, 58, TOM.rocha, 'cima'); D.r(198, 298, 117, 14, TOM.rocha[3]);
    D.esfera(238, 274, 22, TOM.rocha, 'cima');
    // alien espiando atrás da pedra
    D.esfera(214, 252, 17, TOM.verde);
    for (const ex of [205, 222]) { D.elipse(ex, 250, 5, 7, '#140f26'); D.r(ex - 2, 246, 2, 3, '#ffffff'); D.px(ex + 1, 252, '#6a8aff'); }
    for (const [ax, dx] of [[206, -6], [222, 6]]) { D.linha(ax, 236, ax + dx, 222, TOM.verde[2], 2); D.esfera(ax + dx, 220, 3, ['#ffffaa', '#e8ff7a', '#c8ff5a', '#9acf3a', '#6a9a2a']); }
    // placa de alerta
    D.cil(86, 196, 6, 116, TOM.metal);
    D.forma(46, 132, 134, 206, (x, y) => y >= 136 && Math.abs(x - 89) <= (y - 132) * 0.6, (x, y) => tomEm(TOM.ouro, Math.abs(x - 89) <= (y - 132) * 0.6 - 7 && y < 200 ? 1 : 3, x, y));
    D.r(86, 156, 7, 26, '#140f26'); D.r(86, 188, 7, 7, '#140f26');
    return () => {
      for (let i = 0; i < 12; i++) { bctx.globalAlpha = 0.18; D.elipse(-30 + i * 10, 100 + i * 16, 90, 40, i % 2 ? '#e0a874' : '#c88a5a'); }   // tempestade de poeira
      bctx.globalAlpha = 1;
      for (const [x, y, t] of [[250, 40, 1], [318, 92, 0.8], [190, 70, 0.6], [340, 30, 0.5]]) {   // meteoros
        for (let k = 0; k < 40 * t; k++) { bctx.globalAlpha = (1 - k / (40 * t)) * 0.9; D.r(x - k * 2.2, y - k * 1.1, 3, 3, k < 5 ? '#fff6c8' : k < 14 ? '#ffb05a' : '#ff6a3a'); }
        bctx.globalAlpha = 0.35; D.elipse(x + 2, y + 2, 9, 9, '#ffd08a'); bctx.globalAlpha = 1; D.esfera(x + 2, y + 2, 4, TOM.ouro);
      }
      for (let i = 0; i < 160; i++) D.px(hash(i, 31) * PX, hash(i, 32) * PX, '#f6d7a7');
    };
  },
  'capsula-comercio': () => {
    // cápsula deitada (formato de pílula) sobre pernas de pouso, com o balcão aberto
    sombra(176, 316, 128, 10);
    for (const [x0, x1] of [[86, 70], [130, 124], [222, 228], [266, 282]]) { D.linha(x0, 262, x1, 306, TOM.metal[2], 4); D.caixa(x1 - 8, 304, 16, 5, TOM.metal); }
    const cx = 176, cy = 206, meia = 100, r = 62;
    D.forma(cx - meia - r, cy - r, cx + meia + r, cy + r, (x, y) => {
      const dx = Math.max(0, Math.abs(x - cx) - meia); return dx * dx + (y - cy) ** 2 <= r * r;
    }, (x, y) => {
      const dx = Math.max(0, Math.abs(x - cx) - meia) * Math.sign(x - cx) / r, dy = (y - cy) / r;
      const luz = -dy * 0.75 - dx * 0.35 + 0.25;
      return tomEm(TOM.branco, luz > 0.75 ? 0 : luz > 0.35 ? 1 : luz > -0.1 ? 1.7 : luz > -0.45 ? 2.6 : 3.4, x, y);
    });
    for (const sx of [cx - meia + 2, cx + meia - 2]) D.r(sx, cy - r + 3, 1, r * 2 - 6, TOM.branco[3]);   // emendas
    D.forma(cx - meia - r, cy + 30, cx + meia + r, cy + 38, (x, y) => { const dx = Math.max(0, Math.abs(x - cx) - meia); return dx * dx + (y - cy) ** 2 <= (r - 1) ** 2; }, (x, y) => tomEm(TOM.laranja, 1 + (y - cy - 30) / 4, x, y));
    // balcão aberto com prateleiras
    D.caixa(cx - 70, cy - 36, 140, 60, TOM.escuro);
    for (let k = 0; k < 2; k++) {
      D.r(cx - 66, cy - 14 + k * 22, 132, 3, TOM.metal[2]);
      for (let i = 0; i < 9; i++) { const c = [TOM.verde, TOM.azul, TOM.ouro, TOM.vermelho, TOM.roxo, TOM.vidro][(i + k * 3) % 6]; D.caixa(cx - 62 + i * 14, cy - 26 + k * 22, 10, 12, c); }
    }
    D.caixa(cx - 80, cy + 22, 160, 8, TOM.caramelo, 3);                         // balcão
    for (let i = 0; i < 10; i++) {                                               // toldo listrado
      const tons = i % 2 ? TOM.branco : TOM.laranja;
      D.forma(cx - 84 + i * 17, cy - 56, cx - 84 + i * 17 + 16, cy - 40, () => true, (x, y) => tomEm(tons, 0.8 + (y - (cy - 56)) / 10, x, y));
      D.elipse(cx - 76 + i * 17, cy - 40, 8, 4, tomEm(tons, 2, 0, 0), 'baixo');
    }
    for (const wx of [cx - 128, cx + 128]) { D.esfera(wx, cy - 10, 12, TOM.metal); D.esfera(wx, cy - 10, 8, TOM.vidro); D.px(wx - 3, cy - 14, '#ffffff'); }   // escotilhas
    D.caixa(cx - 24, cy - r - 10, 48, 10, TOM.painel); for (let i = 1; i < 6; i++) D.r(cx - 24 + i * 8, cy - r - 10, 1, 10, '#8fb3ff');   // painel solar
    // caixas de carga ao lado
    D.caixa(300, 270, 34, 34, TOM.caramelo, 6); D.r(300, 285, 34, 3, TOM.caramelo[3]); D.r(315, 270, 3, 34, TOM.caramelo[3]);
    D.caixa(306, 246, 24, 24, TOM.caramelo, 5); D.r(306, 256, 24, 2, TOM.caramelo[3]);
    rotulo('COMÉRCIO', cx, cy - r - 30, 34, '#7ff6ee', { brilhoCor: '#3fd0c9', sombraCor: '#0f5050' });
    return () => { bctx.globalAlpha = 0.18; D.forma(cx - 80, cy - r - 46, cx + 80, cy - r - 18, () => true, () => '#3fd0c9'); bctx.globalAlpha = 1; for (let i = 0; i < 14; i++) D.esfera(cx - 78 + i * 12, cy - r + 8 - Math.round(Math.sin(i / 13 * Math.PI) * 4), 2, i % 3 ? TOM.ouro : TOM.vermelho); };
  },
  'monumento-dourado': () => {
    sombra(180, 324, 92, 10);
    D.caixa(96, 296, 168, 26, TOM.pedra, 8); D.caixa(112, 270, 136, 26, TOM.pedra, 7); D.caixa(130, 248, 100, 22, TOM.pedra, 6);
    D.caixa(146, 276, 68, 16, TOM.ouro);                                         // placa
    rotulo('SEU NOME', 180, 284, 20, '#5a3a06', { sombra: false });
    colonoTraje(178, 248, 1.15, TOM.ouro, { dourado: true, visor: ['#ffe9a0', '#e8b84a', '#b8861a', '#8a5a0a', '#5a3a04'], faixa: TOM.ouro[3], luva: TOM.ouro, bota: TOM.ouro, bandeira: TOM.ouro });
    return () => { for (const [x, y] of [[110, 120], [250, 90], [128, 200], [260, 190], [200, 60], [96, 250], [276, 240]]) D.brilho(x, y); };
  },
  'destaque-proximo-ep': () => {
    // palco com cortinas e letreiro de lâmpadas
    for (const [x0, dir] of [[0, 1], [PX - 1, -1]]) for (let i = 0; i < 70; i++) {
      const x = x0 + dir * i;
      for (let y = 0; y < 300; y++) if (y < 300 - Math.max(0, (i - 40)) * 3) D.px(x, y, tomEm(TOM.vermelho, 1.4 + Math.sin(i * 0.35) * 1.3 + (i > 60 ? 0.6 : 0), x, y));
    }
    D.caixa(30, 286, 300, 24, ['#d88aa8', '#b45a7a', '#8a3a58', '#6a2a44', '#4a1a30']); D.r(30, 310, 300, 14, '#3a1428');
    colonoTraje(180, 288, 1.0, TOM.branco, {});
    D.caixa(74, 36, 212, 86, TOM.escuro);
    for (let i = 0; i <= 26; i++) { D.esfera(74 + i * 8.15, 34, 2, TOM.ouro); D.esfera(74 + i * 8.15, 124, 2, TOM.ouro); }
    for (let i = 0; i <= 11; i++) { D.esfera(72, 34 + i * 8.2, 2, TOM.ouro); D.esfera(288, 34 + i * 8.2, 2, TOM.ouro); }
    rotulo('DESTAQUE', 180, 64, 56, COR.ouro, { contorno: CONTORNO }); rotulo('PRÓXIMO EP', 180, 100, 46, '#ffffff', { contorno: CONTORNO });
    return () => {
      bctx.globalAlpha = 0.16;
      for (const [x0, dir] of [[70, 1], [290, -1]]) for (let y = 130; y < 300; y++) { const w = 10 + (y - 130) * 0.55; D.r(x0 + dir * (y - 130) * 0.62 - w / 2, y, w, 1, '#fff6c8'); }
      bctx.globalAlpha = 1;
      for (const [x, y] of [[120, 130], [244, 150], [140, 230], [228, 214]]) D.brilho(x, y);
    };
  },
  'traje-espacial': () => {
    sombra(180, 320, 60, 9);
    D.elipse(180, 316, 54, 10, TOM.escuro[2]); D.elipse(180, 312, 50, 8, TOM.escuro[1]); D.cil(176, 286, 8, 28, TOM.metal);
    const tons = TOM.branco;
    D.caixa(146, 120, 68, 80, TOM.metal);                                          // mochila (atrás)
    D.cil(150, 214, 26, 64, tons); D.cil(184, 214, 26, 64, tons);                  // pernas
    for (const x of [150, 184]) { D.r(x, 246, 26, 5, tons[3]); D.esfera(x + 13, 248, 6, TOM.metal); D.caixa(x - 2, 276, 30, 12, TOM.escuro, 3); }
    for (const x of [118, 218]) { D.cil(x, 134, 24, 66, tons); D.r(x, 166, 24, 5, TOM.laranja[2]); D.esfera(x + 12, 210, 13, TOM.metal); }   // braços
    D.cil(142, 128, 76, 92, tons);                                                 // tronco
    for (const x of [130, 230]) D.esfera(x, 136, 13, tons);                        // ombros
    D.r(142, 190, 76, 7, TOM.laranja[2]); D.r(142, 198, 76, 10, TOM.metal[3]);    // faixa e cinto
    for (const x of [148, 196]) D.caixa(x, 200, 14, 12, TOM.escuro);
    D.caixa(162, 140, 36, 24, TOM.escuro, 2);
    [['#4ed37a', 0], ['#ffc83d', 1], ['#ff4d4d', 2]].forEach(([c, i]) => D.r(166 + i * 9, 144, 5, 5, c));
    D.r(166, 154, 28, 2, '#3fd0c9'); D.r(166, 158, 18, 2, '#3fd0c9');
    D.esfera(152, 176, 9, TOM.laranja); D.elipse(152, 176, 5, 5, TOM.branco[0]); D.elipse(152, 176, 2, 2, TOM.laranja[2]);   // emblema
    D.r(150, 112, 60, 14, tons[3]); D.r(150, 112, 60, 4, tons[2]);               // gola
    D.esfera(180, 84, 40, tons);                                                   // capacete
    D.esfera(182, 86, 28, TOM.ouro, null, -0.4, -0.7);
    D.forma(150, 64, 214, 114, (x, y) => ((x - 182) / 28) ** 2 + ((y - 86) / 28) ** 2 <= 1 && y > 92 + Math.sin(x * 0.15) * 2, (x, y) => tomEm(['#d48058', '#b0603e', '#8a4426', '#6a3018', '#46200f'], 1 + (y - 92) / 8, x, y));
    D.elipse(170, 72, 10, 5, '#ffffffaa', 'cima');
    for (const x of [140, 220]) D.esfera(x, 84, 5, TOM.ouro);
    return () => { D.brilho(250, 50); D.brilho(108, 90); };
  },
  'pet-do-colono': () => {
    // o mesmo cachorrinho caramelo do jogo (rabo pra cima, de perfil para a direita), em alta definição
    sombra(176, 316, 84, 10);
    // tigela com ração
    D.elipse(300, 306, 30, 9, TOM.metal[3]);
    D.forma(270, 296, 330, 308, (x, y) => Math.abs(x - 300) <= 30 - (y - 296) * 0.5, (x, y) => tomEm(TOM.vermelho, 1 + (x - 270) / 22, x, y));
    D.elipse(300, 296, 30, 7, TOM.vermelho[0]); D.elipse(300, 295, 24, 5, TOM.caramelo[3]);
    for (let i = 0; i < 12; i++) D.esfera(282 + hash(i, 91) * 36, 292 + hash(i, 92) * 4, 2, TOM.caramelo);
    const c = TOM.caramelo, claro = ['#fff0d8', '#f8dcb4', '#e8c090', '#c8985e', '#9a6a30'];
    for (let i = 0; i < 30; i++) { const t = i / 30; D.esfera(96 - t * 22 + Math.sin(t * 3) * 6, 236 - t * 50, Math.round(8 - t * 4), c); }   // rabo
    for (const [x, fundo] of [[110, true], [196, true], [126, false], [214, false]]) { D.cil(x, 262, 16, 46, fundo ? [c[1], c[2], c[3], c[4], c[4]] : c); D.elipse(x + 8, 308, 11, 5, fundo ? c[3] : c[2]); }   // patas
    D.forma(84, 210, 250, 292, (x, y) => ((x - 166) / 82) ** 2 + ((y - 250) / 38) ** 2 <= 1, (x, y) => {   // corpo
      const dy = (y - 250) / 38, dx = (x - 166) / 82;
      if (dy > 0.35 && Math.abs(dx) < 0.6) return tomEm(claro, 1 + dy, x, y);   // barriga clara
      return tomEm(c, 1.3 + dy * 2 - dx * 0.4, x, y);
    });
    D.esfera(258, 200, 42, c);                                                     // cabeça
    D.forma(264, 204, 316, 240, (x, y) => ((x - 290) / 26) ** 2 + ((y - 222) / 16) ** 2 <= 1, (x, y) => tomEm(claro, 1 + (y - 214) / 10, x, y));   // focinho
    D.esfera(312, 214, 8, TOM.escuro); D.r(308, 209, 3, 2, '#ffffff');            // nariz
    D.linha(300, 230, 312, 233, c[4], 2);
    for (const [x0, k] of [[226, 0], [262, 1]]) D.poligono([[x0, 176], [x0 + 16 + k * 2, 132 + k * 4], [x0 + 32, 170]], tomEm(c, 1.4 + k * 0.8, 0, 0));   // orelhas
    D.poligono([[234, 172], [243, 146], [252, 170]], '#e8a07a');
    D.elipse(266, 192, 9, 11, '#140f26'); D.r(262, 186, 4, 4, '#ffffff'); D.px(269, 198, '#ffffff');   // olho
    D.elipse(256, 212, 7, 3, '#ff9a9a');                                           // bochecha
    D.forma(214, 222, 262, 242, (x, y) => Math.abs((x - 238) * 0.4 - (y - 231)) < 7 && x > 216 && x < 260, (x, y) => tomEm(TOM.vidro, 1 + (y - 222) / 8, x, y));   // coleira
    D.esfera(236, 248, 7, TOM.ouro); D.px(234, 245, '#ffffff');
    return () => {
      for (const [x, y, s] of [[318, 120, 2], [340, 150, 1.4], [300, 90, 1.2]]) { const k = s * 3; D.elipse(x - k, y, k, k, '#ff6a9a'); D.elipse(x + k, y, k, k, '#ff6a9a'); D.forma(x - k * 2, y, x + k * 2, y + k * 2.6, (px, py) => Math.abs(px - x) <= (k * 2) - (py - y) * 0.8, () => '#ff6a9a'); D.px(x - k - 1, y - 1, '#ffd0e0'); }
    };
  },
  rover: () => {
    sombra(184, 312, 140, 10);
    for (let i = 0; i < 40; i++) D.r(10 + i * 3, 300 + (i % 2) * 2, 2, 1, '#8a4228');   // marcas de pneu
    const rodas = [96, 182, 268];
    for (const x of rodas) D.linha(x, 286, x + (x < 182 ? 30 : x > 182 ? -30 : 0), 252, TOM.metal[3], 4);
    D.caixa(64, 226, 234, 40, TOM.branco, 8);                                       // chassi
    D.r(64, 244, 234, 6, TOM.laranja[2]); D.r(64, 258, 234, 8, TOM.metal[3]);
    for (let i = 0; i < 6; i++) D.rebite(72 + i * 40, 234);
    D.caixa(84, 178, 92, 48, TOM.branco, 6);                                        // cabine
    D.forma(92, 186, 168, 214, () => true, (x, y) => tomEm(TOM.vidro, 0.8 + (y - 186) / 9 + ((x + y) % 23 < 4 ? -0.8 : 0), x, y));   // para-brisa
    D.caixa(186, 208, 104, 12, TOM.painel, 4); for (let i = 1; i < 10; i++) D.r(186 + i * 10.4, 208, 1, 12, '#8fb3ff'); D.r(186, 213, 104, 1, '#8fb3ff');   // painel solar
    D.cil(262, 130, 6, 80, TOM.metal); D.caixa(250, 118, 30, 16, TOM.metal, 4); D.esfera(258, 126, 5, TOM.escuro); D.px(256, 124, '#9fd0ff');   // câmera
    D.cil(222, 150, 4, 58, TOM.metal); D.elipse(224, 150, 20, 8, TOM.branco[1], 'cima'); D.elipse(224, 150, 20, 3, TOM.branco[3], 'baixo');   // antena
    D.esfera(70, 236, 6, TOM.ouro); D.esfera(70, 252, 4, TOM.ouro);                // faróis
    for (const x of rodas) {
      D.esfera(x, 286, 26, ['#6a6a80', '#4a4a5e', '#3a3a48', '#2a2a36', '#1a1a24']);
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) D.r(x + Math.cos(a) * 24 - 1, 286 + Math.sin(a) * 24 - 1, 3, 3, '#1a1a24');
      D.esfera(x, 286, 12, TOM.metal); D.esfera(x, 286, 4, TOM.escuro);
    }
    return () => {
      for (let i = 0; i < 18; i++) { bctx.globalAlpha = 0.28; D.elipse(30 + i * 3, 290 - (i % 4) * 5, 8 + (i % 4) * 3, 6 + (i % 3) * 2, '#e8b48a'); }
      bctx.globalAlpha = 0.25; D.forma(0, 220, 66, 270, (x, y) => Math.abs(y - 244) < (66 - x) * 0.35, () => '#fff3c0'); bctx.globalAlpha = 1;
    };
  },
  'seu-foguete': () => {
    sombra(180, 324, 110, 10);
    D.caixa(84, 304, 192, 18, TOM.pedra, 6);
    // torre de lançamento (treliça)
    D.cil(252, 92, 8, 212, TOM.metal); D.cil(286, 92, 8, 212, TOM.metal);
    for (let y = 100; y < 300; y += 20) { D.linha(256, y, 290, y + 20, TOM.metal[3], 2); D.linha(290, y, 256, y + 20, TOM.metal[3], 2); D.r(252, y, 42, 3, TOM.metal[2]); }
    D.r(204, 150, 48, 4, TOM.metal[2]); D.r(204, 220, 48, 4, TOM.metal[2]);
    D.cil(158, 108, 44, 170, TOM.branco);                                            // corpo
    D.forma(158, 40, 202, 108, (x, y) => Math.abs(x - 180) <= (y - 40) / 68 * 22, (x, y) => { const t = (x - (180 - (y - 40) / 68 * 22)) / Math.max(1, (y - 40) / 68 * 44); return tomEm(TOM.laranja, t < 0.2 ? 0.4 : t < 0.55 ? 1 : t < 0.85 ? 2 : 3.3, x, y); });   // ponta
    D.r(158, 104, 44, 6, TOM.metal[3]);
    D.esfera(180, 150, 13, TOM.metal); D.esfera(180, 150, 9, TOM.azul); D.r(175, 145, 4, 3, '#e8f4ff');
    D.r(158, 210, 44, 8, TOM.laranja[2]); D.r(158, 220, 44, 2, TOM.laranja[3]);
    for (let y = 120; y < 270; y += 30) D.r(158, y, 44, 1, TOM.branco[3]);
    for (const dir of [-1, 1]) {   // aletas
      const x0 = dir < 0 ? 158 : 202;
      D.forma(x0 - 34, 230, x0 + 34, 292, (x, y) => { const d = dir < 0 ? x0 - x : x - x0; return d >= 0 && d <= (y - 230) * 0.55; }, (x, y) => tomEm(TOM.laranja, dir < 0 ? 1 : 2.4, x, y));
    }
    D.forma(164, 278, 196, 296, (x, y) => Math.abs(x - 180) <= 10 + (y - 278) * 0.4, (x, y) => tomEm(TOM.metal, 1.5 + (x - 164) / 10, x, y));   // bocal
    return () => {
      for (let i = 0; i < 26; i++) { const x = 110 + hash(i, 41) * 140, y = 298 + hash(i, 42) * 18, r = 7 + Math.floor(hash(i, 43) * 10); bctx.globalAlpha = 0.9; D.esfera(x, y, r, ['#ffffff', '#f3eefe', '#d6d0e6', '#b2aac8', '#8a82a4']); }
      bctx.globalAlpha = 1;
      D.forma(166, 296, 194, 330, (x, y) => Math.abs(x - 180) <= 14 - (y - 296) * 0.42, (x, y) => (Math.abs(x - 180) < 5 - (y - 296) * 0.12 ? '#fffbe0' : y < 312 ? '#ffd84a' : '#ff8a3a'));
    };
  },
  'capsula-habitacional': () => {
    sombra(170, 318, 136, 10);
    D.caixa(48, 300, 240, 16, TOM.pedra, 6);
    D.esfera(160, 300, 100, TOM.branco, 'cima');                                     // domo
    for (let k = 1; k < 4; k++) D.forma(60, 200, 260, 300, (x, y) => Math.abs(Math.hypot((x - 160) / 100, (y - 300) / 100) - k / 4) < 0.0055, () => TOM.branco[3]);
    for (const a of [-0.6, -0.2, 0.2, 0.6]) D.forma(60, 200, 260, 300, (x, y) => { const dx = (x - 160) / 100, dy = (y - 300) / 100; return dx * dx + dy * dy <= 1 && Math.abs(dx - a * Math.sqrt(Math.max(0, 1 - dy * dy))) < 0.006; }, () => TOM.branco[3]);
    D.forma(60, 266, 260, 278, (x, y) => ((x - 160) / 100) ** 2 + ((y - 300) / 100) ** 2 <= 1, (x, y) => tomEm(TOM.vidro, 1 + (y - 266) / 5, x, y));   // faixa
    for (const x of [104, 140, 176, 212]) { D.caixa(x, 240, 18, 16, TOM.escuro); D.forma(x + 2, 242, x + 15, 253, () => true, (px, py) => tomEm(TOM.ouro, 0.6 + (py - 242) / 6, px, py)); }   // janelas acesas
    D.caixa(142, 268, 36, 32, TOM.metal, 3); D.caixa(148, 274, 24, 26, TOM.escuro); D.r(166, 286, 3, 3, COR.ok);   // porta
    D.cilH(254, 262, 60, 30, TOM.branco); D.esfera(314, 277, 15, TOM.branco); D.esfera(286, 276, 7, TOM.vidro);   // módulo lateral
    D.cil(120, 166, 4, 40, TOM.metal); D.esfera(122, 164, 4, TOM.vermelho);
    D.caixa(196, 196, 50, 8, TOM.painel, 3); for (let i = 1; i < 5; i++) D.r(196 + i * 10, 196, 1, 8, '#8fb3ff');
    D.cil(220, 204, 3, 10, TOM.metal);
    D.caixa(28, 288, 18, 12, TOM.caramelo); for (let i = 0; i < 6; i++) D.esfera(32 + (i % 3) * 5, 282 - Math.floor(i / 3) * 6, 4, TOM.verde);   // vasinho
    return () => { D.brilho(116, 220); };
  },
  'outdoor-holografico': () => {
    sombra(180, 320, 110, 10);
    D.cil(96, 196, 10, 116, TOM.metal); D.cil(254, 196, 10, 116, TOM.metal);
    D.caixa(76, 300, 208, 18, TOM.escuro, 5);
    for (let i = 0; i < 5; i++) { D.esfera(108 + i * 36, 300, 6, TOM.metal); D.esfera(108 + i * 36, 300, 3, TOM.vidro); }
    rotulo('SEU NOME', 180, 110, 56, '#ffffff', { brilhoCor: '#3fd0c9', contorno: '#0b2a3a' });
    rotulo('AQUI', 180, 154, 56, '#ffffff', { brilhoCor: '#3fd0c9', contorno: '#0b2a3a' });
    return () => {
      bctx.globalAlpha = 0.14; D.r(54, 64, 252, 132, '#3fd0c9');
      bctx.globalAlpha = 0.42; D.r(66, 74, 228, 110, '#3fd0c9');
      bctx.globalAlpha = 0.3; for (let y = 74; y < 184; y += 3) D.r(66, y, 228, 1, '#e8ffff');
      bctx.globalAlpha = 0.5; D.r(66, 132, 228, 2, '#ffffff'); D.r(140, 96, 60, 1, '#ffffff');   // falhas do holograma
      for (let i = 0; i < 5; i++) { bctx.globalAlpha = 0.12; D.forma(66, 184, 294, 300, (x, y) => Math.abs(x - (108 + i * 36)) <= (300 - y) * 0.55 + 4, () => '#3fd0c9'); }
      bctx.globalAlpha = 1;
      D.r(66, 74, 228, 1, '#e8ffff'); D.r(66, 183, 228, 1, '#e8ffff'); D.r(66, 74, 1, 110, '#e8ffff'); D.r(293, 74, 1, 110, '#e8ffff');
    };
  },
};

// Outdoor sem o "SEU NOME AQUI": fundo do pop-up de compra do site, que escreve o texto do comprador por cima
// (a tela do holograma vai de x 66 a 294 e de y 74 a 184, em 360 px → 18,3% / 20,6% / 63,3% × 30,6% da imagem).
window.gerarOutdoorVazio = function () {
  return [compor('itens/outdoor-holografico-vazio.png', () => { const ef = ITENS['outdoor-holografico'](); TEXTOS.length = 0; return ef; }, { noite: true })];
};

window.gerarLoja = function () {
  const saida = [];
  for (const [slug, fn] of Object.entries(ITENS)) {
    const opc = slug === 'eventos-furia-marte' ? { alerta: true } : slug === 'outdoor-holografico' || slug === 'destaque-proximo-ep' ? { noite: true } : {};
    saida.push(compor(`itens/${slug}.png`, fn, opc));
  }
  return saida;
};
