/**
 * Geometria do mundo — precisa bater com a função casa_pos() do banco (supabase/migrations/007_bairro_espiral.sql)
 * e com o bairro desenhado no vídeo (fabrica/diretor.js).
 *
 * Bairro em espiral em volta do Módulo de Pouso: lotes numa espiral quadrada a partir do anel ANEL_INICIAL,
 * com uma rua a cada 3 lotes (quarteirões de 3x3 casas). O miolo fica livre para a base, as obras e a praça.
 */
export const CENTRO = { x: 5, y: -8 };     // centro do Módulo de Pouso, em casas
export const ANEL_INICIAL = 10;            // anel (em lotes) da primeira casa
export const CHUNK = 32;                   // quarteirão carregado de uma vez (casas)
export const LIMITE_CHUNKS = 64;           // |cx|, |cy| máximos aceitos pela API (≈ 4 milhões de casas)

export type PersonagemPublico = {
  codigo: string;
  nome: string;
  handle: string;
  plataforma: string;
  status: 'fila' | 'desenhado' | 'estreou';
  pos_x: number;
  pos_y: number;
  seed: number;
  sprite_url: string | null;
  cargo?: string | null;          // id em fabrica/cargos.json (migração 008)
};

/** Lote → casa: entra uma rua a cada 3 lotes. */
const expandir = (u: number) => u + Math.floor(u / 3);
/** Casa → lote (só faz sentido fora das ruas). */
const lote = (d: number) => d - Math.floor((d + 1) / 4);

/** Onde mora o colono de id `id` (mesma conta de casa_pos no banco). */
export function casaDoId(id: number): { x: number; y: number } {
  const m = id - 1 + (2 * ANEL_INICIAL - 1) ** 2;
  const r = Math.floor((Math.floor(Math.sqrt(m)) + 1) / 2);
  const t = m - (2 * r - 1) ** 2;
  let u: number, v: number;
  if (t < r) { u = t; v = r; }
  else if (t < 3 * r) { u = r; v = r - (t - r); }
  else if (t < 5 * r) { u = r - (t - 3 * r); v = -r; }
  else if (t < 7 * r) { u = -r; v = -r + (t - 5 * r); }
  else { u = -r + (t - 7 * r); v = r; }
  return { x: CENTRO.x + expandir(u), y: CENTRO.y + expandir(v) };
}

/** Anel (em lotes) do último colono: até onde o bairro já vai. */
export function anelMaximo(total: number): number {
  if (total <= 0) return ANEL_INICIAL - 1;
  const m = total - 1 + (2 * ANEL_INICIAL - 1) ** 2;
  return Math.floor((Math.floor(Math.sqrt(m)) + 1) / 2);
}

/** A casa (x, y) é rua do bairro? (a cada 4 casas, contando do centro) */
export const ehRua = (x: number, y: number) =>
  ((((x - CENTRO.x) % 4) + 4) % 4) === 3 || ((((y - CENTRO.y) % 4) + 4) % 4) === 3;

/** Anel (em lotes) de uma casa qualquer do mapa. */
export function anelDe(x: number, y: number): number {
  return Math.max(Math.abs(lote(x - CENTRO.x)), Math.abs(lote(y - CENTRO.y)));
}

/** A casa (x, y) fica dentro do bairro já ocupado (lotes e ruas entre o anel inicial e o atual)? */
export function noBairro(x: number, y: number, total: number): boolean {
  const a = anelDe(x, y);
  return total > 0 && a >= ANEL_INICIAL && a <= anelMaximo(total);
}

/** Retângulo (em casas) que contém todo o bairro ocupado. */
export function limitesDoBairro(total: number) {
  const r = expandir(anelMaximo(Math.max(total, 1))) + 1;
  return { x0: CENTRO.x - r, x1: CENTRO.x + r, y0: CENTRO.y - r, y1: CENTRO.y + r };
}

/** Número do colono a partir do código (NM000123 → 123). */
export const idDoCodigo = (codigo: string) => Number(codigo.replace(/\D/g, '')) || 0;
