// Operação Marte Zero · POV em primeira pessoa ("câmera do capacete").
// Roda DEPOIS do diretor.js: usa o mesmo terreno, prédios, sprites e fonte do episódio.
//
// O chão é desenhado em perspectiva linha a linha (estilo "Mode 7" dos games 16-bit) até o horizonte;
// prédios, casas, colonos, pet e criaturas ficam em pé (billboards). Tudo numa tela pequena
// (PW x PH) ampliada 4x sem borrar, para manter o visual pixel art. Por cima: luvas do traje,
// painel do capacete (REC, oxigênio, temperatura, bússola) e o diário em primeira pessoa.
//
//   pov.py chama: carregarEpisodio(ep) → carregarPOV(info, cena) → quadroPOV(i)

const PW = 270, PH = 480, ESC = 4;            // tela interna (ampliada 4x → 1080x1920)
const HZ = 196, F = 150, OLHO = 8.5;          // horizonte, distância focal, altura dos olhos (px do mundo)
const LONGE = 520;                            // até onde o chão é desenhado
const pc = document.createElement('canvas'); pc.width = PW; pc.height = PH;
const px = pc.getContext('2d');
px.imageSmoothingEnabled = false;
const objs = document.createElement('canvas');   // prédios desenhados de cima, recortados como billboards
const ox = objs.getContext('2d');
let OBJ = { x0: 0, y0: 0, esc: 2 };
let POV = null;

// ------------------------------------------------------------------ utilidades
const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const dirDe = (a) => ({ x: Math.cos(a), y: Math.sin(a) });
function angPara(de, para) { return Math.atan2(para.y - de.y, para.x - de.x); }
function mistura(a, b, k) { return a + ang(b - a) * k; }

