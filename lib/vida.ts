/**
 * Vida na colônia (Mundo ao vivo): o que cada colono está fazendo AGORA e onde ele está.
 *
 * Tudo continua sendo função do relógio (Date.now) e do número do colono: quem abre o mapa no mesmo instante vê a
 * mesma cena, sem servidor de jogo. Mas ninguém segue mais uma "rodada" igual à dos outros (pedido do dono: os
 * colonos têm que parecer vivos, não uma rota animada em loop). Cada colono tem a SUA agenda, em blocos de 10 min
 * defasados entre si: fica um tempo em casa, sai uma ou duas vezes (praça, obra, cantina, visita a um vizinho,
 * passeio pelo anel), às vezes emenda um lugar no outro e volta. Tudo com durações sorteadas.
 *   · anda pelas RUAS dos anéis e pelas avenidas (lib/mundo.ts), cada um no seu passo e na sua "faixa" da rua;
 *   · parado num lugar, não vira estátua: dá uns passos, troca de lugar na rodinha, olha para os lados;
 *   · quem recebe visita aparece na porta quando o vizinho chega (e só se estiver em casa).
 * Vega e Lia, os robôs da oficina e os andarilhos usam o mesmo motor (funções no fim do arquivo).
 */
import { AV_Y, CENTRO, R0, PASSO, anelMaximo, moradiaDe } from './mundo';

const CASA = 16;
const BLOCO_S = 600;                       // agenda de cada colono: blocos de 10 min (cada um com o seu início)
/** Compatibilidade: o tamanho do bloco de agenda (antes era a "rodada" de 40 s, igual para todos). */
export const RODADA_S = BLOCO_S;

export type Lugar = { x: number; y: number; w: number; h: number };
export type Tipo = 'casa' | 'recebe' | 'visita' | 'praca' | 'almoco' | 'obra' | 'passeio' | 'trabalho' | 'escava';
/** O que o boneco está fazendo com as mãos (o mapa desenha): agachado, carregando caixa, faísca, cavando, olhando o céu, tablet, reforma. */
export type Acao = 'agacha' | 'carrega' | 'faisca' | 'escava' | 'ceu' | 'tablet' | 'reforma' | null;
type P = { x: number; y: number };
export type Situacao = {
  x: number; y: number;          // pés do colono, em pixels do mundo
  andando: boolean; dir: 1 | -1;
  tipo: Tipo; parceiro: number | null;
  rodada: Tipo;                  // o plano da saída atual (mesmo na volta para casa, quando tipo já é 'casa')
  emote: string | null;          // balão do momento (ou nada)
  dentro: boolean;               // está DENTRO de casa ou de um prédio: o mapa não desenha o boneco
  acao: Acao;                    // gesto do momento (ver Acao)
  carga: string | null;          // cor da caixa que leva (colheita, peça, amostra) ou null
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
  trabalho: ['💪', '🔧', '📋', '👀'],
  escava: ['⛏️', '🤔', '👀', '✨'],
};

// ------------------------------------------------------------------ cargos: posto de trabalho e o que fazem lá
type Posto = { onde: string[]; acoes: Acao[]; emotes: string[]; entra?: boolean; carga?: string; leva?: string[]; texto: string };
/** O primeiro lugar de `onde` que existe (prédio pronto, obra do dia ou base) vira o posto. */
const POSTOS: Record<string, Posto> = {
  botanica:   { onde: ['estufa'], acoes: ['agacha', 'agacha', 'tablet'], emotes: ['🌱', '🥬', '🍅', '💧', '👀'], entra: true, carga: '#4ed37a', leva: ['cantina', 'base'], texto: 'cuidando das plantas da Estufa' },
  cozinha:    { onde: ['cantina', 'estufa'], acoes: ['agacha', null], emotes: ['🍲', '🥔', '😋', '🧂'], entra: true, carga: '#e8b04a', leva: ['estufa'], texto: 'preparando a comida da colônia' },
  engenharia: { onde: ['@obra', 'base'], acoes: ['faisca', 'faisca', 'tablet'], emotes: ['🔧', '📐', '💪', '🔩'], texto: 'trabalhando na obra' },
  energia:    { onde: ['fazenda-solar', 'base'], acoes: ['tablet', 'agacha', 'faisca'], emotes: ['⚡', '☀️', '🔋', '🧽'], texto: 'limpando e testando os painéis solares' },
  comunicacao:{ onde: ['antena', 'base'], acoes: ['tablet', 'ceu'], emotes: ['📡', '📻', '🎧', '👂'], texto: 'ajustando a Antena' },
  astronomia: { onde: ['modulo-comando', 'antena', 'base'], acoes: ['ceu', 'ceu', 'tablet'], emotes: ['🔭', '🌌', '⭐', '🪐'], entra: true, texto: 'olhando o céu' },
  ciencia:    { onde: ['laboratorio', 'extrator-gelo', 'estufa'], acoes: ['agacha', 'tablet'], emotes: ['🧪', '🔬', '🤔', '💡'], entra: true, carga: '#3fd0c9', leva: ['laboratorio', 'base'], texto: 'coletando amostras' },
  medicina:   { onde: ['enfermaria', 'base'], acoes: ['tablet', null], emotes: ['🩺', '💊', '❤️', '🙂'], entra: true, texto: 'de plantão na Enfermaria' },
  robotica:   { onde: ['oficina', '@obra', 'base'], acoes: ['faisca', 'faisca', 'agacha'], emotes: ['🤖', '🔧', '⚙️', '🔩'], entra: true, carga: '#9aa0b5', leva: ['@obra'], texto: 'consertando robôs' },
  piloto:     { onde: ['base'], acoes: ['tablet', 'ceu'], emotes: ['🚀', '🛰️', '📋', '😎'], entra: true, texto: 'checando a nave no Módulo de Pouso' },
  rover:      { onde: ['extrator-gelo', 'base'], acoes: ['agacha', 'tablet'], emotes: ['🚙', '🛞', '🗺️'], texto: 'revisando o rover' },
  geologia:   { onde: ['extrator-gelo', 'base'], acoes: ['agacha', 'escava'], emotes: ['🪨', '⛏️', '🤔'], texto: 'estudando as rochas' },
  guarda:     { onde: ['base', 'praca'], acoes: [null, 'ceu'], emotes: ['🛡️', '👀', '🔦', '👋'], texto: 'fazendo a ronda' },
};
/** Quem cava o solo de Marte de vez em quando (e acha coisas). */
const EXPLORAM: Record<string, number> = { geologia: 0.55, rover: 0.35, ciencia: 0.25, astronomia: 0.1 };

