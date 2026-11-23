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

// ------------------------------------------------------------------ roteiro dos cortes
function prepararTomadas() {
  TOMADAS = [];
  const add = (ini, fim, tipo, cena) => { if (fim - ini > 0.8) TOMADAS.push({ ini, fim, tipo, cena }); };
  const prob = EP.cenas.find((c) => c.tipo === 'problema'), sol = EP.cenas.find((c) => c.tipo === 'solucao');
  if (prob) {
    const a = prob.fala_inicio + 1.4, d = prob.fim - a;
    add(a, a + d * 0.45, 'monitor', prob); add(a + d * 0.45, prob.fim - 0.25, 'alarme', prob);
  }
  if (sol) {
    const a = sol.fala_inicio + (sol.fim - sol.fala_inicio) * 0.3, d = sol.fim - a;
    add(a, a + d * 0.68, 'conserto', sol); add(a + d * 0.68, sol.fim - 0.2, 'objeto', sol);
  }
  const constr = EP.cenas.filter((c) => c.tipo === 'missao' && c.acao === 'construir');
  const c = constr[Math.min(constr.length - 1, 1)] || constr[0];
  if (c && !EP.cenas.some((x) => x.acao === 'plantar' && x === c)) add(c.inicio + (c.fim - c.inicio) * 0.2, c.fim - (c.fim - c.inicio) * 0.12, 'obra', c);
}
function tomadaEm(t) { return TOMADAS.find((x) => t >= x.ini && t < x.fim) || null; }

function desenharTomada(tm, t) {
  const k = (t - tm.ini) / (tm.fim - tm.ini);
  tx.setTransform(1, 0, 0, 1, 0, 0);
  const extra = { monitor: tomadaMonitor, alarme: tomadaAlarme, conserto: tomadaConserto, objeto: tomadaObjeto, obra: tomadaObra }[tm.tipo](t, k, tm.cena);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  // leve empurrão de câmera (dolly) durante a tomada
  const z = 1 + k * 0.06;
  ctx.drawImage(tcv, 0, 0, TW, TH, W / 2 - (W * z) / 2, H / 2 - (H * z) / 2, W * z, H * z);
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
