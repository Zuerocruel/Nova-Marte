// Operação Marte Zero · fotos de perfil das redes (Instagram, TikTok, YouTube). Sem IA.
// Roda DEPOIS do diretor.js (fonte, cores, hash). Pixel art numa tela de 216x216 ampliada 5x (1080x1080).
// O desenho importante fica dentro do círculo central, porque as redes recortam a foto em círculo.
//
//   loja.py chama: gerarPerfis() → [{nome, url}]

const Q = 216, QX = 5;
const pq = document.createElement('canvas'); pq.width = Q; pq.height = Q;
const pctx = pq.getContext('2d');
const pcam = document.createElement('canvas'); pcam.width = Q; pcam.height = Q;
const pl = pcam.getContext('2d');
const PF = document.createElement('canvas'); PF.width = Q * QX; PF.height = Q * QX;
const pf = PF.getContext('2d');
let pg = pctx;

// ------------------------------------------------------------------ ajudantes
const P = {
  r(x, y, w, h, c) { pg.fillStyle = c; pg.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
  disco(cx, cy, r, c) { pg.fillStyle = c; for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y))); pg.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1); } },
  elipse(cx, cy, rx, ry, c, so) {
    pg.fillStyle = c;
    for (let y = -ry; y <= ry; y++) {
      if ((so === 'cima' && y > 0) || (so === 'baixo' && y < 0)) continue;
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      pg.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
    }
  },
  anel(cx, cy, r0, r1, c) { pg.fillStyle = c; for (let y = -r1; y <= r1; y++) for (let x = -r1; x <= r1; x++) { const d = Math.hypot(x, y); if (d <= r1 && d > r0) pg.fillRect(cx + x, cy + y, 1, 1); } },
  // pinta pixel a pixel um disco com uma função de cor (iluminação, texturas)
  esfera(cx, cy, r, cor) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y) / r; if (d <= 1) { const c = cor(x / r, y / r, d); if (c) { pg.fillStyle = c; pg.fillRect(cx + x, cy + y, 1, 1); } } } },
  faixas(y0, y1, cores) {   // céu em faixas com pontilhado entre elas
    const n = cores.length, h = (y1 - y0) / n;
    cores.forEach((c, i) => {
      P.r(0, y0 + i * h, Q, h + 1, c);
      if (i + 1 < n) for (let x = 0; x < Q; x += 2) { P.r(x + (i % 2), y0 + (i + 1) * h - 1, 1, 1, cores[i + 1]); P.r(x + 1 - (i % 2), y0 + (i + 1) * h - 2, 1, 1, cores[i + 1]); }
    });
  },
  estrelas(n, semente, y1 = Q) {
    for (let i = 0; i < n; i++) {
      const x = hash(i, semente) * Q, y = hash(i, semente + 1) * y1, k = hash(i, semente + 2);
      if (k > 0.93) { P.r(x, y - 1, 1, 3, '#fff6d8'); P.r(x - 1, y, 3, 1, '#fff6d8'); }
      else P.r(x, y, 1, 1, k > 0.7 ? '#ffe9a8' : k > 0.4 ? '#cfd6ff' : '#7b74a8');
    }
  },
  nevoa(cx, cy, rx, ry, c, a) { pg.globalAlpha = a; P.elipse(cx, cy, rx, ry, c); pg.globalAlpha = 1; },
  brilho(x, y, c = '#fff8d0', t = 2) { P.r(x, y - t, 1, t * 2 + 1, c); P.r(x - t, y, t * 2 + 1, 1, c); },
  tri(x, y, w, h, c, dir = 'cima') { pg.fillStyle = c; for (let i = 0; i < h; i++) { const k = dir === 'cima' ? (i + 1) / h : 1 - i / h; const lw = Math.max(1, Math.round(w * k)); pg.fillRect(Math.round(x + (w - lw) / 2), Math.round(y + i), lw, 1); } },
};
function contornoPerfil(cor = CONTORNO) {
  const tmp = document.createElement('canvas'); tmp.width = Q; tmp.height = Q;
  const t = tmp.getContext('2d');
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) t.drawImage(pcam, dx, dy);
  t.globalCompositeOperation = 'source-in'; t.fillStyle = cor; t.fillRect(0, 0, Q, Q);
  t.globalCompositeOperation = 'source-over'; t.drawImage(pcam, 0, 0);
  return tmp;
}
function novaCamada() { pl.clearRect(0, 0, Q, Q); pg = pl; }
function colarCamada() { const c = contornoPerfil(); pctx.drawImage(c, 0, 0); pg = pctx; }
function ampliar() { pf.setTransform(1, 0, 0, 1, 0, 0); pf.imageSmoothingEnabled = false; pf.drawImage(pq, 0, 0, Q * QX, Q * QX); }
function fim(nome) { return { nome, url: PF.toDataURL('image/png') }; }