let LUGARES: Record<string, Lugar> = {};
let VERSAO = 0;
const CARGOS = new Map<number, string>();
/** O mapa informa os lugares prontos (base, praça, prédios concluídos e '@obra' = obra do dia). */
export function definirLugares(l: Record<string, Lugar>) {
  const k = JSON.stringify(l);
  if (k !== JSON.stringify(LUGARES)) { LUGARES = l; VERSAO++; PLANOS.clear(); }
}
/** O mapa informa o cargo de cada colono que carregou (id → id do cargo). */
export function registrarCargo(id: number, cargo: string | null | undefined) {
  if (!cargo) return;
  if (CARGOS.get(id) !== cargo) { CARGOS.set(id, cargo); for (const k of [...PLANOS.keys()]) if (k.startsWith(id + '|')) PLANOS.delete(k); }
}
const postoDe = (id: number) => { const c = CARGOS.get(id); return c ? POSTOS[c] ?? null : null; };
function lugarDoPosto(pt: Posto): Lugar | null {
  for (const o of pt.onde) if (LUGARES[o]) return LUGARES[o];
  return null;
}
const portaDoLugar = (l: Lugar): P => ({ x: (l.x + l.w / 2) * CASA, y: (l.y + l.h) * CASA + 3 });

// pseudo-aleatório estável (mesma entrada → mesmo número entre 0 e 1)
function h01(...n: number[]): number {
  let x = 2166136261;
  for (const v of n) { x ^= v | 0; x = Math.imul(x, 16777619); x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995); x ^= x >>> 15; }
  return (x >>> 0) / 4294967296;
}
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const entre = (a: number, b: number, r: number) => a + (b - a) * r;
const dist = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);

/** Pés do colono parado na porta de casa (ou da cápsula). */
export function portaDe(id: number): P {
  const c = moradiaDe(id);   // cápsula (2x2, porta embaixo no meio) ou casinha do lote
  return c.grande ? { x: c.x * CASA + 16, y: c.y * CASA + 31 } : { x: c.x * CASA + 11, y: c.y * CASA + 15 };
}

// ------------------------------------------------------------------ ruas (anéis quadrados + 2 avenidas)
const C: P = { x: (CENTRO.x + 0.5) * CASA, y: (CENTRO.y + 0.5) * CASA };   // meio da casa central, em px
const AV_E = C.y + AV_Y * CASA;                                            // avenida leste-oeste (y fixo)
const cheb = (p: P) => Math.max(Math.abs(p.x - C.x), Math.abs(p.y - C.y)) / CASA;
const anelDe = (p: P) => Math.max(0, Math.round((cheb(p) - R0) / PASSO));
const raioDoAnel = (k: number) => (R0 + PASSO * k) * CASA;
const noCentro = (p: P) => cheb(p) < R0 - 1.5;

/** Ponto da rua do anel (meio-lado s) mais perto de p: o colono sai da porta direto para a rua. */
function naRua(p: P, s: number): P {
  const dx = p.x - C.x, dy = p.y - C.y;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: C.x + Math.sign(dx || 1) * s, y: C.y + clamp(dy, -s, s) };
  return { x: C.x + clamp(dx, -s, s), y: C.y + Math.sign(dy || 1) * s };
}
// perímetro do quadrado, no sentido horário a partir do canto de cima à esquerda
function paramDe(p: P, s: number): number {
  const x = p.x - C.x, y = p.y - C.y;
  const lados = [Math.abs(y + s), Math.abs(x - s), Math.abs(y - s), Math.abs(x + s)];
  const lado = lados.indexOf(Math.min(...lados));
  if (lado === 0) return clamp(x + s, 0, 2 * s);
  if (lado === 1) return 2 * s + clamp(y + s, 0, 2 * s);
  if (lado === 2) return 4 * s + clamp(s - x, 0, 2 * s);
  return 6 * s + clamp(s - y, 0, 2 * s);
}
function pontoDe(t: number, s: number): P {
  t = ((t % (8 * s)) + 8 * s) % (8 * s);
  if (t < 2 * s) return { x: C.x - s + t, y: C.y - s };
  if (t < 4 * s) return { x: C.x + s, y: C.y - s + (t - 2 * s) };
  if (t < 6 * s) return { x: C.x + s - (t - 4 * s), y: C.y + s };
  return { x: C.x - s, y: C.y + s - (t - 6 * s) };
}
/** Caminho pela rua do anel de a até b (os dois já na rua), pelo lado mais curto, passando pelas esquinas. */
function peloAnel(a: P, b: P, s: number): P[] {
  const ta = paramDe(a, s), tb = paramDe(b, s), per = 8 * s;
  const horario = ((tb - ta + per) % per) <= per / 2;
  const pts: P[] = [];
  let t = ta;
  for (let i = 0; i < 4; i++) {   // no máximo 4 esquinas
    const resto = horario ? (tb - t + per) % per : (t - tb + per) % per;
    const prox = horario ? (Math.floor(t / (2 * s) + 1e-6) + 1) * 2 * s : (Math.ceil(t / (2 * s) - 1e-6) - 1) * 2 * s;
    const ate = horario ? (prox - t + per) % per : (t - prox + per) % per;
    if (ate >= resto - 0.01) break;
    t = ((prox % per) + per) % per;
    pts.push(pontoDe(t, s));
  }
  pts.push(b);
  return pts;
}
/** Cruzamentos do anel (meio-lado s) com as avenidas: norte, sul (avenida norte-sul) e leste, oeste (leste-oeste). */
const cruzamentos = (s: number): P[] => [{ x: C.x, y: C.y - s }, { x: C.x, y: C.y + s }, { x: C.x + s, y: AV_E }, { x: C.x - s, y: AV_E }];

/**
 * Caminho de a até b pelas ruas: porta → rua do anel → (anel até a avenida → avenida → anel do destino) → destino.
 * Destino no miolo (praça, obra, cantina): sai pela avenida até o 1º anel e entra direto. `faixa` desloca o colono
 * um pouco para o lado na rua (cada um anda na sua faixa, ninguém em fila indiana perfeita).
 */
