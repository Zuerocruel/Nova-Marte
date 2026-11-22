import colonia from '@/fabrica/colonia.json';

/**
 * Geometria do mundo — precisa bater com a função casa_pos() do banco (supabase/migrations/009_bairro_perto.sql),
 * com fabrica/episodio.py (casa_do_id) e com o bairro desenhado no vídeo (fabrica/diretor.js).
 *
 * Bairro em espiral colado no Módulo de Pouso: lotes numa espiral quadrada a partir do anel ANEL_INICIAL,
 * com uma rua a cada 3 lotes (quarteirões de 3x3 casas). Lote que cai em cima (ou a até MARGEM casas) da
 * base, da praça, de uma obra (mesmo planejada) ou da trilha é pulado: as casas ficam entre as construções.
 * Depois do anel ANEL_RESERVAS não há mais nada reservado e a conta volta a ser direta.
 */
export const CENTRO = { x: 5, y: -8 };     // centro do Módulo de Pouso, em casas
export const ANEL_INICIAL = 2;             // anel (em lotes) da primeira casa
export const MARGEM = 2;                   // casas livres em volta de cada construção
export const ANEL_RESERVAS = 12;           // além deste anel nenhum lote é reservado
export const CHUNK = 32;                   // quarteirão carregado de uma vez (casas)
export const LIMITE_CHUNKS = 64;           // |cx|, |cy| máximos aceitos pela API (≈ 4 milhões de casas)

type Ret = { x0: number; y0: number; x1: number; y1: number };
const B = colonia.base, P = colonia.praca;
/** Retângulos (em casas, fim exclusivo) onde não nasce casa. A mesma lista está no SQL. */
export const RESERVAS: Ret[] = [
  ...[B, P, ...colonia.obras].map((o) => ({ x0: o.x - MARGEM, y0: o.y - MARGEM, x1: o.x + o.w + MARGEM, y1: o.y + o.h + MARGEM })),
  { x0: CENTRO.x, y0: B.y + B.h, x1: CENTRO.x + 1, y1: P.y },          // trilha do módulo até a praça
];
export const reservado = (x: number, y: number) => RESERVAS.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);

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
  lideranca?: string | null;      // id em fabrica/liderancas.json (migração 012)
  traje_moedas?: string | null;   // traje comprado na loja de moedas (migração 013)
};

/** Lote → casa: entra uma rua a cada 3 lotes. */
const expandir = (u: number) => u + Math.floor(u / 3);
/** Casa → lote (só faz sentido fora das ruas). */
const lote = (d: number) => d - Math.floor((d + 1) / 4);

/** Lote de índice m na espiral (o 1º lote de cada anel fica ao sul do centro e o anel gira para o leste). */
function loteDaEspiral(m: number): { u: number; v: number; r: number } {
  const r = Math.floor((Math.floor(Math.sqrt(m)) + 1) / 2);
  const t = m - (2 * r - 1) ** 2;
  let u: number, v: number;
  if (t < r) { u = t; v = r; }
  else if (t < 3 * r) { u = r; v = r - (t - r); }
  else if (t < 5 * r) { u = r - (t - 3 * r); v = -r; }
  else if (t < 7 * r) { u = -r; v = -r + (t - 5 * r); }
  else { u = -r + (t - 7 * r); v = r; }
  return { u, v, r };
}
const casaDoLote = (m: number) => { const l = loteDaEspiral(m); return { x: CENTRO.x + expandir(l.u), y: CENTRO.y + expandir(l.v) }; };
const M0 = (2 * ANEL_INICIAL - 1) ** 2, M_FIM = (2 * ANEL_RESERVAS + 1) ** 2;
/** Lotes livres até o anel ANEL_RESERVAS, em ordem (o colono de id k mora no k-ésimo). */
const LIVRES: number[] = [];
for (let m = M0; m < M_FIM; m++) { const c = casaDoLote(m); if (!reservado(c.x, c.y)) LIVRES.push(m); }
const loteDoId = (id: number) => (id <= LIVRES.length ? LIVRES[id - 1] : M_FIM + (id - LIVRES.length) - 1);
const ID_DO_LOTE = new Map(LIVRES.map((m, i) => [m, i + 1]));
const idDoLote = (m: number) => (m >= M_FIM ? LIVRES.length + (m - M_FIM) + 1 : ID_DO_LOTE.get(m) ?? 0);

/** Onde mora o colono de id `id` (mesma conta de casa_pos no banco). */
export function casaDoId(id: number): { x: number; y: number } {
  return casaDoLote(loteDoId(Math.max(1, id)));
}

/** Anel (em lotes) do último colono: até onde o bairro já vai. */
export function anelMaximo(total: number): number {
  if (total <= 0) return ANEL_INICIAL - 1;
  return loteDaEspiral(loteDoId(total)).r;
}

