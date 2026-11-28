// Expedição Norte · motor de imagem dos VÍDEOS LONGOS (16:9). Separado da fábrica dos Shorts.
// Cada quadro é função do tempo: desenhar(t) acha a fala do momento, desenha o cenário dela em pixel art
// (tela interna PW x PH ampliada 4x) e por cima, na resolução cheia, o relógio, os medidores e a legenda gigante.

const W = 1920, H = 1080, PW = 480, PH = 270, ESC = 4;
const FONTE = '"Press Start 2P", monospace';
const COR = { fundo: '#0b0914', noite: '#0e0b18', duna: '#3a2420', duna2: '#4a2c24', areia: '#6e4430', poeira: '#7a5236',
  ouro: '#ffc83d', ciano: '#3fd0c9', alerta: '#e04f5f', ok: '#4ed37a', branco: '#eef0f8', cinza: '#9aa0b5', escuro: '#2a2140' };

// ---- acentos das MAIÚSCULAS desenhados à mão (a Press Start 2P desenha mal Ã, Ô...), igual à fábrica
(function () {
  const P = CanvasRenderingContext2D.prototype;
  const MARCA = { '̃': [[1, -3], [2, -3], [5, -3], [0, -2], [3, -2], [4, -2]], '́': [[4, -3], [5, -3], [3, -2], [4, -2]],
    '̀': [[1, -3], [2, -3], [2, -2], [3, -2]], '̂': [[2, -3], [3, -3], [4, -3], [1, -2], [2, -2], [4, -2], [5, -2]] };
  const AC = /[ÃÕÂÊÎÔÛÁÉÍÓÚÀ]/;
  const env = (orig, modo) => function (str, x, y) {
    str = String(str);
    if (!AC.test(str) || !/Press Start 2P/.test(this.font)) return orig.apply(this, arguments);
    const tam = parseFloat((this.font.match(/([\d.]+)px/) || [0, 16])[1]);
    const ls = [...str].map((ch) => (AC.test(ch) ? { b: ch.normalize('NFD')[0], m: ch.normalize('NFD')[1] } : { b: ch, m: null }));
    const s = ls.map((l) => l.b).join(''), larg = this.measureText(s).width, passo = larg / Math.max(1, ls.length);
    const x0 = this.textAlign === 'center' ? x - larg / 2 : (this.textAlign === 'right' || this.textAlign === 'end') ? x - larg : x;
    const topo = y - this.measureText('H').actualBoundingBoxAscent, al = this.textAlign;
    this.textAlign = 'left'; orig.call(this, s, x0, y); this.textAlign = al;
    const u = tam / 8, bd = modo === 'stroke' ? this.lineWidth / 2 : 0, antes = this.fillStyle;
    if (modo === 'stroke') this.fillStyle = this.strokeStyle;
    ls.forEach((l, i) => { for (const [cx, cy] of MARCA[l.m] || []) this.fillRect(x0 + i * passo + cx * u - bd, topo + cy * u - bd, u + bd * 2, u + bd * 2); });
    this.fillStyle = antes;
  };
  if (!P.__acentosPT) { P.fillText = env(P.fillText, 'fill'); P.strokeText = env(P.strokeText, 'stroke'); P.__acentosPT = true; }
})();

const tela = document.getElementById('tela');
const ctx = tela.getContext('2d', { alpha: false });
const px = document.createElement('canvas'); px.width = PW; px.height = PH;
const g = px.getContext('2d');
ctx.imageSmoothingEnabled = false; g.imageSmoothingEnabled = false;
let LT = null;