function rota(a: P, b: P, faixa: P): P[] {
  const f = (p: P) => ({ x: p.x + faixa.x, y: p.y + faixa.y });
  if (noCentro(a) && noCentro(b)) {
    const meio = { x: (a.x + b.x) / 2 + faixa.x * 3, y: (a.y + b.y) / 2 + faixa.y * 3 };
    return [a, meio, b];
  }
  if (noCentro(a)) return rota(b, a, faixa).reverse();
  const ka = anelDe(a), sa = raioDoAnel(ka), ea = naRua(a, sa);
  const kb = noCentro(b) ? 0 : anelDe(b), sb = raioDoAnel(kb), eb = noCentro(b) ? null : naRua(b, sb);
  if (eb && ka === kb && dist(ea, eb) < sa * 3) return [a, f(ea), ...peloAnel(ea, eb, sa).map(f), b];
  // escolhe a avenida que dá o caminho total mais curto
  const ca = cruzamentos(sa), cb = cruzamentos(sb);
  let melhor = 0, custo = Infinity;
  for (let i = 0; i < 4; i++) {
    const c = dist(ea, ca[i]) + dist(ca[i], cb[i]) + (eb ? dist(cb[i], eb) : dist(cb[i], b));
    if (c < custo) { custo = c; melhor = i; }
  }
  const pts: P[] = [a, f(ea), ...peloAnel(ea, ca[melhor], sa).map(f), f(cb[melhor])];
  if (eb) pts.push(...peloAnel(cb[melhor], eb, sb).map(f));
  pts.push(b);
  return pts;
}
const comprimento = (pts: P[]) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);
function aoLongo(pts: P[], d: number): P & { dx: number } {
  for (let i = 1; i < pts.length; i++) {
    const L = dist(pts[i - 1], pts[i]);
    if (d <= L || i === pts.length - 1) {
      const f = L ? clamp(d / L) : 1, p = pts[i - 1], q = pts[i];
      return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, dx: q.x - p.x };
    }
    d -= L;
  }
  return { ...pts[pts.length - 1], dx: 0 };
}

// ------------------------------------------------------------------ parado num lugar (mas vivo)
/**
 * Fica perto de `base` entre t0 e t1 sem virar estátua: em trechos de 4–13 s, às vezes dá uns passos até outro
 * ponto (dentro de rx × ry), às vezes só olha para o outro lado. Devolve onde está no instante t.
 */
function perambular(base: P, rx: number, ry: number, t0: number, t: number, v: number, ...sal: number[]) {
  let cur = { ...base }, ini = t0, dir: 1 | -1 = h01(...sal, 1) < 0.5 ? -1 : 1;
  for (let j = 0; j < 400; j++) {
    const dur = entre(4, 13, h01(...sal, j, 2));
    const move = h01(...sal, j, 3) < 0.5;
    const alvo = move ? { x: base.x + (h01(...sal, j, 4) - 0.5) * 2 * rx, y: base.y + (h01(...sal, j, 5) - 0.5) * 2 * ry } : cur;
    const anda = move ? Math.min(dur * 0.8, dist(cur, alvo) / (v * 0.45)) : 0;
    if (t < ini + dur) {
      if (move && t < ini + anda) {
        const k = (t - ini) / anda;
        return { x: cur.x + (alvo.x - cur.x) * k, y: cur.y + (alvo.y - cur.y) * k, andando: true, dir: (alvo.x < cur.x ? -1 : 1) as 1 | -1 };
      }
      const olha = move ? (alvo.x < cur.x ? -1 : 1) : (h01(...sal, j, 6) < 0.5 ? -1 : 1);
      return { x: alvo.x, y: alvo.y, andando: false, dir: (Math.abs(alvo.x - cur.x) < 0.5 && move ? dir : olha) as 1 | -1 };
    }
    if (move) dir = alvo.x < cur.x ? -1 : 1;
    cur = alvo; ini += dur;
  }
  return { ...cur, andando: false, dir };
}

// ------------------------------------------------------------------ a agenda de cada colono
type Parada = { tipo: Tipo; ponto: P; rx: number; ry: number; dur: number; parceiro: number | null;
                entra?: P | null; leva?: P | null };
type Trecho =
  | { k: 'casa'; t0: number; t1: number }
  | { k: 'anda'; t0: number; t1: number; pts: P[]; len: number; para: Tipo; volta: boolean; parceiro: number | null; ajustado?: boolean }
  | { k: 'fica'; t0: number; t1: number; p: Parada };

const PLANOS = new Map<string, Trecho[]>();
let TOTAL_ATUAL = 1;   // cache: a agenda de um bloco não muda (limpa quando cresce)

function pontoDaParada(tipo: Tipo, id: number, sal: number, praca: Lugar | null, obra: Lugar | null,
                       cantina: Lugar | null, parceiro: number | null, casa: P): Parada | null {
  const r = (n: number) => h01(id, sal, n);
  if (tipo === 'visita' && parceiro) { const p = portaDe(parceiro); return { tipo, ponto: { x: p.x + 9, y: p.y + 1 }, rx: 2, ry: 1, dur: entre(30, 90, r(1)), parceiro }; }
  if (tipo === 'praca' && praca)       // a praça e o largo em volta dela; a rodinha se mexe
    return { tipo, ponto: { x: (praca.x - 1.5 + r(2) * (praca.w + 3)) * CASA, y: (praca.y - 0.2 + r(3) * (praca.h + 0.8)) * CASA }, rx: 14, ry: 6, dur: entre(45, 140, r(1)), parceiro: null };
  if (tipo === 'almoco' && cantina)    // nas mesas em frente à cantina (quase parado: está comendo)
    return { tipo, ponto: { x: (cantina.x - 0.4 + r(2) * (cantina.w + 0.8)) * CASA, y: (cantina.y + cantina.h + 0.5 + r(3) * 0.8) * CASA }, rx: 3, ry: 1, dur: entre(40, 100, r(1)), parceiro: null };
  if (tipo === 'obra' && obra) {       // num dos 4 lados da obra, andando ao longo dele
    const lado = Math.floor(r(4) * 4), q = r(2), fora = 6 + r(3) * 8;
    const ox = obra.x * CASA, oy = obra.y * CASA, ow = obra.w * CASA, oh = obra.h * CASA;
    const ponto = lado === 0 ? { x: ox + q * ow, y: oy + oh + fora } : lado === 1 ? { x: ox + q * ow, y: oy - fora + 12 }
      : lado === 2 ? { x: ox - fora, y: oy + 12 + q * (oh - 6) } : { x: ox + ow + fora, y: oy + 12 + q * (oh - 6) };
    return { tipo, ponto, rx: lado < 2 ? 12 : 3, ry: lado < 2 ? 3 : 10, dur: entre(50, 150, r(1)), parceiro: null };
  }
  if (tipo === 'trabalho') {           // no posto do cargo: em volta do prédio, às vezes entra, às vezes leva carga
    const pt = postoDe(id), l = pt && lugarDoPosto(pt);
    if (!pt || !l) return null;
    const lado = Math.floor(r(4) * 4), q = r(2), fora = 5 + r(3) * 6;
    const ox = l.x * CASA, oy = l.y * CASA, ow = l.w * CASA, oh = l.h * CASA;
    const ponto = lado === 0 ? { x: ox + q * ow, y: oy + oh + fora } : lado === 1 ? { x: ox + q * ow, y: oy - fora + 10 }
      : lado === 2 ? { x: ox - fora, y: oy + 10 + q * (oh - 6) } : { x: ox + ow + fora, y: oy + 10 + q * (oh - 6) };
    const destinoCarga = pt.leva?.map((k) => LUGARES[k]).find((x) => x && x !== l) ?? null;
    return { tipo, ponto, rx: lado < 2 ? Math.min(20, ow / 2) : 4, ry: lado < 2 ? 3 : Math.min(16, oh / 2), dur: entre(70, 200, r(1)), parceiro: null,
             entra: pt.entra ? portaDoLugar(l) : null, leva: destinoCarga ? portaDoLugar(destinoCarga) : null };
  }
  if (tipo === 'escava') {             // além do último anel: cava o solo e às vezes acha alguma coisa
    const k = Math.max(0, anelMaximo(TOTAL_ATUAL)), s = raioDoAnel(k) + (3 + r(2) * 5) * CASA;
    return { tipo, ponto: pontoDe(r(3) * 8 * s, s), rx: 3, ry: 1.5, dur: entre(40, 90, r(1)), parceiro: null };
  }
  if (tipo === 'passeio') {            // um trecho do próprio anel, mais adiante, para olhar a paisagem
    if (noCentro(casa)) return null;
    const s = raioDoAnel(anelDe(casa)), t = paramDe(naRua(casa, s), s) + (r(2) - 0.5) * 2 * Math.min(s, 30 * CASA);
    return { tipo, ponto: pontoDe(t, s), rx: 8, ry: 4, dur: entre(12, 40, r(1)), parceiro: null };
  }
  return null;
}