// pequena colônia (usada no reflexo do visor e no pôr do sol), escala 1 = tamanho normal
function colonia(x, y, k, silhueta = null, janelas = '#ffd27a') {
  const c = (cor) => silhueta || cor;
  P.elipse(x, y, 14 * k, 11 * k, c('#e9e6f2'), 'cima'); P.r(x - 14 * k, y - 4 * k, 28 * k, Math.max(1, 2 * k), c('#e2603b'));
  for (const dx of [-8, -1, 6]) P.r(x + dx * k, y - 8 * k, Math.max(1, 2 * k), Math.max(1, 2 * k), janelas);
  P.elipse(x + 22 * k, y, 8 * k, 6 * k, c('#d8d4e6'), 'cima'); P.r(x + 21 * k, y - 4 * k, Math.max(1, 2 * k), Math.max(1, 2 * k), janelas);
  P.r(x - 26 * k, y - 30 * k, 5 * k, 30 * k, c('#e9e6f2')); P.tri(x - 26 * k, y - 38 * k, 5 * k, 8 * k, c('#e2603b'));   // foguete
  P.r(x + 34 * k, y - 20 * k, Math.max(1, k), 20 * k, c('#9aa0b8')); P.r(x + 35 * k, y - 20 * k, 7 * k, 4 * k, c('#e2603b'));   // bandeira
}

