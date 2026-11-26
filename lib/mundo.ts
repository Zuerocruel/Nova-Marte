import colonia from '@/fabrica/colonia.json';

/**
 * Geometria do mundo — precisa bater com a função casa_pos() do banco (supabase/migrations/018_aneis.sql),
 * com fabrica/bairro.py (casa_do_id) e com o bairro desenhado no vídeo (fabrica/diretor.js).
 *
 * VILAREJO EM ANÉIS (pedido do dono em 2026-11-26): ruas em anel (quadradas) em volta do Módulo de Pouso, a
 * R0, R0+PASSO, R0+2*PASSO... casas do centro (o miolo é das construções), e duas avenidas retas: norte-sul na
 * coluna do módulo (dx = 0) e leste-oeste logo abaixo dele (dy = AV_Y). As casas ficam dos dois lados de cada
 * anel, de frente para a rua, uma a cada 2 casas; sem casa nos cantos nem coladas nas avenidas. Ordem de
 * chegada: anel por anel, a partir da avenida sul girando para o leste, lado de dentro e lado de fora de cada
 * ponto da rua. Casa em cima (ou a até MARGEM casas) de construção, Vila das Cápsulas ou lote de cratera é pulada.
 */
export const CENTRO = { x: 5, y: -8 };     // centro do Módulo de Pouso, em casas
export const R0 = 14;                      // rua do primeiro anel (distância em casas do centro)
export const PASSO = 5;                    // de um anel ao outro: rua, casa, quintal, quintal, casa
export const AV_Y = 2;                     // avenida leste-oeste em dy = +2; a norte-sul em dx = 0
export const MARGEM = 2;                   // casas livres em volta de cada construção
export const CRATERAS_POR_FAIXA = 6;
export const CRATERAS_RESERVADAS = 48;
export const CHUNK = 32;                   // quarteirão carregado de uma vez (casas)
export const LIMITE_CHUNKS = 64;           // |cx|, |cy| máximos aceitos pela API (≈ 4 milhões de casas)

export const ruaDoAnel = (k: number) => R0 + PASSO * k;

/**
 * Crateras batizadas (item "Nomeie sua Cratera"): perto, na faixa logo depois de cada anel (6 por faixa, ângulo
 * áureo), longe das avenidas. Centro em casas e raio em pixels do mundo. A mesma conta está em fabrica/bairro.py.
 */
export function posCratera(id: number): { x: number; y: number; r: number } {
  const i = Math.max(1, Math.floor(id));
  const faixa = Math.floor((i - 1) / CRATERAS_POR_FAIXA), d = R0 + 2 + PASSO * faixa;
  const ang = 0.9 + (i - 1) * 2.399963, co = Math.cos(ang), si = Math.sin(ang), m = Math.max(Math.abs(co), Math.abs(si));
  let dx = Math.floor(d * co / m + 0.5), dy = Math.floor(d * si / m + 0.5);
  if (Math.abs(dx) <= 3) dx = dx >= 0 ? 4 : -4;
  if (Math.abs(dy - AV_Y) <= 3) dy = AV_Y + (dy >= AV_Y ? 4 : -4);
  return { x: CENTRO.x + dx, y: CENTRO.y + dy, r: 20 + (i * 5) % 6 };
}

