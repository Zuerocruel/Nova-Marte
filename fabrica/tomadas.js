// Operação Marte Zero · TOMADAS: cortes cinematográficos no meio do episódio (carregado DEPOIS do diretor.js).
//
// O episódio deixa de ser só o mapa visto de cima: em momentos-chave a câmera CORTA para cenas vistas de lado,
// em pixel art grande (tela interna TW x TH ampliada 4x), e volta para o mapa.
//   problema → close no MONITOR da colônia (a leitura piorando) → SALA com alarme vermelho girando
//   solução  → o herói grande, de lado, consertando o OBJETO do problema → CLOSE do objeto ficando verde
//   missão   → a OBRA vista de lado, subindo, com soldador no topo e o rover passando
// O objeto, a sala, a ferramenta e o enquadramento mudam com o tipo do problema e variam entre episódios.
// A narração (texto grande) continua por cima de tudo.

const TW = 270, TH = 480, TE = 4;
const tcv = document.createElement('canvas'); tcv.width = TW; tcv.height = TH;
const tx = tcv.getContext('2d');
tx.imageSmoothingEnabled = false;
let TOMADAS = [];

const R = (x, y, w, h, c) => { tx.fillStyle = c; tx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const hashT = (a, b = 0) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
const variante = (n, sal = 0) => Math.floor(hashT(EP.numero * 7 + sal, n) * n);

// leitura que aparece no monitor, por tipo de problema
const LEITURAS = {
  oxigenio: { rot: 'CO2 NO AR', un: '%', de: 0.4, para: 4.8, ruim: 'ALERTA: AR PESADO' },
  agua: { rot: 'PRESSÃO DA ÁGUA', un: ' BAR', de: 3.2, para: 0.3, ruim: 'ALERTA: VAZAMENTO' },
  manutencao: { rot: 'CARGA DO SISTEMA', un: '%', de: 96, para: 12, ruim: 'FALHA NO EQUIPAMENTO' },
  clima: { rot: 'VENTO LÁ FORA', un: ' KM/H', de: 20, para: 140, ruim: 'TEMPESTADE CHEGANDO' },
  saude: { rot: 'SINAIS VITAIS', un: ' BPM', de: 72, para: 128, ruim: 'ATENÇÃO MÉDICA' },
  ataque: { rot: 'MOVIMENTO NO SENSOR', un: '', de: 0, para: 37, ruim: 'INVASORES!' },
  descoberta: { rot: 'SINAL DESCONHECIDO', un: ' HZ', de: 0, para: 412, ruim: 'O QUE É ISSO?' },
};
const leitura = () => LEITURAS[(EP.problema || {}).categoria] || LEITURAS.manutencao;

// ------------------------------------------------------------------ cenário: sala vista de lado
const PAREDES = [['#3a3f5c', '#30344d'], ['#4a3f5c', '#3c3350'], ['#2f4552', '#273a45']];
function sala(t, o = {}) {
  const [pa, pb] = PAREDES[variante(3, 1)], chao = TH * 0.57, noite = !!o.noite;
  R(0, 0, TW, chao, pa);
  for (let x = 0; x < TW; x += 54) { R(x, 0, 2, chao, pb); for (let y = 10; y < chao; y += 40) { R(x + 6, y, 2, 2, '#5b6282'); R(x + 46, y, 2, 2, '#5b6282'); } }   // chapas rebitadas
  R(0, 26, TW, 4, pb);
  if (o.janela !== false) {   // janela com Marte lá fora
    const jx = variante(2, 2) ? 24 : TW - 104, jy = 50, jw = 80, jh = 62;
    R(jx - 4, jy - 4, jw + 8, jh + 8, '#1b1530');
    const g = tx.createLinearGradient(0, jy, 0, jy + jh);
    if (noite) { g.addColorStop(0, '#0d0a1c'); g.addColorStop(1, '#3a2342'); } else { g.addColorStop(0, '#c97a52'); g.addColorStop(1, '#efc49a'); }
    tx.fillStyle = g; tx.fillRect(jx, jy, jw, jh);
    if (noite) for (let i = 0; i < 12; i++) R(jx + hashT(i, 4) * jw, jy + hashT(i, 5) * jh * 0.6, 1, 1, '#ffffff');
    tx.fillStyle = noite ? '#2a1a30' : '#b85a37';
    tx.beginPath(); tx.moveTo(jx, jy + jh);
    for (let x = 0; x <= jw; x += 4) tx.lineTo(jx + x, jy + jh * 0.7 - Math.sin(x * 0.08 + 1) * 6 - Math.sin(x * 0.21) * 3);
    tx.lineTo(jx + jw, jy + jh); tx.fill();
    R(jx + jw / 2 - 1, jy, 2, jh, '#1b1530');
  }
  // chão de ladrilho + rodapé
  R(0, chao, TW, TH - chao, '#262a3d');
  for (let y = chao; y < TH; y += 18) for (let x = (y / 18) % 2 ? 0 : 18; x < TW; x += 36) R(x, y, 18, 18, '#2c3047');
  R(0, chao - 4, TW, 4, '#1b1530');
  // luz do teto
  R(TW / 2 - 30, 0, 60, 6, o.vermelho ? '#7a2a2a' : '#c9ced9');
  if (!o.vermelho) {
    const g = tx.createLinearGradient(0, 6, 0, chao);
    g.addColorStop(0, 'rgba(255,246,208,0.18)'); g.addColorStop(1, 'rgba(255,246,208,0)');
    tx.fillStyle = g; tx.beginPath(); tx.moveTo(TW / 2 - 30, 6); tx.lineTo(TW / 2 + 30, 6); tx.lineTo(TW / 2 + 90, chao); tx.lineTo(TW / 2 - 90, chao); tx.fill();
  }
  return chao;
}
// ------------------------------------------------------------------ objetos do problema (ok: 0 quebrado → 1 consertado)
function objeto(cat, cx, base, esc, t, ok) {
  const S = (x, y, w, h, c) => R(cx + x * esc, base - y * esc - h * esc, w * esc, h * esc, c);
  const bom = ok > 0.85, piscaRuim = Math.floor(t * 4) % 2;
  if (cat === 'oxigenio') {   // purificador de CO2 com 3 cartuchos e manômetro
    S(-14, 0, 28, 30, '#9aa0b5'); S(-13, 1, 26, 28, '#c9ced9'); S(-14, 30, 28, 3, '#6b6f86');
    for (let i = 0; i < 3; i++) { const limpo = ok > (i + 1) / 3.2; S(-11 + i * 8, 6, 6, 18, limpo ? '#eef0f8' : '#6b4a2e'); S(-11 + i * 8, 20, 6, 2, limpo ? COR.agua : '#3a2a1a'); }
    S(-4, 34, 8, 8, '#1b1530'); S(-3, 35, 6, 6, bom ? COR.ok : (piscaRuim ? COR.alerta : '#7a2a2a'));
    for (let i = 0; i < 8; i++) {   // ar: marrom e pesado → bolhas limpas
      const q = (t * 0.5 + i / 8) % 1;
      tx.globalAlpha = (1 - q) * 0.8;
      S(-16 + (i * 5) % 32 + Math.sin(t + i) * 2, 34 + q * 30, 2, 2, ok > 0.5 ? '#bff8ff' : '#8a6a52');
    }
    tx.globalAlpha = 1;
  } else if (cat === 'agua') {   // cano com rachadura e manômetro
    S(-34, 10, 68, 8, '#9aa0b5'); S(-34, 16, 68, 2, '#c9ced9'); S(-36, 6, 4, 16, '#6b6f86'); S(32, 6, 4, 16, '#6b6f86');
    if (ok < 0.6) { S(-2, 12, 4, 4, '#1b1530'); for (let i = 0; i < 3; i++) { const q = (t * 1.6 + i / 3) % 1; S(-1, 9 - q * 9, 2, 2, COR.agua); } }
    else S(-6, 9, 12, 10, '#e2603b');                                                                       // remendo
    S(10, 18, 10, 10, '#1b1530'); S(11, 19, 8, 8, '#eef0f8');
    const a = lerp(-2.2, 0.6, ok) + (bom ? 0 : Math.sin(t * 9) * 0.1);
    tx.strokeStyle = COR.alerta; tx.lineWidth = 1.5; tx.beginPath(); tx.moveTo(cx + 15 * esc, base - 23 * esc); tx.lineTo(cx + 15 * esc + Math.cos(a) * 3.5 * esc, base - 23 * esc + Math.sin(a) * 3.5 * esc); tx.stroke();
  } else if (cat === 'saude') {   // maca + monitor cardíaco
    S(-30, 8, 50, 4, '#eef0f8'); S(-28, 0, 3, 8, '#6b6f86'); S(16, 0, 3, 8, '#6b6f86'); S(-30, 12, 12, 4, '#c9ced9');
    S(24, 14, 18, 14, '#1b1530'); S(25, 15, 16, 12, '#0f2a1f');
    tx.strokeStyle = bom ? COR.ok : COR.alerta; tx.lineWidth = 1; tx.beginPath();
    for (let x = 0; x < 16; x++) { const k = (x + t * 20) % 16, y = Math.abs(k - 8) < 1 ? (bom ? 4 : 5) : 0; tx.lineTo(cx + (25 + x) * esc, base - (21 + y) * esc); }
    tx.stroke();
  } else if (cat === 'clima') {   // painel/janela coberto de poeira ou gelo sendo limpo
    S(-28, 6, 56, 34, '#6b6f86'); S(-26, 8, 52, 30, '#22357a');
    for (let i = 0; i < 4; i++) S(-26 + i * 13, 8, 1, 30, '#4766c8');
    const sujo = 1 - ok;
    tx.globalAlpha = sujo; S(-26, 8, 52, 30, EP.estacao && EP.estacao.id === 'inverno' ? '#dff3ff' : '#c98a5e'); tx.globalAlpha = 1;
    S(-2, 0, 4, 6, '#6b6f86');
  } else if (cat === 'ataque') {   // armadilha de luz + bichinho
    S(-10, 0, 20, 6, '#3a2f63'); S(-2, 6, 4, 14, '#9aa0b5');
    if (ok > 0.5) { tx.globalAlpha = 0.5; S(-14, 20, 28, 10, '#fff4c2'); tx.globalAlpha = 1; }
    const fuga = ok * 60;
    for (let i = 0; i < 3; i++) S(14 + fuga + i * 8, 1 + Math.abs(Math.sin(t * 12 + i)) * 2, 6, 3, '#8f4129');
  } else if (cat === 'descoberta') {   // microscópio com amostra brilhando
    S(-12, 0, 24, 4, '#6b6f86'); S(-4, 4, 6, 22, '#c9ced9'); S(-8, 24, 14, 6, '#9aa0b5'); S(-10, 12, 20, 2, '#6b6f86');
    S(-3, 14, 6, 3, '#8fe6ff');
    tx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 5); S(-8, 12, 16, 8, '#8fe6ff'); tx.globalAlpha = 1;
  } else {   // manutenção: banco de baterias com barras de carga
    S(-30, 0, 60, 34, '#3a2f63'); S(-28, 2, 56, 30, '#2a2140');
    for (let i = 0; i < 4; i++) {
      S(-25 + i * 14, 5, 10, 24, '#1b1530');
      const n = Math.round(lerp(1, 6, ok));
      for (let j = 0; j < 6; j++) S(-24 + i * 14, 6 + j * 4, 8, 3, j < n ? (bom ? COR.ok : (n < 3 ? COR.alerta : COR.ouro)) : '#2a2140');
    }
    S(-6, 34, 12, 4, '#9aa0b5');
  }
}

// ------------------------------------------------------------------ cada tomada
function tomadaMonitor(t, k) {   // close no monitor: a leitura piorando, gráfico subindo, texto de alerta piscando
  const L = leitura(), q = saida(clamp(k / 0.8));
  R(0, 0, TW, TH, '#141225');
  R(20, 80, TW - 40, 210, '#c9ced9'); R(26, 86, TW - 52, 198, '#0a1a14');
  for (let y = 86; y < 284; y += 3) R(26, y, TW - 52, 1, '#0d2219');                                         // linhas da tela
  tx.strokeStyle = q > 0.6 ? COR.alerta : COR.ok; tx.lineWidth = 2; tx.beginPath();
  for (let i = 0; i <= 40; i++) {   // gráfico
    const kk = i / 40; if (kk > q) break;
    const v = lerp(0.1, 0.85, Math.pow(kk, 2)) + Math.sin(i * 1.7) * 0.03;
    tx.lineTo(34 + kk * (TW - 68), 270 - v * 110);
  }
  tx.stroke();
  R(TW / 2 - 40, 290, 80, 18, '#9aa0b5'); R(TW / 2 - 70, 308, 140, 6, '#6b6f86');
  R(40, 330, TW - 80, 40, '#2a2140'); for (let i = 0; i < 24; i++) R(46 + (i % 12) * 15, 336 + Math.floor(i / 12) * 14, 12, 10, '#3a2f63');   // teclado
  if (Math.floor(t * 2) % 2) R(TW - 46, 92, 8, 8, COR.alerta);
  return () => {   // texto por cima, na resolução cheia
    const v = lerp(L.de, L.para, q);
    texto(`● REC ${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')}`, 140, 372, 24, COR.alerta, { alinhar: 'left', contorno: false });
    texto(L.rot, W / 2, 440, 34, '#8fffc0', { contorno: false });
    texto(`${v.toFixed(Math.abs(L.para) < 10 ? 1 : 0).replace('.', ',')}${L.un}`, W / 2, 520, 72, q > 0.6 ? COR.alerta : '#8fffc0', { contorno: false });
    if (q > 0.7 && Math.floor(t * 3) % 2) texto(L.ruim, W / 2, 640, 30, COR.alerta, { contorno: false });
  };
}

// ------------------------------------------------------------------ ATOR: colono articulado (de lado), nas cores dele
// Corpo montado peça a peça em pixels (cabeça, tronco, mochila, braços com cotovelo, pernas com joelho, botas),
// com as cores tiradas do sprite do próprio colono (pele, cabelo/chapéu, roupa, calça). Os braços usam IK de dois
// ossos: a mão vai até o ponto que a ação pede (a peça, o cano, a bateria) e o cotovelo dobra sozinho.
const FUNDADOR_PAL = {
  vega: { pele: '#e0ac7e', cabelo: '#eef0f8', roupa: '#e2603b', calca: '#a83d22', chapeu: true },
  lia: { pele: '#e0ac7e', cabelo: '#9b59b6', roupa: '#00b8a9', calca: '#00796b', chapeu: false },
};
function paletaDe(seed) {
  const g = gerarSprite(seed);
  return { pele: g[3][3] || '#e0ac7e', cabelo: g[1][4] || '#5a3825', roupa: g[7][4] || '#3f8efc', calca: g[9][4] || '#3a2f63', chapeu: !!g[0][4] };
}
function pessoaT(c) { return { nome: c.nome, pal: paletaDe(c.seed) }; }
function heroiDaTomada() {
  const p = EP.problema || {};
  const c = p.heroi_codigo && colonoPorCodigo.get(p.heroi_codigo);
  if (c) return pessoaT(c);
  const f = EP.mundo.fundadores.find((x) => p.heroi && (x.curto === p.heroi || x.nome === p.heroi)) || EP.mundo.fundadores[0];
  return { nome: f.curto || f.nome, pal: FUNDADOR_PAL[f.id] || FUNDADOR_PAL.vega };
}
function colonoQualquer(i) {
  const cs = EP.mundo.colonos;
  if (!cs.length) return heroiDaTomada();
  return pessoaT(cs[(EP.numero * 3 + i * 5) % cs.length]);
}
const escurece = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.round(v * k); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };

function seg(a, b, w, cor) {   // "osso" pixelado de a até b (carimbos quadrados, sem borrar)
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let i = 0; i <= n; i++) R(a.x + (b.x - a.x) * (i / n) - w / 2, a.y + (b.y - a.y) * (i / n) - w / 2, w, w, cor);
}
function ik(o, alvo, L1, L2, dobra) {   // cotovelo/joelho para a mão/pé chegar no alvo
  let dx = alvo.x - o.x, dy = alvo.y - o.y, d = Math.hypot(dx, dy);
  const max = L1 + L2 - 0.01;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  const a = Math.atan2(dy, dx), b = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const ang = a + dobra * b;
  const meio = { x: o.x + Math.cos(ang) * L1, y: o.y + Math.sin(ang) * L1 };
  return { meio, fim: { x: o.x + dx, y: o.y + dy } };
}

/**
 * Desenha o colono de lado. P: { x, chao, dir (1 olha p/ direita), pulo, agacha (0..1), anda (fase ou null),
 * maoF / maoT (alvo absoluto da mão da frente / de trás ou null), cabeca (inclinação em px), susto, alegre, fala }
 * Devolve as mãos e a cabeça (para pôr ferramenta e etiqueta).
 */
function ator(pal, P, t, E = 3) {
  const d = P.dir || 1, ag = P.agacha || 0;
  const quadril = { x: P.x, y: P.chao - (8 - ag * 3.6) * E - (P.pulo || 0) };
  const resp = Math.round(Math.sin(t * 2.2 + P.x) * 0.6);
  const ombro = { x: P.x + d * (ag * 1.2) * E, y: quadril.y - 6.4 * E + resp };
  const pernas = [];
  for (const s of [-1, 1]) {   // s = 1: perna da frente
    let pe;
    if (P.anda != null) {
      const ph = P.anda + (s > 0 ? 0 : Math.PI), passo = Math.sin(ph);
      pe = { x: quadril.x + d * passo * 3 * E, y: P.chao - Math.max(0, Math.cos(ph)) * 1.6 * E - (P.pulo || 0) };
    } else if (ag > 0.3) pe = s > 0 ? { x: quadril.x + d * 3.4 * E, y: P.chao } : { x: quadril.x - d * 2.6 * E, y: P.chao };
    else pe = { x: quadril.x + d * s * 0.9 * E, y: P.chao - (P.pulo || 0) };
    const j = ik(quadril, pe, 4 * E, 4 * E, s > 0 ? -d : -d);
    pernas.push({ s, j, pe });
  }
  const braco = (alvo, frente) => {
    const sw = P.anda != null ? Math.sin(P.anda + (frente ? Math.PI : 0)) * 2.2 * E : Math.sin(t * 1.6 + (frente ? 0 : 1)) * 0.4 * E;
    const a = alvo || { x: ombro.x + sw * d, y: ombro.y + 6.6 * E };
    return ik({ x: ombro.x + (frente ? d * 0.6 * E : -d * 0.6 * E), y: ombro.y }, a, 3.5 * E, 3.5 * E, d);
  };
  const bT = braco(P.maoT, false), bF = braco(P.maoF, true);
  const roupaEsc = escurece(pal.roupa, 0.72), calcaEsc = escurece(pal.calca, 0.7);
  // sombra
  tx.globalAlpha = 0.3; R(P.x - 5 * E, P.chao - 1, 10 * E, 2, '#000'); tx.globalAlpha = 1;
  // braço e perna de trás (mais escuros)
  seg({ x: ombro.x - d * 0.6 * E, y: ombro.y }, bT.meio, 1.8 * E, roupaEsc); seg(bT.meio, bT.fim, 1.6 * E, roupaEsc);
  R(bT.fim.x - 0.9 * E, bT.fim.y - 0.9 * E, 1.8 * E, 1.8 * E, '#9aa0b5');
  const pT = pernas[0];
  seg(quadril, pT.j.meio, 2 * E, calcaEsc); seg(pT.j.meio, pT.j.fim, 1.9 * E, calcaEsc);
  R(pT.j.fim.x - d * 0.6 * E - 1.1 * E, pT.j.fim.y - 1.2 * E, 2.6 * E, 1.3 * E, '#2a2140');
  // mochila de oxigênio
  R(ombro.x - d * 4.2 * E - (d < 0 ? -1.6 * E : 0), ombro.y + 0.6 * E, 1.6 * E, 4.6 * E, '#9aa0b5');
  R(ombro.x - d * 4.2 * E - (d < 0 ? -1.6 * E : 0), ombro.y + 0.6 * E, 1.6 * E, 0.8 * E, '#c9ced9');
  // tronco
  const tx0 = Math.min(ombro.x, quadril.x) - 2.8 * E;
  tx.fillStyle = pal.roupa;
  tx.beginPath(); tx.moveTo(ombro.x - 2.8 * E, ombro.y); tx.lineTo(ombro.x + 2.8 * E, ombro.y); tx.lineTo(quadril.x + 2.6 * E, quadril.y); tx.lineTo(quadril.x - 2.6 * E, quadril.y); tx.fill();
  R(quadril.x - 2.6 * E, quadril.y - 1 * E, 5.2 * E, 1 * E, '#2a2140');                                      // cinto
  R(quadril.x + d * 0.4 * E, quadril.y - 1 * E, 1 * E, 1 * E, '#ffc83d');                                    // fivela
  R(ombro.x + d * 0.8 * E - 0.6 * E, ombro.y + 1.4 * E, 1.4 * E, 1 * E, '#eef0f8');                           // emblema
  void tx0;
  // perna da frente
  const pF = pernas[1];
  seg(quadril, pF.j.meio, 2.1 * E, pal.calca); seg(pF.j.meio, pF.j.fim, 2 * E, pal.calca);
  R(pF.j.fim.x - d * 0.6 * E - 1.1 * E, pF.j.fim.y - 1.2 * E, 2.7 * E, 1.3 * E, '#3a2f63');
  // cabeça
  const cab = { x: ombro.x + d * 0.4 * E + (P.cabeca || 0) * d * 0.3, y: ombro.y - 6.6 * E + (P.cabeca || 0) * 0.4 };
  R(cab.x - 3.2 * E, cab.y, 6.4 * E, 6 * E, pal.pele);
  if (pal.chapeu) { R(cab.x - 3.4 * E, cab.y - 0.8 * E, 6.8 * E, 2 * E, pal.cabelo); R(cab.x - 3.6 * E + d * 1.6 * E, cab.y + 0.8 * E, 5.2 * E, 0.8 * E, pal.cabelo); }
  else { R(cab.x - 3.2 * E, cab.y - 0.6 * E, 6.4 * E, 1.8 * E, pal.cabelo); R(cab.x - d * 3.2 * E - (d > 0 ? 0 : -1.2 * E), cab.y, 1.2 * E, 3.6 * E, pal.cabelo); }
  const pisca = (t + P.x * 0.13) % 3.1 < 0.12;
  const olhoX = cab.x + d * 1.4 * E - 0.5 * E, olhoY = cab.y + 2.4 * E;
  if (P.susto) { R(olhoX - 0.2 * E, olhoY - 0.4 * E, 1.4 * E, 1.6 * E, '#ffffff'); R(olhoX + 0.2 * E, olhoY, 0.8 * E, 0.8 * E, '#1b1530'); R(cab.x + d * 1.6 * E - 0.6 * E, cab.y + 4.4 * E, 1.4 * E, 1.2 * E, '#1b1530'); }
  else {
    R(olhoX, olhoY + (pisca ? 0.5 * E : 0), 1 * E, pisca ? 0.3 * E : 1 * E, '#1b1530');
    if (P.alegre) R(cab.x + d * 1 * E - 0.8 * E, cab.y + 4.4 * E, 2 * E, 0.6 * E, '#1b1530');
  }
  R(cab.x - d * 0.6 * E - 0.5 * E, cab.y + 2.6 * E, 1 * E, 1.4 * E, escurece(pal.pele, 0.85));               // orelha
  // braço da frente por cima de tudo
  seg({ x: ombro.x + d * 0.6 * E, y: ombro.y }, bF.meio, 1.9 * E, pal.roupa); seg(bF.meio, bF.fim, 1.7 * E, pal.roupa);
  R(bF.fim.x - 1 * E, bF.fim.y - 1 * E, 2 * E, 2 * E, '#c9ced9');                                            // luva
  return { maoF: bF.fim, cotF: bF.meio, maoT: bT.fim, cab: { x: cab.x, y: cab.y } };
}