function agenda(id: number, total: number, bloco: number, praca: Lugar | null, obra: Lugar | null, cantina: Lugar | null): Trecho[] {
  TOTAL_ATUAL = total;
  const chave = `${id}|${total}|${bloco}|${obra ? obra.x + ',' + obra.y : '-'}|${cantina ? 1 : 0}|${praca ? 1 : 0}|${VERSAO}|${CARGOS.get(id) ?? ''}`;
  const salvo = PLANOS.get(chave);
  if (salvo) return salvo;
  if (PLANOS.size > 6000) PLANOS.clear();

  const casa = portaDe(id), v = 9 + h01(id, 9) * 5;                       // cada um no seu passo (px/s)
  const faixa = { x: (h01(id, 10) - 0.5) * 6, y: (h01(id, 11) - 0.5) * 6 };
  const longe = clamp((R0 * 2.2) / Math.max(R0, cheb(casa)));               // quem mora longe vai menos ao centro
  const cheia = clamp((total - 30) / 300);                                  // colônia grande: menos formigueiro
  const posto = (() => { const pt = postoDe(id); return pt && lugarDoPosto(pt); })();
  const sorteiaTipo = (r: number): Tipo => {
    const pesos: [Tipo, number][] = [
      ['praca', (praca ? 0.3 - 0.12 * cheia : 0) * longe], ['obra', (obra ? 0.25 - 0.08 * cheia : 0) * longe],
      ['almoco', (cantina ? 0.2 : 0) * longe], ['visita', 0.22], ['passeio', 0.2],
      ['trabalho', posto ? 0.75 * Math.max(0.5, longe) : 0], ['escava', EXPLORAM[CARGOS.get(id) ?? ''] ?? 0.04],
    ];
    const soma = pesos.reduce((s, [, p]) => s + p, 0);
    let acc = 0;
    for (const [tp, p] of pesos) { acc += p / soma; if (r < acc) return tp; }
    return 'passeio';
  };
  const vizinho = (sal: number) => {
    const d = [1, -1, 2, -2, 3][Math.floor(h01(id, bloco, sal, 1) * 5)], p = id + d;
    return p >= 1 && p <= total ? p : null;
  };

  const plano: Trecho[] = [];
  let t = entre(5, 45, h01(id, bloco, 1));                                  // começa o bloco em casa
  plano.push({ k: 'casa', t0: 0, t1: t });
  const r0 = h01(id, bloco, 2), saidas = r0 < 0.07 ? 0 : r0 < 0.35 ? 1 : r0 < 0.8 ? 2 : 3;
  for (let s = 0; s < saidas; s++) {
    const paradas: Parada[] = [];
    const tipo1 = sorteiaTipo(h01(id, bloco, s, 3));
    const p1 = pontoDaParada(tipo1, id, bloco * 10 + s, praca, obra, cantina, tipo1 === 'visita' ? vizinho(s) : null, casa);
    if (!p1) continue;
    paradas.push(p1);
    if (h01(id, bloco, s, 4) < 0.45) {                                      // às vezes emenda mais um lugar
      const tipo2 = sorteiaTipo(h01(id, bloco, s, 5));
      const p2 = tipo2 !== tipo1 ? pontoDaParada(tipo2, id, bloco * 10 + s + 5, praca, obra, cantina, tipo2 === 'visita' ? vizinho(s + 7) : null, casa) : null;
      if (p2) paradas.push(p2);
    }
    // monta a saída; se não couber no bloco, encurta as paradas ou desiste
    const trechos: Trecho[] = [];
    let cur = casa, tt = t;
    for (const p of paradas) {
      const pts = rota(cur, p.ponto, faixa), len = comprimento(pts);
      trechos.push({ k: 'anda', t0: tt, t1: tt + len / v, pts, len, para: p.tipo, volta: false, parceiro: p.parceiro });
      tt += len / v;
      trechos.push({ k: 'fica', t0: tt, t1: tt + p.dur, p });
      tt += p.dur; cur = p.ponto;
    }
    const pts = rota(cur, casa, faixa), len = comprimento(pts);
    const ultimo = paradas[paradas.length - 1];
    trechos.push({ k: 'anda', t0: tt, t1: tt + len / v, pts, len, para: ultimo.tipo, volta: true, parceiro: ultimo.parceiro });
    tt += len / v;
    const sobra = BLOCO_S - 10 - tt;
    if (sobra < 0) {                                                        // encurta as paradas proporcionalmente
      const ficas = trechos.filter((x): x is Extract<Trecho, { k: 'fica' }> => x.k === 'fica');
      const tempoFicando = ficas.reduce((a, x) => a + (x.t1 - x.t0), 0);
      if (tempoFicando + sobra < 15 * ficas.length) break;                  // nem encurtando cabe: fica em casa
      const fator = (tempoFicando + sobra) / tempoFicando;
      let desl = 0;
      for (const x of trechos) {
        const d = x.t1 - x.t0, nd = x.k === 'fica' ? d * fator : d;
        x.t0 += desl; desl += nd - d; x.t1 = x.t0 + nd;
        if (x.k === 'fica') x.p = { ...x.p, dur: nd };
      }
      tt += desl;
    }
    plano.push(...trechos);
    const descanso = entre(10, 50, h01(id, bloco, s, 6));
    plano.push({ k: 'casa', t0: tt, t1: Math.min(BLOCO_S, tt + descanso) });
    t = Math.min(BLOCO_S, tt + descanso);
    if (t >= BLOCO_S - 30) break;
  }
  plano.push({ k: 'casa', t0: t, t1: BLOCO_S });
  PLANOS.set(chave, plano);
  return plano;
}

