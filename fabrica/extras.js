// Operação Marte Zero · Imagens extras (thumbnail do YouTube, capa dos Reels/TikTok e carrossel do Instagram).
// Roda DEPOIS do diretor.js (mesmo mundo, mesmos sprites, mesma fonte): o mundo é desenhado na tela do diretor
// e recortado para a imagem final, que ganha textos e personagens grandes por cima. Sem IA.
//
//   imagens.py chama: carregarEpisodio(ep) → gerarImagens(info) → [{nome, dataUrl}]

const SAI = document.createElement('canvas');
const sx = SAI.getContext('2d');

// ------------------------------------------------------------------ mundo (só o mapa, sem HUD do vídeo)
function fotoMundo(t, alvo, zoom) {
  const p = typeof alvo === 'string' ? posAlvo(alvo, t) : alvo;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#a94f33';
  ctx.fillRect(0, 0, W, H);
  const tx = Math.round(W / 2 - p.x * zoom), ty = Math.round(H / 2 - p.y * zoom);
  ctx.setTransform(zoom, 0, 0, zoom, tx, ty);
  ctx.drawImage(terreno, TER.x0 * CASA, TER.y0 * CASA);
  const view = {
    x0: Math.floor(-tx / zoom / CASA), x1: Math.ceil((W - tx) / zoom / CASA),
    y0: Math.floor(-ty / zoom / CASA), y1: Math.ceil((H - ty) / zoom / CASA),
  };
  const energia = t >= tempoEnergia || EP.mundo.obras.some((o) => o.tipo === 'solar' && o.status === 'concluida');
  desenharObras(t);
  desenharColonos(view, t);
  desenharCompras(t);
  desenharBase(t, energia);
  desenharPortaAbrigo(t);
  desenharFundadores(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (EP.estacao) {   // um pouco da poeira/clima da estação
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#f6d7a7';
    for (let i = 0; i < 160; i++) ctx.fillRect(hash(i, 1) * W, hash(i, 2) * H, 3, 3);
    ctx.globalAlpha = 1;
  }
}

// recorta a foto do mundo (centro da tela do diretor) para o fundo da imagem final, cobrindo tudo
function fundoMundo(w, h, escurecer = 0) {
  const k = Math.max(w / W, h / H) * 1.0001;
  const cw = w / k, ch = h / k;
  sx.imageSmoothingEnabled = false;
  sx.drawImage(cv, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, w, h);
  if (escurecer) { sx.fillStyle = `rgba(20,15,38,${escurecer})`; sx.fillRect(0, 0, w, h); }
}

// ------------------------------------------------------------------ desenho na imagem final
function novo(w, h) { SAI.width = w; SAI.height = h; sx.setTransform(1, 0, 0, 1, 0, 0); sx.imageSmoothingEnabled = false; }
function r(x, y, w, h, cor) { sx.fillStyle = cor; sx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function escrever(str, x, y, tam, cor, opc = {}) {
  const maxW = opc.maxW || SAI.width - 80;
  let s = tam;
  sx.font = `${s}px ${FONTE}`;
  while (sx.measureText(str).width > maxW && s > 10) { s -= 2; sx.font = `${s}px ${FONTE}`; }
  sx.textAlign = opc.alinhar || 'center';
  sx.textBaseline = 'middle';
  if (opc.sombra !== false) { sx.fillStyle = '#0009'; sx.fillText(str, x + Math.max(3, s * 0.12), y + Math.max(3, s * 0.12)); }
  if (opc.contorno !== false) {
    sx.lineJoin = 'round'; sx.lineWidth = Math.max(6, s * 0.32); sx.strokeStyle = opc.corContorno || COR.ceu;
    sx.strokeText(str, x, y);
  }
  sx.fillStyle = cor; sx.fillText(str, x, y);
  return sx.measureText(str).width;
}
function painel(x, y, w, h, borda = COR.borda, alfa = 0.9) {
  sx.globalAlpha = alfa; r(x, y, w, h, COR.ceu); sx.globalAlpha = 1;
  r(x, y, w, 8, borda); r(x, y + h - 8, w, 8, borda); r(x, y, 8, h, borda); r(x + w - 8, y, 8, h, borda);
}
function selo(texto, x, y, tam, fundo, cor = COR.ceu) {   // etiqueta colorida (ex.: "EP 2")
  sx.font = `${tam}px ${FONTE}`;
  const w = sx.measureText(texto).width + tam * 1.4, h = tam * 2.1;
  r(x + 8, y + 8, w, h, '#0008'); r(x, y, w, h, fundo); r(x, y + h - 6, w, 6, '#0003');
  escrever(texto, x + w / 2, y + h / 2 + 2, tam, cor, { contorno: false, sombra: false });
  return { w, h };
}
// personagem grande, com contorno escuro (pixel art ampliada sem borrar)
function boneco(spr, x, y, escala, virar = false) {
  const w = spr.width * escala, h = spr.height * escala;
  sx.save(); sx.translate(Math.round(x), Math.round(y)); if (virar) sx.scale(-1, 1);
  sx.globalAlpha = 0.35; sx.fillStyle = '#000'; sx.fillRect(-w * 0.4, h * 0.46, w * 0.8, escala * 1.4); sx.globalAlpha = 1;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {   // contorno
    sx.filter = 'brightness(0)'; sx.drawImage(spr, -w / 2 + dx * escala * 0.6, -h / 2 + dy * escala * 0.6, w, h);
  }
  sx.filter = 'none'; sx.drawImage(spr, -w / 2, -h / 2, w, h); sx.restore();
}
function spriteDe(c) { return (c.sprite_url && imagens.get(c.sprite_url)) || spriteColono(c.seed); }
function barra(x, y, w, h, k, cor) {
  r(x, y, w, h, COR.borda); r(x + 4, y + 4, (w - 8) * k, h - 8, cor);
  for (let i = 1; i < 10; i++) r(x + (w * i) / 10, y, 2, h, '#0004');
}
function quebrar(str, tam, maxW) {
  sx.font = `${tam}px ${FONTE}`;
  const linhas = []; let at = '';
  for (const p of str.split(' ')) {
    const t = at ? at + ' ' + p : p;
    if (sx.measureText(t).width > maxW && at) { linhas.push(at); at = p; } else at = t;
  }
  if (at) linhas.push(at);
  return linhas;
}
const png = () => SAI.toDataURL('image/png');

// ------------------------------------------------------------------ momentos do episódio
function cenaT(tipo, k = 0.5) {
  const c = EP.cenas.filter((x) => x.tipo === tipo);
  if (!c.length) return null;
  if (tipo === 'missao') { const a = c[0].inicio, b = c[c.length - 1].fim; return a + (b - a) * k; }
  return c[0].inicio + (c[0].fim - c[0].inicio) * k;
}

// ------------------------------------------------------------------ peças
function thumbYoutube(info) {
  const w = 1280, h = 720;
  novo(w, h);
  const tM = cenaT('missao', 0.75) ?? EP.duracao * 0.6;
  fotoMundo(tM, 'obra', 7.5);
  fundoMundo(w, h);
  const g = sx.createLinearGradient(0, 0, w * 0.75, 0);
  g.addColorStop(0, 'rgba(20,15,38,0.92)'); g.addColorStop(0.6, 'rgba(20,15,38,0.55)'); g.addColorStop(1, 'rgba(20,15,38,0)');
  sx.fillStyle = g; sx.fillRect(0, 0, w, h);
  selo(`EP ${EP.numero}`, 48, 44, 44, COR.ouro);
  if (info.estacao) selo(`${info.estacao.nome.toUpperCase()} ${info.estacao.temp}°C`, 48 + 250, 52, 22, COR.agua);
  const linhas = quebrar(info.manchete, 64, 700).slice(0, 3);
  linhas.forEach((l, i) => escrever(l, 52, 250 + i * 92, 64, i === linhas.length - 1 ? COR.ouro : '#ffffff', { alinhar: 'left', maxW: 720 }));
  if (info.problema) selo(`! ${info.problema.titulo.toUpperCase()}`, 52, 250 + linhas.length * 92 + 10, 26, COR.alerta, '#fff');
  escrever('OPERAÇÃO MARTE ZERO', 52, h - 52, 26, COR.areia, { alinhar: 'left' });
  // heróis do dia em tamanho grande
  const f = EP.mundo.fundadores;
  const heroi = info.problema && f.find((x) => (info.problema.heroi || '').includes(x.curto));
  boneco(spriteMapa((heroi || f[0]).sprite), w - 250, h - 260, 26, true);
  const vizinhos = info.novos.slice(0, 2);
  vizinhos.forEach((c, i) => boneco(spriteDe(colonoPorCodigo.get(c.codigo) || c), w - 470 - i * 150, h - 150, 13, i % 2 === 0));
  return png();
}

function capaVertical(info) {
  const w = 1080, h = 1920;
  novo(w, h);
  fotoMundo(cenaT('missao', 0.8) ?? EP.duracao * 0.6, 'obra', 6);
  fundoMundo(w, h, 0.25);
  const g = sx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(20,15,38,0.85)'); g.addColorStop(0.35, 'rgba(20,15,38,0.1)');
  g.addColorStop(0.7, 'rgba(20,15,38,0.1)'); g.addColorStop(1, 'rgba(20,15,38,0.9)');
  sx.fillStyle = g; sx.fillRect(0, 0, w, h);
  escrever('OPERAÇÃO', w / 2, 210, 70, '#fff');
  escrever('MARTE ZERO', w / 2, 310, 96, COR.ouro);
  selo(`EPISÓDIO ${EP.numero}`, w / 2 - 190, 400, 40, COR.agua);
  quebrar(info.manchete, 56, w - 140).slice(0, 3).forEach((l, i) => escrever(l, w / 2, 1430 + i * 84, 56, i ? COR.ouro : '#fff'));
  if (info.problema) { const t = `! ${info.problema.titulo.toUpperCase()}`; sx.font = `30px ${FONTE}`; selo(t, w / 2 - (sx.measureText(t).width + 42) / 2, 1700, 30, COR.alerta, '#fff'); }
  return png();
}

function slideCapa(info) {
  const w = 1080, h = 1350;
  novo(w, h);
  fotoMundo(EP.duracao - 2, 'colonia', 4.2);
  fundoMundo(w, h, 0.15);
  const g = sx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(20,15,38,0.9)'); g.addColorStop(0.32, 'rgba(20,15,38,0)'); g.addColorStop(0.75, 'rgba(20,15,38,0)'); g.addColorStop(1, 'rgba(20,15,38,0.92)');
  sx.fillStyle = g; sx.fillRect(0, 0, w, h);
  escrever('OPERAÇÃO', w / 2, 120, 58, '#fff');
  escrever('MARTE ZERO', w / 2, 210, 80, COR.ouro);
  selo(`EPISÓDIO ${EP.numero}`, w / 2 - 175, 280, 36, COR.agua);
  quebrar(info.manchete, 48, w - 140).slice(0, 2).forEach((l, i) => escrever(l, w / 2, 1130 + i * 70, 48, i ? COR.ouro : '#fff'));
  escrever('ARRASTE PARA O LADO  >>', w / 2, 1280, 24, COR.areia);
  return png();
}

function slideBoletim(info) {
  const w = 1080, h = 1350;
  novo(w, h);
  fotoMundo(cenaT('missao', 0.9) ?? EP.duracao * 0.6, 'obra', 5.5);
  fundoMundo(w, h, 0.55);
  escrever('BOLETIM DA COLÔNIA', w / 2, 110, 52, COR.ouro);
  escrever(`DIA ${EP.numero} EM MARTE`, w / 2, 180, 28, COR.areia);
  let y = 260;
  const linha = (rot, valor, cor, extra) => {
    painel(70, y, w - 140, 170, cor);
    escrever(rot, 110, y + 52, 26, COR.areia, { alinhar: 'left', contorno: false, sombra: false });
    escrever(valor, 110, y + 112, 38, '#fff', { alinhar: 'left', contorno: false, sombra: false, maxW: w - 220 });
    if (extra) extra(y);
    y += 200;
  };
  if (info.estacao) linha('CLIMA', `${info.estacao.nome.toUpperCase()} · ${info.estacao.temp}°C`, COR.agua);
  linha('POPULAÇÃO', `${info.populacao} COLONOS${info.novos.length ? `  (+${info.novos_total})` : ''}`, COR.ok);
  if (info.obra) {   // nome da obra em cima, barra de andamento embaixo (largura toda)
    painel(70, y, w - 140, 170, COR.ouro);
    escrever(`OBRA: ${info.obra.nome.toUpperCase()}`, 110, y + 52, 26, COR.areia, { alinhar: 'left', contorno: false, sombra: false, maxW: w - 380 });
    escrever(`${info.obra.progresso}%`, w - 110, y + 52, 34, COR.ouro, { alinhar: 'right', contorno: false, sombra: false });
    barra(110, y + 96, w - 220, 44, info.obra.progresso / 100, COR.ouro);
    y += 200;
  }
  if (info.problema) linha('PROBLEMA DO DIA', info.problema.titulo.toUpperCase(), COR.alerta, (yy) => {
    escrever(`RESOLVIDO POR ${(info.problema.heroi || '').toUpperCase()}`, w - 110, yy + 52, 20, COR.ok, { alinhar: 'right', contorno: false, sombra: false });
  });
  escrever('EPISÓDIO NOVO TODO DIA', w / 2, h - 90, 30, COR.ouro);
  return png();
}

function slideBemVindos(info) {
  const w = 1080, h = 1350;
  novo(w, h);
  fotoMundo(cenaT('boas_vindas', 0.5) ?? 20, 'colonia', 5);
  fundoMundo(w, h, 0.6);
  escrever('BEM-VINDOS!', w / 2, 120, 72, COR.ouro);
  escrever('NOVOS COLONOS DE MARTE', w / 2, 200, 26, COR.areia);
  const lista = info.novos.slice(0, 6);
  const cols = lista.length <= 2 ? lista.length : lista.length <= 4 ? 2 : 3;
  const cw = (w - 120) / Math.max(1, cols), lin = Math.ceil(lista.length / Math.max(1, cols));
  const ch = Math.min(440, (h - 420) / Math.max(1, lin));
  lista.forEach((c, i) => {
    const cx = 60 + (i % cols) * cw + cw / 2, cy = 300 + Math.floor(i / cols) * ch;
    painel(cx - cw / 2 + 14, cy, cw - 28, ch - 24, COR.borda, 0.82);
    boneco(spriteDe(colonoPorCodigo.get(c.codigo) || c), cx, cy + ch * 0.36, Math.min(14, ch / 30));
    escrever(c.nome, cx, cy + ch - 120, 30, '#fff', { maxW: cw - 70 });
    if (c.cargo_nome) escrever(c.cargo_nome.toUpperCase(), cx, cy + ch - 72, 16, COR.agua, { maxW: cw - 70, contorno: false });
  });
  if (info.novos_total > lista.length) escrever(`E MAIS ${info.novos_total - lista.length}!`, w / 2, h - 150, 30, COR.ouro);
  escrever('PROCURE SEU NOME NO MAPA', w / 2, h - 80, 28, COR.ouro);
  return png();
}

function slideChamada() {
  const w = 1080, h = 1350;
  novo(w, h);
  fotoMundo(EP.duracao - 1, 'panorama', 2.6);
  fundoMundo(w, h, 0.35);
  painel(80, 360, w - 160, 560, COR.marte, 0.92);
  escrever('CADA SEGUIDOR', w / 2, 460, 46, '#fff');
  escrever('VIRA PERSONAGEM', w / 2, 540, 46, COR.ouro);
  quebrar('Cadastre-se, ganhe sua casa na colônia e apareça nos próximos episódios.', 26, w - 300)
    .forEach((l, i) => escrever(l, w / 2, 650 + i * 48, 26, COR.areia, { contorno: false }));
  selo('LINK NA BIO', w / 2 - 190, 800, 40, COR.ouro);
  EP.mundo.fundadores.forEach((f, i) => boneco(spriteMapa(f.sprite), w / 2 + (i ? 170 : -170), 1110, 14, i === 1));
  escrever(EP.site_tela, w / 2, h - 80, 26, '#fff');
  return png();
}

window.gerarImagens = function (info) {
  const saida = [];
  const add = (nome, fn) => saida.push({ nome, url: fn(info) });
  add('thumb_youtube.png', thumbYoutube);
  add('capa_vertical.png', capaVertical);
  add('carrossel_1_capa.png', slideCapa);
  add('carrossel_2_boletim.png', slideBoletim);
  if (info.novos.length) add('carrossel_3_bem_vindos.png', slideBemVindos);
  add(`carrossel_${info.novos.length ? 4 : 3}_vire_personagem.png`, slideChamada);
  return saida;
};
