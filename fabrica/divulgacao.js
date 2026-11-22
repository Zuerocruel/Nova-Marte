// Operação Marte Zero · Peças de divulgação (sem IA): post de apresentação (carrossel 4:5) e stories (9:16).
// Roda DEPOIS do diretor.js e do extras.js: usa o mundo real do último episódio como fundo.
// O endereço do site vai ESCRITO na imagem (as legendas do Instagram/TikTok nunca levam link).
//
//   divulgacao.py chama: gerarApresentacao(info) e gerarStories(info) → [{nome, url}]

function liderDeExemplo(seed, id) {
  const lid = EP.liderancas && EP.liderancas[id];
  return canvasDeMatriz(lid ? vestirTraje(gerarSprite(seed), lid) : gerarSprite(seed), (v) => v);
}
function colonosGrandes(y, escala, n = 5) {   // fileira de colonos de verdade, grandes
  const lista = EP.mundo.colonos.slice(0, n);
  const passo = Math.min(190, (SAI.width - 160) / Math.max(1, lista.length));
  lista.forEach((c, i) => boneco(spriteDe(c), SAI.width / 2 + (i - (lista.length - 1) / 2) * passo, y, escala, i % 2 === 1));
  return lista;
}
function passo(n, titulo, texto, y, cor) {
  const w = SAI.width;
  painel(90, y, w - 180, 190, cor, 0.9);
  selo(String(n), 120, y + 50, 46, cor);
  escrever(titulo, 250, y + 70, 34, '#fff', { alinhar: 'left', maxW: w - 380 });
  quebrar(texto, 24, w - 400).slice(0, 2).forEach((l, i) => escrever(l, 250, y + 122 + i * 36, 24, COR.areia, { alinhar: 'left', contorno: false }));
}
function gradiente(w, h, paradas) {
  const g = sx.createLinearGradient(0, 0, 0, h);
  paradas.forEach(([k, a]) => g.addColorStop(k, `rgba(20,15,38,${a})`));
  sx.fillStyle = g; sx.fillRect(0, 0, w, h);
}