type Ret = { x0: number; y0: number; x1: number; y1: number };
const B = colonia.base, P = colonia.praca;
/** Retângulos (em casas, fim exclusivo) onde não nasce casa. A mesma lista está no SQL. */
export const RESERVAS: Ret[] = [
  ...[B, P, ...colonia.obras].map((o) => ({ x0: o.x - MARGEM, y0: o.y - MARGEM, x1: o.x + o.w + MARGEM, y1: o.y + o.h + MARGEM })),
  { x0: CENTRO.x + 25, y0: CENTRO.y - 9, x1: CENTRO.x + 43, y1: CENTRO.y + 23 },   // Vila das Cápsulas (VILA, até 50 cápsulas)
  ...Array.from({ length: CRATERAS_RESERVADAS }, (_, k) => { const c = posCratera(k + 1); return { x0: c.x - 2, y0: c.y - 2, x1: c.x + 3, y1: c.y + 3 }; }),
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

/** Todas as casas possíveis do anel k (antes das reservas), na ordem de chegada. */
function vagasDoAnel(k: number): { x: number; y: number }[] {
  const d = ruaDoAnel(k), seq: [number, number, number, number][] = [];
  for (let dx = 0; dx <= d; dx++) seq.push([dx, d, 0, 1]);
  for (let dy = d; dy >= -d; dy--) seq.push([d, dy, 1, 0]);
  for (let dx = d; dx >= -d; dx--) seq.push([dx, -d, 0, -1]);
  for (let dy = -d; dy <= d; dy++) seq.push([-d, dy, -1, 0]);
  for (let dx = -d; dx < 0; dx++) seq.push([dx, d, 0, 1]);
  const out: { x: number; y: number }[] = [];
  for (const [dx, dy, nx, ny] of seq) {
    const aoLongo = ny ? dx : dy;
    if (aoLongo % 2 !== 0 || Math.abs(aoLongo) > d - 3) continue;
    if ((ny && Math.abs(dx) <= 1) || (nx && Math.abs(dy - AV_Y) <= 1)) continue;
    for (const s of [-1, 1]) out.push({ x: CENTRO.x + dx + s * nx, y: CENTRO.y + dy + s * ny });   // dentro, fora
  }
  return out;
}
const LOTES: { x: number; y: number; anel: number }[] = [];
const ID_DA_CASA = new Map<string, number>();
let aneisFeitos = 0;
function garantir(n: number) {
  while (LOTES.length < n) {
    for (const c of vagasDoAnel(aneisFeitos)) {
      if (reservado(c.x, c.y)) continue;
      LOTES.push({ ...c, anel: aneisFeitos });
      ID_DA_CASA.set(`${c.x},${c.y}`, LOTES.length);
    }
    aneisFeitos++;
  }
}

/** Onde mora o colono de id `id` (mesma conta de casa_pos no banco). */
export function casaDoId(id: number): { x: number; y: number } {
  const i = Math.max(1, Math.floor(id));
  garantir(i);
  return { x: LOTES[i - 1].x, y: LOTES[i - 1].y };
}

/** Anel do último colono: até onde o bairro já vai (-1 sem ninguém). */
export function anelMaximo(total: number): number {
  if (total <= 0) return -1;
  garantir(total);
  return LOTES[total - 1].anel;
}

/** Id do colono que mora na casa (x, y), ou 0 (casa vazia, reserva). */
export function idDaCasa(x: number, y: number, total: number): number {
  garantir(Math.max(total, 1));
  return ID_DA_CASA.get(`${x},${y}`) ?? 0;
}
/** Tem casa ocupada em (x, y)? */
export const ehCasa = (x: number, y: number, total: number) => { const id = idDaCasa(x, y, total); return id > 0 && id <= total; };

/** Distância "quadrada" (em casas) do centro da colônia: os anéis são quadrados. */
export const distDoCentro = (x: number, y: number) => Math.max(Math.abs(x - CENTRO.x), Math.abs(y - CENTRO.y));

/**
 * Rua em (x, y)? 'anel' (rua de um anel já ocupado), 'avenida' (as duas avenidas, até o último anel) ou null.
 * As avenidas não passam por cima das construções (a praça corta a avenida sul). MESMA regra em fabrica/diretor.js.
 */
export function ruaEm(x: number, y: number, total: number): 'anel' | 'avenida' | null {
  const kmax = anelMaximo(total);
  if (kmax < 0) return null;
  const dx = x - CENTRO.x, dy = y - CENTRO.y, d = Math.max(Math.abs(dx), Math.abs(dy)), dfim = ruaDoAnel(kmax);
  if (d > dfim || (dx >= 25 && dx < 43 && dy >= -9 && dy < 23)) return null;   // nem dentro da Vila das Cápsulas
  if (d >= R0 && (d - R0) % PASSO === 0) return 'anel';
  const naAvenida = (dx === 0 && (dy <= -3 || dy >= AV_Y)) || dy === AV_Y;
  if (!naAvenida) return null;
  const emObra = [B, P, ...colonia.obras].some((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);
  return emObra ? null : 'avenida';
}

/** A casa (x, y) fica dentro da área do vilarejo já ocupada (do 1º anel até o atual, fora das construções)? */
export function noBairro(x: number, y: number, total: number): boolean {
  const kmax = anelMaximo(total), d = distDoCentro(x, y);
  return kmax >= 0 && d >= R0 - 2 && d <= ruaDoAnel(kmax) + 2 && !reservado(x, y);
}

/** Retângulo (em casas) que contém todo o bairro ocupado. */
export function limitesDoBairro(total: number) {
  const r = ruaDoAnel(Math.max(0, anelMaximo(Math.max(total, 1)))) + 3;
  return { x0: CENTRO.x - r, x1: CENTRO.x + r, y0: CENTRO.y - r, y1: CENTRO.y + r };
}

/** Número do colono a partir do código (NM000123 → 123). */
export const idDoCodigo = (codigo: string) => Number(codigo.replace(/\D/g, '')) || 0;

/** Variantes da cápsula habitacional (a casa do colono). Mesma lista de fabrica/episodio.py → VARIANTES_CAPSULA.
 * Pedido sem opção (comprado antes das variantes) = clássica. */
export const VARIANTES_CAPSULA = ['classica', 'estufa', 'observatorio', 'dupla'] as const;
export type VarianteCapsula = (typeof VARIANTES_CAPSULA)[number];
export const varianteDaCapsula = (opcao: string | null | undefined): VarianteCapsula =>
  (VARIANTES_CAPSULA as readonly string[]).includes(opcao ?? '') ? (opcao as VarianteCapsula) : 'classica';

/* ---------------------------------------------------------------- Vila das Cápsulas
 * Quem compra a Cápsula Habitacional deixa a casinha grátis do lote e ganha uma cápsula MAIOR (2x2 casas)
 * num bairro próprio, a leste da colônia (depois do anel das crateras). A ordem de chegada (1ª compra paga)
 * define o lote da vila: 5 por fileira, com uma rua de 1 casa entre eles. */
export const VILA = { x: CENTRO.x + 27, y: CENTRO.y - 7, colunas: 5, passo: 3, lado: 2 };
export function loteDaVila(i: number): { x: number; y: number; w: number; h: number } {
  const n = Math.max(0, Math.floor(i));
  return { x: VILA.x + (n % VILA.colunas) * VILA.passo, y: VILA.y + Math.floor(n / VILA.colunas) * VILA.passo, w: VILA.lado, h: VILA.lado };
}

/** Moradias especiais (cápsulas): id do colono → canto da cápsula, em casas. Preenchido pelo Mundo ao vivo. */
const MORADIAS = new Map<number, { x: number; y: number }>();
export function definirMoradias(lista: { id: number; x: number; y: number }[]) {
  MORADIAS.clear();
  for (const m of lista) MORADIAS.set(m.id, { x: m.x, y: m.y });
}
/** Onde o colono mora AGORA: a cápsula (grande = true, 2x2 casas) ou a casinha do lote (1x1). */
export function moradiaDe(id: number): { x: number; y: number; grande: boolean } {
  const m = MORADIAS.get(id);
  return m ? { ...m, grande: true } : { ...casaDoId(id), grande: false };
}