type Estado = { x: number; y: number; andando: boolean; dir: 1 | -1; fora: boolean; tipo: Tipo; parceiro: number | null;
                indo: boolean; voltando: boolean; parado: Parada | null; dentro: boolean; acao?: Acao; carga?: string | null };

/**
 * No posto do cargo: trechos de 15–50 s. Trabalha em volta do prédio (com o gesto do cargo), entra no prédio e
 * sai de novo, ou leva uma caixa até outro lugar e volta. Termina sempre perto do ponto base (sem pulo).
 */
function trabalhar(id: number, pa: Parada, t0: number, u: number, v: number, sal: number) {
  const pt = postoDe(id);
  let ini = t0, cur: P = { ...pa.ponto };
  for (let j = 0; j < 80; j++) {
    const r = h01(id, sal, j, 71), fim = t0 + pa.dur - 6;
    const tipoT = j % 3 === 2 && pa.entra && r < 0.6 ? 'entra' : j % 3 === 1 && pa.leva && r < 0.45 ? 'leva' : 'gesto';
    const porta = tipoT === 'entra' ? pa.entra! : tipoT === 'leva' ? pa.leva! : null;
    const ida = porta ? dist(cur, porta) / v : 0;
    const dur = tipoT === 'gesto' ? entre(12, 40, h01(id, sal, j, 72)) : ida * 2 + entre(10, 45, h01(id, sal, j, 73));
    if (ini + dur > fim && j > 0) {        // volta para o ponto base até o fim da parada
      const k = clamp((u - ini) / Math.max(0.1, t0 + pa.dur - ini));
      return { x: cur.x + (pa.ponto.x - cur.x) * k, y: cur.y + (pa.ponto.y - cur.y) * k, andando: k < 1 && dist(cur, pa.ponto) > 1,
               dir: (pa.ponto.x < cur.x ? -1 : 1) as 1 | -1, dentro: false, acao: null as Acao, carga: null };
    }
    if (u < ini + dur) {
      const du = u - ini;
      if (tipoT === 'gesto') {
        const q = perambular(cur, pa.rx, pa.ry, ini, u, v, id, sal, j);
        const acao = q.andando ? null : (pt?.acoes[Math.floor(h01(id, sal, j, 74) * (pt?.acoes.length ?? 1))] ?? null);
        return { ...q, dentro: false, acao, carga: null };
      }
      const parado = dur - 2 * ida;
      if (du < ida) { const k = du / ida; return { x: cur.x + (porta!.x - cur.x) * k, y: cur.y + (porta!.y - cur.y) * k, andando: true, dir: (porta!.x < cur.x ? -1 : 1) as 1 | -1, dentro: false, acao: null as Acao, carga: tipoT === 'leva' ? pt?.carga ?? '#a0613f' : null }; }
      if (du < ida + parado) return { x: porta!.x, y: porta!.y, andando: false, dir: 1 as 1 | -1, dentro: true, acao: null as Acao, carga: null };
      const k = (du - ida - parado) / ida;
      return { x: porta!.x + (cur.x - porta!.x) * k, y: porta!.y + (cur.y - porta!.y) * k, andando: true, dir: (cur.x < porta!.x ? -1 : 1) as 1 | -1, dentro: false, acao: null as Acao, carga: null };
    }
    if (tipoT === 'gesto') { const q = perambular(cur, pa.rx, pa.ry, ini, ini + dur - 1e-3, v, id, sal, j); cur = { x: q.x, y: q.y }; }
    ini += dur;
  }
  return { ...cur, andando: false, dir: 1 as 1 | -1, dentro: false, acao: null as Acao, carga: null };
}

/** Escavando: agacha e cava; no fim, o achado aparece no chão (achadosPerto). */
function escavar(pa: Parada, t0: number, u: number) {
  const k = (u - t0) / pa.dur;
  return { x: pa.ponto.x, y: pa.ponto.y, andando: false, dir: 1 as 1 | -1, dentro: false, acao: (k < 0.85 ? 'escava' : 'agacha') as Acao, carga: null };
}

/**
 * Tempo em casa: quase sempre DENTRO (some do mapa, janela acesa); de vez em quando sai para o quintal, mexe
 * nas plantas, olha a rua, e entra de novo. Nunca fica plantado na porta (era o "colono travado").
 */
function emCasa(id: number, porta: P, t0: number, u: number, v: number, sal: number) {
  let ini = t0;
  for (let j = 0; j < 60; j++) {
    const quintal = j % 2 === 1 && h01(id, sal, j, 61) < 0.7;
    const dur = quintal ? entre(14, 40, h01(id, sal, j, 62)) : entre(25, 120, h01(id, sal, j, 63));
    if (u < ini + dur) {
      if (!quintal) return { x: porta.x, y: porta.y, andando: false, dir: 1 as 1 | -1, dentro: true, acao: null as Acao };
      const base = { x: porta.x + (h01(id, sal, j, 64) - 0.5) * 8, y: porta.y + 3 };
      const volta = 2.5, fimQ = ini + dur - volta;
      const reforma = h01(id, sal, j, 65) < 0.3;   // às vezes o quintal é para melhorar a casa (martelo)
      if (u < fimQ) { const q = perambular(base, reforma ? 3 : 7, 2.5, ini, u, v, id, sal, j); return { ...q, dentro: false, acao: (reforma && !q.andando ? 'reforma' : null) as Acao }; }
      const q = perambular(base, 7, 2.5, ini, fimQ, v, id, sal, j), k = (u - fimQ) / volta;   // volta para a porta e entra
      return { x: q.x + (porta.x - q.x) * k, y: q.y + (porta.y - q.y) * k, andando: true, dir: (porta.x < q.x ? -1 : 1) as 1 | -1, dentro: false, acao: null as Acao };
    }
    ini += dur;
  }
  return { x: porta.x, y: porta.y, andando: false, dir: 1 as 1 | -1, dentro: true, acao: null as Acao };
}