// ------------------------------------------------------------------ carrossel de apresentação (1080x1350, 4:5)
// Área segura: a grade do perfil corta as laterais do 4:5 para 3:4 (~35 px de cada lado): margem de 90 px.
function apCapa() {
  const w = 1080, h = 1350;
  novo(w, h);
  fotoMundo(EP.duracao - 2, 'colonia', 4);
  fundoMundo(w, h, 0.1);
  gradiente(w, h, [[0, 0.92], [0.36, 0.05], [0.66, 0.05], [1, 0.95]]);
  escrever('OPERAÇÃO', w / 2, 140, 62, '#fff');
  escrever('MARTE ZERO', w / 2, 235, 88, COR.ouro);
  selo('SÉRIE DIÁRIA EM PIXEL ART', w / 2 - 300, 300, 30, COR.agua);
  escrever('CADA SEGUIDOR', w / 2, 1080, 54, '#fff');
  escrever('VIRA COLONO', w / 2, 1160, 64, COR.ouro);
  escrever('ARRASTE PARA VER COMO  >>', w / 2, 1265, 24, COR.areia);
  return png();
}
function apComoFunciona() {
  const w = 1080, h = 1350;
  novo(w, h);
  fotoMundo(EP.duracao * 0.3, 'base', 3.2);
  fundoMundo(w, h, 0.62);
  escrever('COMO FUNCIONA', w / 2, 130, 58, COR.ouro);
  passo(1, 'ACESSE O SITE', EP.site_tela, 230, COR.agua);
  passo(2, 'INSIRA SEU NOME', 'Nome ou nick e o seu @. Leva 30 segundos.', 450, COR.ouro);
  passo(3, 'VOCÊ VIRA COLONO', 'Ganha uma casa e aparece nos episódios.', 670, COR.marte);
  colonosGrandes(1080, 13);
  escrever('É GRÁTIS', w / 2, 1255, 40, COR.ok);
  return png();
}
function apMundoAoVivo() {
  const w = 1080, h = 1350;
  novo(w, h);
  fotoMundo(EP.duracao * 0.2, 'colonia', 5.5);
  fundoMundo(w, h, 0.05);
  gradiente(w, h, [[0, 0.95], [0.28, 0.1], [0.72, 0.1], [1, 0.95]]);
  escrever('COLÔNIA AO VIVO', w / 2, 130, 58, COR.ouro);
  quebrar('Sua casa aparece no mapa na hora. Procure seu nome e veja os colonos vivendo o dia.', 30, w - 220)
    .forEach((l, i) => escrever(l, w / 2, 220 + i * 48, 30, '#fff'));
  selo('LOJA DA COLÔNIA', w / 2 - 240, 1080, 36, COR.marte, '#fff');
  quebrar('Cápsula, pet, foguete, rover, outdoor e eventos que mudam o episódio.', 26, w - 220)
    .forEach((l, i) => escrever(l, w / 2, 1200 + i * 42, 26, COR.areia));
  return png();
}
function apEpisodios() {
  const w = 1080, h = 1350;
  novo(w, h);
  fotoMundo(cenaT('missao', 0.7) ?? EP.duracao * 0.6, 'obra', 5.5);
  fundoMundo(w, h, 0.2);
  gradiente(w, h, [[0, 0.95], [0.3, 0.1], [0.6, 0.2], [1, 0.97]]);
  escrever('TODO DIA', w / 2, 130, 58, '#fff');
  escrever('UM EPISÓDIO NOVO', w / 2, 215, 58, COR.ouro);
  quebrar('A colônia constrói uma obra por dia, enfrenta os perigos de Marte e chama os colonos pelo nome.', 28, w - 220)
    .forEach((l, i) => escrever(l, w / 2, 300 + i * 46, 28, '#fff'));
  painel(90, 930, w - 180, 330, COR.ouro, 0.92);
  boneco(liderDeExemplo(7, 'lider'), 220, 1090, 12);
  escrever('QUEM ENTRA PELO SITE', 600, 1010, 30, '#fff', { maxW: 560 });
  escrever('CONCORRE A', 600, 1070, 30, '#fff', { maxW: 560 });
  escrever('LÍDER DA COLÔNIA', 600, 1140, 40, COR.ouro, { maxW: 560 });
  escrever('traje e tag exclusivos', 600, 1205, 22, COR.areia, { contorno: false, maxW: 560 });
  return png();
}
function apChamada() {
  const w = 1080, h = 1350;
  novo(w, h);
  fotoMundo(EP.duracao - 1, 'panorama', 2.6);
  fundoMundo(w, h, 0.4);
  painel(90, 300, w - 180, 640, COR.marte, 0.93);
  escrever('ACESSE O SITE', w / 2, 400, 50, '#fff');
  escrever('E VIRE COLONO', w / 2, 480, 50, COR.ouro);
  selo(EP.site_tela.toUpperCase(), 130, 560, 24, COR.agua);
  quebrar('Insira seu nome e apareça nos próximos episódios da Operação Marte Zero.', 26, w - 320)
    .forEach((l, i) => escrever(l, w / 2, 690 + i * 44, 26, COR.areia, { contorno: false }));
  selo('LINK NA BIO', w / 2 - 190, 820, 40, COR.ouro);
  EP.mundo.fundadores.forEach((f, i) => boneco(spriteMapa(f.sprite), w / 2 + (i ? 190 : -190), 1170, 14, i === 1));
  escrever('SIGA PARA NÃO PERDER O PRÓXIMO EPISÓDIO', w / 2, 1275, 22, '#fff', { maxW: w - 200 });
  return png();
}

window.gerarApresentacao = function () {
  return [
    { nome: 'apresentacao_1_capa.png', url: apCapa() },
    { nome: 'apresentacao_2_como_funciona.png', url: apComoFunciona() },
    { nome: 'apresentacao_3_colonia_ao_vivo.png', url: apMundoAoVivo() },
    { nome: 'apresentacao_4_todo_dia.png', url: apEpisodios() },
    { nome: 'apresentacao_5_acesse.png', url: apChamada() },
  ];
};