/**
 * Fio de energia da casa do colono `id` (em casas, do centro da casa): vai até a casa ocupada mais perto que
 * esteja mais perto do módulo (do mesmo anel ou de até dois anéis para dentro) ou, se for mais perto, até a
 * borda de uma "fonte" (o módulo e as construções já ligadas na rede). A mesma regra está em fabrica/diretor.js.
 */
export function fioDaCasa(id: number, total: number, fontes: Ret[]): { x: number; y: number } {
  const m = loteDoId(id), { r } = loteDaEspiral(m), c0 = casaDoLote(m);
  const eu = { x: c0.x + 0.5, y: c0.y + 0.5 };
  const dBase = (x: number, y: number) => Math.hypot(x - CENTRO.x, y - CENTRO.y);
  let melhor = { x: CENTRO.x, y: CENTRO.y }, dMelhor = Infinity;
  for (const f of fontes) {   // ponto da borda mais perto
    const x = Math.max(f.x0, Math.min(f.x1, eu.x)), y = Math.max(f.y0, Math.min(f.y1, eu.y));
    const d = Math.hypot(x - eu.x, y - eu.y);
    if (d < dMelhor) { dMelhor = d; melhor = { x, y }; }
  }
  const ini = (2 * Math.max(ANEL_INICIAL, r - 2) - 1) ** 2, fim = (2 * r + 1) ** 2;
  for (let k = ini; k < fim; k++) {
    const dono = idDoLote(k);
    if (!dono || dono > total || k === m) continue;
    const c = casaDoLote(k);
    if (dBase(c.x, c.y) >= dBase(c0.x, c0.y)) continue;
    const d = Math.hypot(c.x + 0.5 - eu.x, c.y + 0.5 - eu.y);
    if (d < dMelhor) { dMelhor = d; melhor = { x: c.x + 0.5, y: c.y + 0.5 }; }
  }
  return melhor;
}

/** A casa (x, y) é rua do bairro? (a cada 4 casas, contando do centro) */
export const ehRua = (x: number, y: number) =>
  ((((x - CENTRO.x) % 4) + 4) % 4) === 3 || ((((y - CENTRO.y) % 4) + 4) % 4) === 3;

/** Anel (em lotes) de uma casa qualquer do mapa. */
export function anelDe(x: number, y: number): number {
  return Math.max(Math.abs(lote(x - CENTRO.x)), Math.abs(lote(y - CENTRO.y)));
}

/** A casa (x, y) fica dentro do bairro já ocupado (lotes e ruas entre o anel inicial e o atual, fora das construções)? */
export function noBairro(x: number, y: number, total: number): boolean {
  const a = anelDe(x, y);
  return total > 0 && a >= ANEL_INICIAL && a <= anelMaximo(total) && !reservado(x, y);
}

/** Retângulo (em casas) que contém todo o bairro ocupado. */
export function limitesDoBairro(total: number) {
  const r = expandir(anelMaximo(Math.max(total, 1))) + 1;
  return { x0: CENTRO.x - r, x1: CENTRO.x + r, y0: CENTRO.y - r, y1: CENTRO.y + r };
}

/**
 * Crateras batizadas (item "Nomeie sua Cratera"): num anel FORA da colônia, cada uma num ângulo (ângulo áureo).
 * Centro em casas e raio em pixels do mundo. A mesma conta está em fabrica/bairro.py (pos_cratera).
 */
export const CRATERA_RAIO = 20;
export function posCratera(id: number): { x: number; y: number; r: number } {
  const i = Math.max(1, Math.floor(id));
  const ang = 0.9 + (i - 1) * 2.399963, dist = CRATERA_RAIO + (i * 3) % 4;
  return { x: CENTRO.x + Math.round(dist * Math.cos(ang)), y: CENTRO.y + Math.round(dist * Math.sin(ang)), r: 38 + (i * 5) % 8 };
}

/** Número do colono a partir do código (NM000123 → 123). */
export const idDoCodigo = (codigo: string) => Number(codigo.replace(/\D/g, '')) || 0;

/** Variantes da cápsula habitacional (a casa do colono). Mesma lista de fabrica/episodio.py → VARIANTES_CAPSULA.
 * Pedido sem opção (comprado antes das variantes) = clássica. */
export const VARIANTES_CAPSULA = ['classica', 'estufa', 'observatorio', 'dupla'] as const;
export type VarianteCapsula = (typeof VARIANTES_CAPSULA)[number];
export const varianteDaCapsula = (opcao: string | null | undefined): VarianteCapsula =>
  (VARIANTES_CAPSULA as readonly string[]).includes(opcao ?? '') ? (opcao as VarianteCapsula) : 'classica';