function estadoBruto(id: number, total: number, agoraS: number, praca: Lugar | null, obra: Lugar | null, cantina: Lugar | null): Estado {
  const desloc = h01(id, 5) * BLOCO_S, tt = agoraS + desloc;
  const bloco = Math.floor(tt / BLOCO_S), u = tt - bloco * BLOCO_S;
  const plano = agenda(id, total, bloco, praca, obra, cantina);
  const i = plano.findIndex((x) => u >= x.t0 && u < x.t1), tr = plano[i] ?? plano[plano.length - 1];
  const casa = portaDe(id), v = 9 + h01(id, 9) * 5;
  if (tr.k === 'anda') {
    // saindo de uma parada: a caminhada começa de onde ele estava de fato (deu uns passos por ali), sem pulo
    const ant = plano[i - 1];
    if (ant && !tr.ajustado) {
      const fimAnt = ant.t1 - 1e-3;
      const q = ant.k === 'fica'
        ? (ant.p.tipo === 'trabalho' ? trabalhar(id, ant.p, ant.t0, fimAnt, v, bloco * 13 + Math.round(ant.t0))
          : ant.p.tipo === 'escava' ? escavar(ant.p, ant.t0, fimAnt)
          : perambular(ant.p.ponto, ant.p.rx, ant.p.ry, ant.t0, fimAnt, v, id, bloco, Math.round(ant.t0)))
        : ant.k === 'casa' ? emCasa(id, casa, ant.t0, fimAnt, v, bloco * 7 + Math.round(ant.t0)) : null;
      if (q) { tr.pts = [{ x: q.x, y: q.y }, ...tr.pts.slice(1)]; tr.len = comprimento(tr.pts); }
      tr.ajustado = true;
    }
    const p = aoLongo(tr.pts, ((u - tr.t0) / Math.max(0.01, tr.t1 - tr.t0)) * tr.len);
    return { x: p.x, y: p.y, andando: true, dir: p.dx < 0 ? -1 : 1, fora: !tr.volta, tipo: tr.para, parceiro: tr.parceiro,
             indo: !tr.volta, voltando: tr.volta, parado: null, dentro: false, acao: null, carga: null };
  }
  if (tr.k === 'fica') {
    const base = { fora: true, tipo: tr.p.tipo, parceiro: tr.p.parceiro, indo: false, voltando: false, parado: tr.p };
    if (tr.p.tipo === 'trabalho') return { ...trabalhar(id, tr.p, tr.t0, u, v, bloco * 13 + Math.round(tr.t0)), ...base };
    if (tr.p.tipo === 'escava') return { ...escavar(tr.p, tr.t0, u), ...base };
    const q = perambular(tr.p.ponto, tr.p.rx, tr.p.ry, tr.t0, u, v, id, bloco, Math.round(tr.t0));
    return { ...q, ...base, dentro: false, acao: (tr.p.tipo === 'obra' && !q.andando ? 'faisca' : null) as Acao };
  }
  const c = emCasa(id, casa, tr.t0, u, v, bloco * 7 + Math.round(tr.t0));
  return { ...c, fora: false, tipo: 'casa', parceiro: null, indo: false, voltando: false, parado: null };
}

export function situacao(id: number, total: number, agoraS: number,
                         praca: Lugar | null, obra: (Lugar & { nome: string }) | null,
                         cantina: Lugar | null = null): Situacao {
  const e = estadoBruto(id, total, agoraS, praca, obra, cantina);
  let tipo: Tipo = e.fora ? e.tipo : 'casa', parceiro = e.parceiro, x = e.x, y = e.y, dir = e.dir, dentro = e.dentro;

  // em casa e um vizinho veio visitar agora? aparece na porta para receber
  if (!e.fora && !(e.andando && e.voltando)) {
    for (const d of [1, -1, 2, -2, 3, -3]) {
      const viz = id + d;
      if (viz < 1 || viz > total) continue;
      const ev = estadoBruto(viz, total, agoraS, praca, obra, cantina);
      if (ev.parado && ev.parado.tipo === 'visita' && ev.parado.parceiro === id) {
        if (e.dentro) {   // estava lá dentro: aparece na porta; se já estava no quintal, fica onde está
          const porta = portaDe(id), q = perambular({ x: porta.x - 2, y: porta.y + 1 }, 2.5, 1, 0, agoraS, 9, id, 88);
          x = q.x; y = q.y;
        }
        tipo = 'recebe'; parceiro = viz; dir = ev.x < x ? -1 : 1; dentro = false; break;
      }
    }
  }
  if (tipo === 'visita' && parceiro) {          // a visita olha para a porta
    const pp = portaDe(parceiro); if (!e.andando) dir = pp.x < x ? -1 : 1;
  }

  // balões: na rodinha, na obra, na visita… e de vez em quando em casa
  let emote: string | null = null;
  const janela = Math.floor((agoraS + h01(id, 77) * 2.4) / 2.4);
  const tipoEmote: Tipo | null = e.andando ? (tipo === 'passeio' && !e.voltando ? 'passeio' : null) : tipo;
  if (tipoEmote) {
    const chance = tipoEmote === 'casa' ? 0.1 : tipoEmote === 'visita' || tipoEmote === 'recebe' ? 0.5 : 0.35;
    if (h01(id, janela, 41) < chance) {
      const lista = tipoEmote === 'trabalho' ? (postoDe(id)?.emotes ?? EMOTES.trabalho) : e.acao === 'reforma' ? ['🔨', '🪛', '🎨', '🌱'] : EMOTES[tipoEmote];
      emote = lista[Math.floor(h01(id, janela, 42) * lista.length)];
    }
  }

  const descricao = (nome: (id: number) => string | null) => {
    const outro = parceiro ? (nome(parceiro) ?? `o vizinho NM${String(parceiro).padStart(6, '0')}`) : null;
    if (e.andando && e.voltando) return 'voltando para casa';
    if (e.andando && e.tipo === 'trabalho' && e.carga) return 'levando uma caixa';
    if (e.andando) return e.tipo === 'trabalho' ? 'indo trabalhar' : e.tipo === 'escava' ? 'indo explorar o solo' : e.tipo === 'visita' && outro ? `indo visitar ${outro}` : e.tipo === 'praca' ? 'indo para a praça'
      : e.tipo === 'almoco' ? 'indo almoçar na cantina' : e.tipo === 'obra' ? 'indo ajudar na obra' : 'passeando pelo bairro';
    if (tipo === 'visita') return `visitando ${outro}`;
    if (tipo === 'recebe') return `recebendo a visita de ${outro}`;
    if (tipo === 'praca') return 'conversando na praça';
    if (tipo === 'almoco') return 'almoçando na cantina';
    if (tipo === 'obra') return `ajudando na obra${obra ? ` da ${obra.nome}` : ''}`;
    if (tipo === 'passeio') return 'olhando a paisagem no fim da rua';
    if (tipo === 'trabalho') return dentro ? 'trabalhando lá dentro' : e.carga ? 'levando uma caixa' : (postoDe(id)?.texto ?? 'trabalhando');
    if (tipo === 'escava') return 'cavando o solo de Marte';
    if (e.acao === 'reforma') return 'melhorando a casa';
    return dentro ? 'em casa' : 'no quintal de casa';
  };

  // 'casa' também quando está voltando (o mapa acende a janela só quando ele entra: tipo 'casa' + parado na porta)
  const fora = e.fora || (e.andando && e.voltando);
  return { x, y, andando: e.andando, dir, tipo: fora ? tipo : (tipo === 'recebe' ? 'recebe' : 'casa'), parceiro, rodada: e.tipo,
           emote: dentro ? null : emote, descricao, dentro, acao: dentro ? null : (e.acao ?? null), carga: e.carga ?? null };
}

