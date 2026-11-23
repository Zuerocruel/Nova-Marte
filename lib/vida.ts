/**
 * Vida na colônia (Mundo ao vivo): o que cada colono está fazendo AGORA e onde ele está.
 *
 * Tudo é função do relógio (Date.now) e do número do colono: quem abre o mapa no mesmo instante vê a
 * mesma cena, sem servidor de jogo. A cada RODADA os colonos formam duplas de vizinhos (o vizinho de
 * número ao lado mora na casa ao lado, pela espiral) e cada dupla sorteia o que fazer:
 *   visita (um vai à casa do outro) · praça (rodinha com quem estiver lá) · almoço na cantina (quando
 *   ela fica pronta) · mutirão na obra do dia
 *   · passeio pelas ruas · ficar em casa. Quem fica sem dupla faz algo sozinho.
 * Andam pelas ruas do bairro (a cada 4 casas), conversam com balões e acenam.
 */
import { CENTRO, moradiaDe } from './mundo';

export const RODADA_S = 40;
const CASA = 16;

export type Lugar = { x: number; y: number; w: number; h: number };
export type Tipo = 'casa' | 'recebe' | 'visita' | 'praca' | 'almoco' | 'obra' | 'passeio';
export type Situacao = {
  x: number; y: number;          // pés do colono, em pixels do mundo
  andando: boolean; dir: 1 | -1;
  tipo: Tipo; parceiro: number | null;
  rodada: Tipo;                  // o plano da rodada (mesmo na volta para casa, quando tipo já é 'casa')
  emote: string | null;          // balão do momento (ou nada)
  descricao: (nome: (id: number) => string | null) => string;
};

const EMOTES: Record<Tipo, string[]> = {
  visita: ['👋', '💬', '😂', '❤️', '☕', '🎶', '🤝', '🍪'],
  recebe: ['👋', '💬', '😄', '☕', '🍪', '🎲'],
  praca: ['💬', '😂', '🎶', '🙌', '❤️', '⭐', '🗺️', '🚀'],
  almoco: ['🍲', '🥗', '🍞', '🥤', '😋', '🍪', '💬'],
  obra: ['🔧', '💪', '⚙️', '🔩', '🧱'],
  passeio: ['👋', '🌄', '📸', '🙂'],
  casa: ['📖', '🍵', '🎮', '🌱', '💤'],
};

// pseudo-aleatório estável (mesma entrada → mesmo número entre 0 e 1)
function h01(...n: number[]): number {
  let x = 2166136261;
  for (const v of n) { x ^= v | 0; x = Math.imul(x, 16777619); x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995); x ^= x >>> 15; }
  return (x >>> 0) / 4294967296;
}
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const suave = (k: number) => (k = clamp(k), k * k * (3 - 2 * k));

/** Dupla do colono nesta rodada (alterna entre o vizinho de um lado e o do outro). */
function parceiroDe(id: number, k: number, total: number): number | null {
  const s = k % 2;
  const a = 2 * Math.floor((id - 1 + s) / 2) + 1 - s;
  const p = id === a ? a + 1 : a;
  return p >= 1 && p <= total ? p : null;
}

function tipoDaRodada(id: number, k: number, total: number): { tipo: Tipo; parceiro: number | null } {
  // colônia grande: menos gente na praça e na obra ao mesmo tempo (senão vira um formigueiro)
  const cheia = clamp((total - 30) / 300);
  const pPraca = 0.25 - 0.13 * cheia, pObra = 0.17 - 0.07 * cheia;
  const p = parceiroDe(id, k, total);
  if (p !== null) {
    const r = h01(Math.min(id, p), k, 7);          // sorteio da DUPLA (os dois chegam ao mesmo resultado)
    if (r < 0.30) return { tipo: id === Math.min(id, p) ? 'recebe' : 'visita', parceiro: p };
    if (r < 0.30 + pPraca) return { tipo: 'praca', parceiro: p };
    if (r < 0.30 + pPraca + pObra) return { tipo: 'obra', parceiro: p };
    if (r < 0.40 + pPraca + pObra) return { tipo: 'passeio', parceiro: p };
    return { tipo: 'casa', parceiro: null };
  }
  const r = h01(id, k, 3);
  if (r < pPraca + 0.1) return { tipo: 'praca', parceiro: null };
  if (r < pPraca + pObra + 0.1) return { tipo: 'obra', parceiro: null };
  if (r < pPraca + pObra + 0.2) return { tipo: 'passeio', parceiro: null };
  return { tipo: 'casa', parceiro: null };
}

