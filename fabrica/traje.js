// Traje dos cargos de liderança (fabrica/liderancas.json) por cima do boneco 12x12 de gerarSprite.
// Carregado pelo vídeo (render.html, antes do diretor.js) e pelo painel (aba Cargos de Nova Marte).
// A MESMA função está em lib/sprite.ts (vestirTraje) para o site: mude as duas juntas.
function vestirTraje(g, lid) {
  if (!lid) return g;
  const m = g.map((l) => l.slice());
  const t = lid.traje || {}, ac = lid.acessorios || [], cor = lid.cor || '#ffd84a';
  const C = '#1b1530';
  const meia = (y, x, c) => { m[y][x] = c; m[y][11 - x] = c; };
  if (ac.includes('capa')) for (let y = 6; y <= 10; y++) meia(y, 1, t.detalhe || cor);
  if (ac.includes('mochila')) { meia(6, 2, '#6b6f86'); m[7][9] = '#9aa0b5'; }
  for (let y = 6; y <= 8; y++) for (let x = 3; x <= 5; x++) meia(y, x, t.corpo || cor);
  meia(7, 2, t.corpo || cor);
  for (let x = 3; x <= 5; x++) meia(8, x, t.detalhe || C);   // cinto
  meia(6, 5, t.detalhe || C);                                // gola
  if (t.calca) { meia(9, 4, t.calca); meia(10, 4, t.calca); meia(9, 5, t.calca); }
  if (ac.includes('estrela')) m[7][4] = '#ffd84a';           // distintivo no peito
  if (ac.includes('capacete')) { meia(0, 4, cor); meia(0, 5, cor); for (let x = 2; x <= 5; x++) meia(1, x, cor); }
  if (ac.includes('boina')) { for (let x = 3; x <= 5; x++) meia(1, x, t.detalhe || cor); m[0][3] = m[0][4] = m[0][5] = t.detalhe || cor; }
  if (ac.includes('cruz')) { for (let x = 3; x <= 5; x++) meia(1, x, '#ffffff'); m[0][5] = m[0][6] = '#ffffff'; m[1][5] = m[1][6] = '#e04f5f'; }
  if (ac.includes('coroa')) { for (let x = 3; x <= 5; x++) meia(1, x, '#ffd84a'); meia(0, 3, '#ffd84a'); meia(0, 5, '#ffd84a'); m[1][5] = m[1][6] = '#e04f5f'; }
  if (ac.includes('folha')) { m[0][6] = '#4ed37a'; m[0][7] = '#2bb673'; m[1][6] = '#2bb673'; }
  if (ac.includes('antena')) { m[0][8] = '#ff4d4d'; m[1][8] = '#9aa0b5'; }
  if (ac.includes('oculos')) { meia(3, 3, C); meia(3, 4, '#8fe6ff'); meia(3, 5, C); }
  return m;
}