/**
 * Quem está parado perto de alguém vira para ele (a rodinha da praça, a mesa da cantina, a turma da obra):
 * chamado pelo mapa depois de calcular todo mundo que está na tela.
 */
export function virarParaConversar(lista: { s: Situacao; id?: number }[], agoraS = 0) {
  const parDe = new Map<Situacao, Situacao>();
  const grade = new Map<string, Situacao[]>();
  const chave = (x: number, y: number) => `${Math.floor(x / 16)},${Math.floor(y / 16)}`;
  for (const { s } of lista) {
    if (s.andando || s.tipo === 'casa') continue;
    const k = chave(s.x, s.y); (grade.get(k) ?? grade.set(k, []).get(k)!).push(s);
  }
  for (const { s } of lista) {
    if (s.andando || s.tipo === 'casa' || s.tipo === 'visita' || s.tipo === 'recebe') continue;
    let melhor: Situacao | null = null, d = 15;
    const gx = Math.floor(s.x / 16), gy = Math.floor(s.y / 16);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
      for (const o of grade.get(`${gx + i},${gy + j}`) ?? []) {
        if (o === s) continue;
        const dd = Math.abs(o.x - s.x) + Math.abs(o.y - s.y) * 2;
        if (dd < d && Math.abs(o.x - s.x) > 1.5) { d = dd; melhor = o; }
      }
    if (melhor) { s.dir = melhor.x < s.x ? -1 : 1; parDe.set(s, melhor); }
  }
  // os dois conversam: balões alternados (um fala, o outro responde), cumprimento quando se encontram
  const CONVERSA = ['💬', '😂', '👋', '🤝', '❤️', '🤔', '👍', '😮'];
  for (const { s, id } of lista) {
    const o = parDe.get(s);
    if (!o || s.emote || o.emote) continue;
    const janela = Math.floor(agoraS / 2.2), chave = Math.round(s.x * 7 + s.y * 13 + (id ?? 0));
    if ((janela + (s.x < o.x ? 0 : 1)) % 2 === 0 && h01(chave, janela, 51) < 0.55) s.emote = CONVERSA[Math.floor(h01(chave, janela, 52) * CONVERSA.length)];
  }
}

// ------------------------------------------------------------------ Vega e Lia
/** Os fundadores: muito tempo na obra (andando pelo canteiro), passadas na praça e voltas para o Módulo. */
export function situacaoFundador(i: number, casa: P, agoraS: number, obra: Lugar | null, praca: Lugar | null) {
  const BL = 420, desl = (i * 137) % BL, tt = agoraS + desl, bloco = Math.floor(tt / BL);
  let u = tt - bloco * BL;
  const v = 10 + i * 1.5, r = (n: number) => h01(9000 + i, bloco, n);
  const alvoObra = obra ? { x: (obra.x + obra.w / 2 + (i ? 1.4 : -1.4)) * CASA, y: (obra.y + obra.h + 0.7) * CASA } : null;
  const alvoPraca = praca ? { x: (praca.x + praca.w / 2 + (r(1) - 0.5) * praca.w) * CASA, y: (praca.y + praca.h / 2) * CASA } : null;
  const plano: { tipo: 'casa' | 'obra' | 'praca'; dur: number }[] = [];
  plano.push({ tipo: 'casa', dur: entre(10, 50, r(2)) });
  plano.push({ tipo: alvoObra ? 'obra' : 'praca', dur: entre(90, 170, r(3)) });
  if (alvoPraca && r(4) < 0.55) plano.push({ tipo: 'praca', dur: entre(20, 60, r(5)) });
  {   // o bloco sempre termina com ela de volta no Módulo: se não couber, encurta a parada mais longa
    let tot = 0, c0: P = casa;
    for (const pp of plano) { const a = pp.tipo === 'casa' ? casa : pp.tipo === 'obra' ? alvoObra! : (alvoPraca ?? casa); tot += dist(c0, a) / v + pp.dur; c0 = a; }
    tot += dist(c0, casa) / v;
    if (tot > BL - 5) plano[1].dur = Math.max(20, plano[1].dur - (tot - (BL - 5)));
  }
  let cur: P = casa;
  for (const pp of plano) {
    const alvo = pp.tipo === 'casa' ? casa : pp.tipo === 'obra' ? alvoObra! : (alvoPraca ?? casa);
    const len = dist(cur, alvo), ida = len / v;
    if (u < ida) { const k = u / ida; return { x: cur.x + (alvo.x - cur.x) * k, y: cur.y + (alvo.y - cur.y) * k, andando: true, dir: (alvo.x < cur.x ? -1 : 1) as 1 | -1, trabalhando: false }; }
    u -= ida;
    const parado = (tt2: number) => perambular(alvo, pp.tipo === 'obra' ? 16 : 8, pp.tipo === 'obra' ? 4 : 3, 0, tt2, v, 9100 + i, bloco, pp.tipo.length);
    if (u < pp.dur) { const q = parado(u); return { ...q, trabalhando: pp.tipo === 'obra' && !q.andando }; }
    const fim = parado(pp.dur - 1e-3);   // a próxima caminhada sai de onde ela estava de fato
    u -= pp.dur; cur = { x: fim.x, y: fim.y };
  }
  const len = dist(cur, casa), volta = len / v;   // volta para o Módulo até o bloco acabar
  const k = clamp(u / Math.max(0.01, volta));
  return { x: cur.x + (casa.x - cur.x) * k, y: cur.y + (casa.y - cur.y) * k, andando: k < 1, dir: (casa.x < cur.x ? -1 : 1) as 1 | -1, trabalhando: false };
}