// ------------------------------------------------------------------ 1. astronauta (retrato com visor dourado)
function perfilAstronauta() {
  pg = pctx; pctx.clearRect(0, 0, Q, Q);
  P.faixas(0, 150, ['#07051a', '#0d0a26', '#160f33', '#211442', '#2e1a4e']);
  P.nevoa(50, 50, 60, 30, '#6a3a9a', 0.18); P.nevoa(170, 70, 50, 26, '#2a8a9a', 0.14);
  P.estrelas(140, 101, 150);
  // Marte no horizonte, com brilho da atmosfera
  P.esfera(108, 400, 260, (x, y, d) => d > 0.985 ? '#ffb27a' : y < -0.9 ? (hash(Math.round(x * 300), Math.round(y * 300)) > 0.5 ? '#c4532e' : '#b44a28') : '#a83d22');
  for (const [x, y, r] of [[30, 158, 5], [178, 162, 7], [70, 172, 4], [150, 150, 3]]) { P.elipse(x, y, r, Math.max(1, Math.round(r / 2)), '#8a3018'); P.elipse(x, y - 1, r - 1, Math.max(1, Math.round(r / 3)), '#6e2412'); }
  novaCamada();
  // tronco do traje
  P.r(40, 168, 136, 48, '#e9e6f2'); P.r(130, 168, 46, 48, '#d2cde0'); P.r(40, 168, 12, 48, '#f6f4fb');
  P.r(40, 176, 26, 6, '#e2603b'); P.r(150, 176, 26, 6, '#e2603b');                      // faixas dos ombros
  P.r(92, 172, 32, 20, '#3a2f63'); P.r(95, 175, 4, 3, '#4ed37a'); P.r(101, 175, 4, 3, '#ffc83d'); P.r(107, 175, 4, 3, '#ff4d4d');
  P.r(95, 181, 26, 2, '#3fd0c9'); P.r(95, 185, 18, 2, '#3fd0c9');                       // painel do peito
  P.disco(66, 196, 9, '#ffc83d'); P.disco(66, 196, 7, '#e2603b'); P.anel(66, 196, 3, 5, '#f3eefe');   // emblema "0"
  P.r(132, 192, 30, 9, '#3a2f63');                                                       // tarja do nome (letras depois)
  for (const x of [80, 136]) { P.r(x, 150, 6, 22, '#9aa0b8'); for (let y = 152; y < 172; y += 3) P.r(x, y, 6, 1, '#6a7090'); }   // mangueiras
  // capacete
  P.disco(108, 92, 66, '#e9e6f2');
  P.esfera(108, 92, 66, (x, y) => x > 0.35 ? '#d2cde0' : x < -0.55 && y < 0 ? '#ffffff' : null);
  P.anel(108, 94, 50, 56, '#9aa0b8');
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) P.r(108 + Math.cos(a) * 53, 94 + Math.sin(a) * 53, 1, 1, '#5a5f7a');   // rebites
  P.r(34, 80, 10, 24, '#c9c4da'); P.r(172, 80, 10, 24, '#c9c4da');                      // laterais
  P.r(36, 84, 6, 6, '#ffd84a'); P.r(174, 84, 6, 6, '#ffd84a');                          // lanternas
  P.r(160, 18, 3, 26, '#9aa0b8'); P.disco(161, 16, 3, '#ff4d4d');                       // antena
  P.r(70, 146, 76, 8, '#e2603b'); P.r(70, 146, 76, 2, '#ff8a5c');                       // gola
  // visor dourado com o reflexo da colônia
  P.esfera(108, 94, 49, (x, y) => {
    const k = (y + 1) / 2;
    if (y > 0.28 + 0.05 * Math.sin(x * 6)) return y > 0.6 ? '#7a3a24' : '#a85a3c';   // chão de Marte refletido
    return k < 0.25 ? '#5a3a1a' : k < 0.4 ? '#8a5a20' : k < 0.55 ? '#c98a2a' : '#e8b048';
  });
  colonia(104, 110, 0.7, null, '#fff3c0');
  for (let i = 0; i < 14; i++) P.r(74 + hash(i, 141) * 60, 60 + hash(i, 142) * 30, 1, 1, '#fff3c0');
  pg.globalAlpha = 0.55;                                                                 // reflexo curvo da luz
  for (let i = 0; i < 26; i++) P.r(74 + i * 0.9, 66 - Math.sin(i / 26 * Math.PI) * 16 + i * 0.2, 2, 1, '#ffffff');
  P.elipse(84, 70, 6, 3, '#ffffff'); pg.globalAlpha = 1;
  colarCamada();
  P.brilho(28, 30); P.brilho(190, 46); P.brilho(18, 120, '#cfe8ff');
  ampliar();
  pf.font = `34px ${FONTE}`; pf.textAlign = 'center'; pf.textBaseline = 'middle'; pf.fillStyle = '#ffc83d';
  pf.fillText('OMZ', 147 * QX, 196.5 * QX);
  return fim('perfil_1_astronauta.png');
}