/** Pés do colono parado na porta de casa (ou da cápsula). */
export function portaDe(id: number) {
  const c = moradiaDe(id);   // cápsula (2x2, porta embaixo no meio) ou casinha do lote
  return c.grande ? { x: c.x * CASA + 16, y: c.y * CASA + 31 } : { x: c.x * CASA + 11, y: c.y * CASA + 15 };
}

// ruas: linhas/colunas a cada 4 casas a partir do centro
const ruaMaisPerto = (casa: number, centro: number) => {
  const d = casa - centro, base = d - ((((d - 3) % 4) + 4) % 4);   // rua ≤ d
  return centro + (d - base <= 2 ? base : base + 4);
};

function caminho(a: { x: number; y: number }, b: { x: number; y: number }) {
  // sai para a rua de baixo/cima, anda pela rua até a coluna de rua do destino e vai até ele
  const ry = (ruaMaisPerto(Math.floor(a.y / CASA), CENTRO.y) + 0.5) * CASA;
  const rx = (ruaMaisPerto(Math.floor(b.x / CASA), CENTRO.x) + 0.5) * CASA;
  return [a, { x: a.x, y: ry }, { x: rx, y: ry }, { x: rx, y: b.y }, b];
}

function aoLongo(pts: { x: number; y: number }[], k: number) {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  const total = seg.reduce((s, v) => s + v, 0) || 1;
  let d = clamp(k) * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? d / seg[i] : 1;
      const p = pts[i], q = pts[i + 1];
      return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, dx: q.x - p.x };
    }
    d -= seg[i];
  }
  return { ...pts[pts.length - 1], dx: 0 };
}

/** Onde o colono vai passar a rodada. */
function destino(id: number, tipo: Tipo, parceiro: number | null, k: number, praca: Lugar | null, obra: Lugar | null,
                 cantina: Lugar | null = null) {
  const casa = portaDe(id);
  if (tipo === 'visita' && parceiro) { const p = portaDe(parceiro); return { x: p.x + 9, y: p.y }; }
  const dupla = parceiro ? Math.min(id, parceiro) : id;
  const lado = parceiro ? (id === dupla ? -5 : 5) : 0;
  if (tipo === 'praca' && praca) {   // a praça e o largo em volta dela
    const r1 = h01(dupla, k, 11), r2 = h01(dupla, k, 12);
    return { x: (praca.x - 2.2 + r1 * (praca.w + 4.4)) * CASA + lado, y: (praca.y - 0.4 + r2 * (praca.h + 1.0)) * CASA };
  }
  if (tipo === 'almoco' && cantina) {   // nas mesas em frente à cantina
    const r1 = h01(dupla, k, 13), r2 = h01(dupla, k, 14);
    return { x: (cantina.x - 0.6 + r1 * (cantina.w + 1.2)) * CASA + lado, y: (cantina.y + cantina.h + 0.4 + r2 * 0.9) * CASA };
  }
  if (tipo === 'obra' && obra) {     // em volta da obra, nos 4 lados
    const r1 = h01(dupla, k, 21), lado4 = Math.floor(h01(dupla, k, 22) * 4), fora = 6 + h01(dupla, k, 23) * 8;
    const ox = obra.x * CASA, oy = obra.y * CASA, ow = obra.w * CASA, oh = obra.h * CASA;
    if (lado4 === 0) return { x: ox + r1 * ow + lado, y: oy + oh + fora };
    if (lado4 === 1) return { x: ox + r1 * ow + lado, y: oy - fora + 12 };
    if (lado4 === 2) return { x: ox - fora, y: oy + 12 + r1 * (oh - 6) };
    return { x: ox + ow + fora, y: oy + 12 + r1 * (oh - 6) };
  }
  if (tipo === 'passeio') {
    const r1 = h01(dupla, k, 31), r2 = h01(dupla, k, 32);
    const sx = ruaMaisPerto(Math.floor(casa.x / CASA) + Math.round((r1 - 0.5) * 12), CENTRO.x);
    const sy = ruaMaisPerto(Math.floor(casa.y / CASA) + Math.round((r2 - 0.5) * 12), CENTRO.y);
    return { x: (sx + 0.5) * CASA + lado, y: (sy + 0.5) * CASA };
  }
  return casa;
}