// ------------------------------------------------------------------ robôs de carga da oficina
/** Viagens com carga e descarga de tempos diferentes, às vezes uma parada para recarregar. */
export function situacaoRobo(i: number, de: P, para: P, agoraS: number) {
  const BL = 180, tt = agoraS + i * 71, bloco = Math.floor(tt / BL);
  let u = tt - bloco * BL;
  const r = (n: number) => h01(7000 + i, bloco, n), v = 15 + i * 2, viagem = dist(de, para) / v;
  const passos: { k: 'carrega' | 'vai' | 'descarrega' | 'volta' | 'recarga'; dur: number }[] = [];
  let usado = 0;
  for (let j = 0; j < 12; j++) {
    const viagemToda = [{ k: 'carrega' as const, dur: entre(4, 14, r(j * 5 + 1)) }, { k: 'vai' as const, dur: viagem },
                        { k: 'descarrega' as const, dur: entre(3, 10, r(j * 5 + 2)) }, { k: 'volta' as const, dur: viagem }];
    if (r(j * 5 + 3) < 0.3) viagemToda.push({ k: 'recarga' as const, dur: entre(10, 35, r(j * 5 + 4)) } as never);
    const d = viagemToda.reduce((a, x) => a + x.dur, 0);
    if (usado + d > BL) break;
    passos.push(...viagemToda); usado += d;
  }
  passos.push({ k: 'recarga', dur: BL - usado + 1 });   // o resto do bloco: recarregando na oficina
  for (const p of passos) {
    if (u < p.dur) {
      const k = p.k === 'vai' ? u / p.dur : p.k === 'volta' ? 1 - u / p.dur : p.k === 'descarrega' ? 1 : 0;
      const x = de.x + (para.x - de.x) * k, y = de.y + (para.y - de.y) * k;
      const balanco = p.k === 'carrega' || p.k === 'descarrega' ? Math.sin(agoraS * 6 + i) * 0.6 : 0;
      return { x: x + balanco, y, dir: ((p.k === 'volta' ? de.x - para.x : para.x - de.x) < 0 ? -1 : 1) as 1 | -1,
               carregado: p.k === 'vai' || p.k === 'carrega', andando: p.k === 'vai' || p.k === 'volta', recarga: p.k === 'recarga' };
    }
    u -= p.dur;
  }
  return { x: de.x, y: de.y, dir: 1 as 1 | -1, carregado: false, andando: false, recarga: true };
}

// ------------------------------------------------------------------ andarilhos (sem casa)
/** Quem chegou pelos comentários e ainda não tem casa: zanza em volta da base, para, senta, olha, segue. */
export function situacaoAndarilho(seed: number, i: number, centro: P, agoraS: number) {
  const BL = 400, tt = agoraS + (seed % 397), bloco = Math.floor(tt / BL);
  const v = 8 + h01(seed, 3) * 4;
  // cada bloco tem o seu "ponto de interesse" (o largo de um lado da base), e o andarilho perambula por ali
  const focoDe = (b: number) => { const a = h01(seed, b, 1) * Math.PI * 2, d = (3 + h01(seed, b, 2) * 6) * CASA;
    return { x: centro.x + Math.cos(a) * d, y: centro.y + Math.sin(a) * d * 0.7 }; };
  const foco = focoDe(bloco), focoAnt = focoDe(bloco - 1);
  const IDA = 40;   // a travessia leva sempre 40 s (passo calmo): assim dá para saber onde o bloco anterior terminou
  const fim = perambular(focoAnt, 2.2 * CASA, 1.2 * CASA, IDA, BL, v, seed, bloco - 1, i);
  const antes = { x: fim.x, y: fim.y };
  const u = tt - bloco * BL, ida = IDA;
  if (u < ida) { const k = u / ida; return { x: antes.x + (foco.x - antes.x) * k, y: antes.y + (foco.y - antes.y) * k, andando: true, dir: (foco.x < antes.x ? -1 : 1) as 1 | -1 }; }
  return perambular(foco, 2.2 * CASA, 1.2 * CASA, ida, u, v, seed, bloco, i);
}

// ------------------------------------------------------------------ achados no solo de Marte
export type Achado = { x: number; y: number; tipo: 'cristal' | 'meteorito' | 'fossil' | 'gelo' | 'rocha'; desde: number; id: number };
const TIPOS_ACHADO: Achado['tipo'][] = ['cristal', 'meteorito', 'fossil', 'gelo', 'rocha', 'rocha'];
/**
 * O que os colonos acharam cavando nas últimas 3 h (fica no chão onde cavaram). Só de quem tem cargo explorador
 * (EXPLORAM) e dos colonos passados em `ids` (os que o mapa já carregou).
 */
export function achados(ids: number[], total: number, agoraS: number, praca: Lugar | null, obra: Lugar | null, cantina: Lugar | null): Achado[] {
  const out: Achado[] = [];
  for (const id of ids) {
    if (!(EXPLORAM[CARGOS.get(id) ?? ''] ?? 0.04)) continue;
    const desl = h01(id, 5) * BLOCO_S, tt = agoraS + desl, b0 = Math.floor(tt / BLOCO_S);
    for (let b = b0; b > b0 - 12; b--) {
      const plano = agenda(id, total, b, praca, obra, cantina);
      for (const tr of plano) {
        if (tr.k !== 'fica' || tr.p.tipo !== 'escava') continue;
        const fim = b * BLOCO_S - desl + tr.t1;
        if (fim > agoraS || agoraS - fim > 2 * 3600) continue;
        if (h01(id, b, Math.round(tr.t0), 81) > 0.4) continue;          // nem toda escavação acha algo
        out.push({ x: tr.p.ponto.x + 5, y: tr.p.ponto.y + 1, tipo: TIPOS_ACHADO[Math.floor(h01(id, b, 82) * TIPOS_ACHADO.length)], desde: fim, id });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ melhorias da casa (feitas no quintal)
const DIA0 = Date.UTC(2026, 10, 20) / 1000;   // estreia da série
/** Quantas melhorias a casa já ganhou (0–6): uma em alguns dias, sempre no horário em que o dono reformou. */
export function melhoriasDaCasa(id: number, agoraS: number): number {
  let n = 0;
  const dias = Math.floor((agoraS - DIA0) / 86400);
  for (let d = 0; d <= dias && n < 6; d++) {
    if (h01(id, d, 91) < 0.45 && DIA0 + d * 86400 + h01(id, d, 92) * 86400 <= agoraS) n++;
  }
  return n;
}
