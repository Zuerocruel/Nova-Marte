// Operação Marte Zero · banner do canal do YouTube (2560x1440). Sem IA.
// Roda DEPOIS do diretor.js e do loja.js (usa as primitivas D, TOM, tomEm, misturaCor e escreverPT).
// Tela de 512x288 ampliada 5x. Medidas do YouTube:
//   TV: a imagem inteira · computador: faixa central 2560x423 (y 508–931) · celular e área segura:
//   1546x423 no meio. Título e colônia ficam na área segura; foguete e antena nas laterais.
//
//   loja.py chama: gerarBanner() → [{nome, url}]

const BW = 512, BH = 288, BX = 5;
const bnc = document.createElement('canvas'); bnc.width = BW; bnc.height = BH;
const bn = bnc.getContext('2d');
const bnl = document.createElement('canvas'); bnl.width = BW; bnl.height = BH;
const bnlc = bnl.getContext('2d');
const BF = document.createElement('canvas'); BF.width = BW * BX; BF.height = BH * BX;
const bf = BF.getContext('2d');
const HZB = 168;   // horizonte (dentro da faixa do computador: 101–186)

function bannerContorno() {
  const t = document.createElement('canvas'); t.width = BW; t.height = BH;
  const c = t.getContext('2d');
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.drawImage(bnl, dx, dy);
  c.globalCompositeOperation = 'source-in'; c.fillStyle = CONTORNO; c.fillRect(0, 0, BW, BH);
  c.globalCompositeOperation = 'source-over'; c.drawImage(bnl, 0, 0);
  return t;
}
function gradB(y0, y1, cores) {
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / (y1 - y0) * (cores.length - 1);
    for (let x = 0; x < BW; x++) {
      const tt = Math.max(0, Math.min(cores.length - 1.001, t + (BAYER[y & 1][x & 1] - 0.4) * 0.35));
      const i = Math.floor(tt);
      D.px(x, y, misturaCor(cores[i], cores[i + 1], Math.round((tt - i) * 4) / 4));
    }
  }
}

// casinha de colono (domo com faixa colorida e janela acesa)
function casinhaB(x, y, r, cor) {
  D.esfera(x, y, r, TOM.branco, 'cima');
  D.forma(x - r, y - r * 0.45, x + r, y - r * 0.25, (px, py) => ((px - x) / r) ** 2 + ((py - y) / r) ** 2 <= 1, () => cor);
  D.r(x - 2, y - r * 0.75, 3, 3, '#ffd27a'); D.r(x - 1, y - 5, 3, 5, TOM.escuro[1]);
}
function colonoB(x, y, cor, acena = false) {   // colono pequeno de traje
  D.r(x - 2, y - 7, 5, 7, '#e9e6f2'); D.r(x - 2, y - 4, 5, 1, cor);
  D.esfera(x, y - 10, 3, TOM.branco); D.r(x, y - 11, 2, 2, '#3f8efc');
  if (acena) D.r(x + 3, y - 12, 1, 4, '#e9e6f2'); else D.r(x + 3, y - 6, 1, 3, '#e9e6f2');
  D.r(x - 2, y, 2, 1, TOM.escuro[1]); D.r(x + 1, y, 2, 1, TOM.escuro[1]);
}