// ferramenta na mão (alinhada com o antebraço)
function ferramentaT(tipo, mao, cot, t, E = 3) {
  const dx = mao.x - cot.x, dy = mao.y - cot.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const P = (k, j = 0) => ({ x: mao.x + ux * k * E - uy * j * E, y: mao.y + uy * k * E + ux * j * E });
  if (tipo === 'macarico') {
    seg(P(0), P(4), 1.4 * E, '#4a4466'); seg(P(4), P(5), 1 * E, '#9aa0b5');
    const ch = P(6.2 + Math.sin(t * 40) * 0.4);
    tx.globalCompositeOperation = 'lighter';
    const g = tx.createRadialGradient(ch.x, ch.y, 0, ch.x, ch.y, 9 * E);
    g.addColorStop(0, 'rgba(190,240,255,0.9)'); g.addColorStop(1, 'rgba(120,180,255,0)');
    tx.fillStyle = g; tx.fillRect(ch.x - 9 * E, ch.y - 9 * E, 18 * E, 18 * E);
    tx.globalCompositeOperation = 'source-over';
    R(ch.x - 1, ch.y - 1, 3, 3, '#ffffff');
    const f = Math.floor(t * 14);
    for (let i = 0; i < 8; i++) { const q = hashT(i, f); R(ch.x + (q - 0.5) * 14 * E, ch.y + hashT(i + 3, f) * 8 * E, 2, 2, i % 2 ? COR.ouro : '#ffffff'); }
  } else if (tipo === 'chave') {
    seg(P(-0.5), P(4), 1.1 * E, '#c9ced9'); R(P(4.4).x - 1.2 * E, P(4.4).y - 1.2 * E, 2.4 * E, 2.4 * E, '#9aa0b5'); R(P(4.4).x - 0.4 * E, P(4.4).y - 0.4 * E, 0.8 * E, 0.8 * E, '#2a2140');
  } else if (tipo === 'cartucho' || tipo === 'cartuchoSujo') {
    const c = tipo === 'cartucho' ? '#eef0f8' : '#6b4a2e';
    R(mao.x - 1.2 * E, mao.y - 4.5 * E, 2.4 * E, 6 * E, c); R(mao.x - 1.2 * E, mao.y - 3.5 * E, 2.4 * E, 0.7 * E, tipo === 'cartucho' ? COR.agua : '#3a2a1a');
    if (tipo === 'cartuchoSujo') for (let i = 0; i < 3; i++) { const q = (t * 1.2 + i / 3) % 1; tx.globalAlpha = 1 - q; R(mao.x + (i - 1) * 3, mao.y - 5 * E - q * 18, 2, 2, '#8a6a52'); tx.globalAlpha = 1; }
  } else if (tipo === 'escova') {
    seg(P(0), P(4), 1 * E, '#6b4a2e'); seg(P(4, -1.6), P(4, 1.6), 1.4 * E, '#ffc83d');
  } else if (tipo === 'scanner' || tipo === 'tablet') {
    R(mao.x - 2 * E, mao.y - 3 * E, 4 * E, 3 * E, '#1b1530'); R(mao.x - 1.6 * E, mao.y - 2.6 * E, 3.2 * E, 2.2 * E, COR.agua);
    if (tipo === 'scanner') { tx.globalAlpha = 0.35; tx.fillStyle = COR.agua; tx.beginPath(); tx.moveTo(mao.x + 2 * E, mao.y - 1.5 * E); tx.lineTo(mao.x + 18 * E, mao.y + 6 * E); tx.lineTo(mao.x + 18 * E, mao.y + 14 * E); tx.fill(); tx.globalAlpha = 1; }
  } else if (tipo === 'lanterna') {
    seg(P(0), P(3), 1.4 * E, '#4a4466');
    tx.globalAlpha = 0.3; tx.fillStyle = '#fff4c2'; const a = P(3), b = P(40, -10), c = P(40, 10);
    tx.beginPath(); tx.moveTo(a.x, a.y); tx.lineTo(b.x, b.y); tx.lineTo(c.x, c.y); tx.fill(); tx.globalAlpha = 1;
  } else if (tipo === 'viga') {
    seg(P(-14, -1), P(10, -1), 1.6 * E, '#e2603b');
    for (let k = -12; k < 10; k += 6) seg(P(k, -1), P(k + 3, -1), 1.6 * E, '#eef0f8');
  }
}
function exclamacao(x, y, t, E = 3) {
  if (Math.floor(t * 6) % 2) return;
  R(x - 0.8 * E, y - 7 * E, 1.6 * E, 4.4 * E, COR.alerta); R(x - 0.8 * E, y - 1.8 * E, 1.6 * E, 1.6 * E, COR.alerta);
}
function etiquetaT(nome, cab, E = 3) { return () => texto(nome.toUpperCase(), cab.x * TE, (cab.y - 3 * E) * TE, 30, '#ffffff', { maxW: 520 }); }

// alvos de trabalho de cada objeto (em unidades do desenho do objeto, relativas a cx/base)
const ALVOS = {
  oxigenio: (i) => ({ x: -8 + i * 8, y: 26 }), agua: () => ({ x: 0, y: 14 }), manutencao: (i) => ({ x: -20 + i * 14, y: 22 }),
  clima: (k) => ({ x: -22 + k * 44, y: 12 + Math.abs(Math.sin(k * 9)) * 20 }), saude: (k) => ({ x: -22 + k * 30, y: 16 }),
  ataque: () => ({ x: 0, y: 24 }), descoberta: () => ({ x: 4, y: 16 }),
};

// ------------------------------------------------------------------ tomadas com atores
function tomadaAlarme(t, k) {   // lendo o tablet → alarme → susto (pula, "!") → corre até o equipamento
  const chao = sala(t, { vermelho: true, noite: variante(2, 3) === 1 });
  const a = t * 5;
  tx.globalCompositeOperation = 'lighter';
  for (const lado of [0, Math.PI]) {
    const ang = a + lado, x2 = TW / 2 + Math.cos(ang) * 400, y2 = 8 + Math.abs(Math.sin(ang)) * 300;
    const g = tx.createLinearGradient(TW / 2, 8, x2, y2);
    g.addColorStop(0, 'rgba(255,60,60,0.5)'); g.addColorStop(1, 'rgba(255,60,60,0)');
    tx.fillStyle = g; tx.beginPath(); tx.moveTo(TW / 2, 8); tx.lineTo(x2 - 60, y2); tx.lineTo(x2 + 60, y2); tx.fill();
  }
  tx.globalCompositeOperation = 'source-over';
  R(TW / 2 - 8, 6, 16, 10, Math.floor(t * 5) % 2 ? '#ff4d4d' : '#c03030');
  const cat = (EP.problema || {}).categoria, ox = TW * 0.76;
  objeto(cat, ox, chao + 2, 3, t, 0);
  const c = colonoQualquer(0), E = 4.6;
  let P;
  if (k < 0.3) P = { x: TW * 0.3, chao: chao + 2, dir: -1, maoF: { x: TW * 0.3 - 20, y: chao - 62 }, maoT: { x: TW * 0.3 - 16, y: chao - 60 }, cabeca: 4 };
  else if (k < 0.48) { const q = (k - 0.3) / 0.18; P = { x: TW * 0.3, chao: chao + 2, dir: q > 0.3 ? 1 : -1, pulo: Math.sin(clamp(q / 0.6) * Math.PI) * 26, susto: true, maoF: { x: TW * 0.3 + 14, y: chao - 150 }, maoT: { x: TW * 0.3 - 22, y: chao - 146 } }; }
  else { const q = clamp((k - 0.48) / 0.32); P = { x: lerp(TW * 0.3, ox - 70, suave(q)), chao: chao + 2, dir: 1, anda: q < 1 ? t * 16 : null, susto: q < 1, agacha: q >= 1 ? 0.5 : 0, maoF: q >= 1 ? { x: ox - 40, y: chao - 56 } : null }; }
  const r = ator(c.pal, P, t, E);
  if (k < 0.3) ferramentaT('tablet', r.maoF, r.cotF, t, E);
  if (k >= 0.3 && k < 0.6) exclamacao(r.cab.x, r.cab.y, t, E);
  tx.globalAlpha = 0.16 + 0.1 * Math.sin(t * 10); R(0, 0, TW, TH, '#ff2020'); tx.globalAlpha = 1;
  return etiquetaT(c.nome, r.cab, E);
}

function tomadaConserto(t, k) {   // entra andando → olha → trabalha com a ferramenta na peça → comemora
  const cat = (EP.problema || {}).categoria, fora = cat === 'clima' || cat === 'ataque';
  let chao;
  if (fora) {
    const g = tx.createLinearGradient(0, 0, 0, TH);
    g.addColorStop(0, '#b0704f'); g.addColorStop(0.55, '#e8a678'); g.addColorStop(1, '#b85a37');
    tx.fillStyle = g; tx.fillRect(0, 0, TW, TH);
    for (let c = 0; c < 2; c++) {
      tx.fillStyle = c ? '#a24c30' : '#c4643c'; tx.beginPath(); tx.moveTo(0, TH);
      for (let x = 0; x <= TW; x += 6) tx.lineTo(x, TH * (c ? 0.52 : 0.47) - Math.sin(x * 0.03 + c * 2 + t * 0.05) * 14);
      tx.lineTo(TW, TH); tx.fill();
    }
    chao = TH * 0.6;
    R(0, chao, TW, TH - chao, '#a24c30');
    for (let i = 0; i < 20; i++) R(hashT(i, 9) * TW, chao + hashT(i, 8) * (TH - chao), 3, 2, '#8f4129');
  } else chao = sala(t, { noite: variante(2, 4) === 1 });
  const h = heroiDaTomada(), E = 5, oe = 3.6, ox = TW * 0.74, ob = chao + 2;
  const trab = clamp((k - 0.26) / 0.56), ok = trab;
  objeto(cat, ox, ob, oe, t, ok);
  const ferr = { oxigenio: 'cartucho', agua: 'macarico', manutencao: 'chave', clima: 'escova', saude: 'scanner', ataque: 'lanterna', descoberta: 'chave' }[cat] || 'chave';
  const baixo = cat === 'agua' || cat === 'manutencao';
  const alvoObj = (a) => ({ x: ox + a.x * oe, y: ob - a.y * oe });
  // onde ele para: perto da primeira peça, a um braço de distância
  const a0 = alvoObj((ALVOS[cat] || ALVOS.manutencao)(0));
  const xParada = Math.min(a0.x - 40, ox - 62);
  let P, ferramenta = null;
  if (k < 0.16) { const q = k / 0.16; P = { x: lerp(-20, xParada, suave(q)), chao, dir: 1, anda: t * 12 }; }
  else if (k < 0.26) { const q = (k - 0.16) / 0.1; P = { x: xParada, chao, dir: 1, agacha: baixo ? suave(q) * 0.8 : 0, cabeca: 3, maoF: { x: xParada + 14, y: chao - 112 + q * 10 } }; }
  else if (k < 0.84) {
    const q = trab;
    let alvo;
    if (cat === 'oxigenio') {   // 3 ciclos: tira o cartucho sujo, pega o novo na cintura, encaixa
      const ciclo = Math.min(2, Math.floor(q * 3)), f = q * 3 - ciclo, slot = alvoObj(ALVOS.oxigenio(ciclo));
      if (f < 0.35) { alvo = { x: slot.x, y: lerp(slot.y, slot.y - 24, f / 0.35) }; ferramenta = 'cartuchoSujo'; }
      else if (f < 0.6) { alvo = { x: lerp(slot.x, xParada + 8, (f - 0.35) / 0.25), y: chao - 70 }; ferramenta = (f - 0.35) / 0.25 > 0.5 ? 'cartucho' : 'cartuchoSujo'; }
      else { alvo = { x: lerp(xParada + 8, slot.x, (f - 0.6) / 0.4), y: lerp(chao - 70, slot.y, (f - 0.6) / 0.4) }; ferramenta = 'cartucho'; }
    } else if (cat === 'manutencao') {   // aperta parafuso por parafuso, a chave vai e volta
      const i = Math.min(3, Math.floor(q * 4)), p0 = alvoObj(ALVOS.manutencao(i));
      alvo = { x: p0.x + Math.sin(t * 10) * 8, y: p0.y + Math.cos(t * 10) * 8 }; ferramenta = 'chave';
    } else if (cat === 'clima' || cat === 'saude') { alvo = alvoObj(ALVOS[cat]((Math.sin(t * 3) + 1) / 2)); ferramenta = ferr; }
    else { const p0 = alvoObj((ALVOS[cat] || ALVOS.agua)(0)); alvo = { x: p0.x - 6 + Math.sin(t * 6) * 2, y: p0.y + Math.cos(t * 6) * 2 }; ferramenta = ferr; }
    P = { x: xParada, chao, dir: 1, agacha: baixo ? 0.8 : 0, cabeca: 3, maoF: alvo, maoT: { x: xParada + 26, y: (baixo ? chao - 50 : chao - 86) } };
  } else {   // passo atrás + comemora (soco no ar e pulinho)
    const q = (k - 0.84) / 0.16;
    P = { x: xParada - suave(clamp(q / 0.3)) * 16, chao, dir: 1, pulo: q > 0.3 ? Math.abs(Math.sin((q - 0.3) * 12)) * 14 : 0, alegre: true,
          maoF: { x: xParada - 4, y: chao - 172 - Math.sin(q * 20) * 10 }, maoT: { x: xParada - 30, y: chao - 84 } };
  }
  const r = ator(h.pal, P, t, E);
  if (ferramenta) ferramentaT(ferramenta, r.maoF, r.cotF, t, E);
  const nome = etiquetaT(h.nome, r.cab, E);
  return () => {
    nome();
    const y = 300;
    ret(W / 2 - 260, y, 520, 26, '#1b1530'); ret(W / 2 - 254, y + 6, 508 * ok, 14, ok > 0.95 ? COR.ok : COR.ouro);
    texto(ok > 0.95 ? 'RESOLVIDO!' : 'CONSERTANDO...', W / 2, y - 30, 30, ok > 0.95 ? COR.ok : COR.ouro);
  };
}