// ------------------------------------------------------------------ 2. colono e o pet olhando a Terra
function perfilPet() {
  pg = pctx; pctx.clearRect(0, 0, Q, Q);
  P.faixas(0, 150, ['#06041a', '#0c0a26', '#151036', '#1f1646', '#2c1c50', '#3e2452']);
  P.nevoa(160, 40, 70, 34, '#3a6aaa', 0.14); P.nevoa(40, 90, 60, 26, '#7a3a8a', 0.14);
  P.estrelas(150, 501, 140);
  // a Terra lá longe (pontinho azul com brilho) e Fobos
  for (const [r, a] of [[14, 0.12], [9, 0.22]]) P.nevoa(160, 44, r, r, '#7fb3ff', a);
  P.esfera(160, 44, 5, (x, y) => (x < -0.2 && y < 0.2 ? '#cfe6ff' : (Math.sin(x * 9 + y * 4) > 0.4 ? '#4ed37a' : '#3f8efc')));
  P.esfera(46, 34, 6, (x, y) => (x * -0.6 + y * -0.5 > 0.2 ? '#d8c8b0' : x * -0.6 + y * -0.5 > -0.3 ? '#b09e86' : '#7a6a58'));
  // duna em primeiro plano
  for (let x = 0; x < Q; x++) {
    const h = 150 + Math.sin(x * 0.025 + 1) * 10 + Math.sin(x * 0.07) * 3;
    for (let y = Math.round(h); y < Q; y++) { const t = (y - h) / 40; P.r(x, y, 1, 1, t < 0.06 ? '#ffb27a' : (t < 0.4 ? (hash(x, y) > 0.55 ? '#d4683e' : '#c8603a') : t < 0.9 ? '#b0502e' : '#943e22')); }
  }
  for (let x = 0; x < Q; x++) { const h = 128 + Math.sin(x * 0.04 + 3) * 8; for (let y = Math.round(h); y < 150 + Math.sin(x * 0.025 + 1) * 10; y++) P.r(x, y, 1, 1, '#7a3a2e'); }
  novaCamada();
  // colono sentado de perfil (virado para a direita), olhando para a Terra
  const membro = (x0, y0, x1, y1, r, claro, escuro) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++) P.disco(Math.round(x0 + (x1 - x0) * i / n) + 1, Math.round(y0 + (y1 - y0) * i / n) + 1, r, escuro);
    for (let i = 0; i <= n; i++) P.disco(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), r - 1, claro);
  };
  P.esfera(66, 128, 13, (x) => (x < -0.3 ? '#d8d4e6' : x < 0.4 ? '#c3c8d8' : '#9aa0b8')); P.r(56, 122, 20, 22, '#c3c8d8'); P.r(56, 122, 5, 22, '#d8d4e6');   // mochila
  P.r(60, 126, 4, 3, '#4ed37a'); P.r(60, 131, 4, 3, '#ffc83d');
  membro(86, 152, 112, 142, 8, '#e9e6f2', '#b2aec6');                      // coxa
  membro(112, 142, 116, 164, 7, '#e9e6f2', '#b2aec6');                     // canela
  P.r(108, 162, 18, 8, '#3a2f63'); P.r(108, 162, 18, 2, '#5a4f7e');        // bota
  P.esfera(112, 142, 6, (x) => (x < 0 ? '#c3c8d8' : '#9aa0b8'));            // joelheira
  P.esfera(82, 134, 17, (x, y) => (x < -0.45 ? '#ffffff' : x < 0.3 ? '#e9e6f2' : '#cfcadf'));   // tronco
  P.r(68, 140, 30, 4, '#e2603b');
  P.r(88, 126, 9, 7, '#3a2f63'); P.r(90, 128, 2, 2, '#4ed37a'); P.r(93, 128, 2, 2, '#ff4d4d');  // painel no peito
  membro(88, 124, 104, 136, 5, '#e9e6f2', '#b2aec6'); membro(104, 136, 122, 136, 5, '#e9e6f2', '#b2aec6');   // braço até o cachorro
  P.esfera(124, 136, 4, (x) => (x < 0 ? '#c3c8d8' : '#9aa0b8'));          // luva no cachorro
  P.r(72, 116, 22, 5, '#d2cde0');                                           // gola
  P.esfera(84, 102, 17, (x, y) => (x < -0.45 && y < 0 ? '#ffffff' : x < 0.35 ? '#e9e6f2' : '#cfcadf'));   // capacete
  P.esfera(93, 101, 11, (x, y) => (y < -0.45 + x * 0.25 ? '#ffe9a0' : y < 0.25 ? '#e8b048' : '#a8641e'));  // visor virado para a Terra
  P.r(90, 95, 4, 2, '#fff6d8'); P.r(97, 104, 2, 1, '#7fb3ff');             // reflexo da Terra no visor
  P.r(72, 84, 2, 12, '#9aa0b8'); P.disco(73, 83, 2, '#ff4d4d');            // antena
  for (const y of [100, 106]) P.r(67, y, 3, 3, '#ffd84a');                  // lanterna lateral
  // o cachorrinho caramelo com capacete-bolha, sentado ao lado
  P.esfera(132, 150, 13, (x, y) => (y > 0.3 && Math.abs(x) < 0.5 ? '#f8dcb4' : x < -0.3 ? '#e09a52' : x < 0.4 ? '#c8782e' : '#9a5418'));   // corpo
  P.r(124, 158, 6, 10, '#c8782e'); P.r(136, 158, 6, 10, '#9a5418'); P.r(123, 166, 8, 3, '#e09a52'); P.r(135, 166, 8, 3, '#c8782e');
  P.r(116, 152, 4, 3, '#c8782e'); P.r(112, 146, 5, 6, '#c8782e'); P.r(110, 142, 4, 5, '#e09a52');       // rabo pra cima
  P.esfera(140, 130, 10, (x, y) => (x < -0.3 && y < 0 ? '#e09a52' : x < 0.5 ? '#c8782e' : '#9a5418'));   // cabeça
  P.r(146, 130, 8, 6, '#f8dcb4'); P.r(152, 130, 3, 3, '#1b1530');                                        // focinho e nariz
  P.tri(131, 116, 6, 8, '#9a5418'); P.tri(141, 115, 6, 8, '#c8782e');                                    // orelhas
  P.r(142, 126, 3, 3, '#1b1530'); P.r(142, 126, 1, 1, '#ffffff');
  P.r(132, 139, 16, 3, '#3fd0c9'); P.disco(140, 143, 2, '#ffc83d');                                      // coleira
  colarCamada();
  // capacete-bolha do cachorro (vidro por cima, sem contorno grosso)
  pg = pctx; pctx.globalAlpha = 0.28; P.disco(140, 128, 16, '#cfefff'); pctx.globalAlpha = 1;
  P.anel(140, 128, 15, 16, '#e8f6ff'); P.r(131, 118, 4, 2, '#ffffff'); P.r(129, 121, 2, 3, '#ffffff');
  // pegadas na areia
  for (let i = 0; i < 6; i++) { P.r(30 + i * 9, 178 + (i % 2) * 4, 3, 2, '#943e22'); P.r(36 + i * 9, 192 + (i % 2) * 3, 2, 2, '#943e22'); }
  P.brilho(186, 80); P.brilho(24, 64); P.brilho(130, 20, '#cfe8ff');
  ampliar();
  return fim('perfil_2_colono_e_pet.png');
}

