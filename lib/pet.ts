/**
 * Vida do Pet do Colono no "Mundo ao vivo" — sem servidor, só pelo relógio (todo mundo vê a mesma cena).
 *
 * Cada pet tem um "dia" de CICLO_S segundos, com o horário próprio (deslocado pelo id do dono):
 *   brinca pelo quintal → fome aperta → vai até a tigela e come → brinca → xixi → brinca → cocô → cochilo.
 * O xixi deixa uma poça que seca; o cocô fica no quintal até o dono limpar (e encher a tigela) no cochilo.
 * Quando o dono sai de casa (visita, praça, cantina, obra, passeio), o pet vai junto: anda atrás dele e,
 * quando o dono para, fica por perto (senta, coça a orelha, abana o rabo). Mora na cápsula, se o dono tiver uma.
 */
import { moradiaDe } from '@/lib/mundo';

export const CICLO_S = 96;
const CASA = 16;

export type AcaoPet = 'brincando' | 'indo comer' | 'comendo' | 'indo fazer xixi' | 'fazendo xixi'
  | 'indo fazer cocô' | 'fazendo cocô' | 'dormindo' | 'passeando com o dono' | 'junto com o dono';

/** Pose do desenho (fabrica/pet.js). */
export type PosePet = 'parado' | 'andando' | 'correndo' | 'sentado' | 'pulando' | 'comendo' | 'xixi' | 'coco' | 'dormindo' | 'cocando';

export type SituacaoPet = {
  x: number; y: number; dir: 1 | -1;
  pose: PosePet;
  bola: { x: number; y: number; alt: number } | null;   // bolinha de brinquedo (quando brinca de buscar)
  andando: boolean; pulo: number;        // pulo: altura (px) quando brinca
  acao: AcaoPet;
  emote: string | null;
  fome: number;                          // 0 = de barriga cheia … 1 = morrendo de fome
  bexiga: number;                        // 0 … 1 (vontade de fazer xixi)
  tigela: { x: number; y: number; racao: number };   // racao: 0 (vazia) … 1 (cheia)
  poca: { x: number; y: number; seca: number } | null;  // seca: 0 (molhada) … 1 (sumiu)
  coco: { x: number; y: number } | null;
};

function h01(...n: number[]): number {
  let x = 2166136261;
  for (const v of n) { x ^= v | 0; x = Math.imul(x, 16777619); x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995); x ^= x >>> 15; }
  return (x >>> 0) / 4294967296;
}
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const suave = (k: number) => (k = clamp(k), k * k * (3 - 2 * k));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// rotina dentro do ciclo (segundos): [início, fim, ação]
const COMER = [24, 28, 36] as const;    // sai para a tigela, chega, termina de comer
const XIXI = [54, 57, 60] as const;
const COCO = [72, 75, 79] as const;
const DORME = [84, CICLO_S] as const;

type Casa = { x: number; y: number; grande: boolean };
/** Ponto aleatório (estável) no quintal — a faixa em frente à casinha (ou à cápsula, que é 2x2 e tem quintal maior). */
function pontoNoQuintal(c: Casa, ...sal: number[]) {
  return c.grande
    ? { x: c.x * CASA + 2 + h01(...sal, 1) * 28, y: c.y * CASA + 32 + h01(...sal, 2) * 4 }
    : { x: c.x * CASA + 2 + h01(...sal, 1) * 12, y: c.y * CASA + 13 + h01(...sal, 2) * 4 };
}

/**
 * Onde o pet está e o que está fazendo agora.
 * `dono(t)`: posição do dono no instante t (segundos), ou null se o dono está em casa / fora da tela.
 */