function tomadaObjeto(t, k) {   // close do objeto ficando verde, com brilho de "OK"
  R(0, 0, TW, TH, '#141225');
  const g = tx.createRadialGradient(TW / 2, TH * 0.5, 10, TW / 2, TH * 0.5, 220);
  g.addColorStop(0, k > 0.5 ? 'rgba(78,211,122,0.35)' : 'rgba(255,77,77,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  tx.fillStyle = g; tx.fillRect(0, 0, TW, TH);
  const zoom = 3.4 + k * 0.5;
  objeto((EP.problema || {}).categoria, TW / 2, TH * 0.56, zoom, t, clamp(0.6 + k * 0.6));
  return () => {
    if (k > 0.4) {
      const s = 1 + (1 - saida(clamp((k - 0.4) / 0.2))) * 0.6;
      texto('OK!', W / 2, 330, Math.round(120 * s), COR.ok);
    }
  };
}

// obra vista de lado: céu, dunas, o prédio subindo em fileiras, andaime, soldador no topo, rover passando
const COR_OBRA = { comando: ['#e4e6f0', '#2c4fb8'], estufa: ['#8fe6ff', '#eef0f8'], antena: ['#e2603b', '#eef0f8'], gelo: ['#9aa0b5', '#3fd0c9'], oxigenio: ['#eef0f8', '#3fd0c9'],
  oficina: ['#9aa0b5', '#ffc83d'], cantina: ['#f4b46b', '#e89a55'], enfermaria: ['#eef0f8', '#e04f5f'], abrigo: ['#a0613f', '#5e2c1b'], laboratorio: ['#e4e6f0', '#8fe6ff'] };
function tomadaObra(t, k, cena) {
  const o = EP.mundo.obras.find((x) => x.slug === EP.missao_obra) || {};
  const [p0, p1] = cena.progresso || [0, 1];
  const p = lerp(p0, p1, clamp(k / 0.85));
  const g = tx.createLinearGradient(0, 0, 0, TH);
  g.addColorStop(0, '#d98a5c'); g.addColorStop(0.5, '#f2b98a'); g.addColorStop(1, '#c4643c');
  tx.fillStyle = g; tx.fillRect(0, 0, TW, TH);
  R(40 + t * 2, 50, 6, 6, '#fff3d6');                                                                         // sol pequeno de Marte
  for (let c = 0; c < 3; c++) {
    tx.fillStyle = ['#d9895c', '#c4643c', '#a24c30'][c]; tx.beginPath(); tx.moveTo(0, TH);
    for (let x = 0; x <= TW; x += 5) tx.lineTo(x, TH * (0.5 + c * 0.06) - Math.sin(x * (0.02 + c * 0.01) + c * 3 - t * 0.02 * (c + 1)) * (16 - c * 4));
    tx.lineTo(TW, TH); tx.fill();
  }
  const chao = TH * 0.64, [ca, cb] = COR_OBRA[o.tipo] || ['#c9ced9', '#e2603b'];
  R(0, chao, TW, TH - chao, '#8f4129');
  const bw = 150, bh = o.tipo === 'antena' ? 230 : 150, bx = TW / 2 - bw / 2, topo = chao - bh * p;
  // andaime
  for (const x of [bx - 10, bx + bw + 6]) R(x, chao - bh - 6, 4, bh + 6, '#ffc83d');
  for (let y = chao - 20; y > chao - bh - 6; y -= 30) R(bx - 10, y, bw + 20, 2, '#e0a920');
  if (o.tipo === 'antena') {   // torre treliçada subindo
    for (let y = chao; y > topo; y -= 6) {
      const w = lerp(90, 30, (chao - y) / bh), c = Math.floor((chao - y) / 38) % 2 ? cb : ca;
      R(TW / 2 - w / 2, y - 3, 4, 6, c); R(TW / 2 + w / 2 - 4, y - 3, 4, 6, c);
      if (Math.floor(y / 6) % 3 === 0) R(TW / 2 - w / 2, y - 1, w, 2, '#c9ced9');
    }
    if (p > 0.95) { tx.fillStyle = '#e4e6f0'; tx.beginPath(); tx.ellipse(TW / 2, chao - bh - 10, 40, 14, -0.3, 0, Math.PI); tx.fill(); }
  } else if (o.tipo === 'gelo') {   // Extrator: torre da broca treliçada subindo + tanque ao lado
    const tw = 70, tq = { x: bx - 4, w: 56 }, alt = bh * 1.3 * p;
    for (let y = 0; y < alt; y += 6) { const w = lerp(tw, 18, y / (bh * 1.3)); R(TW / 2 + 30 - w / 2, chao - y - 3, 3, 6, '#9aa0b5'); R(TW / 2 + 30 + w / 2 - 3, chao - y - 3, 3, 6, '#9aa0b5'); if (y % 18 === 0) R(TW / 2 + 30 - w / 2, chao - y, w, 2, '#6b6f86'); }
    const th = Math.min(1, p * 1.4) * 90;
    R(tq.x, chao - th, tq.w, th, '#c9ced9'); R(tq.x + 4, chao - th, 6, th, '#eef0f8');
    if (th > 20) R(tq.x + 20, chao - th + 10, 16, th - 16, '#3fd0c9');
  } else if (o.tipo === 'comando') {   // Módulo de Comando: paredes, janelas e a cúpula do telescópio no fim
    R(bx, topo, bw, chao - topo, ca); R(bx, topo, bw, 8, cb);
    for (let y = chao - 30; y > topo + 12; y -= 30) for (let x = bx + 14; x < bx + bw - 20; x += 28) R(x, y, 16, 12, '#8fe6ff');
    if (p > 0.8) { const q = (p - 0.8) / 0.2; tx.fillStyle = '#eef0f8'; tx.beginPath(); tx.arc(bx + bw - 40, topo, 30 * q, Math.PI, 0); tx.fill(); }
  } else {   // prédio subindo em fileiras (paredes e janelas)
    R(bx, topo, bw, chao - topo, ca);
    for (let y = chao - 24; y > topo + 6; y -= 30) for (let x = bx + 12; x < bx + bw - 20; x += 26) R(x, y, 14, 12, cb);
    R(bx, topo, bw, 4, '#ffffff55');
  }
  // soldador ajoelhado no topo, guiando o maçarico na emenda; outro colono traz uma viga no ombro
  const sd = colonoQualquer(1), E2 = 2;
  const sx = TW / 2 + (o.tipo === 'antena' ? 30 : 44), emenda = { x: TW / 2 + (o.tipo === 'antena' ? 12 : 22) + Math.sin(t * 2.4) * 4, y: topo - 2 };
  const rs = ator(sd.pal, { x: sx, chao: topo + 1, dir: -1, agacha: 0.8, cabeca: 4, maoF: emenda, maoT: { x: sx - 8, y: topo - 10 } }, t, E2);
  ferramentaT('macarico', rs.maoF, rs.cotF, t, E2);
  const cg = colonoQualquer(2), q = ((t * 0.12) % 1);
  const cxg = lerp(-30, TW + 30, q);
  const rc = ator(cg.pal, { x: cxg, chao, dir: 1, anda: t * 10, maoF: { x: cxg + 6, y: chao - 40 }, maoT: { x: cxg - 4, y: chao - 41 } }, t, 2.6);
  ferramentaT('viga', { x: rc.cab.x + 4, y: rc.cab.y + 18 }, { x: rc.cab.x - 6, y: rc.cab.y + 18 }, t, 2.6);
  // rover passando na frente
  const rx = ((t * 40) % (TW + 140)) - 70;
  roverT(rx, chao, t, { anda: true, s: 0.8 });   // o mesmo rover da tomada das dunas (rodas redondas girando)
  return () => {
    texto(`${Math.round(p * 100)}%`, W / 2, (chao - bh) * TE - 80, 60, COR.ouro);
  };
}

// ================================================================== tomadas de história (ep. 6 em diante)
// Redemoinho (problema → alerta no telescópio → corrida → abrigo), rover mapeando as dunas, câmera do rover
// nas marcas de pneu, colonos curiosos no telão e a fundação da próxima obra. TREMOR sacode a tomada inteira.
let TREMOR = 0;
const chaoDuna = (x, base = TH * 0.64) => base - Math.sin(x * 0.018 + 0.6) * 16 - Math.sin(x * 0.047) * 5;
function ceuT(escuro = 0, poeira = 0) {
  const g = tx.createLinearGradient(0, 0, 0, TH);
  g.addColorStop(0, '#c9805a'); g.addColorStop(0.55, '#f0b88c'); g.addColorStop(1, '#c4643c');
  tx.fillStyle = g; tx.fillRect(0, 0, TW, TH);
  if (escuro > 0) { tx.globalAlpha = escuro; R(0, 0, TW, TH, '#4a2418'); tx.globalAlpha = 1; }
  if (poeira > 0) { tx.globalAlpha = poeira; R(0, 0, TW, TH * 0.6, '#c98a5e'); tx.globalAlpha = 1; }
}
function dunasLonge(t, y0 = 0.5, cores = ['#d9895c', '#c4643c']) {
  cores.forEach((cor, c) => {
    tx.fillStyle = cor; tx.beginPath(); tx.moveTo(0, TH);
    for (let x = 0; x <= TW; x += 5) tx.lineTo(x, TH * (y0 + c * 0.05) - Math.sin(x * (0.02 + c * 0.012) + c * 3 + t * 0.01) * (14 - c * 4));
    tx.lineTo(TW, TH); tx.fill();
  });
}
function chaoT(chao, cor = '#a24c30', pedras = '#8f4129') {
  R(0, chao, TW, TH - chao, cor);
  for (let i = 0; i < 26; i++) R(hashT(i, 9) * TW, chao + 4 + hashT(i, 8) * (TH - chao - 4), 3 + (i % 3), 2, pedras);
}
function vento(t, n, forca, cor = '#e8b48c') {   // riscos de poeira voando para a esquerda
  for (let i = 0; i < n; i++) {
    const q = ((t * (0.7 + hashT(i, 21)) * forca + hashT(i, 22)) % 1);
    tx.globalAlpha = 0.25 + 0.5 * hashT(i, 23);
    R(TW + 20 - q * (TW + 80), hashT(i, 24) * TH * 0.9, 6 + hashT(i, 25) * 14 * forca, 1.5, cor);
  }
  tx.globalAlpha = 1;
}
function bolha(txt, x, y, q, cor = '#ffffff', tam = 54) {   // "?" ou "!" que surge com um pulo (q = k desde que surgiu)
  if (q < 0) return;
  const s = 1 + (1 - saida(clamp(q / 0.06))) * 0.8;
  texto(txt, x * TE, y * TE, Math.round(tam * s), cor);
}

// ---- 1. PROBLEMA: o redemoinho no horizonte, crescendo; os colonos lá fora param o que fazem e ficam olhando
function tomadaRedemoinho(t, k) {
  TREMOR = k * 1.2;
  ceuT(k * 0.35, k * 0.2);
  dunasLonge(t, 0.5);
  funilEm(tx, lerp(TW * 0.74, TW * 0.58, k), TH * 0.53, TH * 0.53 - 6, lerp(80, 150, k), t);
  dunasLonge(t, 0.56, ['#b85a37']);
  const chao = TH * 0.66;
  chaoT(chao);
  vento(t, Math.round(10 + k * 40), 0.6 + k * 1.4);
  // painel solar onde um colono trabalhava
  R(TW * 0.5, chao - 34, 46, 24, '#6b6f86'); R(TW * 0.5 + 2, chao - 32, 42, 20, '#22357a'); R(TW * 0.5 + 21, chao - 10, 4, 10, '#6b6f86');
  const c0 = colonoQualquer(0), c1 = colonoQualquer(1), c2 = colonoQualquer(2), E = 3.6;
  const olha = (t0) => k > t0;
  // c0 vinha carregando uma caixa e para
  const x0 = lerp(-10, TW * 0.3, suave(clamp(k / 0.3)));
  const r0 = ator(c0.pal, { x: x0, chao, dir: 1, anda: k < 0.3 ? t * 12 : null, cabeca: olha(0.3) ? -3 : 0,
    maoF: { x: x0 + 12, y: chao - 64 }, maoT: { x: x0 + 2, y: chao - 64 } }, t, E);
  R(x0 - 4, chao - 78, 22, 14, '#c99a1f'); R(x0 - 4, chao - 78, 22, 3, '#e0b84a');
  // c1 consertava o painel, levanta e se assusta
  const em_pe = olha(0.42);
  const r1 = ator(c1.pal, { x: TW * 0.46, chao, dir: 1, agacha: em_pe ? 0 : 0.8, susto: olha(0.55), cabeca: em_pe ? -2 : 3,
    maoF: em_pe ? null : { x: TW * 0.5 + 6, y: chao - 22 + Math.sin(t * 9) * 2 } }, t, E);
  if (!em_pe) ferramentaT('chave', r1.maoF, r1.cotF, t, E);
  // c2 aponta para o redemoinho
  const r2 = ator(c2.pal, { x: TW * 0.14, chao, dir: 1, cabeca: -2,
    maoF: olha(0.6) ? { x: TW * 0.14 + 40, y: chao - 120 } : null }, t, E);
  if (olha(0.62)) exclamacao(r1.cab.x, r1.cab.y, t, E);
  return () => {
    bolha('?', r0.cab.x + 4, r0.cab.y - 8, k - 0.32);
    bolha('!', r2.cab.x, r2.cab.y - 10, k - 0.62, COR.alerta);
    const dist = lerp(6, 1.5, k);
    texto(`DISTÂNCIA ${dist.toFixed(1).replace('.', ',')} KM`, W / 2, 300, 40, Math.floor(t * 3) % 2 ? COR.alerta : '#ffffff');
    texto('VENTO 140 KM/H', W / 2, 360, 26, COR.areia, { contorno: true });
  };
}

// ---- 2. SOLUÇÃO a: o herói vê pelo telescópio (visor redondo), leva um susto e dá o alerta (sirene + ondas da voz)
function tomadaAlertaHeroi(t, k) {
  TREMOR = 0.4 + k * 0.6;
  ceuT(0.3, 0.15);
  dunasLonge(t, 0.48);
  funilEm(tx, TW * 0.74, TH * 0.52, TH * 0.52 - 6, 140, t);
  const chao = TH * 0.64;
  chaoT(chao, '#a8553a');
  vento(t, 30, 1.2);
  const h = heroiDaTomada(), E = 4.4, hx = TW * 0.34;
  // telescópio no tripé, apontado para o redemoinho
  const ocular = { x: hx + 24, y: chao - 104 }, boca = { x: hx + 66, y: chao - 124 };
  seg({ x: hx + 40, y: chao - 112 }, { x: hx + 26, y: chao }, 3, '#4a4466'); seg({ x: hx + 40, y: chao - 112 }, { x: hx + 56, y: chao }, 3, '#4a4466');
  seg(ocular, boca, 8, '#c9ced9'); seg(boca, { x: boca.x + 3, y: boca.y - 1.5 }, 10, '#9aa0b5');
  let P;
  if (k < 0.38) P = { x: hx, chao, dir: 1, cabeca: 4, maoF: { x: hx + 34, y: chao - 108 }, maoT: { x: hx + 28, y: chao - 104 } };
  else if (k < 0.52) { const q = (k - 0.38) / 0.14; P = { x: hx - q * 10, chao, dir: 1, susto: true, pulo: Math.sin(q * Math.PI) * 22, maoF: { x: hx + 20, y: chao - 150 }, maoT: { x: hx - 20, y: chao - 146 } }; }
  else { const a = Math.sin(t * 12); P = { x: hx - 10, chao, dir: -1, susto: true, maoF: { x: hx - 34 + a * 6, y: chao - 170 + a * 8 }, maoT: { x: hx + 14 - a * 6, y: chao - 170 - a * 8 } }; }
  const r = ator(h.pal, P, t, E);
  // sirene no poste (gira e acende a partir do alerta)
  const sx = TW * 0.08;
  R(sx, chao - 150, 4, 150, '#6b6f86'); R(sx - 6, chao - 162, 16, 12, k > 0.52 && Math.floor(t * 6) % 2 ? '#ff4d4d' : '#7a2a2a');
  if (k > 0.52) {
    tx.globalCompositeOperation = 'lighter';
    const ang = t * 6, g = tx.createRadialGradient(sx + 2, chao - 156, 0, sx + 2, chao - 156, 120);
    g.addColorStop(0, 'rgba(255,60,60,0.55)'); g.addColorStop(1, 'rgba(255,60,60,0)');
    tx.fillStyle = g; tx.beginPath(); tx.moveTo(sx + 2, chao - 156);
    tx.arc(sx + 2, chao - 156, 160, ang - 0.35, ang + 0.35); tx.fill();
    tx.globalCompositeOperation = 'source-over';
    tx.strokeStyle = '#fff3d6'; tx.lineWidth = 2;   // ondas do grito
    for (let i = 0; i < 3; i++) { const q = (t * 1.8 + i / 3) % 1; tx.globalAlpha = 1 - q; tx.beginPath(); tx.arc(r.cab.x - 14, r.cab.y + 16, 10 + q * 40, Math.PI * 0.7, Math.PI * 1.3); tx.stroke(); }
    tx.globalAlpha = 1;
  }
  if (k >= 0.38 && k < 0.6) exclamacao(r.cab.x, r.cab.y, t, E);
  // visor do telescópio: o redemoinho de perto
  if (k < 0.42) {
    const vx = TW * 0.7, vy = TH * 0.2, vr = 56;
    tx.save(); tx.beginPath(); tx.arc(vx, vy, vr, 0, Math.PI * 2); tx.clip();
    R(vx - vr, vy - vr, vr * 2, vr * 2, '#b8754f');
    funilEm(tx, vx - 6, vy + vr + 30, 260, 120, t);
    tx.strokeStyle = 'rgba(20,10,10,0.6)'; tx.lineWidth = 1; tx.beginPath(); tx.moveTo(vx - vr, vy); tx.lineTo(vx + vr, vy); tx.moveTo(vx, vy - vr); tx.lineTo(vx, vy + vr); tx.stroke();
    tx.restore();
    tx.strokeStyle = '#1b1530'; tx.lineWidth = 6; tx.beginPath(); tx.arc(vx, vy, vr, 0, Math.PI * 2); tx.stroke();
  }
  const nome = etiquetaT(h.nome, r.cab, E);
  return () => {
    nome();
    if (k > 0.52 && Math.floor(t * 4) % 2) texto('TODOS PARA DENTRO!', W / 2, 330, 48, COR.alerta);
  };
}

// ---- 3. SOLUÇÃO b: todo mundo correndo para o módulo, o herói segurando a porta; o redemoinho chega e engole a cena
function tomadaCorrida(t, k) {
  TREMOR = 1 + k * 2.5;
  ceuT(0.35 + k * 0.2, 0.2 + k * 0.3);
  dunasLonge(t, 0.46);
  funilEm(tx, lerp(TW * 0.98, TW * 0.72, k), TH * 0.66, TH * 0.66 - 6, lerp(180, 280, k), t);
  const chao = TH * 0.66;
  chaoT(chao, '#a8553a');
  // módulo (de lado) com a porta
  const mx = 6, mw = 104, porta = mx + 70;
  tx.fillStyle = '#6b6f86'; tx.beginPath(); tx.ellipse(mx + mw / 2, chao, mw / 2 + 2, 78, 0, Math.PI, 0); tx.fill();
  tx.fillStyle = '#e4e6f0'; tx.beginPath(); tx.ellipse(mx + mw / 2, chao, mw / 2 - 2, 74, 0, Math.PI, 0); tx.fill();
  R(mx + 4, chao - 40, mw - 8, 6, '#e2603b');
  for (const dx of [16, 38]) R(mx + dx, chao - 62, 12, 10, '#ffe58a');
  R(porta - 2, chao - 56, 30, 56, '#3a2f63');
  const fecha = clamp((k - 0.82) / 0.12);
  R(porta, chao - 54, 26, 54, '#1b1530');                                       // vão escuro
  R(porta, chao - 54, 26 * fecha, 54, '#9aa0b5'); if (fecha > 0) R(porta + 26 * fecha - 2, chao - 54, 2, 54, '#c9ced9');
  // colonos correndo da direita para a porta, um atrás do outro
  const E = 3.4, chegou = [];
  for (let i = 0; i < 4; i++) {
    const q = clamp((k - i * 0.1) / 0.55);
    if (q >= 1) { chegou.push(i); continue; }
    const c = colonoQualquer(i + 3), x = lerp(TW + 30 + i * 18, porta + 12, q);
    if (q > 0) ator(c.pal, { x, chao, dir: -1, anda: t * 20 + i, susto: true }, t, E);
    else ator(c.pal, { x: TW + 40, chao, dir: -1 }, t, E);
  }
  // o herói na porta acenando, entra por último
  const h = heroiDaTomada(), hq = clamp((k - 0.72) / 0.1), a = Math.sin(t * 12);
  let rh = null;
  if (hq < 1) rh = ator(h.pal, { x: lerp(porta + 44, porta + 12, hq), chao, dir: hq > 0 ? -1 : 1, susto: true, anda: hq > 0 ? t * 18 : null,
    maoF: hq > 0 ? null : { x: porta + 20 + a * 4, y: chao - 120 - a * 6 }, maoT: hq > 0 ? null : { x: porta + 62, y: chao - 120 } }, t, 4);
  vento(t, 60, 1.6 + k);
  // poeira engolindo tudo no fim
  tx.globalAlpha = clamp((k - 0.78) / 0.22) * 0.75; R(0, 0, TW, TH, '#b8754f'); tx.globalAlpha = 1;
  return () => {
    if (rh) etiquetaT(h.nome, rh.cab, 4)();
    if (fecha >= 1) texto('PORTA FECHADA', W / 2, 330, 40, COR.ok);
  };
}

// ---- 4. SOLUÇÃO c: dentro do abrigo — a janela marrom de poeira, tudo tremendo, luz piscando; depois a calma
function tomadaAbrigo(t, k) {
  const tempestade = k < 0.62 ? 1 : 1 - clamp((k - 0.62) / 0.25);
  TREMOR = tempestade * 2.4;
  const chao = sala(t, {});
  const jx = variante(2, 2) ? 24 : TW - 104, jy = 50, jw = 80, jh = 62;   // a mesma janela que sala() desenhou
  if (tempestade > 0) {
    tx.globalAlpha = tempestade; R(jx, jy, jw, jh, '#9a5a3a'); tx.globalAlpha = 1;
    tx.save(); tx.beginPath(); tx.rect(jx, jy, jw, jh); tx.clip();
    for (let i = 0; i < 40; i++) {
      const q = (t * (1.5 + hashT(i, 31)) + hashT(i, 32)) % 1;
      tx.globalAlpha = tempestade * 0.8; R(jx + jw - q * (jw + 30), jy + hashT(i, 33) * jh, 8 + hashT(i, 34) * 10, 1.5, i % 3 ? '#e8b48c' : '#6b4a2e');
    }
    if (Math.floor(t * 2) % 3 === 0) { tx.globalAlpha = tempestade; R(jx + jw - ((t * 3) % 1) * (jw + 20), jy + 20, 6, 5, '#6b6f86'); }   // pedra voando
    tx.restore(); tx.globalAlpha = 1;
  }
  // poeirinha caindo do teto quando treme
  for (let i = 0; i < 10; i++) { const q = (t * 0.9 + hashT(i, 41)) % 1; tx.globalAlpha = tempestade * (1 - q); R(30 + hashT(i, 42) * (TW - 60), 30 + q * (chao - 30), 1.5, 1.5, '#c98a5e'); }
  tx.globalAlpha = 1;
  // colonos agachados juntos, olhando a janela
  const E = 3.6;
  const rs = [0, 1, 2].map((i) => {
    const c = colonoQualquer(i + 3), x = TW * (0.2 + i * 0.17);
    const olhaJanela = (jx < TW / 2 ? -1 : 1);
    return ator(c.pal, { x, chao: chao + 4, dir: i === 1 ? -olhaJanela : olhaJanela, agacha: tempestade > 0.3 ? 0.7 : 0.1,
      susto: tempestade > 0.5 && Math.floor(t * 2 + i) % 3 === 0, alegre: tempestade < 0.2, cabeca: tempestade > 0.3 ? 2 : -1,
      maoF: tempestade < 0.2 && i === 1 ? { x: x - 6, y: chao - 150 } : null }, t, E);
  });
  // o herói de pé com o tablet, contando o vento
  const h = heroiDaTomada(), hx = TW * 0.78;
  const rh = ator(h.pal, { x: hx, chao: chao + 4, dir: -1, cabeca: 3, alegre: tempestade < 0.2, maoF: { x: hx - 16, y: chao - 70 }, maoT: { x: hx - 10, y: chao - 66 } }, t, 4);
  ferramentaT('tablet', rh.maoF, rh.cotF, t, 4);
  // luz piscando
  if (tempestade > 0.3 && hashT(Math.floor(t * 9), 5) < 0.3) { tx.globalAlpha = 0.45; R(0, 0, TW, TH, '#0a0818'); tx.globalAlpha = 1; }
  const vento_ = Math.round(lerp(140, 10, clamp((k - 0.55) / 0.35)));
  return () => {
    etiquetaT(h.nome, rh.cab, 4)();
    if (tempestade > 0.9) bolha('?', rs[0].cab.x, rs[0].cab.y - 10, k - 0.18);
    texto(`VENTO ${vento_} KM/H`, W / 2, 300, 40, vento_ > 60 ? COR.alerta : COR.ok);
    if (tempestade < 0.15) texto('PASSOU!', W / 2, 380, 60, COR.ok);
  };
}

// ---- rover (de lado, pixel art): 6 rodas (3 à vista) redondas com garras e raios girando, suspensão
// rocker-bogie ligando as rodas ao chassi, deck de painéis solares, caixa de instrumentos, mastro com câmera e antena
function roverT(x, chao, t, o = {}) {
  const s = o.s || 1.5, ang = clamp(o.ang || 0, -0.22, 0.22);
  tx.save(); tx.translate(Math.round(x), Math.round(chao)); tx.rotate(ang); tx.scale(s, s);
  const b = o.anda ? Math.round(Math.sin(t * 14) * 0.6) : 0;
  const F = (x2, y2, w, h, c) => { tx.fillStyle = c; tx.fillRect(Math.round(x2), Math.round(y2), w, h); };
  const L = (x1, y1, x2, y2, w, c) => { tx.strokeStyle = c; tx.lineWidth = w; tx.lineCap = 'square'; tx.beginPath(); tx.moveTo(x1, y1); tx.lineTo(x2, y2); tx.stroke(); };
  const giro = o.anda ? t * 7 : 0, R0 = 9, rodas = [-27, -1, 25];
  // suspensão (atrás das rodas): rocker do pivô do chassi até a roda de trás e até o bogie; bogie nas 2 da frente
  const piv = [-6, -25 + b], bog = [12, -16];
  L(piv[0], piv[1], rodas[0], -R0, 3, '#6b6f86'); L(piv[0], piv[1], bog[0], bog[1], 3, '#6b6f86');
  L(bog[0], bog[1], rodas[1], -R0, 3, '#6b6f86'); L(bog[0], bog[1], rodas[2], -R0, 3, '#6b6f86');
  F(piv[0] - 2, piv[1] - 2, 4, 4, '#c9ced9'); F(bog[0] - 2, bog[1] - 2, 4, 4, '#c9ced9');
  for (const wx of rodas) {   // roda: pneu escuro redondo, garras na borda, aro claro e raios girando
    tx.fillStyle = '#2a2140'; tx.beginPath(); tx.arc(wx, -R0, R0, 0, Math.PI * 2); tx.fill();
    for (let q = 0; q < 10; q++) { const a = giro + q * Math.PI / 5; F(wx + Math.cos(a) * (R0 - 0.5) - 1, -R0 + Math.sin(a) * (R0 - 0.5) - 1, 2, 2, '#4a4466'); }
    tx.fillStyle = '#9aa0b5'; tx.beginPath(); tx.arc(wx, -R0, 5.5, 0, Math.PI * 2); tx.fill();
    for (let q = 0; q < 3; q++) { const a = giro + q * Math.PI * 2 / 3; L(wx, -R0, wx + Math.cos(a) * 5, -R0 + Math.sin(a) * 5, 1.5, '#6b6f86'); }
    F(wx - 1.5, -R0 - 1.5, 3, 3, '#eef0f8');
  }
  // chassi (caixa branca com faixa e sombra embaixo), apoiado na suspensão
  F(-36, -36 + b, 70, 11, '#eef0f8'); F(-36, -27 + b, 70, 3, '#9aa0b5'); F(-36, -36 + b, 70, 2, '#ffffff');
  F(-30, -33 + b, 14, 3, '#e2603b'); F(-13, -33 + b, 3, 3, '#e2603b'); F(22, -33 + b, 8, 4, '#2a2140');
  // deck de painéis solares em cima do chassi
  F(-38, -40 + b, 50, 4, '#2c4fb8'); for (let i = 0; i < 5; i++) F(-37 + i * 10, -39 + b, 8, 2, '#4a6ff0');
  // caixa de instrumentos na frente, com a janelinha do sensor
  F(14, -48 + b, 20, 12, '#eef0f8'); F(17, -45 + b, 13, 6, '#3fd0c9'); F(18, -44 + b, 4, 2, '#bff8ff');
  // mastro com a cabeça da câmera (o lidar gira dentro) e a antena com luz piscando
  F(5, -66 + b, 3, 26, '#9aa0b5'); F(-1, -72 + b, 15, 7, '#c9ced9'); F(10, -70 + b, 3, 3, '#2a2140');
  F(5 + Math.round(Math.cos(t * 4) * 4), -71 + b, 3, 3, '#3fd0c9');
  F(-30, -62 + b, 1, 22, '#6b6f86'); F(-33, -63 + b, 7, 2, '#9aa0b5'); if (Math.floor(t * 3) % 2) F(-31, -66 + b, 3, 3, '#ff4d4d');
  if (o.farol) F(34, -44 + b, 3, 4, '#fff4c2');
  tx.restore();
  // ponta do lidar (na cabeça do mastro), já com a rotação e a escala do rover
  const lx = 12 * s, ly = (-70 + b) * s, c = Math.cos(ang), sn = Math.sin(ang);
  return { lidar: { x: x + lx * c - ly * sn, y: chao + lx * sn + ly * c } };
}

// ---- 5. RESULTADO a: o rover atravessando as dunas e mapeando (feixe do lidar varrendo a areia)
function tomadaRover(t, k) {
  TREMOR = 0;
  ceuT();
  R(40 + t * 2, 46, 6, 6, '#fff3d6');
  dunasLonge(t, 0.42, ['#e3a571', '#d8955f']);
  // chão de duna (areia clara com ondinhas)
  tx.fillStyle = '#e3a571'; tx.beginPath(); tx.moveTo(0, TH);
  for (let x = 0; x <= TW; x += 3) tx.lineTo(x, chaoDuna(x)); tx.lineTo(TW, TH); tx.fill();
  for (let i = 0; i < 40; i++) { const x = hashT(i, 51) * TW, y = chaoDuna(x) + 8 + hashT(i, 52) * (TH - chaoDuna(x) - 8); R(x, y, 8, 1.5, '#f2c08e'); }
  const xr = lerp(-70, TW * 0.62, suave(clamp(k / 0.96)));
  for (let x = -60; x < xr - 50; x += 7) R(x, chaoDuna(x) + 1, 4, 2, '#b4683f');   // trilha do próprio rover
  for (let i = 0; i < 12; i++) {   // poeira levantando atrás
    const q = (t * 2 + i / 12) % 1, x = xr - 60 - q * 50;
    tx.globalAlpha = (1 - q) * 0.6 * (k < 0.96 ? 1 : 0); R(x, chaoDuna(x) - 6 - q * 16, 4 + q * 6, 3 + q * 4, '#f2c08e');
  }
  tx.globalAlpha = 1;
  const ang = Math.atan2(chaoDuna(xr + 20) - chaoDuna(xr - 20), 40);
  const ro = roverT(xr, chaoDuna(xr), t, { ang, anda: k < 0.96, s: 1.5 });
  // feixe do lidar varrendo o chão à frente
  const alvo = xr + 40 + Math.sin(t * 2.5) * 50;
  tx.globalAlpha = 0.28; tx.fillStyle = '#3fd0c9'; tx.beginPath(); tx.moveTo(ro.lidar.x, ro.lidar.y);
  tx.lineTo(alvo - 14, chaoDuna(alvo - 14)); tx.lineTo(alvo + 14, chaoDuna(alvo + 14)); tx.fill(); tx.globalAlpha = 1;
  R(alvo - 14, chaoDuna(alvo) - 1, 28, 2, '#bff8ff');
  return () => {
    texto('ROVER MAPEANDO AS DUNAS', W / 2, 280, 34, COR.agua, { maxW: W - 140 });
    ret(200, 330, W - 400, 22, '#1b1530'); ret(204, 334, (W - 408) * clamp(k * 1.05), 14, COR.agua);
    texto(`${Math.round(clamp(k * 1.05) * 100)}%`, W / 2, 380, 30, '#ffffff');
  };
}

// ---- 6. RESULTADO b: câmera do rover olhando para baixo — a trilha dele para, e cruzando a frente uma trilha
// LARGA, com sulcos em V, que não é nossa. O scanner trava nela, a imagem dá "glitch", algo pisca ao longe.
function areiaDeCima(oy) {
  for (let y = 0; y < TH; y += 4) for (let x = 0; x < TW; x += 4) {
    const wy = y - oy, o = Math.sin(x * 0.045 + Math.sin(wy * 0.02) * 2.2 + wy * 0.09);
    R(x, y, 4, 4, o > 0.8 ? '#e6aa76' : o < -0.7 ? '#cf8c58' : '#d99a64');
  }
}
function tomadaMarcas(t, k) {
  TREMOR = 0;
  const oy = suave(clamp(k / 0.35)) * 50;
  areiaDeCima(oy);
  // trilha do nosso rover (estreita) vindo de baixo e parando
  const para = TH * 0.72 + oy;
  for (const x of [TW * 0.34, TW * 0.66]) for (let y = TH + 10; y > para; y -= 8) { R(x - 5, y, 10, 4, '#b4683f'); R(x - 5, y, 10, 1, '#f2c08e'); }
  // trilha desconhecida: duas esteiras largas com V, na diagonal
  const A = { x: -40, y: TH * 0.66 + oy }, B = { x: TW + 40, y: TH * 0.12 + oy };
  const dl = Math.hypot(B.x - A.x, B.y - A.y), u = { x: (B.x - A.x) / dl, y: (B.y - A.y) / dl }, n = { x: -u.y, y: u.x };
  for (const lado of [-1, 1]) {
    for (let sd = 0; sd < dl; sd += 3) { const c = { x: A.x + u.x * sd + n.x * lado * 34, y: A.y + u.y * sd + n.y * lado * 34 }; R(c.x - 13 * Math.abs(n.x) - 2, c.y - 13 * Math.abs(n.y) - 2, 26 * Math.abs(n.x) + 4, 26 * Math.abs(n.y) + 4, '#9a5434'); }
    for (let sd = 0; sd < dl; sd += 10) {
      const c = { x: A.x + u.x * sd + n.x * lado * 34, y: A.y + u.y * sd + n.y * lado * 34 };
      for (const j of [-1, 1]) seg({ x: c.x + n.x * j * 11 - u.x * 6, y: c.y + n.y * j * 11 - u.y * 6 }, c, 3, '#4a2014');
    }
  }
  // scanner: linha varrendo e depois a mira travada no meio da trilha
  if (k > 0.28 && k < 0.5) { const y = lerp(0, TH, (k - 0.28) / 0.22); tx.globalAlpha = 0.6; R(0, y, TW, 2, '#3fd0c9'); tx.globalAlpha = 0.12; R(0, y - 30, TW, 30, '#3fd0c9'); tx.globalAlpha = 1; }
  const M = { x: A.x + u.x * dl * 0.5, y: A.y + u.y * dl * 0.5 };
  if (k > 0.48 && Math.floor(t * 4) % 4) {
    const s = 60 - saida(clamp((k - 0.48) / 0.12)) * 18;
    tx.strokeStyle = '#ff4d4d'; tx.lineWidth = 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      tx.beginPath(); tx.moveTo(M.x + sx * s, M.y + sy * (s - 12)); tx.lineTo(M.x + sx * s, M.y + sy * s); tx.lineTo(M.x + sx * (s - 12), M.y + sy * s); tx.stroke();
    }
  }
  // ao longe (onde a trilha some): uma luz piscando
  if (k > 0.72 && Math.floor(t * 2.5) % 2) { tx.globalCompositeOperation = 'lighter'; const g = tx.createRadialGradient(TW * 0.86, 30 + oy * 0.2, 0, TW * 0.86, 30 + oy * 0.2, 16); g.addColorStop(0, 'rgba(255,240,200,0.9)'); g.addColorStop(1, 'rgba(255,240,200,0)'); tx.fillStyle = g; tx.fillRect(TW * 0.86 - 16, 14 + oy * 0.2, 32, 32); tx.globalCompositeOperation = 'source-over'; }
  // cara de câmera: linhas, cantos, vinheta escura
  for (let y = 0; y < TH; y += 3) { tx.globalAlpha = 0.1; R(0, y, TW, 1, '#000'); }
  tx.globalAlpha = 0.35; R(0, 0, TW, 18, '#000'); R(0, TH - 18, TW, 18, '#000'); tx.globalAlpha = 1;
  // glitch: faixas deslocadas
  const gl = (k > 0.62 && k < 0.68) || (k > 0.86 && hashT(Math.floor(t * 12), 7) < 0.5);
  if (gl) for (let i = 0; i < 6; i++) { const y = Math.floor(hashT(i, Math.floor(t * 20)) * TH), h = 4 + hashT(i, 3) * 18; tx.drawImage(tcv, 0, y, TW, h, (hashT(i, Math.floor(t * 20) + 1) - 0.5) * 30, y, TW, h); }
  return () => {
    texto(`● CAM ROVER-01   ${String(Math.floor(t)).padStart(3, '0')}`, 90, 120, 24, COR.alerta, { alinhar: 'left', contorno: false });
    if (k > 0.5) {
      texto('PNEU DESCONHECIDO', W / 2, 300, 46, Math.floor(t * 3) % 2 ? COR.alerta : '#ffffff');
      texto('NÃO É DO NOSSO ROVER', W / 2, 360, 28, '#ffffff');
    }
    if (k > 0.6) texto('LARGURA: 2X A NOSSA', M.x * TE, (M.y + 72) * TE, 22, COR.areia);
  };
}