// ---------------------------------------------------------------- utilidades
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const suave = (k) => (k = clamp(k), k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const saida = (k) => 1 - Math.pow(1 - clamp(k), 3);
const hash = (a, b = 0) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const A = (a, f) => { const o = g.globalAlpha; g.globalAlpha = o * a; f(); g.globalAlpha = o; };
function seg(a, b, w, c) { const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y))); for (let i = 0; i <= n; i++) R(a.x + (b.x - a.x) * i / n - w / 2, a.y + (b.y - a.y) * i / n - w / 2, w, w, c); }
function circ(x, y, r, c) { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
// texto na tela cheia (coordenadas 1920x1080)
function T(str, x, y, tam, cor, o = {}) {
  ctx.font = `${tam}px ${FONTE}`;
  let s = tam;
  while (o.maxW && ctx.measureText(str).width > o.maxW && s > 10) { s -= 2; ctx.font = `${s}px ${FONTE}`; }
  ctx.textAlign = o.al || 'center'; ctx.textBaseline = 'middle';
  if (o.borda !== false) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(6, s * 0.32); ctx.strokeStyle = '#05040a'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = cor; ctx.fillText(str, x, y);
}
// rótulo escrito na ilustração (coordenadas da tela interna)
function rotulo(str, x, y, cor = COR.ouro, tam = 22, al = 'center') { POS.push(() => T(str, x * ESC, y * ESC, tam, cor, { maxW: 900, al })); }
let POS = [];

// ---------------------------------------------------------------- peças comuns
function ceu(noite, poeira = 0, t = 0) {
  const gr = g.createLinearGradient(0, 0, 0, PH);
  if (noite) { gr.addColorStop(0, '#07060f'); gr.addColorStop(0.75, '#1c1222'); gr.addColorStop(1, '#2e1a1a'); }
  else { gr.addColorStop(0, '#5e3f2c'); gr.addColorStop(0.7, '#8a5c3c'); gr.addColorStop(1, '#6e4430'); }
  g.fillStyle = gr; g.fillRect(0, 0, PW, PH);
  if (noite) for (let i = 0; i < 90; i++) if (hash(i, 3) > poeira * 1.2) R(hash(i, 1) * PW, hash(i, 2) * PH * 0.6, 1, 1, i % 11 ? '#c9ced9' : '#8fe6ff');
  if (poeira > 0) A(poeira * 0.8, () => R(0, 0, PW, PH, noite ? '#3a2418' : '#7a5236'));
}
function dunas(base, t, cores = [COR.duna2, COR.duna], desloca = 0) {
  cores.forEach((cor, c) => {
    g.fillStyle = cor; g.beginPath(); g.moveTo(0, PH);
    for (let x = 0; x <= PW; x += 4) g.lineTo(x, base + c * 16 - Math.sin((x + desloca) * (0.012 + c * 0.01) + c * 2) * (16 - c * 5) - Math.sin((x + desloca) * 0.031) * 4);
    g.lineTo(PW, PH); g.fill();
  });
}
function vento(t, n, forca, cor = '#b98a62') {
  for (let i = 0; i < n; i++) {
    const v = 120 + hash(i, 4) * 200 * forca, x = PW - ((t * v + hash(i, 5) * PW * 2) % (PW + 60)), y = hash(i, 6) * PH;
    A(0.25 + hash(i, 7) * 0.5, () => R(x, y, 6 + forca * 14, 1, cor));
  }
}
// colono de traje (de lado): corpo do traje claro, faixa da cor da pessoa, visor escuro
const PESSOA = { voce: { faixa: '#ff8a3d' }, vinny: { faixa: '#4ed37a' } };
function astronauta(x, chao, t, o = {}) {
  const d = o.dir || 1, e = o.esc || 1, anda = o.anda ? Math.sin(t * 9 + (o.fase || 0)) : 0, faixa = (PESSOA[o.quem] || PESSOA.voce).faixa;
  const s = (v) => v * e;
  seg({ x: x - s(2), y: chao - s(9) }, { x: x - s(2) + anda * s(3), y: chao }, s(3), '#c9ced9');
  seg({ x: x + s(2), y: chao - s(9) }, { x: x + s(2) - anda * s(3), y: chao }, s(3), '#d8dbe6');
  R(x - s(5), chao - s(20), s(10), s(12), '#e4e6f0'); R(x - s(5), chao - s(15), s(10), s(2), faixa);
  R(x - d * s(8), chao - s(19), s(3), s(9), '#9aa0b5');                                 // mochila
  const braco = o.braco ? o.braco : { x: x + d * s(4) - anda * s(3), y: chao - s(9) };
  seg({ x: x + d * s(3), y: chao - s(18) }, braco, s(2.5), '#d8dbe6');
  R(x - s(5), chao - s(29), s(10), s(9), '#eef0f8'); R(x + d * s(0.5) - s(2.5) + d * s(1), chao - s(27), s(5), s(5), '#2a3050');
  R(x + d * s(1.5), chao - s(26), s(1.5), s(1.5), '#8fe6ff');
  return { cab: { x, y: chao - s(29) }, mao: braco };
}
function rover(x, chao, t, o = {}) {   // rover da colônia de lado, com reboque opcional
  const d = o.dir || 1, anda = !!o.anda, giro = anda ? t * 6 : 0;
  if (o.reboque) {
    const rx = x - d * 46;
    seg({ x: rx + d * 18, y: chao - 8 }, { x: x - d * 20, y: chao - 8 }, 2, '#6b6f86');
    R(rx - 18, chao - 16, 36, 9, '#9aa0b5'); R(rx - 18, chao - 16, 36, 1, '#c9ced9');
    if (o.caixas) { R(rx - 14, chao - 23, 9, 7, '#b8913f'); R(rx - 3, chao - 22, 8, 6, '#b8913f'); }
    for (const wx of [rx - 11, rx + 11]) { circ(wx, chao - 4, 4, '#1b1530'); R(wx - 1, chao - 5, 2, 2, '#9aa0b5'); }
  }
  for (const wx of [x - 15, x, x + 15]) { circ(wx, chao - 5, 5, '#1b1530'); const a = giro + wx; R(wx + Math.cos(a) * 3 - 1, chao - 5 + Math.sin(a) * 3 - 1, 2, 2, '#6b6f86'); }
  R(x - 21, chao - 19, 42, 8, '#e4e6f0'); R(x - 21, chao - 13, 42, 2, '#9aa0b5'); R(x - 17, chao - 17, 9, 2, '#e2603b');
  R(x - 23, chao - 22, 30, 3, '#2c4fb8');
  R(x + d * 8 - 6, chao - 27, 12, 8, '#e4e6f0'); R(x + d * 8 - 4, chao - 25, 8, 4, COR.ciano);
  R(x + d * 2, chao - 38, 2, 16, '#9aa0b5'); R(x + d * 2 - 3, chao - 41, 8, 4, '#c9ced9');
  if (o.farol) A(0.35, () => { g.fillStyle = '#fff4c2'; g.beginPath(); g.moveTo(x + d * 21, chao - 15); g.lineTo(x + d * 120, chao - 30); g.lineTo(x + d * 120, chao + 4); g.fill(); });
  if (o.poeira) A(0.85, () => { R(x - 24, chao - 8, 48, 8, '#7a5236'); R(x - 20, chao - 22, 28, 3, '#7a5236'); });
}
function barracaFora(x, chao, t, tremor = 0) {
  const s = Math.sin(t * 13) * tremor * 2;
  g.fillStyle = '#d8dbe6'; g.beginPath(); g.ellipse(x + s, chao, 34, 26, 0, Math.PI, 0); g.fill();
  for (let i = 1; i < 4; i++) { g.strokeStyle = '#9aa0b5'; g.lineWidth = 1; g.beginPath(); g.ellipse(x + s, chao, 34 * i / 4, 26, 0, Math.PI, 0); g.stroke(); }
  R(x - 5 + s, chao - 14, 10, 8, '#ffe58a');
}
function painel(x, y, w, h, cor = '#07060f') { R(x - 3, y - 3, w + 6, h + 6, '#3a3352'); R(x, y, w, h, cor); for (let yy = y; yy < y + h; yy += 3) A(0.12, () => R(x, yy, w, 1, '#ffffff')); }

// ---------------------------------------------------------------- cenários (t = tempo, k = 0..1 no plano, p = parâmetros, kf = 0..1 na fala)
const CENAS = {
  radio(t, k, p, kf) {
    R(0, 0, PW, PH, '#120f1c');
    painel(70, 50, 340, 150, '#0a0812');
    const caiu = p.sinal === 0 || (p.sinal === 1 && kf > 0.72);
    for (let x = 0; x < 320; x += 2) {
      let a = caiu ? (hash(x, Math.floor(t * 30)) - 0.5) * 10 : Math.sin(x * 0.17 + t * 12) * Math.sin(x * 0.03 + t * 2) * 30 * (0.5 + 0.5 * hash(Math.floor(x / 10), Math.floor(t * 9)));
      if (!caiu && p.sinal === 1 && x / 320 > kf / 0.72) a *= 0.1;
      R(80 + x, 125 - Math.abs(a), 2, Math.abs(a) * 2 + 1, caiu ? '#6b6f86' : COR.ciano);
    }
    for (let i = 0; i < 5; i++) R(90 + i * 14, 66, 10, 6, caiu ? (i === 0 && Math.floor(t * 2) % 2 ? COR.alerta : '#2a2140') : COR.ok);
    for (let y = 214; y < 260; y += 6) for (let x = 120; x < 360; x += 6) R(x, y, 3, 3, '#2a2438');   // grade do alto-falante
    R(420, 60, 14, 130, '#2a2438'); R(424, 60 + (caiu ? 110 : 30 + Math.sin(t * 3) * 8), 6, 14, COR.ouro);
    rotulo('RÁDIO · BASE NOVA MARTE', 240, 34, '#c9ced9', 22);
    if (caiu) rotulo('SEM SINAL', 240, 160, COR.alerta, 34);
  },
  frente(t, k, p, kf) {
    ceu(true, 0, t);
    const muro = 0.25 + k * 0.35;
    g.fillStyle = '#4a2c1c'; g.beginPath(); g.moveTo(0, PH * 0.62);
    for (let x = 0; x <= PW; x += 6) g.lineTo(x, PH * (0.62 - muro * 0.55) - Math.sin(x * 0.05 + t * 0.8) * 6 - hash(Math.floor(x / 6), 9) * 5);
    g.lineTo(PW, PH * 0.62); g.fill();
    A(0.4, () => R(0, PH * (0.62 - muro * 0.55), PW, 40, '#6e4430'));
    dunas(PH * 0.64, t);
    barracaFora(110, PH * 0.8, t); rover(300, PH * 0.8, t, { reboque: true, dir: -1 });
    seg({ x: 160, y: PH * 0.8 }, { x: 160, y: PH * 0.8 - 50 }, 2, '#9aa0b5'); if (Math.floor(t * 2) % 2) R(158, PH * 0.8 - 54, 5, 5, COR.alerta);
    const [mm, ss] = (p.timer || '38:00').split(':').map(Number), rest = Math.max(0, mm * 60 + ss - Math.floor(kf * 20));
    rotulo('TEMPESTADE EM ' + String(Math.floor(rest / 60)).padStart(2, '0') + ':' + String(rest % 60).padStart(2, '0'), PW - 120, 60, COR.alerta, 30);
  },
  roverPainel(t, k, p, kf, c) {
    R(0, 0, PW, PH, '#0e0c16');
    const parte = !!p.partindo;
    painel(60, 40, 360, 190, parte ? '#1a0708' : '#060a0c');
    const linhas = ['ROVER · MODO AUTÔNOMO', 'BASE: SEM SINAL', 'ROTA GRAVADA: BASE · 45 KM'];
    linhas.forEach((l, i) => rotulo(l, 80, 64 + i * 22, i === 1 ? COR.alerta : '#8fe6ff', 18, 'left'));
    let txt = p.contagem || '36:00:00';
    if (/^\d\d:\d\d:\d\d$/.test(txt) && txt !== '00:00:00') {
      const [h, m, s] = txt.split(':').map(Number), tot = Math.max(0, h * 3600 + m * 60 + s - Math.floor((t - c.inicio)));
      txt = [Math.floor(tot / 3600), Math.floor(tot / 60) % 60, tot % 60].map((v) => String(v).padStart(2, '0')).join(':');
    }
    const pisca = txt === 'VOLTA-CASA' ? Math.floor(t * 3) % 2 : 1;
    rotulo('VOLTA-CASA', 240, 150, parte ? COR.alerta : COR.ouro, 40);
    if (pisca && txt !== 'VOLTA-CASA') rotulo(txt, 240, 196, parte ? COR.alerta : '#ffffff', 46);
    if (txt === 'VOLTA-CASA' && pisca) rotulo('PARTINDO', 240, 196, COR.alerta, 46);
    if (parte) for (let i = 0; i < 6; i++) A(0.3, () => R(60, 40 + ((t * 80 + i * 32) % 190), 360, 2, COR.alerta));
  },
  gravacao(t, k, p, kf) {
    R(0, 0, PW, PH, '#100d18');
    painel(80, 40, 320, 130);
    rotulo('DIÁRIO DE BORDO · ROVER', 240, 62, '#c9ced9', 20);
    if (p.rec) {
      if (Math.floor(t * 2) % 2) circ(104, 86, 5, COR.alerta);
      rotulo('REC', 140, 86, COR.alerta, 18);
      for (let x = 0; x < 280; x += 3) { const a = Math.sin(x * 0.2 + t * 14) * 16 * hash(Math.floor(x / 7), Math.floor(t * 10)); R(100 + x, 130 - Math.abs(a), 2, Math.abs(a) * 2 + 1, x / 280 < kf ? COR.ciano : '#24414a'); }
    } else rotulo('PRONTO PARA GRAVAR', 240, 120, '#6b6f86', 22);
    // luva apertando o botão
    R(200, 190, 80, 40, '#3a3352'); circ(240, 210, 12, p.rec ? COR.alerta : '#6b2a30');
    const desce = p.rec ? 0 : Math.max(0, Math.sin(t * 3)) * 10;
    R(222, 150 + desce + (p.rec ? 38 : 20), 36, 30, '#e4e6f0'); R(222, 150 + desce + (p.rec ? 38 : 20), 36, 4, '#ff8a3d');
    R(258, 170 + desce + (p.rec ? 38 : 20), 40, 22, '#d8dbe6');
  },
  acampamento(t, k, p, kf) {
    const noite = p.noite !== 0, tp = p.tempestade || 0;
    ceu(noite, tp * 0.7, t); dunas(PH * 0.6, t);
    const chao = PH * 0.82;
    R(0, chao, PW, PH - chao, noite ? '#2e1c18' : '#5a3826');
    barracaFora(120, chao, t, tp);
    rover(330, chao, t, { reboque: true, dir: -1, poeira: tp > 0.7 });
    const ang = p.antena === 'descendo' ? lerp(0, Math.PI / 2 - 0.1, saida(kf)) : p.antena === 'deitada' ? Math.PI / 2 - 0.1 : 0;
    const base = { x: 190, y: chao };
    seg(base, { x: base.x + Math.sin(ang) * 60, y: base.y - Math.cos(ang) * 60 }, 2, '#9aa0b5');
    if (p.antena === 'descendo') { astronauta(205, chao, t, { quem: 'voce', dir: -1, braco: { x: base.x + Math.sin(ang) * 28, y: base.y - Math.cos(ang) * 28 } }); astronauta(150, chao, t, { quem: 'vinny', dir: 1, anda: true }); }
    vento(t, Math.floor(30 + tp * 140), 0.4 + tp);
    if (tp > 0.6) A(tp * 0.35, () => R(0, 0, PW, PH, '#5a3a26'));
  },
  barraca(t, k, p, kf) {
    const luz = p.luz ?? 1, tremor = Math.sin(t * 11) * 1.5;
    R(0, 0, PW, PH, '#120e18');
    g.fillStyle = '#2a2438'; g.beginPath(); g.ellipse(PW / 2 + tremor, PH, 260, 250, 0, Math.PI, 0); g.fill();
    for (let i = -3; i <= 3; i++) { g.strokeStyle = '#3a3352'; g.lineWidth = 2; g.beginPath(); g.ellipse(PW / 2 + tremor, PH, Math.abs(i) * 80 + 20, 250, 0, Math.PI, 0); g.stroke(); }
    // lanterna pendurada (balança com a tempestade)
    const lx = PW / 2 + Math.sin(t * 1.7) * 8, ly = 70;
    seg({ x: PW / 2, y: 22 }, { x: lx, y: ly }, 1, '#6b6f86'); R(lx - 5, ly, 10, 12, '#ffc83d');
    if (luz > 0) A(0.22 * luz, () => circ(lx, ly + 6, 120, '#ffe0a0'));
    if (p.alarme && Math.floor(t * 3) % 2) A(0.35, () => R(0, 0, PW, PH, COR.alerta));
    // VinnY sentado à direita, de frente; "você" à esquerda, de costas (só ombro e capacete)
    const vx = 330, vchao = 230;
    R(vx - 18, vchao - 40, 36, 40, '#d8dbe6'); R(vx - 18, vchao - 30, 36, 4, PESSOA.vinny.faixa);
    R(vx - 14, vchao - 68, 28, 28, '#e4e6f0'); R(vx - 10, vchao - 62, 20, 16, '#2a3050');
    if (luz > 0.3) { R(vx - 6, vchao - 57, 3, 3, '#ffe0c0'); R(vx + 3, vchao - 57, 3, 3, '#ffe0c0'); R(vx - 4, vchao - 51, 8, 2, p.vinny === 'serio' ? '#ffe0c0' : '#ffe0c0'); }
    if (p.vinny !== 'serio' && luz > 0.3) R(vx - 3, vchao - 50, 6, 1, '#2a3050');
    R(60, 170, 90, 100, '#c9ced9'); R(60, 190, 90, 6, PESSOA.voce.faixa); R(70, 120, 70, 60, '#e4e6f0');
    if (p.caderno) { R(150, 200, 60, 40, '#e8dcc0'); for (let i = 0; i < 5; i++) R(156, 206 + i * 6, 30 + hash(i) * 20, 2, '#6b4a2e'); }
    // respiração congelando no visor
    for (let i = 0; i < 3; i++) { const q = (t * 0.6 + i / 3) % 1; A((1 - q) * 0.4, () => R(vx + 10 + q * 14, vchao - 54 - q * 20, 3, 3, '#ffffff')); }
    A(1 - luz * 0.85, () => R(0, 0, PW, PH, '#05040a'));
  },
  item(t, k, p, kf) {
    R(0, 0, PW, PH, '#0f0c17');
    for (let x = 0; x < PW; x += 20) R(x, 0, 1, PH, '#16121f');
    for (let y = 0; y < PH; y += 20) R(0, y, PW, 1, '#16121f');
    const n = p.n || 1, cols = Math.min(n, 7), lin = Math.ceil(n / cols), sx = PW / (cols + 1);
    for (let i = 0; i < n; i++) {
      const sur = clamp(kf * 3 - i * (1.5 / n)), cx = sx * ((i % cols) + 1), cy = 120 + Math.floor(i / cols) * 60 - (lin - 1) * 30;
      if (sur <= 0) continue;
      A(sur, () => icone(p.item, cx, cy + (1 - saida(sur)) * 10, i, t));
    }
    rotulo(p.rotulo || '', 240, 228, COR.ouro, 34);
  },
  alcance(t, k, p, kf) {
    R(0, 0, PW, PH, '#120e10');
    for (let i = 0; i < 40; i++) R(hash(i, 21) * PW, hash(i, 22) * PH, 3, 1, '#2a1c1a');
    const acamp = { x: 240, y: 70 }, base = { x: 240, y: 70 + 180 }, r = 160;
    g.strokeStyle = COR.alerta; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.arc(acamp.x, acamp.y, r * saida(kf * 2), 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    seg(acamp, { x: base.x, y: lerp(acamp.y, base.y, saida(kf * 1.5)) }, 1, '#6b6f86');
    circ(acamp.x, acamp.y, 5, COR.ouro); circ(base.x, base.y, 6, COR.ciano);
    rotulo('VOCÊS', 290, 70, COR.ouro, 18); rotulo('BASE · 45 KM', 330, 250, COR.ciano, 18);
    rotulo('ALCANCE DO RÁDIO · 40 KM', 240, 24, COR.alerta, 20);
  },
  semente(t, k, p, kf) {
    R(0, 0, PW, PH, '#0f0c14');
    A(0.25, () => circ(240, 150, 110, '#ffe0a0'));
    R(200, 170, 80, 60, '#8a4a2a'); R(196, 166, 88, 8, '#a85a32'); R(206, 172, 68, 6, '#3a2418');
    A(0.25, () => { g.fillStyle = '#bff8ff'; g.beginPath(); g.ellipse(240, 166, 46, 70, 0, Math.PI, 0); g.fill(); });
    g.strokeStyle = '#bff8ff'; g.lineWidth = 1; g.beginPath(); g.ellipse(240, 166, 46, 70, 0, Math.PI, 0); g.stroke();
    const cresce = p.broto ? saida(kf * 1.4) : 0;
    if (cresce > 0) { seg({ x: 240, y: 172 }, { x: 240 + Math.sin(t) * 2, y: 172 - 34 * cresce }, 2, COR.ok); if (cresce > 0.6) { R(232, 172 - 34 * cresce, 7, 4, '#6be08a'); R(242, 168 - 34 * cresce, 7, 4, '#6be08a'); } }
    else R(236, 170, 8, 4, '#c9a24a');
    if (p.gota) { const q = (t * 0.7) % 1; R(240, 96 + q * 70, 2, 4, '#8fe6ff'); }
    rotulo('SEMENTE DE BATATA · LACRADA', 240, 40, '#c9ced9', 20);
  },
  chao(t, k, p, kf, c) {
    R(0, 0, PW, PH, '#0c0a12');
    R(0, 70, PW, 10, '#3a3352');                                                    // piso da barraca
    for (let y = 80; y < PH; y += 2) { const c2 = y < 140 ? '#4a2c22' : y < 200 ? '#3a221c' : '#2a1814'; R(0, y, PW, 2, c2); }
    for (let i = 0; i < 70; i++) R(hash(i, 31) * PW, 84 + hash(i, 32) * (PH - 84), 2, 1, '#5e3a2a');
    if (p.tic) {
      const desde = t - c.inicio, q = (desde % 1.6) / 1.6;
      A(1 - q, () => { g.strokeStyle = '#ffc83d'; g.lineWidth = 2; g.beginPath(); g.arc(240, 240, 10 + q * 120, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); });
      if (p.corte) A(0.5 + 0.5 * Math.sin(t * 6), () => R(222, 246, 36, 3, '#c9ced9'));
    }
    rotulo(p.tic ? 'TIC' : '', 240, 40, COR.ouro, 40);
  },
  fato(t, k, p, kf) {
    R(0, 0, PW, PH, '#0d0b16');
    const f = p.fato;
    if (f === 'gps') {
      circ(130, 140, 34, '#2c4fb8'); R(116, 128, 18, 10, '#4ed37a');
      for (let i = 0; i < 8; i++) { const a = t * 0.5 + i * 0.8; R(130 + Math.cos(a) * 60 - 2, 140 + Math.sin(a) * 30 - 2, 4, 4, '#ffffff'); }
      circ(350, 140, 30, '#b5562b'); circ(340, 132, 5, '#8a3a1a');
      g.strokeStyle = '#3a3352'; g.setLineDash([4, 4]); g.beginPath(); g.ellipse(350, 140, 60, 30, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      rotulo('TERRA · 31 SATÉLITES GPS', 130, 210, '#8fe6ff', 18); rotulo('MARTE · 0', 350, 210, COR.alerta, 26);
    } else if (f === 'odometria') {
      const gx = 140; circ(gx, 150, 40, '#1b1530'); for (let i = 0; i < 8; i++) { const a = t * 2 + i * 0.785; seg({ x: gx, y: 150 }, { x: gx + Math.cos(a) * 36, y: 150 + Math.sin(a) * 36 }, 2, '#6b6f86'); }
      rotulo('VOLTAS: ' + String(41230 + Math.floor(t * 3)).padStart(6, '0'), 140, 214, COR.ouro, 18);
      circ(380, 60, 12, '#ffe58a'); seg({ x: 380, y: 76 }, { x: 330, y: 130 }, 1, '#ffe58a');
      g.strokeStyle = COR.ciano; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(250, 240); g.bezierCurveTo(300, 200, 280, 140, 420, 110); g.stroke(); g.setLineDash([]);
      rotulo('ROTA GRAVADA', 360, 230, COR.ciano, 18);
    } else if (f === 'pressao') {
      const barra = (x, h, cor, txt) => { R(x, 220 - h, 50, h, cor); rotulo(txt, x + 25, 240, '#c9ced9', 16); };
      barra(90, 160 * saida(kf * 2), '#2c4fb8', 'TERRA'); barra(180, Math.max(2, 1.6), COR.alerta, 'MARTE · 0,6%');
      R(330, 50, 14, 150, '#e4e6f0'); circ(337, 208, 14, COR.alerta); R(333, 120, 8, 88, COR.alerta);
      for (let i = 0; i < 6; i++) { const q = (t * 0.8 + i / 6) % 1; circ(337 + Math.sin(i * 3 + t * 4) * 6, 200 - q * 80, 2 + q * 2, '#ffd0d0'); }
      rotulo('37 °C = FERVE', 360, 40, COR.alerta, 22);
      if (p.frase) rotulo('A BARRACA TE PROTEGE DO VAZIO', 240, 20, COR.ouro, 20);
    } else if (f === 'poeira') {
      circ(140, 140, 50, '#3a2a22'); for (let i = 0; i < 40; i++) R(100 + hash(i, 41) * 80, 100 + hash(i, 42) * 80, 2, 2, '#c98a5e');
      circ(320, 140, 50, '#2a2622'); for (let i = 0; i < 300; i++) R(280 + hash(i, 43) * 80, 100 + hash(i, 44) * 80, 1, 1, '#e8b48c');
      rotulo('FARINHA', 140, 214, '#c9ced9', 18); rotulo('POEIRA DE MARTE', 320, 214, COR.ouro, 18);
      if (p.robo) { A(0.92, () => R(0, 0, PW, PH, '#0d0b16')); rover(240, 170, t, {}); A(saida(kf), () => { R(212, 150, 60, 24, '#7a5236'); vento(t, 60, 1); }); rotulo('OPPORTUNITY · NASA · 2018', 240, 214, COR.ouro, 22); }
    }
  },
  vazamento(t, k, p, kf) {
    R(0, 0, PW, PH, '#151020');
    R(0, 40, PW, 30, '#2a2438'); for (let x = 0; x < PW; x += 12) R(x, 54, 6, 2, '#4a4466');   // costura do teto
    const fx = 160, fy = 55;
    if (['furo', 'mao', 'fita', 'cai'].includes(p.fase)) { circ(fx, fy, 2, '#000'); for (let i = 0; i < 5; i++) { const q = (t * 2 + i / 5) % 1; A(1 - q, () => R(fx - 2 + Math.sin(i) * 4, fy + q * 30, 2, 4, '#c98a5e')); } }
    if (p.fase === 'fita' || p.fase === 'para') { const n = p.fase === 'para' ? 3 : Math.min(3, Math.floor(kf * 4)); for (let i = 0; i < n; i++) R(fx - 14 - i * 2, fy - 6 + i * 4, 28 + i * 4, 4, '#9aa0b5'); }
    if (p.fase === 'mao') { const gx = fx - 40 + suave(kf) * 40; R(gx - 14, 84, 28, 26, '#e4e6f0'); R(gx - 14, 104, 28, 6, '#ff8a3d'); for (let i = 0; i < 4; i++) R(gx - 14 + i * 7, 70, 6, 16, '#d8dbe6'); if (kf > 0.7) { circ(fx + 60, 150, 30, '#e4e6f0'); circ(fx + 60, 150, 22, '#2a3050'); R(fx + 52, 142, 4, 4, '#8fe6ff'); } }
    // manômetro
    const cx = 360, cy = 170, r = 56;
    circ(cx, cy, r + 4, '#3a3352'); circ(cx, cy, r, '#0a0812');
    for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.8 + i * Math.PI * 0.14; R(cx + Math.cos(a) * (r - 6) - 1, cy + Math.sin(a) * (r - 6) - 1, 2, 2, i > 6 ? COR.ok : '#c9ced9'); }
    const val = p.fase === 'cai' ? lerp(900, 860, kf) : p.fase === 'para' ? 840 : p.fase === 'fita' ? lerp(850, 841, kf) : lerp(860, 850, kf);
    const a = Math.PI * 0.8 + (val - 700) / 300 * Math.PI * 1.4;
    seg({ x: cx, y: cy }, { x: cx + Math.cos(a) * (r - 10), y: cy + Math.sin(a) * (r - 10) }, 2, p.fase === 'para' ? COR.ok : COR.alerta);
    rotulo(Math.round(val) + ' hPa', cx, cy + 34, p.fase === 'para' ? COR.ok : COR.alerta, 18);
    rotulo('PRESSÃO DA BARRACA', cx, 98, '#c9ced9', 16);
  },
  filtro(t, k, p, kf, c) {
    R(0, 0, PW, PH, '#120e18');
    const bate = Math.max(0, Math.sin(t * 7)) * 8;
    R(150, 100 - bate, 60, 90, '#9aa0b5'); for (let y = 108; y < 182; y += 6) R(156, y - bate, 48, 3, '#6b6f86');
    if (bate > 6) for (let i = 0; i < 12; i++) A(0.6, () => R(150 + hash(i, Math.floor(t * 7)) * 60, 190 + hash(i + 3, Math.floor(t * 7)) * 30, 3, 3, '#c98a5e'));
    const vezes = 14 + Math.floor((t - c.plano_ini) / 2.2);
    rotulo('FILTRO · ×' + vezes, 180, 40, COR.ouro, 26);
    if (p.agenda) {
      painel(280, 60, 170, 150, '#0a0c10');
      ['06:00 COMER', '06:40 FILTRO', '07:20 FILTRO', '08:00 CONFERIR', '08:40 FILTRO'].forEach((l, i) => {
        rotulo(l, 365, 80 + i * 26, '#c9ced9', 14); if (kf * 5 > i) R(288, 76 + i * 26, 6, 6, COR.ok);
      });
    }
  },
  estatica(t, k, p, kf) {
    R(0, 0, PW, PH, '#0a0a0e');
    painel(70, 40, 340, 190, '#060608');
    const f = Math.floor(t * 24);
    for (let i = 0; i < 900; i++) R(72 + hash(i, f) * 336, 42 + hash(i + 900, f) * 186, 2, 1, hash(i, f + 1) > 0.5 ? '#5a5a66' : '#2a2a33');
    if (p.fantasma && Math.floor(t * 1.3) % 3 === 0) rotulo('...BATA...', 240, 135, 'rgba(143,230,255,0.55)', 30);
  },
  mapa(t, k, p, kf) {
    R(0, 0, PW, PH, '#1a120e');
    for (let i = 0; i < 12; i++) { g.strokeStyle = '#2a1c16'; g.beginPath(); g.ellipse(hash(i, 51) * PW, hash(i, 52) * PH, 60, 20, hash(i, 53), 0, Math.PI * 2); g.stroke(); }
    const apaga = p.apaga ? saida(kf) : 0;
    A(1 - apaga, () => { for (let i = 0; i < 10; i++) R(240 + i * 8, 240 - i * 16, 4, 2, COR.ouro); circ(240, 245, 5, COR.ciano); });
    rotulo('?', 330, 80, COR.alerta, 60 + apaga * 30);
    A(apaga * 0.6, () => R(0, 0, PW, PH, '#0b0914'));
  },
  pulsos(t, k, p, kf, c) {
    R(0, 0, PW, PH, '#070a08');
    painel(40, 50, 400, 150, '#020604');
    for (let x = 44; x < 436; x += 40) R(x, 52, 1, 146, '#0c2014');
    const mostra = p.n === 3 ? (p.some ? 1 - kf : 1) : 0;
    let x = 60; const y0 = 125;
    if (p.n === 3) for (const grupo of [4, 1, 7]) { for (let i = 0; i < grupo; i++) { A(mostra, () => R(x, y0 - 30, 6, 30, COR.ok)); x += 12; } x += 30; }
    A(0.8, () => R(44, y0, 392, 1, COR.ok));
    if (p.n === 0) for (let i = 0; i < 392; i += 2) R(44 + i, y0 - Math.abs(hash(i, Math.floor(t * 20)) - 0.5) * 10, 1, 2, '#2a6a3a');
    if (p.n === 3 && !p.some) rotulo('4 · 1 · 7', 240, 222, COR.ok, 34);
    if (p.base) { rotulo('BASE: 3 TOQUES', 140, 30, COR.ciano, 16); rotulo('ISTO: 4 · 1 · 7', 340, 30, COR.alerta, 16); }
    if (p.some) A(saida(kf), () => R(0, 0, PW, PH, '#000'));
  },
  dunas(t, k, p, kf) {
    ceu(false, 0.1, t);
    circ(400, 50, 10, '#f0d8b0');
    const z = p.zoom ? 1 + kf * 0.3 : 1;
    dunas(PH * 0.55, t, ['#8a5a3a', '#6e4430'], 140);
    const chao = PH * 0.84;
    R(0, chao, PW, PH - chao, '#7a4a30');
    rover(240 + (z - 1) * 40, chao, t, { reboque: true, dir: -1, poeira: true });
    barracaFora(90, chao, t);
    rotulo('TRILHA: NENHUMA', 400, 240, COR.alerta, 18);
  },
  caminhada(t, k, p, kf) {
    ceu(false, 0.05, t);
    g.fillStyle = '#8a5a3a'; g.beginPath(); g.moveTo(0, PH); g.lineTo(0, 220); g.quadraticCurveTo(300, 60, PW, 80); g.lineTo(PW, PH); g.fill();
    const y = (x) => { const q = x / PW; return (1 - q) * (1 - q) * 220 + 2 * (1 - q) * q * 60 + q * q * 80; };
    const xa = 120 + k * 160, xb = xa - 28;
    for (let x = 30; x < xb - 10; x += 9) R(x, y(x) - 1, 3, 2, '#5e3a2a');
    astronauta(xa, y(xa), t, { quem: 'voce', anda: true, esc: 1.2 }); astronauta(xb, y(xb), t, { quem: 'vinny', anda: true, esc: 1.2, fase: 1 });
    rotulo('600 M · TOPO DA DUNA', 360, 30, '#c9ced9', 18);
  },
  traje(t, k, p, kf) {
    R(0, 0, PW, PH, '#8a5a3a'); dunas(PH * 0.5, t, ['#7a4a30', '#6e4430']);
    A(0.55, () => R(0, 0, PW, PH, '#05040a'));
    g.fillStyle = '#05040a'; g.beginPath(); g.rect(0, 0, PW, PH); g.ellipse(240, 140, 220, 120, 0, 0, Math.PI * 2); g.fill('evenodd');   // borda do visor
    const pct = p.pct || 12, alerta = Math.floor(t * 3) % 2;
    painel(150, 190, 180, 28, '#100608');
    R(154, 196, 172 * pct / 100, 16, alerta ? COR.alerta : '#7a2a30');
    rotulo('O2 DO TRAJE · ' + pct + '%', 240, 172, COR.alerta, 22);
    if (p.valvula) { circ(380, 110, 18, '#3a3352'); seg({ x: 380, y: 110 }, { x: 380 + Math.cos(t) * 14, y: 110 - 8 }, 3, COR.ouro); rotulo('VÁLVULA MEIO ABERTA', 380, 70, COR.ouro, 14); }
  },
  topo(t, k, p, kf) {
    ceu(false, 0.05, t);
    const olha = p.olha ? saida(kf) : 0, desce = olha * 80;
    dunas(PH * 0.5 - desce, t, ['#8a5a3a', '#6e4430'], 300);
    const chao = PH * 0.8 - desce;
    if (p.olha) { R(0, chao + 40, PW, PH, '#7a4a30'); rover(260, chao + 120, t, { reboque: true, dir: -1, farol: true }); barracaFora(150, chao + 120, t); }
    astronauta(70, PH - 6, t, { quem: 'vinny', esc: 1.8, dir: 1 });
  },
  partindo(t, k, p, kf) {
    ceu(false, 0.05, t); dunas(PH * 0.56, t, ['#8a5a3a', '#6e4430']);
    const chao = PH * 0.84;
    R(0, chao, PW, PH - chao, '#7a4a30');
    const longe = p.longe ? 1 : 0, rx = lerp(220, 420, k) + longe * 30;
    const esc = 1 - longe * 0.35 * kf;
    g.save(); g.translate(rx, chao); g.scale(esc, esc); rover(0, 0, t, { reboque: true, dir: 1, anda: true, caixas: true }); g.restore();
    for (let i = 0; i < 6; i++) { const q = (t * 2 + i / 6) % 1; A(0.5 * (1 - q), () => R(rx - 70 - q * 30, chao - 4 - q * 10, 4, 4, '#c98a5e')); }
    for (let x = 0; x < rx - 70; x += 6) R(x, chao + 2, 3, 1, '#5e3a2a');
    if (!p.longe) { astronauta(lerp(40, 120, k), chao, t, { quem: 'voce', anda: true, esc: 1.3 }); astronauta(lerp(10, 80, k), chao, t, { quem: 'vinny', anda: true, esc: 1.3, fase: 2 }); }
    else { astronauta(150, chao, t, { quem: 'voce', esc: 1.3 }); astronauta(120, chao, t, { quem: 'vinny', esc: 1.3 }); }
  },
  marcas(t, k, p, kf) {
    R(0, 0, PW, PH, '#7a4a30');
    for (let i = 0; i < 80; i++) R(hash(i, 61) * PW, hash(i, 62) * PH, 3, 2, '#6e4028');
    for (let i = 0; i < 9; i++) { const x = 40 + i * 50, y = 150 + (i % 2) * 30; R(x, y, 10, 18, '#5a3420'); R(x + 2, y + 2, 6, 3, '#4a2a18'); }   // pegadas
    const rev = p.revela ? (p.revela === 1 ? Math.max(saida(kf * 1.5), 0.3) : 0) : 0;
    if (rev > 0) for (let i = 0; i < 60 * rev; i++) { const x = i * 8, y = 165 + ((i % 2) ? -14 : 14); A(0.95, () => { R(x, y - 3, 6, 6, '#3a1c12'); R(x, y + 18, 6, 6, '#3a1c12'); }); }
    if (p.norte) { rotulo('NORTE', 430, 40, COR.ouro, 30); A(0.5 + 0.5 * Math.sin(t * 4), () => seg({ x: 380, y: 140 }, { x: 460, y: 70 }, 3, COR.ouro)); }
  },
  pergunta(t, k, p, kf, c) {
    R(0, 0, PW, PH, '#07060c');
    const fimFala = c.palavras.length ? c.palavras[c.palavras.length - 1].f : c.inicio + 3;
    const mostra = clamp((t - fimFala + 0.3) / 0.6);
    POS.push(() => {
      ctx.globalAlpha = mostra;
      for (const [x, cor, txt] of [[W * 0.29, COR.ouro, 'SEGUIR AS MARCAS'], [W * 0.71, COR.ciano, 'ESPERAR O RESGATE']]) {
        ctx.fillStyle = '#14101f'; ctx.fillRect(x - 320, 380, 640, 220); ctx.fillStyle = cor; ctx.fillRect(x - 320, 380, 640, 8); ctx.fillRect(x - 320, 592, 640, 8);
        T(txt, x, 490, 36, cor, { maxW: 580 });
      }
      T('OU', W / 2, 490, 44, '#ffffff');
      ctx.globalAlpha = clamp((t - fimFala - 1.2) / 0.8);
      T('EXPEDIÇÃO NORTE · PARTE 1', W / 2, 820, 34, '#9aa0b5');
      ctx.globalAlpha = 1;
    });
  },
};

function icone(tipo, x, y, i, t) {
  if (tipo === 'cilindro') { R(x - 9, y - 30, 18, 52, '#e4e6f0'); R(x - 9, y - 30, 18, 4, '#ffffff'); R(x - 4, y - 38, 8, 8, '#6b6f86'); R(x - 9, y - 8, 18, 8, COR.ciano); }
  else if (tipo === 'agua') { R(x - 8, y - 22, 16, 36, '#2c6fb8'); R(x - 4, y - 28, 8, 6, '#9aa0b5'); R(x - 6, y - 8, 12, 6, '#8fe6ff'); }
  else if (tipo === 'racao') { R(x - 10, y - 14, 20, 26, '#8a6a42'); R(x - 10, y - 14, 20, 4, '#b8913f'); }
  else if (tipo === 'bateria') { R(x - 30, y - 20, 60, 40, '#2a2140'); R(x - 26, y - 16, 52 * (0.75 - 0.15 * Math.sin(t * 0.3)), 32, COR.ok); R(x + 30, y - 6, 6, 12, '#6b6f86'); }
  else if (tipo === 'diversos') {
    if (i === 0) { R(x - 14, y - 14, 28, 24, '#b8913f'); R(x - 14, y - 6, 28, 2, '#6b4a2e'); }
    if (i === 1) { for (let r = 6; r < 18; r += 4) { g.strokeStyle = '#e2603b'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); } }
    if (i === 2) { R(x - 2, y - 20, 4, 34, '#9aa0b5'); if (Math.floor(t * 2) % 2) R(x - 4, y - 26, 8, 8, COR.alerta); }
    if (i === 3) { circ(x, y, 14, '#9aa0b5'); circ(x, y, 6, '#0f0c17'); }
  }
}

// ---------------------------------------------------------------- tela cheia: relógio, medidores e legenda
function hud(c) {
  if (c.cena === 'pergunta') return;
  ctx.fillStyle = 'rgba(8,6,14,0.78)'; ctx.fillRect(40, 36, 470, 74); ctx.fillStyle = COR.ouro; ctx.fillRect(40, 36, 8, 74);
  T(c.relogio || '', 70, 74, 30, '#ffffff', { al: 'left', borda: false });
  const h = c.hud || {};
  ctx.fillStyle = 'rgba(8,6,14,0.78)'; ctx.fillRect(W - 700, 36, 660, 74);
  T('O2 ' + (h.o2 || '—'), W - 672, 74, 20, COR.ciano, { al: 'left', borda: false });
  T((h.temp != null ? h.temp + '°C' : ''), W - 380, 74, 20, '#c9ced9', { al: 'left', borda: false });
  const s = h.sinal ?? 0;
  T(s ? 'SINAL OK' : 'SEM SINAL', W - 64, 74, 20, s ? COR.ok : COR.alerta, { al: 'right', borda: false });
}
function legenda(c, t) {
  const ws = c.palavras || [];
  if (!ws.length) return;
  // blocos de até 3 palavras; quebra também na pontuação
  const blocos = []; let atual = [];
  ws.forEach((w, i) => { atual.push(w); if (atual.length >= 3 || /[.,!?:]$/.test(w.p) || i === ws.length - 1) { blocos.push(atual); atual = []; } });
  const b = blocos.find((bl, i) => t >= bl[0].i - 0.05 && t < (blocos[i + 1] ? blocos[i + 1][0].i - 0.05 : bl[bl.length - 1].f + 0.5));
  if (!b) return;
  const txt = b.map((w) => w.p).join(' ').toUpperCase().replace(/[.,]$/, '');
  T(txt, W / 2, H - 92, 60, '#ffffff', { maxW: W - 200 });
}

// ---------------------------------------------------------------- quadro
function cenaEm(t) {
  const cs = LT.cenas;
  let lo = 0, hi = cs.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cs[m].inicio <= t) lo = m; else hi = m - 1; }
  return cs[lo];
}
function desenhar(t) {
  const c = cenaEm(t);
  const k = clamp((t - c.plano_ini) / Math.max(0.1, c.plano_fim - c.plano_ini));
  const kf = clamp((t - c.inicio) / Math.max(0.1, c.fim - c.inicio));
  POS = [];
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  (CENAS[c.cena] || CENAS.estatica)(t, k, c.p || {}, kf, c);
  // câmera: zoom lento no plano (tensão) e corte seco com respiro de preto entre planos
  const z = 1 + 0.06 * k, zw = W * z, zh = H * z;
  ctx.fillStyle = COR.fundo; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(px, 0, 0, PW, PH, (W - zw) / 2, (H - zh) / 2, zw, zh);
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  for (const f of POS) f();
  hud(c);
  legenda(c, t);
  const entra = clamp((t - c.plano_ini) / 0.25), sai = clamp((c.plano_fim - t) / 0.2);
  const escuro = 1 - Math.min(entra, t > LT.duracao - 2 ? clamp((LT.duracao - t) / 2) : 1, sai < 1 && c.plano_fim < LT.duracao - 0.1 ? Math.max(sai, 0.4) : 1);
  if (escuro > 0) { ctx.fillStyle = `rgba(0,0,0,${escuro})`; ctx.fillRect(0, 0, W, H); }
}
function quadro(i) { desenhar(i / LT.fps); return tela.toDataURL('image/jpeg', 0.9); }
function carregar(lt) { LT = lt; return { quadros: Math.ceil(lt.duracao * lt.fps) }; }

window.desenhar = desenhar; window.quadro = quadro; window.carregar = carregar;
document.fonts.load(`20px ${FONTE}`).then(() => { window.pronto = true; }, () => { window.pronto = true; });