window.gerarBanner = function () {
  g = bn; bn.clearRect(0, 0, BW, BH);
  // céu: noite em cima → entardecer no horizonte
  gradB(0, HZB, ['#05041a', '#0c0a28', '#1a1240', '#3a2052', '#7a3e58', '#c46a54', '#eaa070']);
  for (let i = 0; i < 360; i++) {   // estrelas (somem perto do horizonte)
    const x = hash(i, 801) * BW, y = hash(i, 802) * HZB * 0.62, k = hash(i, 803);
    if (k > 0.96) D.brilho(x, y, '#fff6d8', 2); else D.px(x, y, k > 0.6 ? '#ffe9a8' : k > 0.3 ? '#bfc6ff' : '#6a64a0');
  }
  for (let i = 0; i < 500; i++) { const t = hash(i, 811), x = t * BW, y = 6 + t * 50 + (hash(i, 812) - 0.5) * 26; D.px(x, y, hash(i, 813) > 0.6 ? '#3a3276' : '#221c58'); }   // Via Láctea
  for (const [r, a] of [[42, 0.08], [26, 0.14], [16, 0.25]]) { bn.globalAlpha = a; D.elipse(392, 160, r, r, '#fff3d6'); }   // sol se pondo
  bn.globalAlpha = 1; D.elipse(392, 160, 9, 9, '#fffaf0');
  D.esfera(70, 40, 10, ['#efe2cc', '#d0bea4', '#b09e86', '#8a7a66', '#665848']);   // Fobos
  D.esfera(452, 30, 5, ['#e8dcc4', '#c4b29a', '#a0907a', '#7a6a58', '#5a4c3e']);   // Deimos
  for (const [r, a] of [[8, 0.18], [5, 0.3]]) { bn.globalAlpha = a; D.elipse(160, 46, r, r, '#7fb3ff'); }   // a Terra
  bn.globalAlpha = 1; D.esfera(160, 46, 3, TOM.azul);
  // montanhas em 3 camadas
  [['#8a4a52', 46, 0], ['#7a3a40', 30, 2], ['#64302e', 18, 4]].forEach(([cor, alt, k]) => {
    const altura = (x) => alt * (0.5 + 0.28 * Math.sin(x * 0.019 + k) + 0.14 * Math.sin(x * 0.061 + k * 2) + 0.08 * Math.sin(x * 0.17 + k)) + 4;
    for (let x = 0; x < BW; x++) { const h = altura(x); D.r(x, HZB - h, 1, h + 1, cor); if (altura(x + 1) < h) D.px(x, HZB - h, misturaCor(cor, '#ffb27a', 0.35)); }
  });
  gradB(HZB, BH, ['#8a3e2c', '#a24c32', '#b45a39', '#c06642']);
  for (let i = 0; i < 160; i++) {
    const x = hash(i, 821) * BW, y = HZB + 3 + hash(i, 822) * (BH - HZB - 4), s = 1 + Math.floor(hash(i, 823) * 2 + (y - HZB) / 40);
    D.r(x, y, s + 1, s, '#6e3020'); D.r(x, y, s, 1, '#d88a62');
  }
  // luz quente da colônia no chão
  bn.globalAlpha = 0.18; D.elipse(256, 176, 150, 14, '#ffb05a'); bn.globalAlpha = 1;
  for (const [x, y, r] of [[90, 236, 22], [380, 252, 30], [250, 270, 14], [470, 222, 12]]) {   // crateras (aparecem na TV)
    D.elipse(x, y, r, r * 0.3, '#d88a62'); D.elipse(x, y + 1, r * 0.86, r * 0.24, '#6e3020'); D.elipse(x, y + 2, r * 0.6, r * 0.14, '#5a2418');
  }
  for (let i = 0; i < 14; i++) { const x = 300 + i * 9, y = 214 + i * 4 + (i % 2) * 3; D.r(x, y, 3, 2, '#7a3422'); }   // pegadas

  // ---------------- colônia (camada com contorno)
  g = bnlc; bnlc.setTransform(1, 0, 0, 1, 0, 0); bnlc.clearRect(0, 0, BW, BH); bnlc.setTransform(1, 0, 0, 1, 0, -8);   // colônia 8 px acima
  // foguete e torre (lateral esquerda: só no computador e na TV)
  D.cil(62, 92, 3, 90, TOM.metal); D.cil(80, 92, 3, 90, TOM.metal);
  for (let y = 96; y < 182; y += 10) { D.linha(64, y, 80, y + 10, TOM.metal[3]); D.r(62, y, 21, 1, TOM.metal[2]); }
  D.cil(36, 98, 18, 74, TOM.branco);
  D.forma(36, 72, 54, 98, (x, y) => Math.abs(x - 45) <= (y - 72) / 26 * 9, (x, y) => tomEm(TOM.laranja, (x - 36) / 18 * 3, x, y));
  D.esfera(45, 116, 4, TOM.azul); D.r(36, 150, 18, 3, TOM.laranja[2]);
  for (const d of [-1, 1]) D.forma(d < 0 ? 26 : 54, 156, d < 0 ? 36 : 64, 182, (x, y) => (d < 0 ? 36 - x : x - 54) <= (y - 156) * 0.4 && (d < 0 ? 36 - x : x - 54) >= 0, (x, y) => tomEm(TOM.laranja, d < 0 ? 1 : 2.4, x, y));
  D.caixa(24, 180, 70, 6, TOM.pedra, 2);
  // antena parabólica e painéis (lateral direita)
  D.cil(462, 120, 4, 62, TOM.metal); D.elipse(464, 118, 18, 7, TOM.branco[1], 'cima'); D.elipse(464, 118, 18, 3, TOM.branco[3], 'baixo'); D.esfera(464, 108, 2, TOM.vermelho);
  for (let i = 0; i < 3; i++) { D.caixa(420 + i * 22, 174, 18, 5, TOM.painel); D.r(420 + i * 22 + 9, 179, 1, 6, TOM.metal[3]); }
  // módulo de pouso (domo grande) e estufa
  D.esfera(256, 186, 27, TOM.branco, 'cima');
  D.forma(229, 172, 283, 177, (x, y) => ((x - 256) / 27) ** 2 + ((y - 186) / 27) ** 2 <= 1, (x, y) => tomEm(TOM.laranja, 1 + (y - 172) / 3, x, y));
  for (const x of [240, 253, 266]) { D.caixa(x, 164, 6, 5, TOM.escuro); D.r(x + 1, 165, 4, 3, '#ffd27a'); }
  D.caixa(251, 177, 10, 9, TOM.escuro); D.r(253, 179, 6, 7, '#ffe9a8');
  bnlc.globalAlpha = 0.85; D.forma(176, 168, 212, 186, (x, y) => ((x - 194) / 18) ** 2 + ((y - 186) / 18) ** 2 <= 1, (x, y) => tomEm(TOM.vidro, 1 + (y - 168) / 8 + ((x % 6) === 0 ? -1 : 0), x, y)); bnlc.globalAlpha = 1;
  for (let i = 0; i < 5; i++) D.esfera(184 + i * 5, 182, 2, TOM.verde);
  // casinhas dos colonos dos dois lados
  [[132, 10, '#e04f5f'], [154, 8, '#3f8efc'], [304, 9, '#2bb673'], [326, 10, '#f4b400'], [350, 8, '#9b59b6'], [114, 8, '#00b8a9'], [372, 9, '#ec407a']]
    .forEach(([x, r, c]) => casinhaB(x, 186, r, c));
  // colonos, o cachorrinho e o rover
  colonoB(218, 192, '#e04f5f', true); colonoB(296, 194, '#3f8efc'); colonoB(140, 196, '#f4b400', true);
  D.esfera(228, 192, 3, TOM.caramelo); D.r(225, 193, 6, 3, TOM.caramelo[2]); D.r(230, 189, 2, 2, TOM.caramelo[3]); D.r(224, 191, 1, 2, TOM.caramelo[2]);   // cachorrinho
  D.caixa(388, 186, 26, 7, TOM.branco, 2); D.caixa(392, 180, 10, 6, TOM.branco); D.r(394, 181, 6, 3, '#9fe3dc');
  for (const x of [391, 401, 411]) D.esfera(x, 194, 3, ['#6a6a80', '#4a4a5e', '#3a3a48', '#2a2a36', '#1a1a24']);
  bnlc.setTransform(1, 0, 0, 1, 0, 0);
  g = bn; bn.drawImage(bannerContorno(), 0, 0);
  bn.globalAlpha = 0.22; D.forma(414, 174, 470, 188, (x, y) => Math.abs(y - 181) < (x - 414) * 0.25, () => '#fff3c0'); bn.globalAlpha = 1;   // farol do rover
  for (let i = 0; i < 9; i++) D.r(150 + i * 24, 192 + (i % 2), 3, 1, '#ffc83d');   // luzes do caminho

  // ---------------- tela final + textos (na área segura)
  bf.setTransform(1, 0, 0, 1, 0, 0); bf.imageSmoothingEnabled = false;
  bf.drawImage(bnc, 0, 0, BW * BX, BH * BX);
  const fundo = bf.createLinearGradient(0, 510, 0, 760);   // leve escurecida atrás do título
  fundo.addColorStop(0, 'rgba(5,4,26,0)'); fundo.addColorStop(0.5, 'rgba(5,4,26,0.35)'); fundo.addColorStop(1, 'rgba(5,4,26,0)');
  bf.fillStyle = fundo; bf.fillRect(507, 510, 1546, 250);
  escreverPT(bf, 'OPERAÇÃO MARTE ZERO', 1280, 580, 76, COR.ouro, { contorno: CONTORNO, brilhoCor: '#ff8a3a' });
  escreverPT(bf, 'CADA SEGUIDOR VIRA PERSONAGEM', 1280, 665, 36, '#ffffff', { contorno: CONTORNO });
  escreverPT(bf, 'EPISÓDIO NOVO TODO DIA', 1280, 718, 30, '#7ff6ee', { contorno: CONTORNO });
  const saida = [{ nome: 'perfil/banner_youtube.png', url: BF.toDataURL('image/png') }];
  // prévia com as áreas marcadas (só para conferir; não é para subir)
  bf.strokeStyle = '#00ff88'; bf.lineWidth = 6; bf.strokeRect(507, 508, 1546, 423);
  bf.strokeStyle = '#ffff00'; bf.strokeRect(0, 508, 2560, 423);
  saida.push({ nome: 'perfil/banner_youtube_areas.png', url: BF.toDataURL('image/png') });
  return saida;
};