// ---- 7. RESULTADO c: a colônia em volta do telão com o mapa novo — chegam, olham, apontam, "?" na cabeça
function tomadaCuriosos(t, k) {
  TREMOR = 0;
  const chao = sala(t, { janela: false });
  tx.globalAlpha = 0.4; R(0, 0, TW, TH, '#0a0818'); tx.globalAlpha = 1;   // luz baixa, o telão ilumina
  const sx = 34, sy = 40, sw = TW - 68, sh = 150;
  R(sx - 6, sy - 6, sw + 12, sh + 12, '#1b1530');
  tx.save(); tx.beginPath(); tx.rect(sx, sy, sw, sh); tx.clip();
  for (let y = sy; y < sy + sh; y += 3) for (let x = sx; x < sx + sw; x += 3) { const o = Math.sin(x * 0.08 + y * 0.18 + Math.sin(y * 0.05) * 2); R(x, y, 3, 3, o > 0.5 ? '#e3a571' : o < -0.5 ? '#c87b4d' : '#d8955f'); }
  const zz = 1 + k * 0.5, mc = { x: sx + sw * 0.5, y: sy + sh * 0.5 };   // o telão dá zoom na trilha
  const P = (x, y) => ({ x: mc.x + (x - mc.x) * zz, y: mc.y + (y - mc.y) * zz });
  for (let i = 0; i < 26; i++) { const a = P(sx + 20 + (i % 13) * 13, sy + sh - 20 - Math.floor(i / 13) * 40); R(a.x, a.y, 4, 2, '#3fd0c9'); }
  const A = P(sx - 10, sy + sh * 0.85), B = P(sx + sw + 10, sy + sh * 0.1);
  for (const lado of [-1, 1]) for (let q = 0; q <= 1; q += 0.025) { const x = lerp(A.x, B.x, q), y = lerp(A.y, B.y, q) + lado * 6 * zz; R(x, y, 3, 3, '#e04f5f'); }
  tx.restore();
  for (let y = sy; y < sy + sh; y += 3) { tx.globalAlpha = 0.12; R(sx, y, sw, 1, '#000'); } tx.globalAlpha = 1;
  if (k > 0.7 && Math.floor(t * 4) % 2) { tx.strokeStyle = '#ff4d4d'; tx.lineWidth = 3; tx.strokeRect(sx - 3, sy - 3, sw + 6, sh + 6); }
  // brilho do telão no chão
  tx.globalCompositeOperation = 'lighter';
  const g = tx.createLinearGradient(0, sy + sh, 0, chao + 80);
  g.addColorStop(0, 'rgba(255,190,140,0.22)'); g.addColorStop(1, 'rgba(255,190,140,0)');
  tx.fillStyle = g; tx.fillRect(sx, sy + sh, sw, chao + 80 - sy - sh); tx.globalCompositeOperation = 'source-over';
  // quatro colonos: dois já olhando, dois chegando
  const E = 3.6, base = chao + 30, rs = [];
  const pos = [TW * 0.18, TW * 0.4, TW * 0.6, TW * 0.82];
  for (let i = 0; i < 4; i++) {
    const c = colonoQualquer(i + 6), vem = i === 0 || i === 3, q = vem ? clamp(k / 0.3) : 1;
    const x = vem ? lerp(i === 0 ? -30 : TW + 30, pos[i], suave(q)) : pos[i];
    const dir = x < TW / 2 ? 1 : -1;
    const aponta = i === 1 && k > 0.35;
    rs.push(ator(c.pal, { x, chao: base, dir, anda: q < 1 ? t * 12 : null, cabeca: -3, susto: k > 0.72 && k < 0.82,
      maoF: aponta ? { x: x + 30, y: sy + sh * 0.7 } : (i === 2 && k > 0.5 ? { x: x - 4, y: base - 88 } : null) }, t, E));
  }
  return () => {
    rs.forEach((r, i) => bolha('?', r.cab.x + 4, r.cab.y - 10, k - 0.3 - i * 0.1));
    texto('DUNAS DO NORTE · TRILHA DESCONHECIDA', W / 2, (sy + sh + 22) * TE, 20, COR.areia, { maxW: W - 120 });
  };
}

// ---- 8. FUNDAÇÃO da próxima obra (corte de lado): escavadeira abre a vala → colonos armam a malha → caminhão concreta
function tomadaFundacao(t, k) {
  TREMOR = k < 0.38 ? 0.5 : 0;
  ceuT();
  dunasLonge(t, 0.44);
  const chao = TH * 0.58;
  R(0, chao, TW, TH - chao, '#a24c30');
  for (let y = chao + 30; y < TH; y += 34) R(0, y, TW, 2, '#8f4129');   // camadas do solo
  const kd = clamp(k / 0.38), km = clamp((k - 0.38) / 0.24), kc = clamp((k - 0.62) / 0.33);
  const px0 = TW * 0.28, px1 = TW * 0.7, fundo = 50 * saida(kd), larg = (px1 - px0) * (0.35 + 0.65 * saida(kd)), cx = (px0 + px1) / 2;
  const a0 = cx - larg / 2, a1 = cx + larg / 2;
  R(a0, chao, larg, fundo, '#3a1a10'); R(a0, chao, 3, fundo, '#5a2a18'); R(a1 - 3, chao, 3, fundo, '#5a2a18');
  // monte de terra (cresce com a escavação)
  tx.fillStyle = '#8f4129'; tx.beginPath(); tx.moveTo(TW * 0.74, chao); tx.lineTo(TW * 0.8, chao - 30 * kd); tx.lineTo(TW * 0.88, chao); tx.fill();
  // fôrmas + malha de aço
  if (km > 0) {
    R(a0 - 2, chao - 8, 4, fundo + 8, '#c99a1f'); R(a1 - 2, chao - 8, 4, fundo + 8, '#c99a1f');
    const n = Math.floor(km * 14);
    for (let i = 0; i < Math.min(n, 9); i++) R(a0 + 6 + i * (larg - 12) / 8, chao + 8, 2, fundo - 12, '#e2603b');
    for (let j = 0; j < Math.max(0, n - 9); j++) R(a0 + 4, chao + 12 + j * 9, larg - 8, 2, '#e2603b');
  }
  // concreto subindo
  if (kc > 0) {
    const nivel = fundo * saida(kc);
    R(a0 + 2, chao + fundo - nivel, larg - 4, nivel, '#9aa0b5');
    R(a0 + 2, chao + fundo - nivel, larg - 4, 2, '#c9ced9');
    for (let i = 0; i < 5; i++) R(a0 + 8 + hashT(i, 61) * (larg - 20), chao + fundo - nivel + 3, 6, 1, '#b9bdcc');
  }
  // escavadeira à direita: esteira, cabine e braço com IK (cava → levanta → despeja no monte)
  const ex = TW * 0.9, sai = clamp((k - 0.4) / 0.15);
  const exx = ex + sai * 60;
  R(exx - 24, chao - 12, 48, 12, '#2a2140'); for (let i = 0; i < 6; i++) R(exx - 22 + i * 8, chao - 10, 4, 8, '#4a4466');
  R(exx - 20, chao - 36, 36, 24, '#ffc83d'); R(exx - 2, chao - 34, 14, 12, '#8fe6ff'); R(exx - 20, chao - 38, 36, 3, '#e0a920');
  const ombro = { x: exx - 18, y: chao - 30 };
  let alvo;
  if (kd < 1) {
    const c = (t * 0.55) % 1;
    const dentro = { x: lerp(a1 - 14, a0 + 20, ((t * 0.55) / 1 | 0) % 3 / 2), y: chao + fundo - 6 };
    const alto = { x: ombro.x - 40, y: chao - 70 }, monte = { x: TW * 0.8, y: chao - 36 * kd - 10 };
    alvo = c < 0.35 ? { x: lerp(alto.x, dentro.x, c / 0.35), y: lerp(alto.y, dentro.y, c / 0.35) }
      : c < 0.6 ? { x: lerp(dentro.x, alto.x, (c - 0.35) / 0.25), y: lerp(dentro.y, alto.y, (c - 0.35) / 0.25) }
      : { x: lerp(alto.x, monte.x, (c - 0.6) / 0.4), y: lerp(alto.y, monte.y, (c - 0.6) / 0.4) };
    if (c > 0.85) for (let i = 0; i < 4; i++) R(monte.x - 4 + i * 3, monte.y + 6 + ((t * 30 + i * 5) % 14), 3, 3, '#8f4129');
  } else alvo = { x: ombro.x - 30, y: chao - 14 };
  const j = ik(ombro, alvo, 44, 40, 1);
  seg(ombro, j.meio, 6, '#ffc83d'); seg(j.meio, j.fim, 5, '#e0a920');
  R(j.fim.x - 7, j.fim.y - 3, 14, 10, '#6b6f86'); R(j.fim.x - 7, j.fim.y + 6, 14, 2, '#c9ced9');
  // caminhão betoneira chegando pela esquerda, balão girando e bica despejando
  if (k > 0.55) {
    const bx = lerp(-110, a0 - 74, suave(clamp((k - 0.55) / 0.08)));
    R(bx, chao - 30, 92, 18, '#6b6f86');
    for (const wx of [bx + 12, bx + 70, bx + 84]) { R(wx - 7, chao - 14, 14, 14, '#2a2140'); R(wx - 3, chao - 10, 6, 6, '#9aa0b5'); }
    R(bx, chao - 56, 24, 26, '#e2603b'); R(bx + 4, chao - 52, 14, 10, '#8fe6ff');
    tx.fillStyle = '#eef0f8'; tx.beginPath(); tx.ellipse(bx + 58, chao - 46, 32, 17, -0.15, 0, Math.PI * 2); tx.fill();
    for (let i = 0; i < 4; i++) { const q = ((t * 0.8 + i / 4) % 1); R(bx + 30 + q * 56, chao - 60 + Math.sin(q * Math.PI) * 4, 3, 28 * Math.sin(q * Math.PI) + 2, '#e2603b'); }
    const bica = { x: bx + 92, y: chao - 34 }, ponta = { x: a0 + 24, y: chao - 6 };
    seg(bica, ponta, 4, '#9aa0b5');
    if (kc > 0 && kc < 1) for (let i = 0; i < 8; i++) { const q = (t * 3 + i / 8) % 1; R(ponta.x - 2 + Math.sin(i) * 2, ponta.y + q * (fundo - fundo * saida(kc) + 6), 4, 4, '#b9bdcc'); }
  }
  // colonos: sinaleiro (escavação), dois armando a malha dentro da vala, um nivelando o concreto
  const E = 3;
  const c0 = colonoQualquer(0), c1 = colonoQualquer(1), c2 = colonoQualquer(2);
  if (k < 0.38) {
    const a = Math.sin(t * 5);
    ator(c0.pal, { x: TW * 0.16, chao, dir: 1, maoF: { x: TW * 0.16 + 8 + a * 6, y: chao - 92 }, maoT: { x: TW * 0.16 - 12, y: chao - 60 } }, t, E);
  } else if (k < 0.64) {
    const rr = ator(c1.pal, { x: a0 + larg * 0.3, chao: chao + fundo, dir: 1, agacha: 0.7, maoF: { x: a0 + larg * 0.3 + 16 + Math.sin(t * 6) * 4, y: chao + fundo - 26 } }, t, E);
    ator(c2.pal, { x: a0 + larg * 0.72, chao: chao + fundo, dir: -1, agacha: 0.5, maoF: { x: a0 + larg * 0.6, y: chao + 14 }, maoT: { x: a0 + larg * 0.62, y: chao + 16 } }, t, E);
    void rr;
    // um terceiro desce com feixe de vergalhão no ombro
    const q = clamp((k - 0.38) / 0.24), x = lerp(-20, a0 - 10, q);
    const rv = ator(c0.pal, { x, chao, dir: 1, anda: q < 1 ? t * 12 : null, maoF: { x: x + 8, y: chao - 70 }, maoT: { x: x - 4, y: chao - 70 } }, t, E);
    seg({ x: rv.cab.x - 30, y: rv.cab.y + 18 }, { x: rv.cab.x + 30, y: rv.cab.y + 18 }, 2.5, '#e2603b');
  } else {
    const x = a0 + larg * (0.55 + Math.sin(t * 2) * 0.12), nivelY = chao + fundo - fundo * saida(kc);
    const rr = ator(c1.pal, { x: Math.min(x, a1 - 16), chao: Math.max(chao, nivelY), dir: -1, maoF: { x: x - 24, y: Math.max(chao, nivelY) - 8 }, maoT: { x: x - 10, y: Math.max(chao, nivelY) - 50 } }, t, E);
    seg(rr.maoT, { x: x - 30, y: Math.max(chao, nivelY) - 2 }, 2, '#6b4a2e'); R(x - 40, Math.max(chao, nivelY) - 3, 16, 3, '#9aa0b5');
  }
  const etapa = k < 0.38 ? 'ESCAVAÇÃO' : k < 0.62 ? 'MALHA DE AÇO' : k < 0.96 ? 'CONCRETAGEM' : 'FUNDAÇÃO PRONTA!';
  const obra = (FUND && FUND.c.obra_nome) || 'PRÓXIMA OBRA';
  const pct = Math.round(lerp(0, ((FUND && FUND.c.progresso) || [0, 0.15])[1] * 100, k));
  return () => {
    texto(obra.toUpperCase(), W / 2, 270, 40, COR.agua, { maxW: W - 120 });
    texto(etapa, W / 2, 336, 34, k >= 0.96 ? COR.ok : COR.ouro);
    ret(200, 380, W - 400, 22, '#1b1530'); ret(204, 384, (W - 408) * k, 14, k >= 0.96 ? COR.ok : COR.marte);
    texto(`${pct}%`, W / 2, 432, 30, '#ffffff');
  };
}

// ---- CORREIO DA COLÔNIA: estúdio da rádio. O comentário aparece no telão (rede, @autor, texto); enquanto o
// narrador lê, Vega e Lia olham o telão curiosos; quando um deles responde, ele fala animado (pula, gesticula,
// notinhas e corações saindo) e o outro ri junto. No fim da resposta, chuva de confete.
const COR_REDE = { youtube: ['#ff3d3d', 'YOUTUBE'], instagram: ['#e1306c', 'INSTAGRAM'], tiktok: ['#25f4ee', 'TIKTOK'] };
function tomadaCorreio(t, k, cena) {
  TREMOR = 0;
  const atual = (typeof cenaEm === 'function' && cenaEm(t)) || cena;
  const c = (atual && atual.correio) || cena.correio || {};
  const resposta = c.fase === 'resposta';
  const kc = atual ? clamp((t - atual.inicio) / Math.max(0.5, atual.fim - atual.inicio)) : k;
  const chao = sala(t, { janela: false });
  tx.globalAlpha = 0.25; R(0, 0, TW, TH, '#1a0f2e'); tx.globalAlpha = 1;
  // placa NO AR piscando
  const noAr = Math.floor(t * 2) % 2 === 0;
  R(TW / 2 - 34, 12, 68, 16, '#1b1530'); R(TW / 2 - 32, 14, 64, 12, noAr ? '#e04f5f' : '#7a2a2a');
  // telão do comentário
  const [corRede] = COR_REDE[c.rede] || ['#9b59b6'];
  const sx = 16, sy = 36, sw = TW - 32, sh = 150;
  R(sx - 5, sy - 5, sw + 10, sh + 10, '#1b1530'); R(sx, sy, sw, sh, '#f3eefe'); R(sx, sy, sw, 6, corRede);
  const entra = saida(clamp(kc / 0.2));
  if (!resposta) { tx.globalAlpha = 1 - entra; R(sx, sy + 6, sw, sh - 6, '#f3eefe'); tx.globalAlpha = 1; }
  // mesa da rádio (tampo na altura da cintura; a frente cobre as pernas depois)
  const tampo = Math.round(TH * 0.63), mesa = tampo + 30;   // mesa = onde ficam os pés (escondidos)
  // Vega (esquerda) e Lia (direita) atrás da mesa
  const E = 5, quem = c.quem;
  const pose = (id, x, dir) => {
    const fala = resposta && quem === id, ri = resposta && quem !== id && Math.sin(t * 3) > 0.2;
    const a = Math.sin(t * 9), pul = fala ? Math.abs(Math.sin(t * 7)) * 10 : ri ? Math.abs(Math.sin(t * 11)) * 4 : 0;
    const P = { x, chao: mesa + 2, dir, pulo: pul, alegre: resposta || kc > 0.7, cabeca: resposta ? 0 : -4,
      maoF: fala ? { x: x + dir * (28 + a * 8), y: tampo - 70 - a * 16 } : (ri ? { x: x + dir * 8, y: tampo - 34 } : { x: x + dir * 16, y: tampo - 2 }),
      maoT: fala ? { x: x - dir * 20, y: tampo - 50 + a * 10 } : { x: x - dir * 4, y: tampo - 2 } };
    return { r: ator(FUNDADOR_PAL[id], P, t, E), fala };
  };
  const v = pose('vega', TW * 0.26, 1), l = pose('lia', TW * 0.74, -1);
  R(8, tampo, TW - 16, 6, '#8a5a30'); R(8, tampo + 6, TW - 16, TH - tampo, '#5a3a20');   // tampo + frente da mesa (cobre as pernas)
  for (let x = 30; x < TW - 30; x += 54) R(x, tampo + 16, 30, 3, '#6b4a2e');
  for (const [mx, d] of [[TW * 0.26 + 24, -1], [TW * 0.74 - 24, 1]]) {   // microfones na mesa, virados para cada um
    R(mx - 1, tampo - 22, 3, 22, '#4a4466'); R(mx - 6 + d * 2, tampo - 34, 12, 13, '#2a2140'); R(mx - 5 + d * 2, tampo - 33, 10, 4, '#6b6f86');
  }
  if (Math.floor(t * 2) % 2) R(TW / 2 - 3, tampo + 26, 6, 6, '#e04f5f');   // luz de gravação
  // notinhas e corações saindo de quem fala
  const falante = v.fala ? v.r : l.fala ? l.r : null;
  if (falante) for (let i = 0; i < 6; i++) {
    const q = (t * 0.7 + i / 6) % 1, x = falante.cab.x + Math.sin(i * 2.3 + t * 2) * 18, y = falante.cab.y - 6 - q * 70;
    tx.globalAlpha = 1 - q;
    if (i % 2) { R(x, y, 3, 3, '#ff8fa3'); R(x + 3, y, 3, 3, '#ff8fa3'); R(x - 1, y + 2, 9, 3, '#ff8fa3'); R(x + 1, y + 5, 5, 2, '#ff8fa3'); }
    else { R(x, y, 2, 8, '#ffd84a'); R(x - 3, y + 6, 5, 4, '#ffd84a'); }
  }
  tx.globalAlpha = 1;
  // confete no fim da resposta
  if (resposta && kc > 0.72) for (let i = 0; i < 36; i++) {
    const q = clamp((kc - 0.72) / 0.28), x = hashT(i, 81) * TW, y = -10 + q * (TH * 0.8) * (0.6 + hashT(i, 82) * 0.6);
    R(x + Math.sin(t * 6 + i) * 6, y, 3, 2, ['#ffd84a', '#3fd0c9', '#e04f5f', '#4ed37a', '#9b59b6'][i % 5]);
  }
  return () => {
    // título e telão em pixels da tela (texto nítido)
    texto('CORREIO DA COLÔNIA', W / 2, 78, 26, noAr ? '#ffffff' : COR.areia, { contorno: false });
    const [cor, nomeRede] = COR_REDE[c.rede] || ['#9b59b6', ''];
    const x0 = sx * TE + 26, y0 = sy * TE + 52;
    ctx.save(); ctx.globalAlpha = resposta ? 1 : entra;
    texto(nomeRede, x0, y0, 26, cor, { alinhar: 'left', contorno: false });
    texto(`@${c.autor || ''}`, x0, y0 + 50, 40, '#1b1530', { alinhar: 'left', contorno: false, maxW: sw * TE - 60 });
    // texto do comentário quebrado em linhas
    ctx.font = `32px ${FONTE}`;
    const maxW = sw * TE - 60, palavras = String(c.texto || '').split(/\s+/), linhas = [];
    let lin = '';
    for (const p of palavras) { const tenta = lin ? `${lin} ${p}` : p; if (ctx.measureText(tenta).width > maxW && lin) { linhas.push(lin); lin = p; } else lin = tenta; }
    if (lin) linhas.push(lin);
    linhas.slice(0, 6).forEach((l, i) => texto(l, x0, y0 + 112 + i * 48, 32, '#3a2f63', { alinhar: 'left', contorno: false, maxW }));
    ctx.restore();
    etiquetaT('Vega', v.r.cab, E)(); etiquetaT('Lia', l.r.cab, E)();
  };
}