export function situacao(id: number, total: number, agoraS: number,
                         praca: Lugar | null, obra: (Lugar & { nome: string }) | null,
                         cantina: Lugar | null = null): Situacao {
  const k = Math.floor(agoraS / RODADA_S);
  const f = (agoraS / RODADA_S) - k;
  let { tipo, parceiro } = tipoDaRodada(id, k, total);
  if (tipo === 'obra' && !obra) tipo = 'praca';
  // com a Cantina pronta, metade dos encontros na praça vira almoço juntos
  if (tipo === 'praca' && cantina && h01(parceiro ? Math.min(id, parceiro) : id, k, 55) < 0.5) tipo = 'almoco';
  const casa = portaDe(id);
  const alvo = destino(id, tipo, parceiro, k, praca, obra, cantina);
  const sai = tipo !== 'casa' && tipo !== 'recebe';

  // cada dupla tem o seu horário dentro da rodada (senão todo mundo sai e volta no mesmo segundo)
  const d = h01(parceiro ? Math.min(id, parceiro) : id, k, 99) * 0.14;
  const sai1 = 0.02 + d, chega = 0.20 + d, volta = 0.64 + d, emCasa = 0.82 + d;

  let x = casa.x, y = casa.y, andando = false, dir: 1 | -1 = 1, ativo = true;
  if (sai) {
    const ida = caminho(casa, alvo);
    if (f < sai1) { ativo = false; }
    else if (f < chega) { const p = aoLongo(ida, suave((f - sai1) / (chega - sai1))); x = p.x; y = p.y; andando = true; dir = p.dx < 0 ? -1 : 1; }
    else if (f < volta) { x = alvo.x; y = alvo.y; }
    else if (f < emCasa) { const p = aoLongo([...ida].reverse(), suave((f - volta) / (emCasa - volta))); x = p.x; y = p.y; andando = true; dir = p.dx < 0 ? -1 : 1; ativo = false; }
    else ativo = false;
  }
  if (tipo === 'recebe' && (f < chega || f >= volta)) ativo = false;   // a visita ainda não chegou / já foi
  if (!andando && parceiro && ativo) {                               // virados um para o outro
    const outro = tipo === 'recebe' ? destino(parceiro, 'visita', id, k, praca, obra, cantina) : destino(parceiro, tipo, id, k, praca, obra, cantina);
    dir = outro.x < x ? -1 : 1;
  }

  // balões: um fala de cada vez (alternando na dupla); em casa, bem de vez em quando
  let emote: string | null = null;
  const janela = Math.floor(agoraS / 2.4);
  const tipoEmote = andando ? (tipo === 'passeio' ? 'passeio' : null) : (ativo ? tipo : (sai ? null : 'casa'));
  if (tipoEmote) {
    const vez = parceiro && ativo ? (janela + id) % 2 === 0 : h01(id, janela, 41) < (tipoEmote === 'casa' ? 0.12 : 0.45);
    if (vez) { const lista = EMOTES[tipoEmote]; emote = lista[Math.floor(h01(id, janela, 42) * lista.length)]; }
  }

  const descricao = (nome: (id: number) => string | null) => {
    const outro = parceiro ? (nome(parceiro) ?? `o vizinho NM${String(parceiro).padStart(6, '0')}`) : null;
    if (andando) return f < 0.5 ? (tipo === 'visita' && outro ? `indo visitar ${outro}` : tipo === 'praca' ? 'indo para a praça' : tipo === 'almoco' ? 'indo almoçar na cantina' : tipo === 'obra' ? 'indo ajudar na obra' : 'passeando pelo bairro') : 'voltando para casa';
    if (!ativo) return 'em casa';
    if (tipo === 'visita') return `visitando ${outro}`;
    if (tipo === 'recebe') return `recebendo a visita de ${outro}`;
    if (tipo === 'praca') return outro ? `na praça com ${outro}` : 'conversando na praça';
    if (tipo === 'almoco') return outro ? `almoçando na cantina com ${outro}` : 'almoçando na cantina';
    if (tipo === 'obra') return `ajudando na obra${obra ? ` da ${obra.nome}` : ''}${outro ? ` com ${outro}` : ''}`;
    if (tipo === 'passeio') return outro ? `passeando com ${outro}` : 'passeando pelo bairro';
    return 'em casa';
  };

  return { x, y, andando, dir, tipo: ativo ? tipo : 'casa', parceiro, rodada: tipo, emote, descricao };
}
