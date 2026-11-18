/**
 * Sprite provisório 12x12 gerado a partir do seed do personagem.
 * Todo mundo que se cadastra já "nasce" no mundo com um boneco único;
 * quando a arte final é feita, sprite_url substitui este.
 * Mesmo seed → mesmo boneco, no site, no painel e nos episódios.
 */

export const TAM_SPRITE = 12;

const PELES = ['#f2c9a0', '#e0ac7e', '#c68642', '#8d5524', '#5c3a1e', '#ffdbac'];
const ROUPAS = ['#e04f5f', '#3f8efc', '#2bb673', '#f4b400', '#9b59b6', '#ff7f50', '#00b8a9', '#ec407a'];
const CABELOS = ['#2b1b10', '#5a3825', '#b5651d', '#e8c872', '#d9d9d9', '#c0392b', '#1e88e5', '#8e44ad'];
const CONTORNO = '#1b1530';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];

/** Matriz 12x12 de cores (null = transparente). Simétrica, como um bonequinho. */
export function gerarSprite(seed: number): (string | null)[][] {
  const r = rng(seed);
  const pele = pick(r, PELES);
  const roupa = pick(r, ROUPAS);
  const calca = pick(r, ROUPAS);
  const cabelo = pick(r, CABELOS);
  const estiloCabelo = Math.floor(r() * 4);
  const temChapeu = r() < 0.25;
  const chapeu = pick(r, ROUPAS);

  const g: (string | null)[][] = Array.from({ length: 12 }, () => Array(12).fill(null));
  const meia = (y: number, x: number, c: string) => { g[y][x] = c; g[y][11 - x] = c; };

  // cabeça (linhas 1-5)
  for (let y = 1; y <= 5; y++) for (let x = 3; x <= 5; x++) meia(y, x, pele);
  // cabelo / chapéu
  for (let x = 3; x <= 5; x++) meia(1, x, temChapeu ? chapeu : cabelo);
  if (temChapeu) { meia(0, 4, chapeu); meia(0, 5, chapeu); meia(1, 2, chapeu); }
  else {
    if (estiloCabelo >= 1) meia(2, 3, cabelo);
    if (estiloCabelo >= 2) { meia(3, 3, cabelo); meia(0, 5, cabelo); }
    if (estiloCabelo === 3) { meia(4, 2, cabelo); meia(5, 2, cabelo); meia(2, 2, cabelo); }
  }
  // olhos
  meia(3, 4, CONTORNO);
  // corpo (linhas 6-8)
  for (let y = 6; y <= 8; y++) for (let x = 3; x <= 5; x++) meia(y, x, roupa);
  meia(7, 2, roupa); meia(8, 2, pele);  // braços e mãos
  if (r() < 0.5) meia(6, 5, CONTORNO); // detalhe na gola
  // pernas (9-10) e pés (11)
  meia(9, 4, calca); meia(10, 4, calca); meia(9, 5, calca);
  meia(11, 4, CONTORNO); meia(11, 3, CONTORNO);
  return g;
}

export function desenharSprite(ctx: CanvasRenderingContext2D, seed: number, x: number, y: number, escala: number) {
  const g = gerarSprite(seed);
  for (let j = 0; j < 12; j++)
    for (let i = 0; i < 12; i++) {
      const c = g[j][i];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(Math.floor(x + i * escala), Math.floor(y + j * escala), Math.ceil(escala), Math.ceil(escala));
    }
}