// ------------------------------------------------------------------ stories (1080x1920, 9:16)
// Área segura dos stories (Instagram e TikTok): nada importante nos 260 px de cima (barra, perfil) nem nos
// 360 px de baixo (responder, curtir, legenda do TikTok); laterais com 90 px.
function stEpisodio(info) {
  const w = 1080, h = 1920;
  novo(w, h);
  fotoMundo(cenaT('missao', 0.75) ?? EP.duracao * 0.6, 'obra', 6.5);
  fundoMundo(w, h, 0.1);
  gradiente(w, h, [[0, 0.9], [0.3, 0.05], [0.62, 0.05], [1, 0.97]]);
  selo('EPISÓDIO NOVO', w / 2 - 250, 300, 40, COR.alerta, '#fff');
  escrever(`EP ${EP.numero}`, w / 2, 470, 96, COR.ouro);
  quebrar(info.manchete, 52, w - 220).slice(0, 3).forEach((l, i) => escrever(l, w / 2, 1180 + i * 76, 52, i ? COR.ouro : '#fff'));
  painel(90, 1390, w - 180, 170, COR.agua, 0.92);
  escrever('ASSISTA NO PERFIL', w / 2, 1450, 38, '#fff');
  escrever('e vire colono: ' + EP.site_tela, w / 2, 1510, 24, COR.areia, { contorno: false, maxW: w - 240 });
  return png();
}
function stComoFunciona() {
  const w = 1080, h = 1920;
  novo(w, h);
  fotoMundo(EP.duracao * 0.3, 'colonia', 4);
  fundoMundo(w, h, 0.66);
  escrever('VIRE COLONO', w / 2, 330, 72, COR.ouro);
  escrever('EM 3 PASSOS', w / 2, 420, 46, '#fff');
  passo(1, 'ACESSE O SITE', EP.site_tela, 520, COR.agua);
  passo(2, 'INSIRA SEU NOME', 'Nome ou nick e o seu @. É grátis!', 740, COR.ouro);
  passo(3, 'APAREÇA NO EPISÓDIO', 'Sua casa nasce e você entra no vídeo.', 960, COR.marte);
  colonosGrandes(1350, 13);
  selo(EP.site_tela.toUpperCase(), 110, 1440, 24, COR.agua);
  return png();
}
function stAoVivo() {
  const w = 1080, h = 1920;
  novo(w, h);
  fotoMundo(EP.duracao * 0.2, 'colonia', 6);
  fundoMundo(w, h, 0.05);
  gradiente(w, h, [[0, 0.95], [0.26, 0.1], [0.62, 0.1], [1, 0.97]]);
  escrever('A COLÔNIA', w / 2, 320, 64, '#fff');
  escrever('ESTÁ AO VIVO', w / 2, 410, 64, COR.ouro);
  quebrar('Procure seu nome no mapa, veja sua casa e os colonos vivendo o dia.', 30, w - 240)
    .forEach((l, i) => escrever(l, w / 2, 500 + i * 48, 30, '#fff'));
  painel(90, 1240, w - 180, 320, COR.ouro, 0.93);
  escrever('ENTRE NO SITE', w / 2, 1310, 44, '#fff');
  selo(EP.site_tela.toUpperCase(), 130, 1370, 24, COR.agua);
  escrever('quem entra pelo site concorre a líder da colônia', w / 2, 1500, 22, COR.areia, { contorno: false, maxW: w - 240 });
  return png();
}

window.gerarStories = function (info) {
  return [
    { nome: 'story_1_episodio_novo.png', url: stEpisodio(info) },
    { nome: 'story_2_como_funciona.png', url: stComoFunciona() },
    { nome: 'story_3_colonia_ao_vivo.png', url: stAoVivo() },
  ];
};