export function situacaoPet(idDono: number, agoraS: number,
                            dono?: (t: number) => { x: number; y: number; dir: 1 | -1; fora: boolean; andando: boolean } | null): SituacaoPet {
  const c = moradiaDe(idDono);
  const off = h01(idDono, 7) * CICLO_S;
  const t = agoraS + off;
  const ciclo = Math.floor(t / CICLO_S);
  const f = t - ciclo * CICLO_S;

  const tigela = c.grande ? { x: c.x * CASA + 4, y: c.y * CASA + 34 } : { x: c.x * CASA + 3, y: c.y * CASA + 15 };
  const xixiEm = pontoNoQuintal(c, idDono, ciclo, 30);
  const cocoEm = pontoNoQuintal(c, idDono, ciclo, 40);

  // necessidades: a fome cresce desde a última refeição; a bexiga desde o último xixi
  const desdeComer = (f - COMER[2] + CICLO_S) % CICLO_S;
  const fome = f >= COMER[1] && f < COMER[2] ? 1 - (f - COMER[1]) / (COMER[2] - COMER[1]) : clamp(desdeComer / (CICLO_S - 8));
  const desdeXixi = (f - XIXI[2] + CICLO_S) % CICLO_S;
  const bexiga = f >= XIXI[1] && f < XIXI[2] ? 1 - (f - XIXI[1]) / (XIXI[2] - XIXI[1]) : clamp(desdeXixi / (CICLO_S - 6));
  // ração: o dono enche a tigela durante o cochilo; o pet esvazia comendo
  const racao = f < COMER[1] ? 1 : f < COMER[2] ? 1 - (f - COMER[1]) / (COMER[2] - COMER[1]) : f < DORME[0] ? 0 : 1;

  // poça do xixi: seca em 25 s · cocô: fica no quintal até o dono limpar (enquanto o pet cochila)
  const sXixi = f - XIXI[2] >= 0 ? f - XIXI[2] : null;
  const poca = sXixi !== null && sXixi < 25 ? { ...xixiEm, seca: sXixi / 25 } : null;
  const coco: SituacaoPet['coco'] = f >= COCO[2] && f < DORME[0] + 6 ? cocoEm : null;

  // brincadeira: um alvo novo a cada 4 s, com um pulinho de vez em quando
  // cada trecho de 4 s é uma brincadeira: buscar a bolinha (corre), dar uma volta (anda) ou ficar por ali;
  // parado, ele senta, fica de pé abanando o rabo, coça a orelha ou dá pulinhos
  const brincar = (sal: number) => {
    const j = Math.floor(f / 4), fr = (f / 4) - j;
    const de = pontoNoQuintal(c, idDono, ciclo, j - 1, sal), para = pontoNoQuintal(c, idDono, ciclo, j, sal);
    const jogo = h01(idDono, ciclo, j, 11), busca = jogo < 0.45;
    const k = suave(busca ? (fr - 0.08) / 0.35 : fr / 0.6);
    const dir = (Math.abs(para.x - de.x) < 0.5 ? (h01(idDono, j, 12) < 0.5 ? -1 : 1) : para.x < de.x ? -1 : 1) as 1 | -1;
    const pula = h01(idDono, ciclo, j, 9) < 0.25 && k >= 1 ? Math.abs(Math.sin(f * 7)) * 3 : 0;
    const quieto = h01(idDono, ciclo, j, 13);
    const pose: PosePet = k < 1 ? (busca ? 'correndo' : 'andando') : pula > 0 ? 'pulando'
      : quieto < 0.45 ? 'sentado' : quieto < 0.8 ? 'parado' : 'cocando';
    const x = lerp(de.x, para.x, k), y = lerp(de.y, para.y, k);
    let bola: SituacaoPet['bola'] = null;
    if (busca) {   // a bolinha sai quicando na frente e chega antes; depois ele fica com ela na boca
      const kb = suave(fr / 0.25);
      bola = k >= 1 ? { x: x + dir * 5, y: y - 1, alt: pose === 'sentado' ? 4 : 2 }
        : { x: lerp(de.x, para.x, kb) + dir * 3, y: lerp(de.y, para.y, kb), alt: Math.abs(Math.sin(fr * 30)) * 4 * (1 - kb) };
    }
    return { x, y, dir, andando: k < 1, pulo: pula, pose, bola };
  };
  const ir = (de: { x: number; y: number }, para: { x: number; y: number }, a: number, b: number) => {
    const k = suave((f - a) / (b - a));
    return { x: lerp(de.x, para.x, k), y: lerp(de.y, para.y, k), dir: (para.x < de.x ? -1 : 1) as 1 | -1, andando: k < 1, pulo: 0,
             pose: (k < 1 ? 'andando' : 'parado') as PosePet, bola: null };
  };

  const base = { fome, bexiga, tigela: { ...tigela, racao }, poca, coco };
  const janela = Math.floor(agoraS / 2.2);

  // o dono saiu de casa: o pet vai junto para onde ele for (visita, praça, cantina, obra, passeio)
  const d = dono?.(agoraS - 0.9);
  if (d && d.fora) {
    const coracao = h01(idDono, janela, 3) < 0.2 ? (h01(idDono, janela, 4) < 0.5 ? '❤️' : '🐾') : null;
    if (d.andando) {   // um pouco atrás, pisando onde o dono pisou
      return { ...base, x: d.x - d.dir * 6, y: d.y + 1, dir: d.dir, andando: true, pulo: 0, pose: 'andando', bola: null,
               acao: 'passeando com o dono', emote: coracao };
    }
    // o dono parou: fica do lado dele, trocando de pose de vez em quando (e às vezes dá uma voltinha)
    const j = Math.floor(agoraS / 3), lado = h01(idDono, j, 14) < 0.5 ? -1 : 1;
    const x = d.x + lado * (6 + h01(idDono, j, 15) * 4), y = d.y + 1 + h01(idDono, j, 16) * 2;
    const r = h01(idDono, j, 17);
    const pose: PosePet = r < 0.4 ? 'sentado' : r < 0.7 ? 'parado' : r < 0.85 ? 'cocando' : 'pulando';
    return { ...base, x, y, dir: (d.x < x ? -1 : 1) as 1 | -1, andando: false, pulo: pose === 'pulando' ? Math.abs(Math.sin(agoraS * 7)) * 3 : 0,
             pose, bola: null, acao: 'junto com o dono', emote: coracao };
  }

  const antes = brincar(0);
  if (f >= COMER[0] && f < COMER[1]) return { ...base, ...ir(antes, tigela, COMER[0], COMER[1]), acao: 'indo comer', emote: '🍖' };
  if (f >= COMER[1] && f < COMER[2]) return { ...base, ...tigela, x: tigela.x + 6, y: tigela.y + 1, dir: -1, andando: false, pulo: 0,
                                              pose: 'comendo', bola: null, acao: 'comendo', emote: h01(idDono, janela, 5) < 0.5 ? '😋' : null };
  if (f >= XIXI[0] && f < XIXI[1]) return { ...base, ...ir(antes, xixiEm, XIXI[0], XIXI[1]), acao: 'indo fazer xixi', emote: '💦' };
  if (f >= XIXI[1] && f < XIXI[2]) return { ...base, ...xixiEm, x: xixiEm.x + 3, dir: 1, andando: false, pulo: 0, pose: 'xixi', bola: null, acao: 'fazendo xixi', emote: null };
  if (f >= COCO[0] && f < COCO[1]) return { ...base, ...ir(antes, cocoEm, COCO[0], COCO[1]), acao: 'indo fazer cocô', emote: '😣' };
  if (f >= COCO[1] && f < COCO[2]) return { ...base, ...cocoEm, x: cocoEm.x + 4, dir: 1, andando: false, pulo: 0, pose: 'coco', bola: null, acao: 'fazendo cocô', emote: '💩' };
  if (f >= DORME[0]) {
    const cama = c.grande ? { x: c.x * CASA + 27, y: c.y * CASA + 33 } : { x: c.x * CASA + 13, y: c.y * CASA + 14 };
    if (f < DORME[0] + 2) return { ...base, ...ir(antes, cama, DORME[0], DORME[0] + 2), acao: 'dormindo', emote: null };
    return { ...base, ...cama, dir: -1, andando: false, pulo: 0, pose: 'dormindo', bola: null, acao: 'dormindo', emote: Math.floor(f) % 3 === 0 ? null : '💤' };
  }
  // brincando: às vezes pede carinho, às vezes reclama de fome
  const emote = fome > 0.75 && h01(idDono, janela, 6) < 0.4 ? '🍖'
    : h01(idDono, janela, 6) < 0.08 ? (h01(idDono, janela, 8) < 0.5 ? '🎾' : '❤️') : null;
  return { ...base, ...antes, acao: 'brincando', emote };
}

export function descricaoPet(s: SituacaoPet): string {
  const fome = s.fome > 0.75 ? 'com muita fome' : s.fome > 0.45 ? 'com um pouco de fome' : 'de barriga cheia';
  return `${s.acao} · ${fome}`;
}