// ------------------------------------------------------------------ 3. lançamento do foguete
function perfilLancamento() {
  pg = pctx; pctx.clearRect(0, 0, Q, Q);
  P.faixas(0, 170, ['#2a1a3a', '#4a2a4a', '#7a3e4a', '#a85a4a', '#d07a52', '#eaa070']);
  P.estrelas(40, 601, 60);
  for (const [r, a] of [[30, 0.1], [18, 0.2]]) P.nevoa(176, 120, r, r, '#fff3d6', a);
  P.disco(176, 120, 8, '#fff6e0');
  for (let x = 0; x < Q; x++) { const h = 22 * (0.5 + 0.3 * Math.sin(x * 0.04) + 0.2 * Math.sin(x * 0.11 + 2)); P.r(x, 168 - h, 1, h + 1, '#9c5e40'); }
  for (let x = 0; x < Q; x++) for (let y = 168; y < Q; y++) P.r(x, y, 1, 1, y < 172 ? '#c8703e' : hash(x, y) > 0.6 ? '#b45a39' : '#a8502f');
  // colônia pequena ao fundo, à direita
  colonia(176, 176, 0.55);
  novaCamada();
  // torre de lançamento
  P.r(128, 92, 3, 88, '#9aa0b8'); P.r(140, 92, 3, 88, '#9aa0b8');
  for (let y = 96; y < 180; y += 8) { P.r(128, y, 15, 1, '#6a7090'); for (let k = 0; k < 8; k++) P.r(129 + k * 1.6, y + k, 1, 1, '#6a7090'); }
  P.r(116, 112, 12, 2, '#9aa0b8');
  // foguete subindo (um pouco acima da plataforma)
  const fx0 = 96, topo = 34;
  P.esfera(fx0 + 10, topo + 22, 10, (x) => (x < -0.4 ? '#ffb07a' : x < 0.3 ? '#e2603b' : '#b8482a'));
  for (let y = topo; y < topo + 22; y++) { const w = Math.round((y - topo) / 22 * 10); P.r(fx0 + 10 - w, y, w * 2, 1, '#e2603b'); P.r(fx0 + 10 - w, y, Math.max(1, Math.round(w * 0.5)), 1, '#ff8a5c'); }
  for (let x = 0; x < 20; x++) { const t = x / 20; P.r(fx0 + x, topo + 22, 1, 66, t < 0.15 ? '#ffffff' : t < 0.6 ? '#eef0f8' : t < 0.85 ? '#d6d4e4' : '#b2aec6'); }
  P.r(fx0, topo + 30, 20, 2, '#9aa0b8');
  P.disco(fx0 + 10, topo + 42, 5, '#c3c8d8'); P.disco(fx0 + 10, topo + 42, 3, '#3f8efc'); P.r(fx0 + 8, topo + 40, 2, 2, '#cfe6ff');
  P.r(fx0, topo + 64, 20, 4, '#e2603b');
  for (let i = 0; i < 16; i++) { P.r(fx0 - 1 - i * 0.6, topo + 72 + i, 1 + i * 0.6, 1, '#e2603b'); P.r(fx0 + 20, topo + 72 + i, 1 + i * 0.6, 1, '#b8482a'); }
  P.r(fx0 + 4, topo + 88, 12, 5, '#6a7090');
  P.r(fx0 + 6, topo + 50, 8, 8, '#3a2f63'); P.r(fx0 + 8, topo + 52, 4, 1, '#ffc83d'); P.r(fx0 + 8, topo + 55, 4, 1, '#ffc83d');   // emblema
  colarCamada();
  // chama e fumaça
  pg = pctx;
  for (let y = 0; y < 44; y++) { const w = 7 - y * 0.12 + Math.sin(y * 0.9) * 1.2; P.r(fx0 + 10 - w, topo + 93 + y, w * 2, 1, y < 6 ? '#fffbe0' : y < 18 ? '#ffd84a' : y < 32 ? '#ff8a3a' : '#e2603b'); }
  for (let y = 0; y < 14; y++) P.r(fx0 + 8, topo + 94 + y, 4, 1, '#ffffff');
  for (let i = 0; i < 40; i++) {
    const x = 60 + hash(i, 611) * 110, y = 168 + hash(i, 612) * 30, r = 6 + Math.floor(hash(i, 613) * 10);
    P.esfera(Math.round(x), Math.round(y), r, (dx, dy) => (dx * -0.5 + dy * -0.7 > 0.35 ? '#ffffff' : dx * -0.5 + dy * -0.7 > -0.1 ? '#e8e2f2' : dy > 0.2 ? '#b8a2a8' : '#d0c4d8'));
  }
  pctx.globalAlpha = 0.35; P.disco(fx0 + 10, 170, 20, '#ffb05a'); pctx.globalAlpha = 1;
  P.brilho(30, 30); P.brilho(196, 22); P.brilho(60, 60, '#ffe9a8');
  ampliar();
  return fim('perfil_3_lancamento.png');
}

