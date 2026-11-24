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
const COR_OBRA = { estufa: ['#8fe6ff', '#eef0f8'], antena: ['#e2603b', '#eef0f8'], gelo: ['#9aa0b5', '#3fd0c9'], oxigenio: ['#eef0f8', '#3fd0c9'],
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
  const rx = ((t * 40) % (TW + 140)) - 70, ry = TH * 0.7;
  R(rx, ry - 16, 60, 12, '#eef0f8'); R(rx + 40, ry - 28, 18, 12, '#eef0f8'); R(rx + 44, ry - 25, 12, 6, COR.agua);
  for (const wx of [rx + 6, rx + 26, rx + 46]) { R(wx, ry - 6, 10, 10, '#2a2140'); R(wx + 3, ry - 3, 4, 4, '#6b6f86'); }
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

// ---- rover (de lado, pixel art): 3 rodas à vista com raios girando, suspensão, mastro com lidar e antena
function roverT(x, chao, t, o = {}) {
  const s = o.s || 1.5;
  tx.save(); tx.translate(Math.round(x), Math.round(chao)); tx.rotate(o.ang || 0); tx.scale(s, s);
  const b = o.anda ? Math.round(Math.sin(t * 18) * 0.6) : 0, F = (x2, y2, w, h, c) => { tx.fillStyle = c; tx.fillRect(x2, y2, w, h); };
  for (const wx of [-26, 0, 26]) {
    F(wx - 2, -22 + b, 4, 8, '#9aa0b5');
    F(wx - 8, -16, 16, 16, '#2a2140'); F(wx - 5, -13, 10, 10, '#6b6f86');
    const a = o.anda ? t * 9 : 0;
    for (let q = 0; q < 4; q++) { const aa = a + q * Math.PI / 2; F(wx + Math.cos(aa) * 4 - 1, -8 + Math.sin(aa) * 4 - 1, 2, 2, '#c9ced9'); }
    F(wx - 1, -9, 2, 2, '#1b1530');
  }
  F(-38, -34 + b, 76, 12, '#eef0f8'); F(-38, -24 + b, 76, 3, '#9aa0b5'); F(-38, -34 + b, 76, 2, '#ffffff');
  F(-30, -31 + b, 12, 4, '#e2603b'); F(-14, -31 + b, 3, 4, '#e2603b');
  F(6, -50 + b, 30, 17, '#eef0f8'); F(10, -47 + b, 22, 9, '#3fd0c9'); F(12, -46 + b, 6, 3, '#bff8ff');
  F(-24, -60 + b, 3, 26, '#9aa0b5'); F(-30, -66 + b, 15, 6, '#c9ced9');
  F(-24 + Math.round(Math.cos(t * 4) * 5) - 1, -65 + b, 3, 3, '#3fd0c9');
  F(-35, -74 + b, 1, 40, '#6b6f86'); if (Math.floor(t * 3) % 2) F(-36, -76 + b, 3, 3, '#ff4d4d');
  if (o.farol) F(36, -44 + b, 3, 4, '#fff4c2');
  tx.restore();
  return { lidar: { x: x + (-22 * s) * Math.cos(o.ang || 0) + 63 * s * Math.sin(o.ang || 0), y: chao - 63 * s } };
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

// ------------------------------------------------------------------ roteiro dos cortes
function prepararTomadas() {
  TOMADAS = [];
  const add = (ini, fim, tipo, cena) => { if (fim - ini > 0.8) TOMADAS.push({ ini, fim, tipo, cena }); };
  const prob = EP.cenas.find((c) => c.tipo === 'problema'), sol = EP.cenas.find((c) => c.tipo === 'solucao');
  const redemoinho = EP.problema && EP.problema.id === 'redemoinho';
  if (prob && redemoinho) add(prob.fala_inicio + 0.9, prob.fim - 0.2, 'redemoinho', prob);
  else if (prob) {
    const a = prob.fala_inicio + 1.4, d = prob.fim - a;
    add(a, a + d * 0.45, 'monitor', prob); add(a + d * 0.45, prob.fim - 0.25, 'alarme', prob);
  }
  if (sol && redemoinho) {   // alerta no telescópio → corrida para dentro → abrigo tremendo → varrer a poeira
    const foco = sol.focos.find((f) => f.alvo.startsWith('colono:'));
    const a = Math.max(sol.fala_inicio + 1.2, foco ? foco.t + 0.9 : 0);
    const todo = palavraEm(sol, /^todo/i, a) ?? a + (sol.fim - a) * 0.4;
    const espera = palavraEm(sol, /^espera/i, todo) ?? todo + (sol.fim - todo) * 0.4;
    const depois = palavraEm(sol, /^depois/i, espera) ?? espera + (sol.fim - espera) * 0.5;
    add(a, todo - 0.1, 'alertaHeroi', sol); add(todo - 0.1, espera, 'corrida', sol);
    add(espera, depois - 0.05, 'abrigo', sol); add(depois - 0.05, sol.fim - 0.2, 'conserto', sol);
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
  const constr = EP.cenas.filter((c) => c.tipo === 'missao' && c.acao === 'construir');
  const c = constr[Math.min(constr.length - 1, 1)] || constr[0];
  if (c && !EP.cenas.some((x) => x.acao === 'plantar' && x === c)) add(c.inicio + (c.fim - c.inicio) * 0.2, c.fim - (c.fim - c.inicio) * 0.12, 'obra', c);
}
function tomadaEm(t) { return TOMADAS.find((x) => t >= x.ini && t < x.fim) || null; }

function desenharTomada(tm, t) {
  const k = (t - tm.ini) / (tm.fim - tm.ini);
  tx.setTransform(1, 0, 0, 1, 0, 0);
  TREMOR = 0;
  const extra = { monitor: tomadaMonitor, alarme: tomadaAlarme, conserto: tomadaConserto, objeto: tomadaObjeto, obra: tomadaObra,
                  redemoinho: tomadaRedemoinho, alertaHeroi: tomadaAlertaHeroi, corrida: tomadaCorrida, abrigo: tomadaAbrigo,
                  rover: tomadaRover, marcas: tomadaMarcas, curiosos: tomadaCuriosos, fundacao: tomadaFundacao }[tm.tipo](t, k, tm.cena);
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