// ------------------------------------------------------------------ cenário: céu, montanhas, chão
const ceuCache = new Map();
function ceu(t, noite) {
  const g = px.createLinearGradient(0, 0, 0, HZ);
  if (noite) { g.addColorStop(0, '#0d0a1c'); g.addColorStop(1, '#3a2342'); }
  else { g.addColorStop(0, '#b0704f'); g.addColorStop(0.6, '#d99a6c'); g.addColorStop(1, '#efc49a'); }
  px.fillStyle = g; px.fillRect(0, 0, PW, HZ);
  const a = POV.cam.a;
  // sol (de dia) ou estrelas (à noite), presos à direção do mundo
  const giro = (alvo) => { const d = ang(alvo - a); return Math.abs(d) < 1.2 ? PW / 2 + Math.tan(d) * F : null; };
  if (noite) {
    for (let i = 0; i < 70; i++) {
      const ax = hash(i, 7) * Math.PI * 2, y = hash(i, 8) * (HZ - 30);
      const x = giro(ax); if (x == null) continue;
      px.fillStyle = hash(i, 9) > 0.8 ? '#ffe9a8' : '#cfd6ff';
      px.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  } else {
    const xs = giro(-2.2);
    if (xs != null) { px.fillStyle = '#fff3d6'; px.beginPath(); px.arc(xs, 46, 7, 0, 7); px.fill(); px.fillStyle = '#fff3d633'; px.beginPath(); px.arc(xs, 46, 14, 0, 7); px.fill(); }
  }
  const xf = giro(0.9);   // Fobos
  if (xf != null) { px.fillStyle = noite ? '#d8c8b0' : '#c9a98c'; px.fillRect(Math.round(xf) - 2, 30, 4, 3); px.fillRect(Math.round(xf) - 1, 29, 3, 5); }
  // duas camadas de montanhas (paralaxe pela direção do olhar)
  for (const [cor, alt, fase, amp] of [[noite ? '#2a1a33' : '#b77a57', 30, 0, 1], [noite ? '#1f1428' : '#9c5e40', 18, 5, 0.6]]) {
    px.fillStyle = cor;
    for (let x = 0; x < PW; x++) {
      const w = a * 120 + (x - PW / 2) * 0.8 + fase * 100;
      const h = alt * (0.45 + 0.35 * Math.sin(w * 0.031) + 0.2 * Math.sin(w * 0.093 + fase)) * amp + 4;
      px.fillRect(x, HZ - h, 1, h + 1);
    }
  }
}

function chao(noite) {
  px.fillStyle = noite ? '#3b1e1c' : '#a94f33';
  px.fillRect(0, HZ, PW, PH - HZ);
  const P = POV.cam, d0 = dirDe(P.a), dir = d0, dir_ = d0, dirR = { x: -d0.y, y: d0.x };
  for (let y = HZ + 1; y < PH; y++) {
    const dist = OLHO * F / (y - HZ);
    if (dist > LONGE) continue;
    const meia = dist * (PW / 2) / F;
    const Q = { x: P.x + dist * dir.x - meia * dirR.x, y: P.y + dist * dir.y - meia * dirR.y };
    const s = F / dist;
    const a = s * dirR.x, c = s * dirR.y, b = s * dir_.x, d = s * dir_.y;
    px.save();
    px.beginPath(); px.rect(0, y, PW, 1); px.clip();
    px.setTransform(a, b, c, d, -(a * Q.x + c * Q.y), y - (b * Q.x + d * Q.y));
    px.drawImage(terreno, TER.x0 * CASA, TER.y0 * CASA);
    px.restore();
  }
  // névoa de poeira perto do horizonte
  const g = px.createLinearGradient(0, HZ, 0, HZ + 70);
  g.addColorStop(0, noite ? 'rgba(40,24,48,0.95)' : 'rgba(232,180,138,0.92)'); g.addColorStop(1, 'rgba(232,180,138,0)');
  px.fillStyle = g; px.fillRect(0, HZ, PW, 70);
  if (noite) { px.fillStyle = 'rgba(10,6,24,0.45)'; px.fillRect(0, HZ, PW, PH - HZ); }
}

// ------------------------------------------------------------------ objetos em pé (billboards)
function prepararObjetos(t) {
  // desenha prédios (de cima, arte em 3/4) numa tela transparente; cada prédio vira um recorte em pé
  const caixas = [EP.mundo.base, ...EP.mundo.obras.filter((o) => o.status !== 'planejada' || o.slug === EP.missao_obra)].map(retanguloDe);
  const x0 = Math.min(...caixas.map((c) => c.x0)) - 40, y0 = Math.min(...caixas.map((c) => c.y0)) - 60;
  const x1 = Math.max(...caixas.map((c) => c.x1)) + 40, y1 = Math.max(...caixas.map((c) => c.y1)) + 40;
  OBJ = { x0, y0, esc: 2 };
  objs.width = (x1 - x0) * OBJ.esc; objs.height = (y1 - y0) * OBJ.esc;
  ox.setTransform(1, 0, 0, 1, 0, 0); ox.clearRect(0, 0, objs.width, objs.height);
  ox.imageSmoothingEnabled = false;
  ox.setTransform(OBJ.esc, 0, 0, OBJ.esc, -x0 * OBJ.esc, -y0 * OBJ.esc);
  const antes = usarCtx(ox);
  const energia = EP.mundo.obras.some((o) => o.tipo === 'solar' && o.status === 'concluida');
  try { desenharObras(t); desenharBase(t, energia); } finally { usarCtx(antes); }
}

function predios() {
  const lista = [];
  const add = (r, margemTopo, nome) => lista.push({
    x: (r.x0 + r.x1) / 2, y: r.y1 - 2, larg: r.x1 - r.x0 + 8, alt: (r.y1 - r.y0 + margemTopo) * 0.85,
    img: objs, src: [(r.x0 - 4 - OBJ.x0) * OBJ.esc, (r.y0 - margemTopo - OBJ.y0) * OBJ.esc,
                     (r.x1 - r.x0 + 8) * OBJ.esc, (r.y1 - r.y0 + margemTopo) * OBJ.esc], nome,
  });
  add(retanguloDe(EP.mundo.base), 30, 'base');
  for (const o of EP.mundo.obras) if (o.status !== 'planejada' || o.slug === EP.missao_obra) add(retanguloDe(o), 18, o.slug);
  return lista;
}

const casaCache = new Map();
function casinha(seed) {   // casa dos colonos: domo pressurizado com faixa colorida e porta
  if (casaCache.has(seed)) return casaCache.get(seed);
  const c = document.createElement('canvas'); c.width = 16; c.height = 12;
  const x = c.getContext('2d');
  const cor = ROUPAS[Math.abs(seed) % ROUPAS.length];
  x.fillStyle = CONTORNO; x.beginPath(); x.ellipse(8, 11, 8, 10, 0, Math.PI, 0); x.fill();
  x.fillStyle = '#e9e6f2'; x.beginPath(); x.ellipse(8, 11, 7, 9, 0, Math.PI, 0); x.fill();
  x.fillStyle = cor; x.fillRect(1, 7, 14, 2);
  x.fillStyle = '#9fb6d8'; x.fillRect(4, 4, 2, 2); x.fillRect(10, 4, 2, 2);
  x.fillStyle = '#3a2f63'; x.fillRect(7, 8, 3, 4);
  casaCache.set(seed, c);
  return c;
}

const besouroCache = [];
function besouro(fase) {   // besouro-de-ferrugem: carapaça laranja enferrujada, olhos vermelhos
  const k = fase % 2;
  if (besouroCache[k]) return besouroCache[k];
  const c = document.createElement('canvas'); c.width = 10; c.height = 7;
  const x = c.getContext('2d');
  x.fillStyle = CONTORNO; x.fillRect(1, 1, 8, 5); x.fillRect(0, 2, 10, 3);
  x.fillStyle = '#b5651d'; x.fillRect(2, 1, 6, 4); x.fillStyle = '#8d4a12'; x.fillRect(5, 1, 1, 4);
  x.fillStyle = '#ff3b3b'; x.fillRect(1, 2, 1, 1); x.fillRect(8, 2, 1, 1);
  x.fillStyle = CONTORNO; for (let i = 0; i < 3; i++) x.fillRect(2 + i * 3, k ? 5 : 6, 1, 1);
  besouroCache[k] = c;
  return c;
}

function projetar(o) {
  const P = POV.cam, d = dirDe(P.a), dr = { x: -d.y, y: d.x };
  const rx = o.x - P.x, ry = o.y - P.y;
  const z = rx * d.x + ry * d.y;
  if (z < 2.5 || z > LONGE) return null;
  const lado = rx * dr.x + ry * dr.y;
  const s = F / z;
  return { sx: PW / 2 + lado * s, chaoY: HZ + OLHO * s, s, z };
}

function desenharBillboards(lista, noite) {
  const vis = [];
  for (const o of lista) { const p = projetar(o); if (p) vis.push({ o, p }); }
  vis.sort((a, b) => b.p.z - a.p.z);
  for (const { o, p } of vis) {
    const w = o.larg * p.s, h = o.alt * p.s;
    if (p.sx + w / 2 < 0 || p.sx - w / 2 > PW) continue;
    const y = p.chaoY - h - (o.voo || 0) * p.s;
    px.globalAlpha = clamp(1.3 - p.z / LONGE);
    px.fillStyle = 'rgba(0,0,0,0.25)';
    px.fillRect(Math.round(p.sx - w * 0.35), Math.round(p.chaoY - Math.max(1, p.s * 0.6)), Math.round(w * 0.7), Math.max(1, Math.round(p.s * 1.1)));
    px.save(); px.translate(Math.round(p.sx), 0);
    if (o.virar) px.scale(-1, 1);
    if (o.src) px.drawImage(o.img, ...o.src, -w / 2, y, w, h);
    else px.drawImage(o.img, -w / 2, y, w, h);
    px.restore();
    if (noite && o.lanterna) { px.fillStyle = 'rgba(255,224,140,0.25)'; px.fillRect(p.sx - w, y - h * 0.2, w * 2, h * 1.4); }
    if (o.balao && p.z < 150) balaoPOV(p.sx, y - 4, o.balao, p.s);
    if (o.nome && p.z < 110 && o.pessoa) etiquetaPOV(p.sx, y - (o.balao ? 18 : 3), o.nome);
    px.globalAlpha = 1;
  }
}

function etiquetaPOV(x, y, nome) {
  px.font = `5px ${FONTE}`; px.textAlign = 'center'; px.textBaseline = 'bottom';
  const w = px.measureText(nome).width + 4;
  px.fillStyle = 'rgba(20,15,38,0.8)'; px.fillRect(Math.round(x - w / 2), Math.round(y - 7), Math.round(w), 7);
  px.fillStyle = '#ffc83d'; px.fillText(nome, Math.round(x), Math.round(y - 1));
}
function balaoPOV(x, y, emoji, s) {
  const tam = Math.max(7, Math.min(14, s * 6));
  px.fillStyle = '#f3eefe'; px.fillRect(Math.round(x - tam * 0.75), Math.round(y - tam * 1.6), Math.round(tam * 1.5), Math.round(tam * 1.3));
  px.fillRect(Math.round(x - 1), Math.round(y - tam * 0.3), 2, 2);
  px.font = `${tam}px "Segoe UI Emoji","Noto Color Emoji",sans-serif`; px.textAlign = 'center'; px.textBaseline = 'middle';
  px.fillText(emoji, Math.round(x), Math.round(y - tam * 0.95));
}

// ------------------------------------------------------------------ luvas do traje (primeira pessoa)
function maos(t) {
  px.save(); px.translate(PW / 2, PH); px.scale(1.6, 1.6); px.translate(-PW / 2, -PH);
  try { maosNaTela(t); } finally { px.restore(); }
}
function maosNaTela(t) {
  const a = POV.estado(t);
  const passo = a.andando ? Math.sin(t * 9) : 0;
  const by = PH - 30 + Math.abs(passo) * 3;
  // braço do traje entrando pelo canto da tela, na diagonal, com a luva (dedos e polegar) na ponta
  const luva = (x, y, flip, giro = 0, segura = null) => {
    px.save(); px.translate(x, y); if (flip) px.scale(-1, 1); px.rotate(-0.42 + giro);
    px.fillStyle = CONTORNO; px.fillRect(-12, -4, 26, 70);
    px.fillStyle = '#e9e6f2'; px.fillRect(-10, -2, 22, 66);              // manga do traje
    px.fillStyle = '#c9c4da'; px.fillRect(6, -2, 6, 66);                 // sombra da manga
    px.fillStyle = '#e2603b'; px.fillRect(-10, 16, 22, 5);               // faixa laranja
    px.fillStyle = CONTORNO; px.fillRect(-13, -8, 28, 7);
    px.fillStyle = '#9aa0b8'; px.fillRect(-11, -7, 24, 5);               // punho
    px.fillStyle = CONTORNO; px.fillRect(-12, -26, 26, 20);
    px.fillStyle = '#d8dbe8'; px.fillRect(-10, -24, 22, 17);             // palma
    px.fillStyle = CONTORNO; for (let i = 0; i < 4; i++) px.fillRect(-10 + i * 6, -33, 6, 10);
    px.fillStyle = '#e9ecf5'; for (let i = 0; i < 4; i++) px.fillRect(-9 + i * 6, -32, 4, 8);   // dedos
    if (segura) segura();                                                // o que a mão segura (lanterna)
    px.fillStyle = CONTORNO; px.fillRect(12, -22, 8, 12); px.fillStyle = '#e9ecf5'; px.fillRect(13, -21, 6, 10);   // polegar
    px.restore();
  };
  const fer = a.ferramenta;
  if (fer === 'martelo') {   // martelada: a mão direita sobe e desce
    const k = a.trabalhando ? Math.abs(Math.sin(t * 6)) : 0;
    luva(PW - 62, by + 2 - k * 16, true, -k * 0.5);
    px.save(); px.translate(PW - 78, by - 30 - k * 26); px.rotate(-0.5 + k * 0.9);
    px.fillStyle = CONTORNO; px.fillRect(-3, -40, 7, 44); px.fillStyle = '#8d5524'; px.fillRect(-2, -39, 5, 42);
    px.fillStyle = CONTORNO; px.fillRect(-12, -50, 25, 13); px.fillStyle = '#9aa0b8'; px.fillRect(-11, -49, 23, 11);
    px.restore();
    if (a.trabalhando && Math.sin(t * 6) > 0.92) for (let i = 0; i < 6; i++) { px.fillStyle = '#ffc83d'; px.fillRect(PW / 2 + (hash(i, Math.floor(t * 6)) - 0.5) * 40, HZ + 120 + hash(i, 3) * 30, 2, 2); }
    luva(52, by + 12, false);
  } else if (fer === 'lanterna') {   // luz estroboscópica na mão esquerda
    luva(80, by + 4, false, 0.2, () => {   // a lanterna fica presa na mão
      px.fillStyle = CONTORNO; px.fillRect(-8, -58, 20, 34); px.fillStyle = '#3a2f63'; px.fillRect(-6, -56, 16, 30);
      px.fillStyle = a.flash ? '#fffbe0' : '#ffd84a'; px.fillRect(-7, -63, 18, 7);
      if (a.flash) { px.fillStyle = 'rgba(255,250,210,0.35)'; px.fillRect(-14, -78, 30, 16); }
    });
    luva(PW - 52, by + 14, true);
  } else if (fer === 'tablet') {
    px.fillStyle = CONTORNO; px.fillRect(PW / 2 - 48, by - 30, 96, 62); px.fillStyle = '#1e1838'; px.fillRect(PW / 2 - 45, by - 27, 90, 56);
    px.fillStyle = '#3fd0c9'; px.font = `6px ${FONTE}`; px.textAlign = 'center'; px.textBaseline = 'middle';
    px.fillText(a.tela || 'OBRA', PW / 2, by - 14);
    if (a.progresso != null) { px.fillStyle = '#3a2f63'; px.fillRect(PW / 2 - 36, by, 72, 8); px.fillStyle = '#ffc83d'; px.fillRect(PW / 2 - 36, by, 72 * a.progresso, 8); }
    luva(PW / 2 - 56, by + 30, false, 0.25); luva(PW / 2 + 56, by + 30, true, 0.25);
  } else if (fer === 'aceno') {
    const k = Math.sin(t * 10) * 0.35;
    luva(PW - 70, by - 10, true, k);
  } else {
    luva(46, by + 20 + passo * 3, false); luva(PW - 46, by + 20 - passo * 3, true);
  }
}

// ------------------------------------------------------------------ capacete (HUD) e diário — na tela grande
function hudCapacete(t) {
  const a = POV.estado(t);
  const W2 = W, H2 = H;
  // moldura do visor
  const g = ctx.createRadialGradient(W2 / 2, H2 * 0.46, H2 * 0.36, W2 / 2, H2 * 0.46, H2 * 0.68);
  g.addColorStop(0, 'rgba(10,8,22,0)'); g.addColorStop(1, 'rgba(10,8,22,0.92)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W2, H2);
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = 0; y < H2; y += 8) ctx.fillRect(0, y, W2, 2);   // linhas do visor
  ctx.globalAlpha = 0.08; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(W2 * 0.28, H2 * 0.2, 140, 360, -0.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;   // reflexo
  // topo: REC + quem está filmando
  if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = COR.alerta; ctx.beginPath(); ctx.arc(80, 104, 14, 0, 7); ctx.fill(); }
  texto('REC', 108, 106, 24, '#fff', { alinhar: 'left' });
  texto(`POV: ${POV.info.prota.nome}`, W2 - 70, 92, 26, COR.ouro, { alinhar: 'right', maxW: 640 });
  if (POV.info.prota.cargo_nome) texto(POV.info.prota.cargo_nome.toUpperCase(), W2 - 70, 132, 16, COR.agua, { alinhar: 'right', contorno: false, maxW: 640 });
  // bússola
  const cx = W2 / 2, cy = 196;
  ctx.fillStyle = 'rgba(20,15,38,0.7)'; ctx.fillRect(cx - 230, cy - 26, 460, 52);
  ctx.save(); ctx.beginPath(); ctx.rect(cx - 230, cy - 26, 460, 52); ctx.clip();
  for (const [rot, ang0] of [['L', 0], ['S', Math.PI / 2], ['O', Math.PI], ['N', -Math.PI / 2]]) {
    for (const volta of [-2 * Math.PI, 0, 2 * Math.PI]) {
      const d = ang0 + volta - POV.cam.a;
      if (Math.abs(d) > 1.1) continue;
      texto(rot, cx + d * 200, cy + 2, rot === 'N' ? 26 : 20, rot === 'N' ? COR.alerta : '#fff', { contorno: false });
    }
  }
  ctx.restore();
  ctx.fillStyle = COR.ouro; ctx.fillRect(cx - 2, cy - 30, 4, 10);
  // oxigênio e temperatura
  const o2 = a.o2 != null ? a.o2 : 0.86 - t * 0.002;
  texto('O2', 70, 276, 22, COR.agua, { alinhar: 'left' });
  ctx.fillStyle = COR.borda; ctx.fillRect(130, 262, 220, 28);
  ctx.fillStyle = o2 < 0.3 ? COR.alerta : COR.agua; ctx.fillRect(134, 266, 212 * o2, 20);
  if (POV.info.estacao) texto(`${POV.info.estacao.temp}°C`, W2 - 70, 276, 24, COR.areia, { alinhar: 'right' });
  if (a.alerta && Math.floor(t * 3) % 2) { ctx.fillStyle = 'rgba(255,60,60,0.18)'; ctx.fillRect(0, 0, W2, H2); texto(a.alerta, W2 / 2, 300, 40, COR.alerta); }
  // diário em primeira pessoa (máquina de escrever)
  const fala = POV.falas.filter((f) => t >= f.t).pop();
  if (fala && t < fala.fim) {
    const n = Math.floor(clamp((t - fala.t) / Math.max(0.6, fala.texto.length * 0.035)) * fala.texto.length);
    const linhas = quebrarFala(fala.texto, 34, W2 - 180);
    let feito = 0;
    const y0 = H2 - 900;
    ctx.fillStyle = 'rgba(20,15,38,0.82)'; ctx.fillRect(60, y0 - 20, W2 - 120, linhas.length * 54 + (fala.quem ? 70 : 30));
    ctx.fillStyle = fala.quem ? COR.ouro : COR.agua; ctx.fillRect(60, y0 - 20, 8, linhas.length * 54 + (fala.quem ? 70 : 30));
    let y = y0 + 18;
    if (fala.quem) { texto(fala.quem, 96, y, 22, fala.quem === POV.info.prota.nome ? COR.agua : COR.ouro, { alinhar: 'left', contorno: false }); y += 50; }
    for (const l of linhas) {
      const parte = l.slice(0, Math.max(0, n - feito)); feito += l.length + 1;
      texto(parte, 96, y, 30, '#fff', { alinhar: 'left', contorno: false, maxW: W2 - 200 }); y += 54;
    }
  }
  // título no começo e chamada no fim
  if (t < 3.2) {
    ctx.globalAlpha = clamp(3.2 - t);
    texto('OPERAÇÃO MARTE ZERO', W2 / 2, 380, 34, '#fff');
    texto(POV.titulo, W2 / 2, 450, 44, COR.ouro, { maxW: W2 - 100 });
    ctx.globalAlpha = 1;
  }
  if (t > POV.duracao - 3.6) {
    ctx.globalAlpha = clamp((t - (POV.duracao - 3.6)) / 0.5);
    ctx.fillStyle = 'rgba(20,15,38,0.75)'; ctx.fillRect(0, 560, W2, 340);
    texto('VIRE PERSONAGEM', W2 / 2, 640, 50, COR.ouro);
    texto('E VIVA EM MARTE', W2 / 2, 720, 40, '#fff');
    texto(EP.site_tela, W2 / 2, 820, 30, COR.agua);
    ctx.globalAlpha = 1;
  }
}
function quebrarFala(str, tam, maxW) {
  ctx.font = `${tam}px ${FONTE}`;
  const out = []; let at = '';
  for (const p of str.split(' ')) { const t2 = at ? at + ' ' + p : p; if (ctx.measureText(t2).width > maxW && at) { out.push(at); at = p; } else at = t2; }
  if (at) out.push(at);
  return out.slice(0, 4);
}

// ------------------------------------------------------------------ roteiro (caminho da câmera + falas)
// passos: {andar: ponto, vel} · {olhar: ponto, dur} · {parar: dur} · com estado (ferramenta, trabalhando...) e fala opcional
function montarCaminho(inicio, angInicial, passos) {
  const trechos = [];
  let t = 0, pos = { ...inicio }, a = angInicial;
  const falas = [];
  for (const p of passos) {
    const st = { ...(p.estado || {}) };
    let dur, de = { ...pos }, para = { ...pos }, a0 = a, a1 = a;
    if (p.andar) {
      para = p.andar; a1 = angPara(pos, para);
      dur = Math.max(0.8, Math.hypot(para.x - pos.x, para.y - pos.y) / (p.vel || 22));
      st.andando = true;
    } else if (p.olhar) { a1 = angPara(pos, p.olhar); dur = p.dur || 1.2; }
    else dur = p.parar || 1;
    trechos.push({ t0: t, t1: t + dur, de, para, a0, a1, st, girar: p.andar ? Math.min(0.7, dur * 0.4) : dur * 0.8 });
    if (p.fala) for (const f of [].concat(p.fala)) {
      const ft = t + (f.atraso || 0.2);
      falas.push({ t: ft, fim: ft + Math.max(2.4, f.texto.length * 0.075), texto: f.texto, quem: f.quem || null });
    }
    t += dur; pos = para; a = a1;
  }
  // cada fala some quando começa a próxima
  falas.sort((x, y) => x.t - y.t);
  for (let i = 0; i + 1 < falas.length; i++) falas[i].fim = Math.min(falas[i].fim, falas[i + 1].t - 0.1);
  return { trechos, falas, duracao: t };
}
function camEm(tr, t) {
  let T = tr[tr.length - 1];
  for (const x of tr) if (t < x.t1) { T = x; break; }
  const k = clamp((t - T.t0) / (T.t1 - T.t0));
  const kg = clamp((t - T.t0) / Math.max(0.01, T.girar));
  const balanço = T.st.andando ? Math.sin(t * 9) * 0.018 : Math.sin(t * 0.8) * 0.01;
  return {
    x: lerp(T.de.x, T.para.x, T.st.andando ? k : 0), y: lerp(T.de.y, T.para.y, T.st.andando ? k : 0),
    a: mistura(T.a0, T.a1, suave(kg)) + balanço, st: T.st,
  };
}

// ------------------------------------------------------------------ cenas
function spritePOV(c) { return (c.sprite_url && imagens.get(c.sprite_url)) || spriteColono(c.seed); }
function pontoDe(tx, ty) { return { x: tx * CASA, y: ty * CASA }; }
function frenteDe(c) { return { x: c.x * CASA + 8, y: c.y * CASA + 22 }; }

function cenaObra(info) {
  const obra = obraDaMissao(), r = retanguloDe(obra), b = EP.mundo.base;
  const prota = info.prota;
  const casa = frenteDe(prota);
  const chegada = { x: (r.x0 + r.x1) / 2, y: r.y1 + 26 };
  const trilha = { x: (b.x + b.w / 2) * CASA, y: chegada.y + 40 };
  const pr = info.obra ? info.obra.progresso / 100 : 0.4;
  const nomeObra = obra.nome;
  return {
    titulo: `UM DIA DE OBRA: ${nomeObra.toUpperCase()}`,
    caminho: montarCaminho(casa, -Math.PI / 2, [
      { parar: 1.4, fala: { texto: `Diário de ${prota.nome}. Dia ${EP.numero} em Marte. Hoje é dia de obra.` } },
      { olhar: trilha, dur: 1 },
      { andar: trilha, vel: 26, fala: { texto: `Lá fora: ${info.estacao ? info.estacao.temp : -70} graus. O traje aguenta. Bora pra ${nomeObra}.`, atraso: 0.6 } },
      { olhar: chegada, dur: 0.8 },
      { andar: chegada, vel: 24, fala: { texto: `Olha a turma já trabalhando. Cada colono novo é mais uma mão na obra.`, atraso: 0.6 } },
      { olhar: { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }, dur: 1, estado: { ferramenta: 'tablet', tela: nomeObra.toUpperCase(), progresso: pr } ,
        fala: { texto: `${nomeObra}: ${Math.round(pr * 100)}% pronta. Vamos subir mais um pouco.` } },
      { parar: 2.2, estado: { ferramenta: 'tablet', tela: nomeObra.toUpperCase(), progresso: pr } },
      { parar: 5, estado: { ferramenta: 'martelo', trabalhando: true },
        fala: [{ texto: `Parafuso por parafuso. Aqui ninguém constrói sozinho.`, atraso: 0.4 },
               ...(info.vizinho ? [{ texto: `Valeu pela ajuda, ${prota.nome}! Amanhã tem mais.`, quem: info.vizinho.nome, atraso: 3 }] : [])] },
      { olhar: { x: (b.x + b.w / 2) * CASA, y: (b.y) * CASA }, dur: 1.4, fala: { texto: `O sol já vai se pôr. Fim de turno na colônia.`, atraso: 0.3 } },
      { parar: 3.8 },
    ]),
    pessoas: (t) => trabalhadores(info, r, t),
  };
}

function trabalhadores(info, r, t) {   // colonos e fundadores martelando em volta da obra
  const lista = [];
  const quem = [...EP.mundo.fundadores.map((f) => ({ img: spriteMapa(f.sprite), nome: f.curto })),
                ...info.colonos.filter((c) => c.codigo !== info.prota.codigo).slice(0, 8).map((c) => ({ img: spritePOV(c), nome: c.nome }))];
  quem.forEach((q, i) => {
    const p = pontoNaObra(r, i);
    const pulo = Math.floor(t * 4 + i) % 2 ? 1.2 : 0;
    lista.push({ x: p.x, y: p.y - 6, larg: 12, alt: 12, img: q.img, nome: q.nome, pessoa: true, voo: pulo, virar: i % 2 === 1,
                 balao: Math.floor(t / 2.5 + i) % 5 === 0 ? ['🔧', '💪', '🧱', '⚙️'][i % 4] : null });
  });
  return lista;
}

function cenaDefesa(info) {
  const b = EP.mundo.base, prota = info.prota;
  const porta = { x: (b.x + b.w / 2) * CASA, y: (b.y + b.h) * CASA + 30 };
  const cerca = { x: porta.x + 80, y: porta.y + 90 };
  const dunas = { x: cerca.x + 140, y: cerca.y + 120 };
  const perto = { x: cerca.x - 44, y: cerca.y - 52 };   // para a uns passos da cerca
  const caminho = montarCaminho(porta, Math.PI / 2, [
    { parar: 1.6, estado: { alerta: 'ALERTA!' }, fala: { texto: `Noite em Marte. O alarme tocou: alguma coisa está mexendo na cerca.` } },
    { olhar: cerca, dur: 0.9, estado: { alerta: 'ALERTA!' } },
    { parar: 0.6, estado: { ferramenta: 'lanterna' } },
    { andar: perto, vel: 34, estado: { ferramenta: 'lanterna' }, fala: { texto: `Besouros-de-ferrugem! Eles roem os cabos da colônia.`, atraso: 0.8 } },
    { parar: 1.2, estado: { ferramenta: 'lanterna' }, fala: { texto: `Sem machucar ninguém. Só luz.` } },
    { olhar: dunas, dur: 0.6, estado: { ferramenta: 'lanterna', flash: true } },
    { parar: 3.6, estado: { ferramenta: 'lanterna', flash: true, estrobo: true }, fala: { texto: `Luz estroboscópica neles!`, atraso: 0.1 } },
    { parar: 2.4, estado: { ferramenta: 'lanterna' }, fala: { texto: `Voltaram para as dunas. Cerca inteira, cabos salvos.` } },
    { olhar: porta, dur: 1.4, fala: { texto: `Mais uma noite tranquila na colônia. Boa noite, ${info.colonos.length + 2} colonos.`, atraso: 0.4 } },
    { parar: 3.8 },
  ]);
  const tFlash = caminho.trechos.find((x) => x.st.estrobo);
  const fuga0 = tFlash ? tFlash.t0 : 99;
  return {
    titulo: 'DEFENDENDO A BASE', noite: true, caminho,
    pessoas: (t) => {
      const lista = [];
      for (let i = 0; i < 9; i++) {
        const base = { x: cerca.x + 10 + (hash(i, 1) - 0.5) * 60, y: cerca.y + (hash(i, 2) - 0.5) * 24 };
        const fuga = clamp((t - fuga0 - hash(i, 3) * 0.8) / 2.5);
        const ida = { x: lerp(base.x, dunas.x + (hash(i, 4) - 0.5) * 120, fuga), y: lerp(base.y, dunas.y + hash(i, 5) * 60, fuga) };
        const treme = fuga > 0 ? 0 : Math.sin(t * 14 + i) * 1.2;
        if (fuga >= 1) continue;
        lista.push({ x: ida.x + treme, y: ida.y, larg: 14, alt: 10, img: besouro(Math.floor(t * 8 + i)), virar: fuga > 0 });
      }
      lista.push({ x: cerca.x + 20, y: cerca.y + 22, larg: 44, alt: 6, img: cercaImg() });
      return lista;
    },
  };
}
let _cerca = null;
function cercaImg() {
  if (_cerca) return _cerca;
  _cerca = document.createElement('canvas'); _cerca.width = 40; _cerca.height = 10;
  const x = _cerca.getContext('2d');
  x.fillStyle = '#5b6b8c'; for (let i = 0; i < 40; i += 8) x.fillRect(i, 0, 2, 10);
  x.fillRect(0, 2, 40, 1); x.fillRect(0, 6, 40, 1);
  return _cerca;
}

function cenaPasseio(info) {
  const prota = info.prota, b = EP.mundo.base;
  const vizinhos = info.colonos.filter((c) => c.codigo !== prota.codigo).slice(0, 4);
  const pontos = [];
  let at = frenteDe(prota);
  for (const v of vizinhos) pontos.push({ v, p: { x: v.x * CASA + 8, y: v.y * CASA + 34 } });
  const passos = [{ parar: 1.4, fala: { texto: `Diário de ${prota.nome}. Hora de dar uma volta pelo bairro.` } }];
  for (const { v, p } of pontos) {
    passos.push({ andar: p, vel: 24 });
    passos.push({ olhar: { x: v.x * CASA + 8, y: v.y * CASA + 12 }, dur: 0.8, estado: { ferramenta: 'aceno' },
                  fala: [{ texto: `Olha quem está em casa: ${v.nome}${v.cargo_nome ? `, ${v.cargo_nome.toLowerCase()}` : ''}!` },
                         { texto: saudacao(v, prota), quem: v.nome, atraso: 1.6 }] });
    passos.push({ parar: 2.6, estado: { ferramenta: 'aceno' } });
  }
  const praca = EP.mundo.praca ? centro(EP.mundo.praca) : centro(b);
  passos.push({ andar: { x: praca.x, y: praca.y + 30 }, vel: 26, fala: { texto: `Cada casa aqui é de um seguidor de verdade.`, atraso: 0.8 } });
  passos.push({ olhar: centro(b), dur: 1.4, fala: { texto: `E ainda tem muito lote livre. Quem vem morar com a gente?`, atraso: 0.3 } });
  passos.push({ parar: 3.8 });
  return {
    titulo: 'PASSEIO PELA COLÔNIA', caminho: montarCaminho(at, -Math.PI / 2, passos),
    pessoas: (t) => info.colonos.filter((c) => c.codigo !== prota.codigo).map((c, i) => ({
      x: c.x * CASA + 8, y: c.y * CASA + 18, larg: 12, alt: 12, img: spritePOV(c), nome: c.nome, pessoa: true,
      voo: Math.floor(t * 2 + i) % 3 === 0 ? 1 : 0, virar: Math.sin(t * 0.7 + i) > 0,
      balao: Math.floor(t / 2 + i) % 4 === 0 ? ['👋', '😄', '🚀', '❤️'][i % 4] : null,
    })),
  };
}
function saudacao(v, prota) {
  const opcoes = [
    `E aí, ${prota.nome}! Já viu a obra hoje?`,
    `Bom dia, vizinho! Cuidado com a poeira lá fora.`,
    `${prota.nome}! Passa aqui mais tarde pra um café de estufa.`,
    `Opa! Amanhã eu ajudo na obra também.`,
  ];
  return opcoes[Math.abs(v.seed || 0) % opcoes.length];
}

function cenaConversa(info) {
  const prota = info.prota;
  const v = info.colonos.find((c) => c.codigo !== prota.codigo) || null;
  const lia = EP.mundo.fundadores.find((f) => f.id === 'lia') || EP.mundo.fundadores[0];
  const quem = v ? { nome: v.nome, img: spritePOV(v), cargo: v.cargo_nome } : { nome: lia.curto, img: spriteMapa(lia.sprite), cargo: 'Cientista' };
  const praca = EP.mundo.praca ? centro(EP.mundo.praca) : centro(EP.mundo.base);
  const encontro = { x: praca.x, y: praca.y + 10 };
  const de = { x: encontro.x - 70, y: encontro.y + 70 };
  const linhas = conversa(info, quem);
  const passos = [
    { parar: 1.2, fala: { texto: `Diário de ${prota.nome}. Encontrei alguém na praça.` } },
    { andar: { x: encontro.x - 14, y: encontro.y + 22 }, vel: 22 },
    { olhar: encontro, dur: 0.8 },
  ];
  linhas.forEach((l, i) => passos.push({ parar: Math.max(2.6, l.texto.length * 0.07), estado: { ferramenta: l.quem === prota.nome ? 'aceno' : null }, fala: { ...l, atraso: 0.15 } }));
  passos.push({ parar: 3.8 });
  return {
    titulo: `PAPO NA PRAÇA COM ${quem.nome.toUpperCase()}`, caminho: montarCaminho(de, -Math.PI / 4, passos),
    pessoas: (t) => [{ x: encontro.x, y: encontro.y, larg: 12, alt: 12, img: quem.img, nome: quem.nome, pessoa: true,
                       voo: Math.floor(t * 3) % 4 === 0 ? 1 : 0, balao: Math.floor(t / 1.5) % 3 === 0 ? '💬' : null }],
  };
}
function conversa(info, quem) {
  const p = info.prota.nome, o = info.obra, est = info.estacao;
  const l = [
    { quem: quem.nome, texto: `Fala, ${p}! Viu que já somos ${info.populacao} na colônia?` },
    { quem: p, texto: `Vi! A cada dia chega gente nova. O bairro tá enchendo.` },
  ];
  if (o) l.push({ quem: quem.nome, texto: `E a ${o.nome}? Ouvi dizer que já passou de ${o.progresso}%.` },
                { quem: p, texto: `Com mais mãos ela sai rapidinho. Amanhã eu vou cedo.` });
  if (info.problema) l.push({ quem: quem.nome, texto: `E aquele susto de hoje... ${info.problema.titulo.toLowerCase()}! Achei que não ia dar.` },
                            { quem: p, texto: `A ${info.problema.heroi || 'Lia'} resolveu na hora. Essa colônia não para.` });
  else if (est) l.push({ quem: quem.nome, texto: `${est.temp} graus lá fora. Que ${est.nome.toLowerCase()} é essa?` });
  l.push({ quem: quem.nome, texto: `Bora chamar mais gente pra morar aqui!` });
  return l;
}

const CENAS = { obra: cenaObra, defesa: cenaDefesa, passeio: cenaPasseio, conversa: cenaConversa };

// ------------------------------------------------------------------ API para o pov.py
window.carregarPOV = function (info, nome) {
  for (const c of info.colonos) if (!colonoPorCodigo.has(c.codigo)) colonoPorCodigo.set(c.codigo, c);
  const cena = CENAS[nome](info);
  POV = {
    info, nome, titulo: cena.titulo, noite: !!cena.noite, pessoas: cena.pessoas,
    trechos: cena.caminho.trechos, falas: cena.caminho.falas, duracao: cena.caminho.duracao,
    cam: { x: 0, y: 0, a: 0 },
    estado: (t) => camEm(POV.trechos, t).st,
  };
  prepararObjetos(EP.duracao);
  return { quadros: Math.ceil(POV.duracao * EP.fps), duracao: POV.duracao, titulo: POV.titulo,
           falas: POV.falas.map((f) => ({ t: f.t, texto: f.texto, quem: f.quem })) };
};

function desenharPOV(t) {
  const c = camEm(POV.trechos, t);
  POV.cam = { x: c.x, y: c.y, a: c.a };
  px.setTransform(1, 0, 0, 1, 0, 0);
  ceu(t, POV.noite);
  chao(POV.noite);
  const casas = POV.info.colonos.filter((x) => x.codigo !== POV.info.prota.codigo)   // a própria casa fica atrás da câmera
    .map((x) => ({ x: x.x * CASA + 8, y: x.y * CASA + 10, larg: 16, alt: 12, img: casinha(x.seed) }));
  const pet = POV.info.pets.map((p, i) => ({ x: p.x * CASA + 8 + Math.sin(t * 0.9 + i) * 8, y: p.y * CASA + 26, larg: 8, alt: 8,
                                             img: spriteContornado('pet'), virar: Math.cos(t * 0.9 + i) < 0 }));
  desenharBillboards([...predios(), ...casas, ...pet, ...POV.pessoas(t)], POV.noite);
  if (c.st.estrobo && Math.floor(t * 10) % 2 === 0) { px.fillStyle = 'rgba(255,250,220,0.55)'; px.fillRect(0, 0, PW, PH); }
  if (POV.noite && c.st.ferramenta === 'lanterna') {   // cone da lanterna
    const g = px.createRadialGradient(PW / 2, HZ + 70, 10, PW / 2, HZ + 70, 160);
    g.addColorStop(0, 'rgba(255,230,160,0.28)'); g.addColorStop(1, 'rgba(255,230,160,0)');
    px.fillStyle = g; px.fillRect(0, 0, PW, PH);
  }
  maos(t);
  // tela grande: amplia a cena pixel a pixel e põe o capacete por cima
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pc, 0, 0, PW, PH, 0, 0, W, H);
  hudCapacete(t);
  const preto = Math.max(1 - clamp(t / 0.5), clamp((t - (POV.duracao - 0.7)) / 0.7));
  if (preto > 0) { ctx.globalAlpha = preto; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}

window.quadroPOV = function (i, qualidade = 0.9) {
  desenharPOV(i / EP.fps);
  return cv.toDataURL('image/jpeg', qualidade);
};
window.desenharPOV = desenharPOV;