// ------------------------------------------------------------------ TOMADAS EXCLUSIVAS DOS CORTES (Instagram/TikTok)
// Só entram quando EP.curto existe: o vídeo curto não recicla o episódio do YouTube. Cortes de 1,5–3 s, câmera
// colada no assunto: o rosto do herói no alarme, a máquina soltando faísca, o herói correndo pelo corredor,
// a broca da obra furando o chão e os novos colonos chegando pela crista da duna contra o sol.

// 1. close no ROSTO do herói: luz vermelha girando, olho que corre de um lado para o outro e arregala, gota de suor
function curtoRosto(t, k, cena) {
  const h = heroiDaTomada(), pal = h.pal, fim = cena && cena.tipo === 'youtube', feliz = fim && EP.curto === 'instagram';
  R(0, 0, TW, TH, '#120c1c');
  const susto = !feliz && k > 0.35;
  TREMOR = susto ? 0.5 : 0.15;
  // cabeça gigante (ocupa a tela): pele, cabelo/chapéu, orelha, sombra do lado
  const x0 = 38, x1 = TW - 38, y0 = 110, y1 = 430;
  R(x0, y0, x1 - x0, y1 - y0, pal.pele);
  R(x0, y0, 22, y1 - y0, escurece(pal.pele, 0.82));
  R(x0, y0 - 18, x1 - x0, 64, pal.cabelo); R(x0 - 8, y0 + 30, 20, 110, pal.cabelo);
  if (pal.chapeu) R(x0 - 14, y0 + 34, x1 - x0 + 28, 14, escurece(pal.cabelo, 0.8));
  R(x1 - 10, y0 + 120, 18, 44, escurece(pal.pele, 0.85));
  // olhos: correm (procurando o alarme) e depois arregalam
  const olha = susto ? 0 : Math.sign(Math.sin(t * 5)) * 7, arregala = susto ? 1 : 0;
  for (const ox of [TW * 0.36, TW * 0.64]) {
    const w = 34 + arregala * 6, hh = 24 + arregala * 14;
    R(ox - w / 2, 230 - hh / 2, w, hh, '#ffffff');
    R(ox - 7 + olha, 230 - 7, 14, 14, '#1b1530'); R(ox - 3 + olha, 230 - 5, 4, 4, '#ffffff');
    R(ox - w / 2 - 2, 230 - hh / 2 - 16 - arregala * 10, w + 4, 6, escurece(pal.cabelo, 0.9));   // sobrancelha sobe
  }
  // boca: reta → "O" de susto
  if (feliz) { R(TW / 2 - 30, 346, 60, 8, '#1b1530'); R(TW / 2 - 36, 338, 8, 8, '#1b1530'); R(TW / 2 + 28, 338, 8, 8, '#1b1530'); }
  else if (susto) { R(TW / 2 - 13, 340, 26, 30, '#1b1530'); R(TW / 2 - 9, 360, 18, 8, '#7a2a2a'); }
  else R(TW / 2 - 20, 352, 40, 5, '#1b1530');
  // gota de suor escorrendo
  if (!feliz && k > 0.45) { const q = ((k - 0.45) * 2.2) % 1; R(x1 - 46, 170 + q * 120, 8, 12, '#bff8ff'); R(x1 - 44, 166 + q * 120, 4, 4, '#bff8ff'); }
  // luz de alarme girando por cima (ou a luz fria do "e agora?" no fim)
  tx.globalCompositeOperation = 'lighter';
  const ang = t * 4, cx = TW / 2 + Math.cos(ang) * 160, g = tx.createRadialGradient(cx, 160, 10, cx, 160, 260);
  g.addColorStop(0, fim ? 'rgba(120,180,255,0.35)' : 'rgba(255,50,50,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  tx.fillStyle = g; tx.fillRect(0, 0, TW, TH);
  tx.globalCompositeOperation = 'source-over';
  tx.globalAlpha = 0.3; R(0, 0, TW, 60, '#000'); R(0, TH - 50, TW, 50, '#000'); tx.globalAlpha = 1;
  return () => {
    texto(h.nome.toUpperCase(), W / 2, 230, 64, '#ffffff', { maxW: W - 120 });
    if (feliz) {   // botão de play do YouTube desenhado (sem logo): retângulo vermelho com triângulo branco
      const s = 1 + Math.sin(t * 6) * 0.05, bw = 260 * s, bh = 180 * s, py = 1600, bx = W / 2 - bw / 2, by = py - bh / 2;
      ret(bx, by, bw, bh, '#ff3b3b'); ctx.fillStyle = '#ffffff'; ctx.beginPath();
      ctx.moveTo(W / 2 - 40 * s, py - 50 * s); ctx.lineTo(W / 2 + 55 * s, py); ctx.lineTo(W / 2 - 40 * s, py + 50 * s); ctx.fill();
    } else if (fim) { if (Math.floor(t * 2) % 2) texto('?', W / 2 + 330, 560, 200, COR.ouro); }
    else if (susto && Math.floor(t * 4) % 2) texto('!', W / 2 + 330, 520, 160, COR.alerta);
  };
}

// 2. MACRO na máquina do problema: faíscas estourando, fumaça, luz piscando, câmera passando devagar
function curtoFaisca(t, k) {
  const cat = (EP.problema || {}).categoria, L = leitura();
  R(0, 0, TW, TH, '#0e0a18');
  const esc = 7.2, cx = TW / 2 + lerp(30, -30, k), base = TH * 0.86;
  objeto(cat, cx, base, esc, t, 0);
  const pf = { x: cx + 6 * esc, y: base - 26 * esc };   // de onde sai a faísca
  const fase = (t * 1.3) % 1, estouro = fase < 0.22;
  TREMOR = estouro ? 1.2 : 0.2;
  if (estouro) {
    tx.globalCompositeOperation = 'lighter';
    const g = tx.createRadialGradient(pf.x, pf.y, 0, pf.x, pf.y, 90);
    g.addColorStop(0, 'rgba(255,240,190,0.9)'); g.addColorStop(1, 'rgba(255,140,40,0)');
    tx.fillStyle = g; tx.fillRect(pf.x - 90, pf.y - 90, 180, 180);
    tx.globalCompositeOperation = 'source-over';
    const f = Math.floor(t * 1.3);
    for (let i = 0; i < 26; i++) {
      const a = hashT(i, f) * Math.PI * 2, v = 30 + hashT(i + 9, f) * 90, q = fase / 0.22;
      R(pf.x + Math.cos(a) * v * q, pf.y + Math.sin(a) * v * q + 40 * q * q, 3, 3, i % 3 ? COR.ouro : '#ffffff');
    }
  }
  for (let i = 0; i < 7; i++) {   // fumaça subindo
    const q = (t * 0.35 + i / 7) % 1;
    tx.globalAlpha = (1 - q) * 0.45; tx.fillStyle = '#4a4466';
    tx.beginPath(); tx.arc(pf.x + Math.sin(t + i * 2) * 14, pf.y - q * 200, 10 + q * 30, 0, 7); tx.fill();
  }
  tx.globalAlpha = 0.12 + (Math.floor(t * 6) % 2) * 0.12; R(0, 0, TW, TH, '#ff2020'); tx.globalAlpha = 1;
  return () => { if (Math.floor(t * 3) % 3) texto(L.ruim, W / 2, 330, 44, COR.alerta, { maxW: W - 100 }); };
}

// 3. o herói CORRENDO pelo corredor da base: paredes passando rápido, lâmpadas vermelhas, riscos de velocidade
function curtoCorredor(t, k) {
  const h = heroiDaTomada(), chao = TH * 0.66, vel = 260, off = t * vel;
  R(0, 0, TW, chao, '#2b2f45');
  for (let x = -((off) % 60); x < TW; x += 60) {   // chapas e portas passando
    R(x, 40, 3, chao - 40, '#1f2234');
    if (Math.floor((x + off) / 60) % 3 === 0) { R(x + 14, chao - 150, 34, 150, '#1b1530'); R(x + 18, chao - 146, 26, 142, '#3a2f63'); R(x + 38, chao - 80, 4, 8, COR.ouro); }
  }
  for (let x = -((off * 0.5) % 120); x < TW; x += 120) {   // lâmpadas de alarme no teto
    const on = Math.floor(t * 6) % 2;
    R(x + 50, 30, 20, 10, on ? '#ff4d4d' : '#7a2a2a');
    if (on) { tx.globalAlpha = 0.25; tx.fillStyle = '#ff3030'; tx.beginPath(); tx.moveTo(x + 50, 40); tx.lineTo(x + 70, 40); tx.lineTo(x + 120, chao); tx.lineTo(x, chao); tx.fill(); tx.globalAlpha = 1; }
  }
  R(0, chao, TW, TH - chao, '#1d2031');
  for (let x = -((off * 1.4) % 40); x < TW; x += 40) R(x, chao + 6, 22, 3, '#2c3047');
  // riscos de velocidade
  for (let i = 0; i < 14; i++) { const y = 60 + hashT(i, 3) * (TH - 100), x = TW - ((t * 900 + hashT(i, 4) * TW) % (TW + 80)); tx.globalAlpha = 0.35; R(x, y, 40 + hashT(i, 5) * 50, 2, '#ffffff'); }
  tx.globalAlpha = 1;
  TREMOR = 0.7;
  const r = ator(h.pal, { x: TW * 0.42, chao, dir: 1, anda: t * 24, susto: true, cabeca: -2 }, t, 5.4);
  return etiquetaT(h.nome, r.cab, 5.4);
}

// 4. a BROCA da obra: torre de perfuração, broca girando e descendo pelo regolito até o gelo, pedras voando
function curtoBroca(t, k, cena) {
  const o = EP.mundo.obras.find((x) => x.slug === EP.missao_obra) || {}, [p0, p1] = (cena && cena.progresso) || [0, 1];
  const g = tx.createLinearGradient(0, 0, 0, TH * 0.42);
  g.addColorStop(0, '#d98a5c'); g.addColorStop(1, '#f2b98a'); tx.fillStyle = g; tx.fillRect(0, 0, TW, TH * 0.42);
  const sup = TH * 0.42;
  R(0, sup, TW, 70, '#a24c30'); R(0, sup + 70, TW, 90, '#8f4129'); R(0, sup + 160, TW, TH - sup - 160, '#9fd8e8');   // regolito → rocha → gelo
  for (let i = 0; i < 40; i++) R(hashT(i, 1) * TW, sup + hashT(i, 2) * 160, 5, 3, i % 2 ? '#7a3520' : '#b85a37');
  for (let i = 0; i < 16; i++) R(hashT(i, 3) * TW, sup + 170 + hashT(i, 4) * (TH - sup - 180), 8, 2, '#e8f8ff');
  const fundo = sup + lerp(20, 230, saida(clamp(k / 0.85))), bx = TW / 2;
  R(bx - 22, sup - 150, 6, 150, '#ffc83d'); R(bx + 16, sup - 150, 6, 150, '#ffc83d');   // torre
  for (let y = sup - 140; y < sup; y += 22) { R(bx - 18, y, 36, 3, '#e0a920'); }
  R(bx - 30, sup - 160, 60, 14, '#e2603b'); R(bx - 6, sup - 146, 12, fundo - sup + 146 - 30, '#9aa0b5');   // haste
  R(bx - 26, sup - 6, 52, 10, '#4a4466');
  // broca: espiral girando (listras inclinadas que sobem)
  tx.save(); tx.beginPath(); tx.moveTo(bx - 16, fundo - 40); tx.lineTo(bx + 16, fundo - 40); tx.lineTo(bx, fundo); tx.closePath(); tx.clip();
  R(bx - 16, fundo - 40, 32, 40, '#c9ced9');
  for (let i = -3; i < 6; i++) { const y = fundo - 40 + ((i * 10 + t * 60) % 50); R(bx - 16, y, 32, 4, '#6b6f86'); }
  tx.restore();
  R(bx - 18, fundo - 40, 36, 2, '#1b1530');
  // pedaços voando para fora do buraco (rocha ou gelo, conforme a profundidade)
  const gelo = fundo > sup + 160;
  for (let i = 0; i < 18; i++) {
    const q = (t * 1.8 + i / 18) % 1, lado = i % 2 ? 1 : -1, x = bx + lado * (20 + q * 90 * hashT(i, 7)), y = sup - Math.sin(q * Math.PI) * 70 * hashT(i, 8);
    R(x, y, 4, 4, gelo && i % 3 ? '#e8f8ff' : '#7a3520');
  }
  TREMOR = 0.6;
  const c = colonoQualquer(1), r = ator(c.pal, { x: TW * 0.18, chao: sup, dir: 1, maoF: { x: TW * 0.18 + 22, y: sup - 66 }, maoT: { x: TW * 0.18 + 18, y: sup - 62 } }, t, 3.2);
  ferramentaT('tablet', r.maoF, r.cotF, t, 3.2);
  const p = Math.round(lerp(p0, p1, clamp(k / 0.85)) * 100);
  return () => {
    texto((o.nome || 'OBRA').toUpperCase(), W / 2, 250, 40, '#ffffff', { maxW: W - 100 });
    texto(`${p}%`, W / 2, 380, 120, p >= 100 ? COR.ok : COR.ouro);
    if (gelo && Math.floor(t * 3) % 2) texto('GELO!', W / 2, 1560, 70, '#bff8ff');
  };
}

// 5. CHEGADA: os novos colonos atravessam a crista da duna em silhueta, contra um sol enorme; o nome aparece em cima
function curtoChegada(t, k, cena) {
  const g = tx.createLinearGradient(0, 0, 0, TH);
  g.addColorStop(0, '#3a2342'); g.addColorStop(0.5, '#c4643c'); g.addColorStop(1, '#2a1a30');
  tx.fillStyle = g; tx.fillRect(0, 0, TW, TH);
  tx.globalCompositeOperation = 'lighter';
  const sol = tx.createRadialGradient(TW / 2, TH * 0.5, 10, TW / 2, TH * 0.5, 200);
  sol.addColorStop(0, 'rgba(255,240,200,1)'); sol.addColorStop(0.25, 'rgba(255,200,140,0.7)'); sol.addColorStop(1, 'rgba(0,0,0,0)');
  tx.fillStyle = sol; tx.fillRect(0, 0, TW, TH);
  tx.globalCompositeOperation = 'source-over';
  const crista = (x) => TH * 0.56 - Math.sin(x * 0.012 + 1) * 18;
  tx.fillStyle = '#1e1226'; tx.beginPath(); tx.moveTo(0, TH);
  for (let x = 0; x <= TW; x += 4) tx.lineTo(x, crista(x)); tx.lineTo(TW, TH); tx.fill();
  const quem = ((cena && cena.focos) || []).map((f) => {
    const [tipo, id] = f.alvo.split(':');
    if (tipo === 'colono') { const c = colonoPorCodigo.get(id); return c ? { nome: c.nome, seed: c.seed, and: false } : null; }
    if (tipo === 'andarilho') { const a = (EP.mundo.andarilhos || []).find((x) => x.handle === f.alvo.slice(10)); return a ? { nome: '@' + a.handle, seed: a.seed, and: true, rede: a.rede } : null; }
    return null;
  }).filter(Boolean).slice(0, 4);
  if (!quem.length) quem.push({ nome: heroiDaTomada().nome, seed: 1, and: false });
  const sil = { pele: '#1b1530', cabelo: '#120c1c', roupa: '#1b1530', calca: '#120c1c', chapeu: false };
  const tags = [];
  quem.forEach((q, i) => {
    const x = lerp(-30 - i * 46, TW * 0.64 - i * 52, saida(clamp(k * 1.1)));
    const r = ator(sil, { x, chao: crista(x) + 2, dir: 1, anda: t * 10 + i }, t, 4);
    if (q.and) R(x - 26, crista(x) - 70, 10, 22, '#1b1530');   // mochila de quem chegou pelos comentários
    tags.push({ q, cab: r.cab, i });
  });
  return () => {
    texto('CHEGOU GENTE NOVA', W / 2, 300, 44, COR.ouro);
    for (const { q, cab, i } of tags) {
      if (k < 0.15 + i * 0.12) continue;
      texto(q.nome, cab.x * TE, (cab.y - 16) * TE, 30, '#ffffff', { maxW: 520 });
      if (q.rede && COR_ORIGEM[q.rede]) ret(cab.x * TE - 8, (cab.y - 8) * TE, 16, 16, COR_ORIGEM[q.rede]);
    }
  };
}

function prepararTomadasCurtas() {
  // cada fala ganha a animação do que ela conta (pedido do dono): ventania → lona rasgando; amarra/fecha → lona presa
  // e persianas; obra chegando a 100% → a obra terminando; tanque enche/ligou → inauguração; chegou → câmara de ar
  const add = (ini, fim, tipo, cena) => { if (fim - ini > 0.8) TOMADAS.push({ ini, fim, tipo, cena }); };
  for (const c of EP.cenas) {
    const a = c.inicio, d = c.fim - a;
    if (c.tipo === 'problema') {
      if (ehVentania()) { add(a, a + d * 0.3, 'cRosto', c); add(a + d * 0.3, c.fim, 'ventania', c); }
      else { add(a, a + d * 0.42, 'cRosto', c); add(a + d * 0.42, c.fim, 'cFaisca', c); }
    } else if (c.tipo === 'solucao') {
      if (ehVentania()) { const f = palavraEm(c, /^fecha/i, a + 1) ?? a + d * 0.6; add(a, f - 0.1, 'amarraLona', c); add(f - 0.1, c.fim, 'persiana', c); }
      else { add(a, a + d * 0.55, 'cCorredor', c); add(a + d * 0.55, c.fim, 'objeto', c); }
    } else if (c.tipo === 'boas_vindas') add(a, c.fim, 'boasVindas', c);
    else if (c.tipo === 'andarilhos') add(a, c.fim, 'cChegada', c);
    else if (c.tipo === 'missao' && (c.tomadas || []).length) for (const [i0, i1, tipo] of trechosDasEtapas(c, true)) add(i0, i1, tipo, c);
    else if (c.tipo === 'missao') add(a, c.fim, c.acao === 'ligar' ? 'inauguracao' : ((c.progresso || [0, 0])[1] >= 1 ? 'obra' : 'cBroca'), c);
    else if (c.tipo === 'youtube') add(a, c.fim, 'cRosto', c);   // fim: TikTok no suspense (?), Instagram sorrindo com o play
  }
}

// ---- TikTok: linguagem de CÂMERA DE SEGURANÇA (diferente do corte do Instagram, mesmo episódio)
function cctvFiltro(t, ver = 0.55) {   // verde-acinzentado, linhas, chiado, vinheta e o carimbo da câmera
  tx.globalCompositeOperation = 'multiply'; tx.globalAlpha = ver; R(0, 0, TW, TH, '#7fae8f'); tx.globalAlpha = 1;
  tx.globalCompositeOperation = 'source-over';
  for (let y = (Math.floor(t * 40) % 3); y < TH; y += 3) { tx.globalAlpha = 0.18; R(0, y, TW, 1, '#000'); }
  const f = Math.floor(t * 20);
  for (let i = 0; i < 90; i++) { tx.globalAlpha = 0.25; R(hashT(i, f) * TW, hashT(i + 5, f) * TH, 1, 1, '#ffffff'); }
  if (hashT(f, 7) > 0.85) { tx.globalAlpha = 0.25; R(0, hashT(f, 8) * TH, TW, 6 + hashT(f, 9) * 10, '#ffffff'); }   // linha de interferência
  tx.globalAlpha = 1;
}
function cctvCarimbo(t, cam) {   // texto da câmera, na resolução cheia
  return () => {
    if (Math.floor(t * 2) % 2) { ret(80, 150, 22, 22, '#ff3b3b'); }
    texto('REC', 120, 172, 30, '#ffffff', { alinhar: 'left', contorno: false });
    texto(cam, W - 80, 172, 26, '#ffffff', { alinhar: 'right', contorno: false });
    const s = Math.floor(t * 30) % 1800, hh = String(3 + Math.floor(s / 600)).padStart(2, '0'), mm = String(Math.floor(s / 30) % 60).padStart(2, '0');
    texto(`SOL ${String(EP.numero).padStart(3, '0')}  ${hh}:${mm}:${String(Math.floor(s % 30 * 2)).padStart(2, '0')}`, 80, 1780, 26, '#ffffff', { alinhar: 'left', contorno: false });
  };
}

// 1. câmera de vigilância na sala da máquina: as luzes da máquina apagam uma a uma, alarme, o herói entra correndo
function ttCCTV(t, k) {
  const chao = sala(t, { vermelho: k > 0.35, janela: false });
  const cat = (EP.problema || {}).categoria, ox = TW * 0.62;
  objeto(cat, ox, chao + 2, 3.4, t, 0);
  for (let i = 0; i < 4; i++) {   // painel de luzinhas ao lado: apagando
    const viva = k < 0.1 + i * 0.07;
    R(TW * 0.12, 120 + i * 26, 18, 14, viva ? '#4ed37a' : (Math.floor(t * 5 + i) % 2 ? COR.alerta : '#3a1a1a'));
  }
  if (k > 0.35) { tx.globalAlpha = 0.2 + 0.12 * Math.sin(t * 12); R(0, 0, TW, TH, '#ff2020'); tx.globalAlpha = 1; }
  let r = null;
  const h = heroiDaTomada();
  if (k > 0.55) { const q = clamp((k - 0.55) / 0.3); r = ator(h.pal, { x: lerp(-30, ox - 70, suave(q)), chao: chao + 2, dir: 1, anda: q < 1 ? t * 20 : null, susto: true, agacha: q >= 1 ? 0.5 : 0 }, t, 4); }
  cctvFiltro(t);
  const carimbo = cctvCarimbo(t, 'CAM 03 · SALA DO AR');
  return () => { carimbo(); if (r) etiquetaT(h.nome, r.cab, 4)(); if (k > 0.35 && k < 0.6 && Math.floor(t * 3) % 2) texto('FALHA DETECTADA', W / 2, 330, 44, COR.alerta); };
}

// 2. câmara de ar: a porta abre com vapor, quem veio dos comentários entra de mochila, o scanner passa e o crachá sai
function ttCracha(t, k, cena) {
  const quem = ((cena && cena.focos) || []).map((f) => {
    const [tipo, id] = f.alvo.split(':');
    if (tipo === 'andarilho') { const a = (EP.mundo.andarilhos || []).find((x) => x.handle === f.alvo.slice(10)); return a && { nome: '@' + a.handle, seed: a.seed, rede: a.rede, and: true }; }
    if (tipo === 'colono') { const c = colonoPorCodigo.get(id); return c && { nome: c.nome, seed: c.seed, and: false }; }
    return null;
  }).filter(Boolean);
  const q0 = quem.length ? quem[Math.min(quem.length - 1, Math.floor(k * quem.length))] : { nome: heroiDaTomada().nome, seed: 1 };
  const kk = quem.length ? (k * quem.length) % 1 : k;
  const chao = sala(t, { janela: false });
  // porta da câmara de ar (abre em duas folhas) com a luz de fora
  const px = TW * 0.5, abre = suave(clamp(kk / 0.22)) * 46;
  R(px - 60, chao - 190, 120, 190, '#1b1530'); R(px - 50, chao - 180, 100, 180, '#d98a5c');
  R(px - 50, chao - 180, 50 - abre, 180, '#9aa0b5'); R(px + abre, chao - 180, 50 - abre, 180, '#9aa0b5');
  R(px - 64, chao - 200, 128, 12, Math.floor(t * 3) % 2 ? '#ffc83d' : '#e0a920');
  for (let i = 0; i < 10; i++) { const q = (t * 0.6 + i / 10) % 1; tx.globalAlpha = (1 - q) * 0.5 * clamp(kk / 0.3); tx.fillStyle = '#eef0f8'; tx.beginPath(); tx.arc(px + (hashT(i, 2) - 0.5) * 120 * q, chao - 20 - q * 120, 8 + q * 22, 0, 7); tx.fill(); }
  tx.globalAlpha = 1;
  const anda = clamp((kk - 0.18) / 0.32), x = lerp(px, TW * 0.36, suave(anda));
  const r = ator(paletaDe(q0.seed), { x, chao: chao + 2, dir: -1, anda: anda < 1 ? t * 12 : null, alegre: anda >= 1 }, t, 4.4);
  if (q0.and) R(x + 14, chao - 96, 14, 30, '#8a5a34');   // mochila
  if (kk > 0.5 && kk < 0.75) {   // feixe do scanner descendo pelo corpo
    const y = lerp(chao - 150, chao, (kk - 0.5) / 0.25);
    tx.globalAlpha = 0.7; R(x - 40, y, 80, 3, '#3fd0c9'); tx.globalAlpha = 0.2; R(x - 40, y - 14, 80, 14, '#3fd0c9'); tx.globalAlpha = 1;
  }
  cctvFiltro(t, 0.35);
  const carimbo = cctvCarimbo(t, 'CAM 01 · ENTRADA');
  return () => {
    carimbo();
    if (kk > 0.72) {   // crachá saindo da impressora
      const s = saida(clamp((kk - 0.72) / 0.12)), y = 1640 - s * 120;
      ret(W / 2 - 300, y, 600, 230, '#eef0f8'); ret(W / 2 - 300, y, 600, 46, '#e2603b');
      texto('CRACHÁ DE COLONO', W / 2, y + 34, 28, '#ffffff', { contorno: false });
      texto(q0.nome, W / 2, y + 120, 40, '#1b1530', { contorno: false, maxW: 540 });
      if (q0.rede && COR_ORIGEM[q0.rede]) ret(W / 2 - 270, y + 150, 26, 26, COR_ORIGEM[q0.rede]);
      texto(q0.and ? 'ANDARILHO · SEM CASA (AINDA)' : 'COLONO', W / 2 + 20, y + 180, 22, '#6b6f86', { contorno: false, maxW: 480 });
    } else if (kk > 0.5) texto('ESCANEANDO...', W / 2, 330, 40, COR.agua);
  };
}

// 3. TIMELAPSE da obra: câmera fixa no horizonte, o céu gira dia → noite → dia e a construção sobe em blocos
function ttTimelapse(t, k, cena) {
  const o = EP.mundo.obras.find((x) => x.slug === EP.missao_obra) || {}, [p0, p1] = (cena && cena.progresso) || [0, 1];
  const p = lerp(p0, p1, clamp(k / 0.9)), ciclo = (k * 2.2) % 1, noite = Math.max(0, Math.sin(ciclo * Math.PI * 2));
  const g = tx.createLinearGradient(0, 0, 0, TH * 0.6);
  g.addColorStop(0, `rgb(${Math.round(lerp(217, 14, noite))},${Math.round(lerp(138, 10, noite))},${Math.round(lerp(92, 30, noite))})`);
  g.addColorStop(1, `rgb(${Math.round(lerp(242, 58, noite))},${Math.round(lerp(185, 35, noite))},${Math.round(lerp(138, 66, noite))})`);
  tx.fillStyle = g; tx.fillRect(0, 0, TW, TH);
  if (noite > 0.3) for (let i = 0; i < 40; i++) { tx.globalAlpha = noite; R(hashT(i, 1) * TW, hashT(i, 2) * TH * 0.5, 1, 1, '#ffffff'); }
  tx.globalAlpha = 1;
  const sa = ciclo * Math.PI * 2; R(TW / 2 + Math.cos(sa) * 150, TH * 0.5 + Math.sin(sa) * 170, 8, 8, '#fff3d6');   // sol riscando o céu
  const chao = TH * 0.62;
  tx.fillStyle = noite > 0.5 ? '#2a1a30' : '#a24c30'; tx.fillRect(0, chao, TW, TH - chao);
  const [ca, cb] = COR_OBRA[o.tipo] || ['#c9ced9', '#e2603b'];
  const blocos = Math.round(p * 12), bx = TW / 2 - 50;
  for (let i = 0; i < blocos; i++) { const lin = Math.floor(i / 3), col = i % 3; R(bx + col * 34, chao - 22 - lin * 22, 32, 20, lin % 2 ? cb : ca); R(bx + col * 34, chao - 22 - lin * 22, 32, 3, '#ffffff33'); }
  if (blocos < 12) { const lin = Math.floor(blocos / 3); R(bx - 8, chao - 30 - lin * 22, 3, 30 + lin * 22, '#ffc83d'); R(bx - 8, chao - 30 - lin * 22, 120, 3, '#ffc83d'); }   // guindaste
  if (noite > 0.4) for (let i = 0; i < blocos; i += 2) R(bx + (i % 3) * 34 + 12, chao - 14 - Math.floor(i / 3) * 22, 6, 5, '#ffe58a');   // janelas acesas
  for (let i = 0; i < 6; i++) { const x = (hashT(i, 4) * TW + t * 160 * (i % 2 ? 1 : -1)) % TW; R((x + TW) % TW, chao - 10, 4, 10, '#1b1530'); }   // colonos passando rápido (borrão)
  cctvFiltro(t, 0.15);
  const carimbo = cctvCarimbo(t, 'CAM 07 · TIMELAPSE');
  return () => {
    carimbo();
    texto((o.nome || 'OBRA').toUpperCase(), W / 2, 300, 40, '#ffffff', { maxW: W - 100 });
    texto(`${Math.round(p * 100)}%`, W / 2, 420, 110, COR.ouro);
    texto('▶▶ x1000', W - 80, 230, 26, '#ffffff', { alinhar: 'right', contorno: false });
  };
}

// 4. fim: a câmera trava no herói, a imagem se desfaz em chiado e cai o sinal
function ttSinal(t, k) {
  const chao = sala(t, { vermelho: true, janela: false }), h = heroiDaTomada();
  const congela = k > 0.35 ? 0.35 : k;   // a imagem trava
  ator(h.pal, { x: TW * 0.5, chao: chao + 2, dir: -1, susto: true, cabeca: 3, maoF: { x: TW * 0.5 - 30, y: chao - 120 }, maoT: { x: TW * 0.5 + 24, y: chao - 116 } }, congela * 10, 5);
  tx.globalAlpha = 0.2; R(0, 0, TW, TH, '#ff2020'); tx.globalAlpha = 1;
  cctvFiltro(t);
  const ruido = clamp((k - 0.4) / 0.35);
  if (ruido > 0) {
    const f = Math.floor(t * 24);
    for (let y = 0; y < TH; y += 4) for (let x = 0; x < TW; x += 4) if (hashT(x * 3 + y, f) < ruido) R(x, y, 4, 4, hashT(x + y * 7, f + 1) > 0.5 ? '#d0d0d0' : '#202020');
    for (let i = 0; i < 4; i++) { tx.globalAlpha = ruido * 0.5; R(0, hashT(i, f) * TH, TW, 4 + hashT(i + 2, f) * 18, '#ffffff'); }
    tx.globalAlpha = 1;
  }
  if (k > 0.78) R(0, 0, TW, TH, '#0a0a12');
  const carimbo = cctvCarimbo(t, 'CAM 03 · SALA DO AR');
  return () => {
    if (k <= 0.78) carimbo();
    if (k > 0.35 && k <= 0.78 && Math.floor(t * 4) % 2) texto('IMAGEM CONGELADA', W / 2, 330, 36, COR.alerta);
    if (k > 0.78) { texto('SINAL PERDIDO', W / 2, 640, 60, '#ffffff'); texto('CONTINUA NO YOUTUBE', W / 2, 1560, 34, COR.ouro); }
  };
}

function prepararTomadasTikTok() {
  const add = (ini, fim, tipo, cena) => { if (fim - ini > 0.8) TOMADAS.push({ ini, fim, tipo, cena }); };
  for (const c of EP.cenas) {
    const a = c.inicio, d = c.fim - a;
    if (c.tipo === 'problema') { if (ehVentania()) { add(a, a + d * 0.35, 'tCCTV', c); add(a + d * 0.35, c.fim, 'tVentania', c); } else add(a, c.fim, 'tCCTV', c); }
    else if (c.tipo === 'boas_vindas' || c.tipo === 'andarilhos') add(a, c.fim, 'tCracha', c);
    else if (c.tipo === 'missao' && (c.tomadas || []).length) for (const [i0, i1, tipo] of trechosDasEtapas(c, true)) add(i0, i1, 'cctv:' + tipo, c);
    else if (c.tipo === 'missao') add(a, c.fim, c.acao === 'ligar' ? 'tInauguracao' : 'tTimelapse', c);
    else if (c.tipo === 'youtube') add(a, c.fim, 'tSinal', c);
    else if (c.tipo === 'solucao') {
      if (ehVentania()) { const f = palavraEm(c, /^fecha/i, a + 1) ?? a + d * 0.6; add(a, f - 0.1, 'tAmarra', c); add(f - 0.1, c.fim, 'tPersiana', c); }
      else { add(a, a + d * 0.55, 'cCorredor', c); add(a + d * 0.55, c.fim, 'objeto', c); }
    }
  }
}

// ------------------------------------------------------------------ roteiro dos cortes
// ================================================================== tomadas novas (refino do ep. 8, pedido do dono)
// Cenas que antes ficavam só no mapa ganham corte próprio: a chegada de quem entrou, o batismo da cratera, o
// resultado da votação do telescópio, a inauguração da obra e a assembleia da votação nova.
function pessoaDoCodigo(cod, i = 0) { const c = cod && colonoPorCodigo.get(cod); return c ? pessoaT(c) : colonoQualquer(i); }

// ---- BOAS-VINDAS: a câmara de ar abre (luz vermelha → verde, vapor da pressurização) e quem chegou entra;
// a Comandante Vega recebe acenando
function tomadaBoasVindas(t, k, cena) {
  TREMOR = 0;
  const chao = sala(t, { janela: false });
  const pw = 74, ph = 136, px = TW - pw - 22, py = chao - ph;
  R(px - 10, py - 10, pw + 20, ph + 10, '#1b1530'); R(px - 6, py - 6, pw + 12, ph + 6, '#6b6f86');
  const g = tx.createLinearGradient(0, py, 0, chao); g.addColorStop(0, '#f0b88c'); g.addColorStop(1, '#c4643c');
  tx.fillStyle = g; tx.fillRect(px, py, pw, ph);
  tx.fillStyle = '#b85a37'; tx.beginPath(); tx.moveTo(px, chao);
  for (let x = 0; x <= pw; x += 4) tx.lineTo(px + x, chao - 26 - Math.sin(x * 0.09) * 6); tx.lineTo(px + pw, chao); tx.fill();
  const abre = suave(clamp((k - 0.06) / 0.22)), folha = ph * (1 - abre);
  R(px, py, pw, folha, '#9aa0b5');
  for (let y = py + 10; y < py + folha - 4; y += 18) R(px, y, pw, 2, '#6b6f86');
  if (folha > 8) R(px + pw / 2 - 8, py + folha - 10, 16, 5, '#ffc83d');
  R(px + pw / 2 - 5, py - 22, 10, 7, abre > 0.97 ? COR.ok : (Math.floor(t * 4) % 2 ? COR.alerta : '#7a2a2a'));
  if (abre > 0.02 && k < 0.6) for (let i = 0; i < 16; i++) {   // vapor saindo da câmara
    const q = (t * 0.9 + i / 16) % 1;
    tx.globalAlpha = (1 - q) * 0.45 * (1 - clamp((k - 0.4) / 0.2));
    R(px + hashT(i, 3) * pw - q * 60, chao - 8 - q * 70 - hashT(i, 4) * 50, 6 + q * 12, 4 + q * 8, '#eef0f8');
  }
  tx.globalAlpha = 1;
  const novos = (cena.colonos || []).map((c) => colonoPorCodigo.get(c)).filter(Boolean).slice(0, 3).map(pessoaT);
  if (!novos.length) novos.push(colonoQualquer(0));
  const rs = [];
  novos.forEach((p, i) => {
    const q = clamp((k - 0.26 - i * 0.12) / 0.38);
    if (q <= 0) return;
    const x = lerp(px + pw / 2, TW * 0.54 - i * 40, suave(q)), parado = q >= 1;
    rs.push({ p, r: ator(p.pal, { x, chao, dir: -1, anda: parado ? null : t * 11, alegre: parado,
      maoF: parado && i === 0 ? { x: x - 20, y: chao - 92 + Math.sin(t * 9) * 6 } : null }, t, 3.2) });
  });
  const xv = TW * 0.17;
  ator(FUNDADOR_PAL.vega, { x: xv, chao, dir: 1, alegre: k > 0.45, maoF: k > 0.45 ? { x: xv + 22, y: chao - 92 + Math.sin(t * 9 + 1) * 6 } : null }, t, 3.2);
  return () => {
    texto('GENTE NOVA NA COLÔNIA', W / 2, 220, 42, COR.ouro, { maxW: W - 140 });
    for (const { p, r } of rs) texto(p.nome, r.cab.x * TE, (r.cab.y - 12) * TE, 30, '#ffffff', { maxW: 420 });
  };
}

// ---- CRATERA: quem batizou chega na borda com a placa, crava o poste a marteladas e a placa ganha o nome
function tomadaCratera(t, k, cena) {
  TREMOR = 0;
  ceuT(); R(40 + t * 2, 46, 6, 6, '#fff3d6'); dunasLonge(t, 0.42);
  const chao = TH * 0.6;
  const cr = (EP.mundo.crateras || []).find((c) => (cena.crateras || []).includes(c.id)) || { nome: 'Cratera', codigo: null };
  chaoT(chao);
  const cx = TW * 0.72, rx = 66, fundo = 60;
  for (const lado of [-1, 1]) {   // bordas levantadas
    tx.fillStyle = '#c46c44'; tx.beginPath(); tx.ellipse(cx + lado * rx, chao, 26, 13, 0, Math.PI, 0); tx.fill();
    tx.fillStyle = '#d98a5c'; tx.beginPath(); tx.ellipse(cx + lado * rx - 4, chao - 2, 16, 8, 0, Math.PI, Math.PI * 1.6); tx.fill();
  }
  tx.save(); tx.beginPath(); tx.rect(0, chao, TW, TH); tx.clip();
  tx.fillStyle = '#6b2f1d'; tx.beginPath(); tx.ellipse(cx, chao, rx, fundo, 0, 0, Math.PI * 2); tx.fill();
  tx.fillStyle = '#8f4129'; tx.beginPath(); tx.ellipse(cx + 12, chao + 8, rx - 18, fundo - 16, 0, 0, Math.PI * 2); tx.fill();
  tx.fillStyle = '#a14b2f'; tx.beginPath(); tx.ellipse(cx + 22, chao + 18, rx - 44, fundo - 36, 0, 0, Math.PI * 2); tx.fill();
  tx.restore();
  for (let i = 0; i < 7; i++) R(cx - rx + 10 + hashT(i, 61) * rx * 2 - 20, chao + 10 + hashT(i, 62) * 30, 4, 3, '#5a2a18');   // pedras no fundo
  const sx = cx - rx - 40, p = pessoaDoCodigo(cr.codigo, 3), E = 3;
  const anda = clamp(k / 0.28), martela = clamp((k - 0.3) / 0.3), pronto = k > 0.62;
  const alt = 40 + 56 * suave(martela);                         // poste entrando no chão (de cima: fica mais alto à vista)
  const xp = lerp(-30, sx - 34, suave(anda));
  if (martela > 0) {
    R(sx - 1.5, chao - alt, 3, alt, '#d8dbe8');
    R(sx - 46, chao - alt - 26, 92, 26, '#5a3a22'); R(sx - 44, chao - alt - 24, 88, 22, pronto ? '#8a5a34' : '#6b4a2e');
    if (pronto) { R(sx + 1, chao - alt - 46, 2, 20, '#d8dbe8'); R(sx + 3, chao - alt - 46, 14, 8, COR.ouro); }
  }
  const golpe = martela > 0 && martela < 1 ? Math.abs(Math.sin(t * 9)) : 0;
  const r = ator(p.pal, { x: xp, chao, dir: 1, anda: anda < 1 ? t * 10 : null, alegre: pronto, pulo: pronto ? Math.abs(Math.sin(t * 6)) * 6 : 0,
    maoF: martela > 0 && !pronto ? { x: sx - 6, y: chao - alt - 30 + golpe * 18 } : (pronto ? { x: xp + 6, y: chao - 96 } : null),
    maoT: anda < 1 ? { x: xp + 8, y: chao - 50 } : null }, t, E);
  if (anda < 1) seg({ x: xp - 6, y: chao - 52 }, { x: xp + 40, y: chao - 46 }, 3, '#d8dbe8');   // carregando o poste
  if (martela > 0 && !pronto) ferramentaT('chave', r.maoF, r.cotF, t, E);
  if (golpe > 0.95) for (let i = 0; i < 5; i++) R(sx - 6 + (hashT(i, Math.floor(t * 9)) - 0.5) * 20, chao - alt - 28 - hashT(i + 5, Math.floor(t * 9)) * 10, 2, 2, '#ffffff');
  return () => {
    texto('NOME NOVO NO MAPA', W / 2, 220, 40, COR.ouro, { maxW: W - 140 });
    if (pronto) texto(cr.nome.toUpperCase(), sx * TE, (chao - alt - 13) * TE, 20, '#ffffff', { maxW: 84 * TE });
    if (!pronto) texto(p.nome, r.cab.x * TE, (r.cab.y - 10) * TE, 26, '#ffffff', { maxW: 360 });
    else texto(`BATIZADA POR ${p.nome.toUpperCase()}`, W / 2, 280, 26, '#ffffff', { maxW: W - 140 });
  };
}

// ---- RESULTADO DO TELESCÓPIO (votação SIM): o telescópio no teto do Módulo de Pouso — o teto afunda, estala e
// todo mundo pula para trás; corta para a planta azul do Módulo de Comando, logo acima do módulo, com a cúpula
function tomadaTelescopioTeto(t, k) {
  TREMOR = k > 0.35 && k < 0.7 ? 0.35 : 0;
  const g = tx.createLinearGradient(0, 0, 0, TH); g.addColorStop(0, '#0d0a1c'); g.addColorStop(0.7, '#3a2342'); g.addColorStop(1, '#7a3a2a');
  tx.fillStyle = g; tx.fillRect(0, 0, TW, TH);
  for (let i = 0; i < 60; i++) R(hashT(i, 71) * TW, hashT(i, 72) * TH * 0.55, 1, 1, i % 7 ? '#ffffff' : '#8fe6ff');
  R(TW * 0.8, TH * 0.16, 3, 3, '#6fb8ff');                                   // a Terra, um pontinho azul
  const chao = TH * 0.66;
  chaoT(chao, '#5a2a1a', '#3d1b12');
  const mx = TW / 2, mw = 150, mh = 80, topo = chao - mh, afunda = 18 * suave(clamp((k - 0.3) / 0.4));
  R(mx - mw / 2, topo, mw, mh, '#c9ced9'); R(mx - mw / 2 + 4, topo + 4, mw - 8, mh - 8, '#e4e6f0');
  R(mx - mw / 2, topo + 30, mw, 6, '#e2603b');
  for (let i = 0; i < 4; i++) R(mx - 56 + i * 32, topo + 46, 16, 12, '#3fd0c9');
  tx.fillStyle = '#d2d5e2'; tx.beginPath(); tx.moveTo(mx - mw / 2, topo);   // teto (cúpula) que afunda no meio
  tx.quadraticCurveTo(mx, topo - 50 + afunda * 2.4, mx + mw / 2, topo); tx.fill();
  const ty = topo - 34 + afunda * 1.8, ang = -0.8 + afunda * 0.02;
  seg({ x: mx - 14, y: ty + 16 }, { x: mx, y: ty }, 3, '#6b6f86'); seg({ x: mx + 14, y: ty + 16 }, { x: mx, y: ty }, 3, '#6b6f86');
  for (let i = 0; i < 38; i++) R(mx + Math.cos(ang) * i - 3, ty + Math.sin(ang) * i - 3, 7, 7, i > 32 ? '#2a2140' : '#9aa0b5');
  if (k > 0.42) {   // rachaduras e pedacinhos caindo
    tx.strokeStyle = '#2a2140'; tx.lineWidth = 2; tx.beginPath();
    tx.moveTo(mx - 20, topo - 14 + afunda); tx.lineTo(mx - 8, topo - 4 + afunda); tx.lineTo(mx - 16, topo + 6); tx.moveTo(mx + 12, topo - 12 + afunda); tx.lineTo(mx + 22, topo); tx.stroke();
    for (let i = 0; i < 6; i++) { const q = ((t * 1.3 + i / 6) % 1); R(mx - 30 + i * 12, topo + q * (mh + 10), 3, 3, '#9aa0b5'); }
  }
  const rs = [];
  for (let i = 0; i < 3; i++) {
    const c = colonoQualquer(i + 9), x0 = [TW * 0.14, TW * 0.86, TW * 0.3][i], fuga = clamp((k - 0.5) / 0.2) * (i === 1 ? 26 : -26);
    rs.push(ator(c.pal, { x: x0 + fuga, chao, dir: i === 1 ? -1 : 1, cabeca: -4, susto: k > 0.48, pulo: k > 0.48 && k < 0.6 ? 10 : 0 }, t, 2.6));
  }
  if (k > 0.45) rs.forEach((r, i) => exclamacao(r.cab.x, r.cab.y - 4, t + i * 0.3, 2.6));
  return () => { if (k > 0.45) texto('O TETO NÃO AGUENTA!', W / 2, 220, 40, COR.alerta, { maxW: W - 140 }); };
}
function tomadaPlantaComando(t, k) {
  TREMOR = 0;
  R(0, 0, TW, TH, '#163a80');
  for (let x = 0; x < TW; x += 15) R(x, 0, 1, TH, '#2a56a8');
  for (let y = 0; y < TH; y += 15) R(0, y, TW, 1, '#2a56a8');
  const linha = '#eaf2ff', prog = (a, b) => clamp((k - a) / (b - a));
  const tr = (x0, y0, x1, y1, q) => { if (q > 0) seg({ x: x0, y: y0 }, { x: lerp(x0, x1, q), y: lerp(y0, y1, q) }, 2, linha); };
  const caixa = (x, y, w, h, q) => { tr(x, y, x + w, y, clamp(q * 4)); tr(x + w, y, x + w, y + h, clamp(q * 4 - 1)); tr(x + w, y + h, x, y + h, clamp(q * 4 - 2)); tr(x, y + h, x, y, clamp(q * 4 - 3)); };
  // Módulo de Pouso (já existe): embaixo, tracejado
  const mx = TW / 2 - 50, my = TH * 0.62;
  caixa(mx, my, 100, 64, 1);
  for (let x = mx + 6; x < mx + 96; x += 12) R(x, my + 30, 6, 2, linha);
  // Módulo de Comando (novo), logo acima, com a cúpula e o telescópio
  const cy = my - 130, q1 = prog(0.12, 0.55), q2 = prog(0.5, 0.78), q3 = prog(0.74, 0.95);
  caixa(mx + 6, cy, 88, 70, q1);
  if (q2 > 0) {
    tx.strokeStyle = linha; tx.lineWidth = 2; tx.beginPath(); tx.arc(mx + 66, cy, 22, Math.PI, Math.PI + Math.PI * q2); tx.stroke();
    for (let i = 0; i < 4; i++) if (q2 > (i + 1) / 5) R(mx + 16 + i * 14, cy + 22, 8, 8, linha);
  }
  if (q3 > 0) tr(mx + 66, cy - 12, mx + 66 + 40, cy - 52, q3);
  for (let y = my - 6; y > cy + 74; y -= 8) if (k > 0.3) R(TW / 2 - 1, y, 2, 4, '#ffc83d');   // ligação entre os dois
  return () => {
    texto('MÓDULO DE COMANDO', W / 2, 200, 42, '#ffffff', { maxW: W - 140 });
    if (k > 0.78) texto('TELESCÓPIO', (mx + 110) * TE, (cy - 62) * TE, 24, COR.ouro);
    texto('MÓDULO DE POUSO', W / 2, (my + 84) * TE, 22, '#bcd2ff');
  };
}

// ---- INAUGURAÇÃO: a Comandante corta a fita na frente da obra pronta; depois a obra "liga" (Extrator: o
// tanque enche com a água tirada do gelo; as outras: as luzes acendem) e a colônia comemora com confete
function tomadaInauguracao(t, k) {
  TREMOR = 0;
  const o = EP.mundo.obras.find((x) => x.slug === EP.missao_obra) || {};
  ceuT(0.25); R(TW * 0.8, 60, 8, 8, '#fff3d6'); dunasLonge(t, 0.46);
  const chao = TH * 0.62, corta = 0.22, liga = clamp((k - 0.3) / 0.5);
  chaoT(chao);
  const [ca, cb] = COR_OBRA[o.tipo] || ['#c9ced9', '#e2603b'];
  if (o.tipo === 'gelo') {
    const tq = { x: TW * 0.2, w: 84, h: 120 };   // tanque
    R(tq.x - 2, chao - tq.h - 2, tq.w + 4, tq.h + 2, '#6b6f86'); R(tq.x, chao - tq.h, tq.w, tq.h, '#c9ced9');
    tx.fillStyle = '#e4e6f0'; tx.beginPath(); tx.ellipse(tq.x + tq.w / 2, chao - tq.h, tq.w / 2, 12, 0, Math.PI, 0); tx.fill();
    const nivel = (tq.h - 16) * liga;
    R(tq.x + 30, chao - tq.h + 10, 24, tq.h - 18, '#2a2140');   // visor do nível
    R(tq.x + 31, chao - 9 - nivel, 22, nivel, COR.agua);
    if (liga > 0 && liga < 1) R(tq.x + 31, chao - 9 - nivel, 22, 2, '#bff8ff');
    const torre = TW * 0.68;   // torre da broca treliçada, cano até o tanque
    for (let y = 0; y < 170; y += 6) { const w = lerp(56, 14, y / 170); R(torre - w / 2, chao - y - 3, 3, 6, cb === '#3fd0c9' ? '#9aa0b5' : cb); R(torre + w / 2 - 3, chao - y - 3, 3, 6, '#9aa0b5'); if (y % 18 === 0) R(torre - w / 2, chao - y, w, 2, '#6b6f86'); }
    R(torre - 8, chao - 178, 16, 10, '#e2603b');
    R(tq.x + tq.w, chao - 30, torre - tq.x - tq.w - 10, 8, '#9aa0b5');
    if (liga > 0) for (let i = 0; i < 6; i++) { const q = (t * 1.6 + i / 6) % 1; R(lerp(torre - 12, tq.x + tq.w, q), chao - 28, 6, 4, COR.agua); }
    R(torre - 4, chao, 8, TH - chao, '#6b6f86');   // broca descendo até o gelo
    R(0, TH - 34, TW, 34, '#bfe7f5'); for (let i = 0; i < 10; i++) R(i * 28 + 4, TH - 30, 20, 3, '#ffffff');
  } else {
    const bw = 140, bh = 120, bx = TW / 2 - bw / 2 + 30;
    R(bx, chao - bh, bw, bh, ca); R(bx, chao - bh, bw, 5, '#ffffff55');
    let n = 0;
    for (let y = chao - bh + 18; y < chao - 24; y += 30) for (let x = bx + 12; x < bx + bw - 16; x += 26, n++)
      R(x, y, 14, 12, liga * 9 > n ? '#ffe58a' : cb);
    if (o.tipo === 'comando') { tx.fillStyle = '#eef0f8'; tx.beginPath(); tx.arc(bx + bw - 34, chao - bh, 22, Math.PI, 0); tx.fill(); seg({ x: bx + bw - 34, y: chao - bh - 12 }, { x: bx + bw, y: chao - bh - 46 }, 6, '#9aa0b5'); }
  }
  // fita vermelha na frente (a Comandante corta) e os colonos
  const fy = chao - 40;
  if (k < corta) R(TW * 0.08, fy, TW * 0.84, 4, '#e04f5f');
  else { const q = clamp((k - corta) / 0.12); for (const s of [-1, 1]) seg({ x: TW / 2 + s * 4, y: fy + q * 30 }, { x: TW / 2 + s * TW * 0.42, y: fy }, 3, '#e04f5f'); }
  const xv = TW / 2 - 16;
  const rv = ator(FUNDADOR_PAL.vega, { x: xv, chao, dir: 1, alegre: k > corta, maoF: k < corta + 0.05 ? { x: TW / 2 - 2, y: fy + 1 } : { x: xv + 8, y: chao - 92 } }, t, 3);
  if (k < corta + 0.05) { seg(rv.maoF, { x: rv.maoF.x + 8, y: rv.maoF.y - 4 + (Math.floor(t * 10) % 2) * 6 }, 2, '#c9ced9'); }
  for (let i = 0; i < 4; i++) {
    const c = colonoQualquer(i + 13), x = [TW * 0.1, TW * 0.24, TW * 0.78, TW * 0.92][i], festa = k > 0.55;
    ator(c.pal, { x, chao: chao + 30, dir: x < TW / 2 ? 1 : -1, alegre: festa, pulo: festa ? Math.abs(Math.sin(t * 7 + i)) * 10 : 0,
      maoF: festa ? { x: x + (x < TW / 2 ? 6 : -6), y: chao - 66 } : null }, t, 2.8);
  }
  if (k > corta) for (let i = 0; i < 40; i++) {   // confete
    const q = ((t * 0.35 + hashT(i, 81)) % 1), x = hashT(i, 82) * TW + Math.sin(t * 3 + i) * 8;
    R(x, q * TH * 0.8, 3, 4, ['#ffc83d', '#e04f5f', '#3fd0c9', '#4ed37a', '#eef0f8'][i % 5]);
  }
  return () => {
    const y0 = EP.curto === 'tiktok' ? 280 : 200;   // no TikTok, abaixo do letreiro da câmera
    texto((o.nome || 'OBRA').toUpperCase(), W / 2, y0, 40, COR.ouro, { maxW: W - 140 });
    texto(k < corta + 0.05 ? 'INAUGURAÇÃO' : 'FUNCIONANDO!', W / 2, y0 + 60, 34, '#ffffff', { maxW: W - 140 });
  };
}

// ---- ASSEMBLEIA (votação nova): a colônia reunida na frente do telão com a pergunta; uns levantam a mão (SIM),
// outros cruzam os braços (NÃO), e o telão pisca pedindo o voto de quem está assistindo
function tomadaAssembleia(t, k, cena) {
  TREMOR = 0;
  const chao = sala(t, { janela: false });
  tx.globalAlpha = 0.35; R(0, 0, TW, TH, '#0a0818'); tx.globalAlpha = 1;
  const sx = 26, sy = 44, sw = TW - 52, sh = 120;
  R(sx - 6, sy - 6, sw + 12, sh + 12, '#1b1530'); R(sx, sy, sw, sh, '#22357a');
  for (let y = sy; y < sy + sh; y += 3) { tx.globalAlpha = 0.15; R(sx, y, sw, 1, '#000'); } tx.globalAlpha = 1;
  R(sx + 20, sy + sh - 38, 90, 26, '#2bb673'); R(sx + sw - 110, sy + sh - 38, 90, 26, '#e04f5f');
  if (k > 0.65 && Math.floor(t * 4) % 2) { tx.strokeStyle = COR.ouro; tx.lineWidth = 3; tx.strokeRect(sx - 3, sy - 3, sw + 6, sh + 6); }
  tx.globalCompositeOperation = 'lighter';
  const gl = tx.createLinearGradient(0, sy + sh, 0, chao + 60); gl.addColorStop(0, 'rgba(120,160,255,0.2)'); gl.addColorStop(1, 'rgba(120,160,255,0)');
  tx.fillStyle = gl; tx.fillRect(sx, sy + sh, sw, chao + 60 - sy - sh); tx.globalCompositeOperation = 'source-over';
  const E = 3.2, base = chao + 34;
  for (let i = 0; i < 5; i++) {
    const c = colonoQualquer(i + 17), x = TW * (0.12 + i * 0.19), sim = i % 2 === 0, q = clamp((k - 0.2 - i * 0.07) / 0.1);
    ator(c.pal, { x, chao: base, dir: x < TW / 2 ? 1 : -1, cabeca: -4,
      maoF: sim && q > 0 ? { x: x + (x < TW / 2 ? 4 : -4), y: base - 70 - 30 * q } : (!sim && q > 0 ? { x: x + (x < TW / 2 ? 6 : -6), y: base - 46 } : null),
      maoT: !sim && q > 0 ? { x: x + (x < TW / 2 ? 8 : -8), y: base - 44 } : null }, t, E);
  }
  const v = cena.votacao || {};
  return () => {
    texto(v.tela || 'VOTAÇÃO DA COLÔNIA', W / 2, (sy + 34) * TE, 30, '#ffffff', { maxW: (sw - 20) * TE });
    texto('SIM', (sx + 65) * TE, (sy + sh - 25) * TE, 34, '#ffffff'); texto('NÃO', (sx + sw - 65) * TE, (sy + sh - 25) * TE, 34, '#ffffff');
    if (k > 0.65) texto('COMENTA O SEU VOTO!', W / 2, (sy + sh + 30) * TE, 30, COR.ouro, { maxW: W - 140 });
  };
}

// ================================================================== ventania (problema 'ventania'): a animação do que a fala diz
// lona da obra batendo e rasgando, pedra voando nas casas → o herói amarra a lona com cabo de aço → as persianas
// de metal descem e a pedra bate e volta. Usadas no episódio e nos dois cortes (no TikTok com o filtro de câmera).
function lonaT(x0, y0, w, h, t, solta, presa) {   // lona presa no topo; 'solta' = 0..1 do canto rasgando, 'presa' = cabo esticado
  const amp = (1 - presa) * 14, cor = '#3f8efc', esc = '#2b62b5';
  for (let i = 0; i <= w; i += 3) {
    const q = i / w, onda = Math.sin(t * 9 + q * 6) * amp * q, voa = solta * q * q * 60;
    const fundo = y0 + h + onda - voa * 0.6, xx = x0 + i - voa * 1.4 * q;
    R(xx, y0 + onda * 0.3, 3, fundo - y0, i % 12 < 6 ? cor : esc);
  }
  R(x0 - 2, y0 - 3, w + 4, 3, '#6b6f86');
}
function casinhaT(x, chao, persiana, t) {   // casinha vista de lado com janela; persiana 0..1 (descendo)
  R(x, chao - 54, 70, 54, '#c9ced9'); R(x + 2, chao - 52, 66, 50, '#e4e6f0');
  tx.fillStyle = '#e04f5f'; tx.beginPath(); tx.moveTo(x - 6, chao - 54); tx.lineTo(x + 35, chao - 80); tx.lineTo(x + 76, chao - 54); tx.fill();
  const jx = x + 38, jy = chao - 42, jw = 24, jh = 20;
  R(jx - 2, jy - 2, jw + 4, jh + 4, '#6b6f86'); R(jx, jy, jw, jh, '#ffe58a');
  const fecha = jh * persiana;
  for (let y = 0; y < fecha; y += 3) R(jx, jy + y, jw, 2, '#9aa0b5');
  R(jx - 3, jy - 5, jw + 6, 3, '#4a4466');
  R(x + 10, chao - 30, 14, 30, '#3a2f63');
}
function pedrasT(t, alvoX, alvoY, n, rebate) {
  for (let i = 0; i < n; i++) {
    const q = (t * (0.9 + hashT(i, 91) * 0.6) + hashT(i, 92)) % 1, y0 = alvoY - 30 + hashT(i, 93) * 50;
    let x = lerp(TW + 20, alvoX, q), y = lerp(y0 - 20, y0, q);
    if (rebate && q > 0.8) { const b = (q - 0.8) / 0.2; x = alvoX + b * 30; y = y0 - Math.sin(b * Math.PI) * 14; }
    R(x, y, 4, 3, '#5a2a18');
    if (!rebate && q > 0.96) for (let j = 0; j < 3; j++) R(alvoX - 4 + j * 3, y0 - 3 + j * 2, 2, 2, '#ffffff');
  }
}
function tomadaVentania(t, k) {
  TREMOR = 0.28;
  ceuT(0.15, 0.35); dunasLonge(t, 0.5, ['#c98a5e', '#b8754f']);
  const chao = TH * 0.66;
  chaoT(chao);
  vento(t, 50, 1.6);
  // andaime da obra com a lona azul batendo; o canto rasga em k ~ 0.45
  const ax = TW * 0.52, aw = 104, ay = chao - 150;
  for (const x of [ax, ax + aw]) R(x - 2, ay - 6, 4, chao - ay + 6, '#ffc83d');
  for (let y = ay + 20; y < chao; y += 36) R(ax, y, aw, 2, '#e0a920');
  lonaT(ax + 2, ay, aw - 4, 110, t, suave(clamp((k - 0.45) / 0.4)), 0);
  casinhaT(TW * 0.06, chao, 0, t);
  pedrasT(t, TW * 0.06 + 70, chao - 34, 7, false);
  vento(t, 24, 2.2, '#f0c8a0');
  return () => {
    texto('VENTO LÁ FORA', W / 2, 220, 34, '#ffffff', { maxW: W - 140 });
    texto(`${Math.round(lerp(96, 128, k))} KM/H`, W / 2, 290, 60, COR.alerta);
  };
}
function tomadaAmarraLona(t, k) {
  TREMOR = 0.15;
  ceuT(0.1, 0.25); dunasLonge(t, 0.5, ['#c98a5e', '#b8754f']);
  const chao = TH * 0.66;
  chaoT(chao);
  vento(t, 36, 1.3);
  const ax = TW * 0.46, aw = 110, ay = chao - 150, presa = suave(clamp((k - 0.35) / 0.45));
  for (const x of [ax, ax + aw]) R(x - 2, ay - 6, 4, chao - ay + 6, '#ffc83d');
  lonaT(ax + 2, ay, aw - 4, 110, t, 0, presa);
  const h = heroiDaTomada(), E = 3.2, hx = lerp(-30, ax - 26, suave(clamp(k / 0.3)));
  const anc = { x: ax - 40, y: chao - 2 };   // estaca no chão
  R(anc.x - 3, anc.y - 8, 6, 10, '#6b6f86');
  const canto = { x: ax + 4, y: ay + 108 };
  const puxa = k > 0.3 ? Math.sin(t * 10) * 3 * (1 - presa) : 0;
  const r = ator(h.pal, { x: hx, chao, dir: 1, agacha: k > 0.3 ? 0.5 : 0, anda: k < 0.3 ? t * 12 : null, alegre: presa > 0.95,
    maoF: k > 0.3 ? { x: hx + 22 + puxa, y: chao - 40 } : null, maoT: k > 0.3 ? { x: hx + 14 + puxa, y: chao - 36 } : null }, t, E);
  if (k > 0.3) { seg(canto, r.maoF, 2, '#c9ced9'); seg(r.maoF, anc, 2, presa > 0.9 ? '#c9ced9' : '#9aa0b5'); }
  return () => {
    etiquetaT(h.nome, r.cab, E)();
    if (presa > 0.95) texto('LONA PRESA!', W / 2, 240, 44, COR.ok);
    else texto('CABO DE AÇO', W / 2, 240, 36, '#ffffff');
  };
}
function tomadaPersiana(t, k) {
  TREMOR = 0.12;
  ceuT(0.1, 0.25);
  const chao = TH * 0.7;
  chaoT(chao);
  vento(t, 30, 1.2);
  const desce = suave(clamp((k - 0.1) / 0.45)), x0 = TW * 0.3;
  tx.save(); tx.translate(TW / 2, chao); tx.scale(1.9, 1.9); tx.translate(-TW / 2, -chao);   // casinha de perto
  casinhaT(x0, chao, desce, t);
  pedrasT(t, x0 + 62, chao - 32, 5, desce > 0.95);
  tx.restore();
  const h = heroiDaTomada();
  const r = ator(h.pal, { x: TW * 0.14, chao: chao + 40, dir: 1, alegre: desce > 0.95, maoF: { x: TW * 0.14 + 18, y: chao - 30 } }, t, 3);
  R(TW * 0.14 + 16, chao - 34, 8, 8, '#2a2140'); R(TW * 0.14 + 18, chao - 32, 4, 4, desce > 0.95 ? COR.ok : COR.alerta);   // botão
  return () => {
    etiquetaT(h.nome, r.cab, 3)();
    texto(desce > 0.95 ? 'PERSIANAS FECHADAS' : 'PERSIANAS DE METAL', W / 2, 240, 38, desce > 0.95 ? COR.ok : '#ffffff', { maxW: W - 140 });
  };
}
// versão "câmera de segurança" (TikTok) de qualquer tomada
function comCCTV(fn, cam) { return (t, k, cena) => { const f = fn(t, k, cena); cctvFiltro(t, 0.4); const c = cctvCarimbo(t, cam); return () => { if (f) f(); c(); }; }; }
const ehVentania = () => (EP.problema || {}).id === 'ventania';

// ---- AMOSTRA: a Doutora Lia no laboratório, gelo no microscópio, a tela confere e acende "sem sal tóxico"
function tomadaAmostra(t, k) {
  TREMOR = 0;
  const chao = sala(t, { janela: true });
  R(TW * 0.36, chao - 50, TW * 0.6, 8, '#9aa0b5'); R(TW * 0.38, chao - 42, 6, 42, '#6b6f86'); R(TW * 0.9, chao - 42, 6, 42, '#6b6f86');   // bancada
  objeto('descoberta', TW * 0.62, chao - 50, 3, t, clamp((k - 0.4) / 0.3));
  const tela = { x: TW * 0.72, y: chao - 140, w: 64, h: 50 }, ok = k > 0.48;   // monitor da análise
  R(tela.x - 3, tela.y - 3, tela.w + 6, tela.h + 6, '#1b1530'); R(tela.x, tela.y, tela.w, tela.h, ok ? '#0f2a1f' : '#101a2e');
  for (let i = 0; i < 5; i++) { const w = (tela.w - 12) * clamp((k - 0.1 - i * 0.06) / 0.15); R(tela.x + 6, tela.y + 7 + i * 8, w, 3, ok ? COR.ok : COR.agua); }
  const tubo = { x: TW * 0.5, y: chao - 64 };   // tubinho com o gelo derretendo
  R(tubo.x, tubo.y - 22, 8, 22, '#eef0f8'); R(tubo.x + 1, tubo.y - 12, 6, 10, '#bfe7f5');
  const xl = TW * 0.3;
  const r = ator(FUNDADOR_PAL.lia, { x: xl, chao, dir: 1, cabeca: 3, alegre: ok,
    maoF: k < 0.45 ? { x: tubo.x + 4, y: tubo.y - 14 } : { x: TW * 0.6, y: chao - 78 } }, t, 3.4);
  return () => {
    etiquetaT('Doutora Lia', r.cab, 3.4)();
    texto(ok ? 'GELO LIMPO' : 'ANALISANDO...', W / 2, 230, 44, ok ? COR.ok : '#ffffff');
    if (ok) texto('SEM SAL TÓXICO', W / 2, 290, 30, '#ffffff');
  };
}

// ================================================================== etapas exclusivas das obras (colonia.json missao.etapas)
// Cada trecho do progresso de uma obra tem a SUA animação (pedido do dono: a construção não pode repetir entre
// episódios). A fala da missão diz a etapa e a tomada mostra exatamente aquilo. Módulo de Comando: estrutura (aranha
// de carga com os arcos de aço), casco blindado (placas na ventosa + gel azul nas emendas) e janelas (vista de dentro).
function pctDaEtapa(cena, t) {   // a % corre pela CENA inteira (não recomeça a cada etapa)
  const [p0, p1] = (cena && cena.progresso) || [0, 1], ini = cena.fala_inicio ?? cena.inicio;
  return Math.round(lerp(p0, p1, clamp((t - ini) / Math.max(0.1, cena.fim - 0.3 - ini))) * 100);
}
function placaEtapa(rot, cena, t, y = 250) {
  const p = pctDaEtapa(cena, t);
  return () => { texto(rot, W / 2, y, 40, '#ffffff', { maxW: W - 100 }); texto(p + '%', W / 2, y + 120, 110, COR.ouro); };
}
function arcoT(cx, base, rx, ry, cor, w = 4) {   // arco de aço (meia elipse), em "pixels" quadrados
  for (let a = 0; a <= 40; a++) {
    const q = Math.PI + (a / 40) * Math.PI;
    R(cx + Math.cos(q) * rx - w / 2, base + Math.sin(q) * ry - w / 2, w, w, cor);
  }
}
function aranhaT(x, y, t, anda, carga) {   // robô de seis patas: corpo laranja, olho ciano, patas em passo alternado
  for (let i = 0; i < 6; i++) {
    const lado = i < 3 ? -1 : 1, j = i % 3, fase = anda ? Math.sin(t * 7 + i * Math.PI / 1.5 + (i % 2) * Math.PI) : 0;
    const quadril = { x: x + (j - 1) * 16, y: y + 10 };
    const pe = { x: quadril.x + lado * 4 + (j - 1) * 14 + fase * 6, y: y + 56 - Math.max(0, fase) * 5 };
    const joelho = { x: (quadril.x + pe.x) / 2 + (j - 1) * 6, y: y - 8 };
    const cor = lado < 0 ? '#6b6f86' : '#9aa0b5';
    seg(quadril, joelho, 4, cor); seg(joelho, pe, 3, cor); R(pe.x - 3, pe.y - 2, 6, 3, '#2a2140');
  }
  R(x - 30, y - 4, 60, 20, '#e2603b'); R(x - 30, y - 4, 60, 4, '#ff8a5c'); R(x - 26, y + 12, 52, 4, '#a83d22');
  R(x + 22, y + 2, 6, 6, '#1b1530'); R(x + 23, y + 3, 4, 4, Math.floor(t * 3) % 2 ? COR.agua : '#bff8ff');
  R(x - 3, y - 18, 6, 14, '#4a4466');                                             // mastro do guincho
  if (carga != null && carga > 0) R(x - 1, y - 18 - carga, 2, carga, '#c9ced9');  // cabo até o arco
}
function tomadaCmdAranha(t, k, cena) {
  ceuT(); dunasLonge(t, 0.52); const chao = TH * 0.68; chaoT(chao);
  R(40, chao - 6, 190, 6, '#b9bfcc'); R(40, chao - 6, 190, 2, '#e4e6f0');       // a laje da fundação (ep. 8)
  const prontos = 2 + Math.floor(clamp(k) * 2.2), cx0 = 110;
  for (let i = prontos - 1; i >= 0; i--) arcoT(cx0 + i * 14, chao - 6 - i * 3, 58, 92 - i * 3, i % 2 ? '#9aa0b5' : '#c9ced9');
  // a aranha chega pela direita com o próximo arco pendurado e baixa no encaixe
  const andar = clamp(k / 0.55), baixa = clamp((k - 0.55) / 0.3);
  const ax = lerp(TW + 50, cx0 + prontos * 14 + 26, saida(andar)), ay = chao - 62;
  const alvo = cx0 + prontos * 14, altura = lerp(70, 0, saida(baixa));
  const arcX = lerp(ax, alvo, saida(baixa)), arcB = chao - 6 - prontos * 3 - altura, ry = 92 - prontos * 3;
  arcoT(arcX, arcB, 58, ry, '#ffc83d');
  aranhaT(ax, ay, t, andar < 1, (ay - 18) - (arcB - ry));
  // colono agachado apertando o parafuso do pé do arco: faísca a cada volta da chave
  const c = colonoQualquer(1), px = cx0 - 70, base = chao;
  const r = ator(c.pal, { x: px, chao: base, dir: 1, agacha: 0.7, maoF: { x: px + 14 + Math.sin(t * 9) * 2, y: base - 12 }, maoT: { x: px + 10, y: base - 14 } }, t, 2.6);
  ferramentaT('chave', r.maoF, r.cotF, t, 2.6);
  const f = Math.floor(t * 9);
  if (f % 3 === 0) for (let i = 0; i < 5; i++) R(px + 16 + hashT(i, f) * 10, base - 16 + hashT(i + 4, f) * 6, 2, 2, COR.ouro);
  if (baixa > 0.95 && Math.floor(t * 4) % 2) R(alvo - 4, chao - 10, 8, 4, '#ffffff');   // "clac": encaixou
  TREMOR = andar < 1 ? 0.15 : 0;
  return placaEtapa('ESTRUTURA DE AÇO', cena, t);
}
function tomadaCmdCasco(t, k, cena) {
  // close na parede: placas cinza já presas, uma placa nova descendo na ventosa, gel azul correndo na emenda
  R(0, 0, TW, TH, '#2b2440');
  for (let y = 0; y < TH; y += 40) R(0, y, TW, 3, '#3a3258');                     // arcos vistos de perto (fundo)
  const col = 3, lw = 78, lh = 92, x0 = 18, y0 = 70;
  const total = col * 4, feitas = 5 + Math.floor(clamp(k) * 3);
  for (let i = 0; i < feitas && i < total; i++) {
    const cx = x0 + (i % col) * (lw + 6), cy = y0 + Math.floor(i / col) * (lh + 6);
    R(cx, cy, lw, lh, '#9aa0b5'); R(cx, cy, lw, 4, '#c9ced9'); R(cx + 6, cy + 10, lw - 12, 2, '#6b6f86');
    for (const [a, b] of [[4, 8], [lw - 8, 8], [4, lh - 8], [lw - 8, lh - 8]]) R(cx + a, cy + b, 3, 3, '#4a4466');   // rebites
    R(cx + lw, cy, 6, lh + 6, '#3fd0c9'); R(cx, cy + lh, lw + 6, 6, '#3fd0c9');  // emendas já seladas
  }
  // a placa nova desce da ventosa até o lugar dela
  const i = Math.min(feitas, total - 1), nx = x0 + (i % col) * (lw + 6), ny = y0 + Math.floor(i / col) * (lh + 6);
  const q = saida(clamp(k / 0.5)), py = lerp(-lh - 30, ny, q);
  R(nx + lw / 2 - 2, -10, 4, py + 2, '#c9ced9'); R(nx + lw / 2 - 14, py - 8, 28, 10, '#4a4466');   // cabo + ventosa
  R(nx, py, lw, lh, '#b9bfcc'); R(nx, py, lw, 4, '#eef0f8');
  // gel azul correndo pela emenda da placa nova (depois que ela encosta)
  const gel = clamp((k - 0.5) / 0.4);
  if (gel > 0) { R(nx - 6, ny - 6, (lw + 12) * gel, 6, '#3fd0c9'); R(nx - 6, ny - 6, (lw + 12) * gel, 2, '#bff8ff'); }
  // colono com a pistola de gel seguindo a emenda
  const c = colonoQualquer(2), gx = nx - 6 + (lw + 12) * gel, px = Math.max(30, gx - 26), pc = Math.min(TH - 40, ny + 62);
  R(px - 22, pc, 44, 5, '#ffc83d'); R(px - 22, pc, 44, 2, '#ffe08a');                                   // plataforma elevatória
  for (let y = pc + 5, i = 0; y < TH - 14; y += 16, i++) seg({ x: px - 18, y }, { x: px + 18, y: y + 16 }, 2, '#e0a920'), seg({ x: px + 18, y }, { x: px - 18, y: y + 16 }, 2, '#e0a920');
  R(px - 26, TH - 14, 52, 10, '#4a4466'); R(px - 22, TH - 6, 8, 6, '#1b1530'); R(px + 14, TH - 6, 8, 6, '#1b1530');
  const r = ator(c.pal, { x: px, chao: pc, dir: 1, maoF: { x: gx, y: ny - 4 }, maoT: { x: gx - 6, y: ny + 2 } }, t, 2.8);
  ferramentaT('scanner', r.maoF, r.cotF, t, 2.8);
  return placaEtapa('CASCO BLINDADO', cena, t);
}
function tomadaCmdJanelas(t, k, cena) {
  // de DENTRO do módulo: parede escura, o buraco da janela com a colônia lá fora; o vidro grosso desce e a luz entra
  R(0, 0, TW, TH, '#1e1a30');
  const jx = 45, jy = 120, jw = 180, jh = 140;
  tx.save(); tx.beginPath(); tx.rect(jx, jy, jw, jh); tx.clip();
  const g = tx.createLinearGradient(0, jy, 0, jy + jh); g.addColorStop(0, '#d98a5c'); g.addColorStop(1, '#f2b98a');
  tx.fillStyle = g; tx.fillRect(jx, jy, jw, jh);
  tx.fillStyle = '#c4643c'; tx.beginPath(); tx.moveTo(jx, jy + jh);
  for (let x = jx; x <= jx + jw; x += 5) tx.lineTo(x, jy + jh * 0.62 - Math.sin(x * 0.05) * 6);
  tx.lineTo(jx + jw, jy + jh); tx.fill();
  for (let i = 0; i < 7; i++) { const hx = jx + 14 + i * 24, hy = jy + jh * 0.7 + (i % 2) * 8; R(hx, hy, 12, 9, '#c9ced9'); R(hx + 4, hy + 3, 4, 3, '#ffc83d'); }   // casinhas da colônia
  R(jx + jw * 0.72, jy + 18, 8, 8, '#fff3d6');                                    // o sol lá fora
  tx.restore();
  // o vidro desce no trilho; um brilho atravessa quando assenta
  const q = saida(clamp(k / 0.55)), vy = lerp(jy - jh - 10, jy, q);
  tx.globalAlpha = 0.35; R(jx, vy, jw, jh, '#bff8ff'); tx.globalAlpha = 1;
  R(jx, vy, jw, 3, '#eef0f8');
  if (q >= 1) { const b = ((t * 0.6) % 1.4) - 0.2; tx.globalAlpha = 0.5; for (let i = 0; i < 4; i++) R(jx + b * jw + i * 6, jy, 3, jh, '#ffffff'); tx.globalAlpha = 1; }
  // moldura grossa (por cima) + borracha de vedação correndo
  R(jx - 12, jy - 12, jw + 24, 12, '#4a4466'); R(jx - 12, jy + jh, jw + 24, 12, '#4a4466');
  R(jx - 12, jy, 12, jh, '#4a4466'); R(jx + jw, jy, 12, jh, '#4a4466');
  const veda = clamp((k - 0.55) / 0.3);
  if (veda > 0) R(jx - 2, jy - 2, (jw + 4) * veda, 2, '#1b1530');
  // luz entrando no chão quando a janela fica pronta
  const chao = TH * 0.86, luz = clamp((k - 0.6) / 0.3);
  if (luz > 0) { tx.globalAlpha = 0.25 * luz; tx.fillStyle = '#fff3d6'; tx.beginPath(); tx.moveTo(jx, jy + jh); tx.lineTo(jx + jw, jy + jh); tx.lineTo(jx + jw + 50, chao); tx.lineTo(jx - 20, chao); tx.fill(); tx.globalAlpha = 1; }
  R(0, chao, TW, TH - chao, '#2a2140');
  // dois colonos: um empurra o vidro no trilho, o outro olha a colônia pela janela nova e comemora
  const a = colonoQualquer(3), b2 = colonoQualquer(4), feliz = k > 0.7;
  ator(a.pal, { x: jx - 4, chao, dir: 1, maoF: { x: jx + 6, y: Math.max(jy + 20, vy + jh - 10) }, maoT: { x: jx + 2, y: Math.max(jy + 30, vy + jh) } }, t, 3);
  ator(b2.pal, { x: jx + jw - 20, chao, dir: -1, alegre: feliz, pulo: feliz ? Math.abs(Math.sin(t * 6)) * 6 : 0,
                 maoF: feliz ? { x: jx + jw - 26, y: chao - 70 } : null }, t, 3);
  return placaEtapa('JANELAS BLINDADAS', cena, t);
}
// trechos de tempo de cada etapa dentro da fala da missão (frac = fração do texto; a fala é quase linear)
function trechosDasEtapas(m, inteiro = false) {
  const ws = m.palavras || [], fi = ws.length ? ws[0].i : m.fala_inicio, ff = ws.length ? ws[ws.length - 1].f : m.fim;
  return (m.tomadas || []).map((e, j, arr) => [
    j === 0 ? (inteiro ? m.inicio : fi - 0.1) : fi + e.frac[0] * (ff - fi),
    j === arr.length - 1 && (inteiro || e.frac[1] >= 0.99) ? m.fim - (inteiro ? 0 : 0.2) : fi + e.frac[1] * (ff - fi),
    e.tipo]);
}
function prepararTomadas() {
  TOMADAS = [];
  // Instagram e TikTok: só tomadas exclusivas, e cada rede com a sua linguagem (o mesmo episódio, 2 vídeos diferentes)
  if (EP.curto === 'tiktok') { prepararTomadasTikTok(); return; }
  if (EP.curto) { prepararTomadasCurtas(); return; }
  const add = (ini, fim, tipo, cena) => { if (fim - ini > 0.8) TOMADAS.push({ ini, fim, tipo, cena }); };
  const prob = EP.cenas.find((c) => c.tipo === 'problema'), sol = EP.cenas.find((c) => c.tipo === 'solucao');
  const redemoinho = EP.problema && EP.problema.id === 'redemoinho';
  if (prob && redemoinho) add(prob.fala_inicio + 0.9, prob.fim - 0.2, 'redemoinho', prob);
  else if (prob) {
    const a = prob.fala_inicio + 1.4, d = prob.fim - a;
    add(a, a + d * 0.45, 'monitor', prob); add(a + d * 0.45, prob.fim - 0.25, ehVentania() ? 'ventania' : 'alarme', prob);
  }
  if (sol && redemoinho) {   // alerta no telescópio → corrida para dentro → abrigo tremendo → varrer a poeira
    const foco = sol.focos.find((f) => f.alvo.startsWith('colono:'));
    const a = Math.max(sol.fala_inicio + 1.2, foco ? foco.t + 0.9 : 0);
    const todo = palavraEm(sol, /^todo/i, a) ?? a + (sol.fim - a) * 0.4;
    const espera = palavraEm(sol, /^espera/i, todo) ?? todo + (sol.fim - todo) * 0.4;
    const depois = palavraEm(sol, /^depois/i, espera) ?? espera + (sol.fim - espera) * 0.5;
    add(a, todo - 0.1, 'alertaHeroi', sol); add(todo - 0.1, espera, 'corrida', sol);
    add(espera, depois - 0.05, 'abrigo', sol); add(depois - 0.05, sol.fim - 0.2, 'conserto', sol);
  } else if (sol && ehVentania()) {   // "amarra as lonas com cabo de aço e fecha as persianas de metal"
    const a = palavraEm(sol, /^amarra/i) ?? sol.fala_inicio + (sol.fim - sol.fala_inicio) * 0.3;
    const f = palavraEm(sol, /^fecha/i, a) ?? a + (sol.fim - a) * 0.55;
    add(a - 0.2, f - 0.1, 'amarraLona', sol); add(f - 0.1, sol.fim - 0.2, 'persiana', sol);
  } else if (sol) {
    const a = sol.fala_inicio + (sol.fim - sol.fala_inicio) * 0.3, d = sol.fim - a;
    add(a, a + d * 0.68, 'conserto', sol); add(a + d * 0.68, sol.fim - 0.2, 'objeto', sol);
  }
  // resultado do "mapear as dunas" (SIM): rover → marcas de pneu → (mapa atualizado, no mapa) → colonos no telão
  if (DUNAS_MAPA) {
    const r = DUNAS_MAPA.c;
    const rover = palavraEm(r, /^rover/i) ?? r.fala_inicio + 2;
    const mas = palavraEm(r, /^mas\b/i, rover) ?? rover + (DUNAS_MAPA.t0 - rover) * 0.5;
    const ninguem = palavraEm(r, /^ningu/i, DUNAS_MAPA.t0) ?? DUNAS_MAPA.t0 + 2.2;
    add(rover - 0.1, mas - 0.05, 'rover', r); add(mas - 0.05, DUNAS_MAPA.t0 - 0.05, 'marcas', r);
    add(Math.max(ninguem - 0.1, DUNAS_MAPA.t0 + 1.8), r.fim - 0.2, 'curiosos', r);
  }
  if (FUND) add(FUND.ini, FUND.fim, 'fundacao', FUND.c);
  // refino (ep. 8): chegada de quem entrou, batismo da cratera, resultado do telescópio, inauguração e assembleia
  const bv = EP.cenas.find((c) => c.tipo === 'boas_vindas');
  if (bv) add(bv.fala_inicio + 0.2, (palavraEm(bv, /^casa/i, bv.fala_inicio + 1) ?? bv.fim) - 0.35, 'boasVindas', bv);
  const cr = EP.cenas.find((c) => c.tipo === 'cratera');
  if (cr) { const f = (cr.focos || []).find((x) => x.alvo.startsWith('cratera:')); add(cr.fala_inicio + 0.3, (f ? f.t : cr.fim) - 0.1, 'cratera', cr); }
  const res = EP.cenas.find((c) => c.tipo === 'resultado' && c.votacao && c.votacao.id === 'telescopio' && c.votacao.resultado === 'sim');
  if (res) {
    const teto = palavraEm(res, /^teto/i) ?? res.fala_inicio + (res.fim - res.fala_inicio) * 0.4;
    const entao = palavraEm(res, /^ent[aã]o/i, teto) ?? teto + (res.fim - teto) * 0.4;
    add(teto - 0.6, entao - 0.05, 'telescopioTeto', res); add(entao - 0.05, res.fim - 0.2, 'plantaComando', res);
  }
  // falas da missão que contam uma ação ganham a animação dela (não só o boneco andando no mapa)
  for (const m of EP.cenas.filter((c) => c.tipo === 'missao' && c.acao !== 'ligar')) {
    if (/amostra/i.test(m.fala) && !TOMADAS.some((x) => x.cena === m)) add(m.fala_inicio + 0.2, m.fim - 0.2, 'amostra', m);
  }
  const lig = EP.cenas.find((c) => c.tipo === 'missao' && c.acao === 'ligar');
  if (lig) add(lig.fala_inicio + 0.1, lig.fim - 0.2, 'inauguracao', lig);
  const vt = EP.cenas.find((c) => c.tipo === 'votacao');
  if (vt) add(vt.fala_inicio + 0.3, (palavraEm(vt, /^escreve/i, vt.fala_inicio + 2) ?? vt.fim) - 0.2, 'assembleia', vt);
  // Correio da colônia: uma tomada só do primeiro ao último comentário respondido (o estúdio não corta no meio)
  const correio = EP.cenas.filter((c) => c.tipo === 'correio');
  if (correio.length) add(correio[0].inicio + 0.25, correio[correio.length - 1].fim - 0.15, 'correio', correio[0]);
  const constr = EP.cenas.filter((c) => c.tipo === 'missao' && c.acao === 'construir');
  const comEtapa = constr.filter((c) => (c.tomadas || []).length);
  for (const m of comEtapa) for (const [ini, fim, tipo] of trechosDasEtapas(m)) add(ini, fim, tipo, m);
  const c = constr[Math.min(constr.length - 1, 1)] || constr[0];
  if (!comEtapa.length && c && !EP.cenas.some((x) => x.acao === 'plantar' && x === c)) add(c.inicio + (c.fim - c.inicio) * 0.2, c.fim - (c.fim - c.inicio) * 0.12, 'obra', c);
}
function tomadaEm(t) { return TOMADAS.find((x) => t >= x.ini && t < x.fim) || null; }

function desenharTomada(tm, t) {
  const k = (t - tm.ini) / (tm.fim - tm.ini);
  tx.setTransform(1, 0, 0, 1, 0, 0);
  TREMOR = 0;
  const extraFn = { monitor: tomadaMonitor, alarme: tomadaAlarme, conserto: tomadaConserto, objeto: tomadaObjeto, obra: tomadaObra,
                  redemoinho: tomadaRedemoinho, alertaHeroi: tomadaAlertaHeroi, corrida: tomadaCorrida, abrigo: tomadaAbrigo,
                  rover: tomadaRover, marcas: tomadaMarcas, curiosos: tomadaCuriosos, fundacao: tomadaFundacao,
                  correio: tomadaCorreio, cRosto: curtoRosto, cFaisca: curtoFaisca, cCorredor: curtoCorredor,
                  cBroca: curtoBroca, cChegada: curtoChegada, tCCTV: ttCCTV, tCracha: ttCracha, tTimelapse: ttTimelapse,
                  tSinal: ttSinal, boasVindas: tomadaBoasVindas, cratera: tomadaCratera, telescopioTeto: tomadaTelescopioTeto,
                  plantaComando: tomadaPlantaComando, inauguracao: tomadaInauguracao, assembleia: tomadaAssembleia,
                  amostra: tomadaAmostra, ventania: tomadaVentania, amarraLona: tomadaAmarraLona, persiana: tomadaPersiana,
                  tVentania: comCCTV(tomadaVentania, 'CAM 01 · CANTEIRO'), tAmarra: comCCTV(tomadaAmarraLona, 'CAM 01 · CANTEIRO'),
                  tPersiana: comCCTV(tomadaPersiana, 'CAM 05 · VILAREJO'), tInauguracao: comCCTV(tomadaInauguracao, 'CAM 02 · EXTRATOR'),
                  cmdAranha: tomadaCmdAranha, cmdCasco: tomadaCmdCasco, cmdJanelas: tomadaCmdJanelas };
  const fn = tm.tipo.startsWith('cctv:') ? comCCTV(extraFn[tm.tipo.slice(5)], 'CAM 03 · CANTEIRO') : extraFn[tm.tipo];
  const extra = fn(t, k, tm.cena);
  tx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  // leve empurrão de câmera (dolly) durante a tomada; TREMOR sacode (vento, redemoinho, escavadeira)
  const z = 1 + k * 0.06 + (TREMOR ? 0.03 : 0);
  const sx = TREMOR ? (hashT(Math.floor(t * 24), 1) - 0.5) * TREMOR * 14 : 0, sy = TREMOR ? (hashT(Math.floor(t * 24), 2) - 0.5) * TREMOR * 14 : 0;
  ctx.drawImage(tcv, 0, 0, TW, TH, W / 2 - (W * z) / 2 + sx, H / 2 - (H * z) / 2 + sy, W * z, H * z);
  // vinheta e linhas finas (cara de filme)
  ctx.drawImage(vinheta, 0, 0);
  if (extra) extra();
  // corte: um flash rápido na entrada
  const corte = clamp(1 - (t - tm.ini) / 0.12);
  if (corte > 0) { ctx.globalAlpha = corte * 0.6; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}

window.tomadaEm = tomadaEm;
window.desenharTomada = desenharTomada;
window.prepararTomadas = prepararTomadas;