// ------------------------------------------------------------------ 4. a casa na colônia à noite
function perfilCasa() {
  pg = pctx; pctx.clearRect(0, 0, Q, Q);
  P.faixas(0, 140, ['#05041a', '#0a0824', '#110c30', '#1a1240', '#28184c', '#3a2252']);
  P.nevoa(108, 70, 120, 40, '#3a2a7a', 0.18);
  for (let i = 0; i < 260; i++) { const t = hash(i, 701), x = t * Q, y = 10 + t * 70 + (hash(i, 702) - 0.5) * 30; P.r(x, y, 1, 1, hash(i, 703) > 0.6 ? '#4a3e86' : '#2e2662'); }   // Via Láctea
  P.estrelas(150, 711, 130);
  P.esfera(40, 36, 9, (x, y) => (x * -0.6 + y * -0.5 > 0.25 ? '#efe2cc' : x * -0.6 + y * -0.5 > -0.2 ? '#c4b29a' : '#7a6a58'));   // Fobos
  P.esfera(178, 28, 4, (x, y) => (x * -0.6 + y * -0.5 > 0 ? '#d8c8b0' : '#8a7a66'));                                               // Deimos
  // morros escuros e chão
  for (let x = 0; x < Q; x++) { const h = 30 * (0.5 + 0.3 * Math.sin(x * 0.03 + 1) + 0.2 * Math.sin(x * 0.09)); P.r(x, 140 - h, 1, h + 1, '#2a1a34'); }
  for (let x = 0; x < Q; x++) for (let y = 140; y < Q; y++) P.r(x, y, 1, 1, y < 142 ? '#5a3040' : hash(x, y) > 0.6 ? '#4a2830' : '#42222a');
  // luz quente das janelas no chão
  pctx.globalAlpha = 0.25; P.elipse(108, 176, 74, 16, '#ffb05a'); pctx.globalAlpha = 0.18; P.elipse(108, 176, 44, 10, '#ffd27a'); pctx.globalAlpha = 1;
  novaCamada();
  // domo grande com painéis
  P.esfera(108, 170, 66, (x, y) => {
    if (y > 0) return null;
    const anel = Math.abs(Math.hypot(x, y) - 0.5) < 0.012 || Math.abs(Math.hypot(x, y) - 0.75) < 0.01;
    const meridiano = [-0.55, -0.2, 0.2, 0.55].some((a) => Math.abs(x - a * Math.sqrt(Math.max(0, 1 - y * y))) < 0.012);
    if (anel || meridiano) return '#6a6488';
    const luz = x * -0.6 + y * -0.6;
    return luz > 0.55 ? '#c9c4e0' : luz > 0.2 ? '#a8a2c8' : luz > -0.2 ? '#8a84ac' : '#6a6490';
  });
  P.r(42, 156, 132, 4, '#3fd0c9');
  // janelas acesas e silhuetas dentro
  for (const x of [62, 86, 120, 144]) { P.r(x, 132, 12, 12, '#2a2248'); P.r(x + 1, 133, 10, 10, '#ffd27a'); P.r(x + 1, 133, 10, 3, '#fff3c0'); }
  P.r(90, 137, 3, 6, '#5a3a20'); P.disco(91, 136, 2, '#5a3a20');           // alguém na janela
  P.r(124, 139, 6, 4, '#5a3a20');                                            // o pet deitado na janela
  // porta aberta com luz e colono acenando
  P.r(98, 146, 22, 24, '#9aa0b8'); P.r(101, 149, 16, 21, '#ffe9a8');
  P.r(104, 156, 8, 14, '#e9e6f2'); P.disco(108, 153, 5, '#e9e6f2'); P.disco(109, 153, 3, '#3f8efc'); P.r(108, 152, 1, 1, '#cfe6ff');
  P.r(112, 150, 3, 6, '#e9e6f2'); P.r(113, 147, 3, 3, '#c3c8d8');          // mão acenando
  // antena com luz e placa solar
  P.r(150, 92, 2, 26, '#9aa0b8'); P.disco(151, 91, 2, '#ff4d4d');
  P.r(56, 104, 22, 4, '#2b3a88'); for (let i = 1; i < 4; i++) P.r(56 + i * 5.5, 104, 1, 4, '#6f8fe8');
  // poste de luz e caixa de correio
  P.r(184, 140, 2, 34, '#6a7090'); P.r(180, 138, 10, 3, '#9aa0b8'); P.r(182, 141, 6, 2, '#fff3c0');
  P.r(24, 160, 10, 8, '#e2603b'); P.r(28, 168, 2, 8, '#6a7090');
  colarCamada();
  pctx.globalAlpha = 0.22; P.tri(166, 143, 34, 32, '#fff3c0'); pctx.globalAlpha = 1;
  // caminho de pedras iluminado até a porta
  for (let i = 0; i < 6; i++) { const y = 176 + i * 7, w = 8 + i * 3; P.r(109 - w / 2, y, w, 3, i % 2 ? '#7a5a5a' : '#6a4a50'); P.r(109 - w / 2, y, w, 1, '#a07a70'); }
  P.brilho(186, 60); P.brilho(30, 90); P.brilho(140, 18, '#cfe8ff');
  ampliar();
  return fim('perfil_4_casa_na_colonia.png');
}

window.gerarPerfis = function () {
  return [perfilAstronauta(), perfilPet(), perfilLancamento(), perfilCasa()].map((r) => ({ ...r, nome: `perfil/${r.nome}` }));
};