// ------------------------------------------------------------------ como convidar (feed 4:5 + stories 9:16)
function cvPassos(w, y0, alt, tamT) {
  passo(1, 'ENTRE NA COLÔNIA', 'Abra o Mundo ao vivo com a sua conta.', y0, COR.agua);
  passo(2, 'COPIE O SEU LINK', 'Logo abaixo do chat: toque em Copiar.', y0 + alt, COR.ouro);
  passo(3, 'MANDE PARA OS AMIGOS', 'Grupo, direct, stories: quem entrar conta para você.', y0 + alt * 2, COR.marte);
}
function cvFeed1() {
  const w = 1080, h = 1350; novo(w, h);
  fotoMundo(EP.duracao * 0.25, 'colonia', 5); fundoMundo(w, h, 0.1);
  gradiente(w, h, [[0, 0.95], [0.34, 0.08], [0.62, 0.08], [1, 0.96]]);
  escrever('TRAGA A SUA', w / 2, 150, 60, '#fff'); escrever('TRIPULAÇÃO', w / 2, 240, 76, COR.ouro);
  selo('SEU LINK DE CONVITE', w / 2 - 270, 300, 34, COR.agua);
  colonosGrandes(1020, 13);
  escrever('ARRASTE PARA VER COMO  >>', w / 2, 1265, 24, COR.areia);
  return png();
}
function cvFeed2() {
  const w = 1080, h = 1350; novo(w, h);
  fotoMundo(EP.duracao * 0.3, 'base', 3.2); fundoMundo(w, h, 0.62);
  escrever('COMO CONVIDAR', w / 2, 130, 58, COR.ouro);
  cvPassos(w, 230, 220);
  painel(90, 930, w - 180, 170, COR.borda, 0.92);
  escrever('operacao-marte-zero.vercel.app/c/', w / 2, 990, 26, COR.areia, { contorno: false });
  escrever('SEU CÓDIGO', w / 2, 1045, 34, COR.ouro);
  escrever('cada colono tem o seu', w / 2, 1180, 26, '#fff');
  return png();
}
function cvFeed3() {
  const w = 1080, h = 1350; novo(w, h);
  fotoMundo(cenaT('missao', 0.7) ?? EP.duracao * 0.6, 'obra', 5); fundoMundo(w, h, 0.35);
  painel(90, 250, w - 180, 720, COR.ouro, 0.94);
  escrever('QUEM MAIS CONVIDA', w / 2, 340, 46, '#fff');
  escrever('CONCORRE A CARGOS', w / 2, 410, 46, COR.ouro);
  ['lider', 'vice', 'comunicacao'].forEach((id, i) => boneco(liderDeExemplo(9 + i * 17, id), w / 2 + (i - 1) * 230, 650, 12, i === 2));
  escrever('LÍDER · EMBAIXADOR · FESTAS', w / 2, 820, 30, COR.areia, { maxW: w - 260 });
  escrever('com traje e tag exclusivos', w / 2, 890, 24, '#fff', { contorno: false });
  selo('LINK NA BIO', w / 2 - 190, 1060, 40, COR.agua);
  return png();
}
function cvStory1() {
  const w = 1080, h = 1920; novo(w, h);
  fotoMundo(EP.duracao * 0.25, 'colonia', 5.5); fundoMundo(w, h, 0.55);
  escrever('CONVIDE E', w / 2, 330, 72, '#fff'); escrever('GANHE CARGO', w / 2, 425, 72, COR.ouro);
  cvPassos(w, 540, 230);
  painel(90, 1270, w - 180, 260, COR.agua, 0.93);
  escrever('SEU LINK FICA NA', w / 2, 1340, 34, '#fff'); escrever('COLÔNIA AO VIVO', w / 2, 1400, 40, COR.agua);
  escrever(EP.site_tela, w / 2, 1470, 24, COR.areia, { contorno: false });
  return png();
}
function cvStory2() {
  const w = 1080, h = 1920; novo(w, h);
  fotoMundo(cenaT('missao', 0.7) ?? EP.duracao * 0.6, 'obra', 6); fundoMundo(w, h, 0.25);
  gradiente(w, h, [[0, 0.92], [0.3, 0.1], [0.62, 0.1], [1, 0.96]]);
  escrever('QUEM MAIS', w / 2, 330, 72, '#fff'); escrever('CONVIDA', w / 2, 425, 72, COR.ouro);
  escrever('vira líder, embaixador ou chefe das festas', w / 2, 510, 26, '#fff', { maxW: w - 220 });
  ['lider', 'vice', 'comunicacao'].forEach((id, i) => boneco(liderDeExemplo(9 + i * 17, id), w / 2 + (i - 1) * 260, 1080, 14, i === 2));
  painel(90, 1330, w - 180, 220, COR.ouro, 0.93);
  escrever('COPIE O SEU LINK EM', w / 2, 1400, 30, '#fff'); escrever(EP.site_tela, w / 2, 1470, 28, COR.ouro, { maxW: w - 240 });
  return png();
}
window.gerarConvite = function () {
  return [
    { nome: 'convite_feed_1.png', url: cvFeed1() }, { nome: 'convite_feed_2.png', url: cvFeed2() }, { nome: 'convite_feed_3.png', url: cvFeed3() },
    { nome: 'convite_story_1.png', url: cvStory1() }, { nome: 'convite_story_2.png', url: cvStory2() },
  ];
};

// ------------------------------------------------------------------ thumbnail do vídeo longo do YouTube (1280x720)
window.gerarThumbLongo = function () {
  const w = 1280, h = 720; novo(w, h);
  fotoMundo(cenaT('missao', 0.75) ?? EP.duracao * 0.6, 'obra', 6.5); fundoMundo(w, h, 0.05);
  const g = sx.createLinearGradient(0, 0, w * 0.72, 0);
  g.addColorStop(0, 'rgba(20,15,38,0.96)'); g.addColorStop(0.62, 'rgba(20,15,38,0.7)'); g.addColorStop(1, 'rgba(20,15,38,0)');
  sx.fillStyle = g; sx.fillRect(0, 0, w, h);
  selo('GUIA COMPLETO', 52, 46, 30, COR.alerta, '#fff');
  escrever('VIRE PERSONAGEM', 56, 230, 66, '#fff', { alinhar: 'left', maxW: 760 });
  escrever('DE UMA SÉRIE', 56, 320, 66, '#fff', { alinhar: 'left', maxW: 760 });
  escrever('EM MARTE!', 56, 420, 84, COR.ouro, { alinhar: 'left', maxW: 760 });
  selo('GRÁTIS · EM 30 SEGUNDOS', 56, 500, 28, COR.agua);
  escrever('OPERAÇÃO MARTE ZERO', 56, h - 52, 26, COR.areia, { alinhar: 'left' });
  boneco(liderDeExemplo(9, 'lider'), w - 240, h - 300, 24);
  boneco(liderDeExemplo(26, 'eng-civil'), w - 420, h - 150, 12, true);
  EP.mundo.colonos.slice(0, 2).forEach((c, i) => boneco(spriteDe(c), w - 120 - i * 130, h - 110, 11, i % 2 === 0));
  return [{ nome: 'thumb.png', url: png() }];
};
