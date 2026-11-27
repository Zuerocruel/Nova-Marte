'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { gerarSprite } from '@/lib/sprite';
import {
  CENTRO, CHUNK, LIMITE_CHUNKS, VILA, anelMaximo, definirMoradias, ehCasa, idDoCodigo, limitesDoBairro, moradiaDe, noBairro, ruaEm,
  type PersonagemPublico,
} from '@/lib/mundo';
import {
  BLOCO, CASA, COR, TRILHA_DUNAS_DESDE, blocoDeTerreno, crateraBatizada, desenharBase, desenharClima, desenharObra, desenharPraca,
  desenharTrilha, desenharTrilhaDunas, fontePixel,
  desenharBandeira, desenharCapsulaGrande, desenharComercio, desenharFoguete, desenharOutdoor, desenharRover,
  disco, iconeDoProduto, spriteContornado, spriteEstatua, spriteMapa,
} from '@/lib/colonia-arte';
import { achados, definirLugares, melhoriasDaCasa, registrarCargo, situacao, situacaoAndarilho, situacaoFundador, situacaoRobo,
         virarParaConversar, type Achado, type Situacao } from '@/lib/vida';
import { descricaoPet, situacaoPet } from '@/lib/pet';
import { desenharBola, desenharPet } from '@/lib/pet-arte';
import { cargoDe } from '@/lib/cargos';
import type { EstadoColonia } from '@/lib/colonia';
import LojaModal from './LojaModal';
import { liderancaDe, nomeComTitulo, vestirTraje, type Lideranca } from '@/lib/liderancas';

// trajes da loja de moedas (slug → traje), carregados uma vez; o cargo de liderança tem prioridade sobre eles
const TRAJES_LOJA = new Map<string, Lideranca>();
let trajesPedidos = false;
function trajeDaLoja(slug?: string | null): Lideranca | null {
  if (!slug) return null;
  if (!trajesPedidos && typeof window !== 'undefined') {
    trajesPedidos = true;
    fetch('/api/loja-moedas').then((r) => r.json()).then((d) => {
      for (const it of d.itens ?? []) TRAJES_LOJA.set(it.slug, { id: 'loja-' + it.slug, traje: it.traje, acessorios: it.traje.acessorios ?? [], cor: it.traje.cor ?? it.traje.detalhe ?? '#ffc83d' } as unknown as Lideranca);
    }).catch(() => {});
  }
  return TRAJES_LOJA.get(slug) ?? null;
}
import BotaoComentar from './BotaoComentar';
import type { MensagemChat } from '@/app/api/chat/route';

/**
 * Mundo ao vivo: a colônia como no vídeo (módulo de pouso, praça, obras, Vega e Lia trabalhando, clima da
 * estação) + o bairro em espiral com a casa de cada colono. Os colonos vivem (lib/vida.ts): se visitam,
 * se encontram na praça, ajudam na obra e passeiam pelas ruas, conversando com balões. Quem escreve no
 * rádio ganha um balão com a mensagem. Tudo segue o relógio: todo mundo vê a mesma cena.
 */
const RECARREGA_MS = 30_000;
// cor da rede de onde o andarilho veio (remendo na mochila e quadradinho antes do @), igual ao vídeo
const COR_REDE: Record<string, string> = { youtube: '#ff3b3b', instagram: '#e1306c', tiktok: '#25f4ee' };
const ZOOM_MIN = 0.2, ZOOM_MAX = 8;   // 0.2: o hexágono inteiro cabe na tela

// ---- mapa em HEXÁGONO (bordas arredondadas, minimalista): a colônia mora dentro; fora é o espaço.
// Raio em casas: no mínimo 110 (bem maior que o bairro de hoje) e cresce junto com o bairro.
export const raioHex = (total: number) => Math.max(110, Math.ceil((limitesDoBairro(Math.max(total, 1)).x1 - CENTRO.x) * 1.6) + 30);
// A colônia mora no fundo de uma CRATERA: a borda é irregular (raio que ondula com o ângulo), com a encosta
// clara por dentro; fora fica o planalto escuro. raioHex continua sendo o raio médio (limite da câmera).
const raioBorda = (a: number, r: number) => r * (1 + 0.05 * Math.sin(3 * a + 0.7) + 0.035 * Math.sin(5 * a + 2.1) + 0.02 * Math.sin(9 * a + 4));
function caminhoHex(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2, rr = raioBorda(a, r);
    if (i) ctx.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); else ctx.moveTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
  }
  ctx.closePath();
}
function dentroDoHex(x: number, y: number, cx: number, cy: number, r: number) {
  return Math.hypot(x - cx, y - cy) <= raioBorda(Math.atan2(y - cy, x - cx), r);
}
const BALAO_MS = 7_000;   // quanto tempo a fala do rádio fica no balão em cima do colono

/** Quebra o texto em até `max` linhas de no máximo `largura` px (a última ganha "…" se sobrar texto). */
function quebrarLinhas(ctx: CanvasRenderingContext2D, texto: string, largura: number, max: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of texto.split(' ')) {
    const tenta = atual ? `${atual} ${palavra}` : palavra;
    if (ctx.measureText(tenta).width <= largura || !atual) { atual = tenta; continue; }
    linhas.push(atual); atual = palavra;
  }
  if (atual) linhas.push(atual);
  const saida = linhas.slice(0, max).map((l) => {
    while (l.length > 1 && ctx.measureText(l).width > largura) l = l.slice(0, -1);
    return l;
  });
  if (linhas.length > max || saida.some((l, i) => l !== linhas[i])) {
    let u = saida[saida.length - 1];
    while (u.length > 1 && ctx.measureText(u + '…').width > largura) u = u.slice(0, -1);
    saida[saida.length - 1] = u.trimEnd() + '…';
  }
  return saida;
}

type Chunk = { dados: PersonagemPublico[]; em: number } | 'carregando';
type Pessoa = { p: PersonagemPublico; id: number; s: Situacao };

const TELHADOS = ['#e04f5f', '#3f8efc', '#2bb673', '#f4b400', '#9b59b6', '#ff7f50', '#00b8a9', '#ec407a'];

const spritesColono = new Map<number, HTMLCanvasElement>();
const spritesLider = new Map<string, HTMLCanvasElement>();
function spriteColono(seed: number, lideranca?: string | null, trajeMoedas?: string | null): HTMLCanvasElement {
  const lid = liderancaDe(lideranca) ?? trajeDaLoja(trajeMoedas);
  const k = lid ? `${seed}:${lid.id}` : '';
  let c = lid ? spritesLider.get(k) : spritesColono.get(seed);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 12;
    const x = c.getContext('2d')!;
    vestirTraje(gerarSprite(seed), lid).forEach((l, j) => l.forEach((cor, i) => { if (cor) { x.fillStyle = cor; x.fillRect(i, j, 1, 1); } }));
    if (lid) spritesLider.set(k, c); else spritesColono.set(seed, c);
  }
  return c;
}

/** Fio de energia discreto, rente ao chão, com um pulsinho de luz indo da fonte até a casa. */
function desenharFio(ctx: CanvasRenderingContext2D, casa: { pos_x: number; pos_y: number }, para: { x: number; y: number }, t: number) {
  const ax = casa.pos_x * CASA + 8, ay = casa.pos_y * CASA + 12;
  const bx = para.x * CASA, by = para.y * CASA;
  const dist = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(dist / 1.2));
  ctx.fillStyle = 'rgba(46,30,48,0.5)';
  for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(ax + (bx - ax) * i / n), Math.round(ay + (by - ay) * i / n), 1, 1);
  const k = ((((t * 28) / Math.max(dist, 1) + casa.pos_x * 0.37 + casa.pos_y * 0.71) % 1) + 1) % 1;
  ctx.fillStyle = 'rgba(255,216,90,0.75)';
  ctx.fillRect(Math.round(bx + (ax - bx) * k), Math.round(by + (ay - by) * k), 1, 1);
}

/** Casinha do lote (cúpula com a porta e uma janela acesa quando tem gente em casa). */
function desenharCasinha(ctx: CanvasRenderingContext2D, cx: number, cy: number, seed: number, temGente: boolean, melhorias = 0) {
  const x = cx * CASA, y = cy * CASA;
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + 1, y + 12, 12, 2);
  if (melhorias >= 5) { ctx.fillStyle = '#8a6a52'; for (let i = 0; i < 4; i++) ctx.fillRect(x - 1 + i * 4, y + 13, 1, 2); ctx.fillRect(x - 1, y + 13, 14, 1); }   // cerquinha
  disco(ctx, x + 7, y + 8, 6, '#6b6f86');
  disco(ctx, x + 7, y + 8, 5, '#e4e6f0');
  ctx.fillStyle = TELHADOS[seed % TELHADOS.length]; ctx.fillRect(x + 2, y + 8, 11, 2);
  ctx.fillStyle = '#3a2f63'; ctx.fillRect(x + 6, y + 9, 3, 4);
  ctx.fillStyle = temGente ? '#ffe58a' : '#2b2350'; ctx.fillRect(x + 4, y + 5, 2, 2);
  if (melhorias >= 1) { ctx.fillStyle = '#a0613f'; ctx.fillRect(x + 11, y + 11, 2, 2); ctx.fillStyle = '#4ed37a'; ctx.fillRect(x + 10, y + 9, 2, 2); ctx.fillRect(x + 12, y + 10, 1, 1); }   // vaso
  if (melhorias >= 2) { ctx.fillStyle = '#9aa0b5'; ctx.fillRect(x + 9, y, 1, 3); ctx.fillStyle = '#e2603b'; ctx.fillRect(x + 9, y - 1, 1, 1); }   // antena
  if (melhorias >= 3) { ctx.fillStyle = '#3a5fb8'; ctx.fillRect(x + 3, y + 2, 3, 2); ctx.fillStyle = '#8fb0ff'; ctx.fillRect(x + 3, y + 2, 1, 1); }   // placa solar
  if (melhorias >= 4) { ctx.fillStyle = '#ffe58a'; ctx.fillRect(x + 1, y + 10, 1, 2); }   // lanterna na entrada
  if (melhorias >= 6) { ctx.fillStyle = '#6b6f86'; ctx.fillRect(x + 12, y + 1, 1, 6); ctx.fillStyle = TELHADOS[(seed + 3) % TELHADOS.length]; ctx.fillRect(x + 13, y + 1, 3, 2); }   // bandeirinha
}

/** Achado no solo (cristal, meteorito, fóssil, gelo, rocha): o recente pisca por 20 s. */
function desenharAchado(ctx: CanvasRenderingContext2D, a: Achado, agoraS: number, t: number) {
  const x = Math.round(a.x), y = Math.round(a.y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 2, y, 5, 1);
  ctx.fillStyle = '#7a3520'; ctx.fillRect(x - 3, y - 1, 7, 1);   // terra revirada
  const cor = { cristal: ['#b07cff', '#e6d4ff'], meteorito: ['#3a3048', '#ff9a4a'], fossil: ['#e8d8b0', '#b8a070'], gelo: ['#bff0ff', '#ffffff'], rocha: ['#8f6a52', '#c49a7a'] }[a.tipo];
  ctx.fillStyle = cor[0]; ctx.fillRect(x - 1, y - 3, 3, 3);
  ctx.fillStyle = cor[1]; ctx.fillRect(x - 1, y - 3, 1, 1);
  if (a.tipo === 'cristal') { ctx.fillStyle = cor[0]; ctx.fillRect(x, y - 5, 1, 2); }
  if (agoraS - a.desde < 20 && Math.floor(t * 5) % 2) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 2, y - 6, 1, 1); ctx.fillRect(x - 3, y - 5, 1, 1); }
}

export default function Mundo({ codigoInicial, novo, mensagens = [], online = [], onlineN, chat, chatAberto = false, aoChat, naoLidas = 0 }: {
  codigoInicial?: string; novo?: boolean; mensagens?: MensagemChat[]; online?: string[];
  /** quantos estão online agora (barra de notícias) */
  onlineN?: number;
  /** o Rádio da colônia: fica numa gaveta dentro do mapa, aberta pelo botão roxo */
  chat?: React.ReactNode; chatAberto?: boolean; aoChat?: () => void; naoLidas?: number;
}) {
  const onlineRef = useRef(new Set<string>());
  onlineRef.current = new Set(online);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ x: 0, y: 0, zoom: 3, pronta: false });
  const chunks = useRef(new Map<string, Chunk>());
  const terreno = useRef(new Map<string, HTMLCanvasElement>());
  const imagens = useRef(new Map<string, HTMLImageElement>());
  const selecionadoRef = useRef<PersonagemPublico | null>(null);
  const estadoRef = useRef<EstadoColonia | null>(null);
  const totalRef = useRef(0);
  const mensagensRef = useRef<MensagemChat[]>([]);
  const chegada = useRef(new Map<number, number>());   // id da mensagem → quando chegou (para o balão)
  const pessoasRef = useRef<Pessoa[]>([]);              // quem está desenhado agora (para o clique)
  const achadosCache = useRef<{ em: number; lista: Achado[] }>({ em: 0, lista: [] });
  const seguindo = useRef<string | null>(null);          // código do colono que a câmera está seguindo
  const nomes = useRef(new Map<number, string>());       // id → nome, de quem já foi carregado

  const [selecionado, setSelecionado] = useState<PersonagemPublico | null>(null);
  const [fazendo, setFazendo] = useState('');
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<PersonagemPublico[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [ultimos, setUltimos] = useState<PersonagemPublico[]>([]);
  const [estado, setEstado] = useState<EstadoColonia | null>(null);
  const [telaCheia, setTelaCheia] = useState(false);
  const [visitante, setVisitante] = useState(false);       // não está logado: convite "crie o seu boneco"
  const [conviteFechado, setConviteFechado] = useState(false);

  useEffect(() => {
    fetch('/api/sessao').then((r) => r.json()).then((j) => setVisitante(!j.colono)).catch(() => {});
  }, []);
  // tela cheia: trava a rolagem da página e fecha com Esc
  useEffect(() => {
    if (!telaCheia) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setTelaCheia(false); };
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = antes; window.removeEventListener('keydown', esc); };
  }, [telaCheia]);

  useEffect(() => {
    const agora = performance.now();
    // mensagem recém-escrita (menos de 30 s, já contando a espera da atualização do chat) ganha o balão
    // inteiro de 7 s a partir de quando chega na tela; as antigas do histórico não aparecem
    for (const m of mensagens) if (!chegada.current.has(m.id)) {
      const idade = Date.now() - Date.parse(m.em);
      chegada.current.set(m.id, idade < 30_000 ? agora : -1e9);
    }
    mensagensRef.current = mensagens;
  }, [mensagens]);

  const centralizarEm = useCallback((wx: number, wy: number, zoomMin = 0) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const c = cam.current;
    c.zoom = Math.max(c.zoom, zoomMin);
    c.x = wx - cv.clientWidth / 2 / c.zoom;
    c.y = wy - cv.clientHeight / 2 / c.zoom;
    c.pronta = true;
  }, []);

  const selecionar = useCallback((p: PersonagemPublico | null, centralizar = true) => {
    selecionadoRef.current = p;
    setSelecionado(p);
    if (p && centralizar) { const m = moradiaDe(idDoCodigo(p.codigo)); centralizarEm((m.x + (m.grande ? 1 : 0.5)) * CASA, (m.y + (m.grande ? 1 : 0.5)) * CASA, 4); }
    seguindo.current = p ? p.codigo : null;   // achou alguém (busca ou clique): a câmera vai junto com ele
  }, [centralizarEm]);

  // ---------- dados ----------
  const carregarChunk = useCallback(async (cx: number, cy: number) => {
    const k = `${cx},${cy}`;
    const atual = chunks.current.get(k);
    if (atual === 'carregando') return;
    if (atual && Date.now() - atual.em < RECARREGA_MS) return;
    if (!atual) chunks.current.set(k, 'carregando');
    try {
      const r = await fetch(`/api/mundo/area?cx=${cx}&cy=${cy}`);
      const dados: PersonagemPublico[] = await r.json();
      if (!r.ok || !Array.isArray(dados)) throw new Error('quarteirão não veio');
      for (const p of dados) { nomes.current.set(idDoCodigo(p.codigo), p.nome); registrarCargo(idDoCodigo(p.codigo), p.cargo); }
      chunks.current.set(k, { dados, em: Date.now() });
    } catch {
      // falhou: quem já estava no mapa continua lá (tenta de novo em ~5 s); sem nada ainda, tenta no próximo quadro
      if (atual) chunks.current.set(k, { dados: atual.dados, em: Date.now() - RECARREGA_MS + 5_000 });
      else chunks.current.delete(k);
    }
  }, []);

  useEffect(() => {
    const resumo = () =>
      fetch('/api/mundo/resumo').then((r) => r.json()).then((j) => {
        setTotal(j.total);
        setUltimos(j.ultimos ?? []);
        if (anelMaximo(j.total) !== anelMaximo(totalRef.current)) terreno.current.clear();   // o bairro ganhou um anel
        totalRef.current = j.total;
      }).catch(() => {});
    const colonia = () =>
      fetch('/api/colonia').then((r) => r.json()).then((j) => {
        if (j && j.base) {
          definirMoradias((j.capsulas ?? []).map((k: { codigo: string; x: number; y: number }) => ({ id: idDoCodigo(k.codigo), x: k.x, y: k.y })));
          estadoRef.current = j; setEstado(j);
          const lugares: Record<string, { x: number; y: number; w: number; h: number }> = { base: j.base };
          if (j.praca) lugares.praca = j.praca;
          for (const o of j.obras ?? []) {
            if (o.status === 'concluida') lugares[o.slug] = { x: o.x, y: o.y, w: o.w, h: o.h };
            else if (!lugares['@obra']) lugares['@obra'] = { x: o.x, y: o.y, w: o.w, h: o.h };
          }
          definirLugares(lugares);   // postos de trabalho dos cargos (lib/vida.ts)
        }
      }).catch(() => {});
    resumo(); colonia();
    const t1 = setInterval(resumo, 15_000), t2 = setInterval(colonia, 30_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  async function buscar(texto: string, focarPrimeiro = false) {
    if (texto.trim().length < 2) { setResultados(null); return; }
    const r = await fetch(`/api/mundo/busca?q=${encodeURIComponent(texto)}`);
    const lista: PersonagemPublico[] = await r.json().catch(() => []);
    setResultados(Array.isArray(lista) ? lista : []);
    if (focarPrimeiro && lista[0]) selecionar(lista[0]);
  }

  useEffect(() => {
    if (codigoInicial) buscar(codigoInicial, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoInicial]);

  // o que o selecionado está fazendo (atualiza a ficha)
  useEffect(() => {
    if (!selecionado) { setFazendo(''); return; }
    const atualizar = () => {
      const e = estadoRef.current;
      const obra = e?.obras.find((o) => o.status !== 'concluida') ?? null;
      const cantina = e?.obras.find((o) => o.slug === 'cantina' && o.status === 'concluida') ?? null;
      const s = situacao(idDoCodigo(selecionado.codigo), Math.max(totalRef.current, 1), Date.now() / 1000, e?.praca ?? null, obra, cantina);
      const temPet = e?.pets?.some((p) => p.codigo === selecionado.codigo);
      const id = idDoCodigo(selecionado.codigo);
      const pet = temPet ? situacaoPet(id, Date.now() / 1000, (tt) => {
        const so = situacao(id, Math.max(totalRef.current, 1), tt, e?.praca ?? null, obra, cantina);
        return { x: so.x, y: so.y, dir: so.dir, fora: so.tipo !== 'casa' && so.tipo !== 'recebe', andando: so.andando };
      }) : null;
      setFazendo(s.descricao((id) => nomes.current.get(id) ?? null) + (pet ? ` · Pet: ${descricaoPet(pet)}` : ''));
    };
    atualizar();
    const t = setInterval(atualizar, 1000);
    return () => clearInterval(t);
  }, [selecionado]);

  // ---------- desenho ----------
  useEffect(() => {
    const cv = canvasRef.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;

    const blocoTerreno = (bx: number, by: number) => {
      const k = `${bx},${by}`;
      let c = terreno.current.get(k);
      if (c) return c;
      const e = estadoRef.current;
      const n = totalRef.current;
      const reservados = e ? [e.base, ...e.obras, ...(e.praca ? [e.praca] : [])]
        .map((o) => ({ x0: o.x - 1, y0: o.y - 1, x1: o.x + o.w + 1, y1: o.y + o.h + 1 })) : [];
      const casa = (x: number, y: number) => ehCasa(x, y, n);
      const livre = (x: number, y: number) => !reservados.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)
        && !noBairro(x, y, n) && !(n > 0 && noBairro(x, y, n + 400));   // sem cratera no bairro nem logo em volta
      c = blocoDeTerreno(bx, by, livre, casa, (x, y) => ruaEm(x, y, n));
      if (terreno.current.size > 160) terreno.current.clear();
      terreno.current.set(k, c);
      return c;
    };

    const desenhar = (ms: number) => {
      const t = ms / 1000;
      const agoraS = Date.now() / 1000;          // relógio "de verdade": todos veem a mesma cena
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      }
      const e = estadoRef.current;
      const c = cam.current;
      if (!c.pronta && e && w > 0) {   // começa olhando a base, a praça e o começo do bairro
        c.zoom = w < 600 ? 1.8 : 2.4;
        c.x = (CENTRO.x + 0.5) * CASA - w / 2 / c.zoom;
        c.y = (CENTRO.y + 3) * CASA - h / 2 / c.zoom;
        c.pronta = true;
      }
      if (seguindo.current && w > 0) {   // a câmera acompanha os passos do colono clicado (suave)
        const alvo = pessoasRef.current.find((x) => x.p.codigo === seguindo.current);
        if (alvo) {
          const tx = alvo.s.x - w / 2 / c.zoom, ty = alvo.s.y - 8 - h / 2 / c.zoom;
          c.x += (tx - c.x) * 0.08; c.y += (ty - c.y) * 0.08;
        }
      }
      const { x: camX, y: camY, zoom } = c;
      const n = Math.max(totalRef.current, 0);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#b85a37';
      ctx.fillRect(0, 0, w, h);

      // ---- mundo (pixels do mundo)
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -camX * zoom * dpr, -camY * zoom * dpr);
      const vx0 = Math.floor(camX / CASA), vx1 = Math.ceil((camX + w / zoom) / CASA);
      const vy0 = Math.floor(camY / CASA), vy1 = Math.ceil((camY + h / zoom) / CASA);
      const TB = BLOCO * CASA;
      for (let by = Math.floor(vy0 / BLOCO); by <= Math.floor(vy1 / BLOCO); by++)
        for (let bx = Math.floor(vx0 / BLOCO); bx <= Math.floor(vx1 / BLOCO); bx++)
          ctx.drawImage(blocoTerreno(bx, by), bx * TB, by * TB, TB + 0.5, TB + 0.5);
      {   // fora da cratera: planalto escuro com pedras; a borda é uma encosta clara e irregular (sombra por dentro)
        const hx = (CENTRO.x + 0.5) * CASA, hy = (CENTRO.y + 0.5) * CASA, hr = raioHex(n) * CASA;
        const x0 = camX - 50, y0 = camY - 50, x1 = camX + w / zoom + 50, y1 = camY + h / zoom + 50;
        ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); caminhoHex(ctx, hx, hy, hr);
        ctx.fillStyle = '#3d1b12'; ctx.fill('evenodd');
        for (let i = 0; i < 320; i++) {   // pedras do planalto
          const sx = hx + (((i * 7919) % 4000) / 4000 - 0.5) * hr * 3.4, sy = hy + (((i * 104729) % 4000) / 4000 - 0.5) * hr * 3.4;
          if (sx > x0 && sx < x1 && sy > y0 && sy < y1 && !dentroDoHex(sx, sy, hx, hy, hr * 1.04)) {
            ctx.fillStyle = i % 3 ? '#2c130c' : '#5a2a1a'; ctx.fillRect(sx, sy, 6 + (i % 4) * 3, 4 + (i % 3) * 2);
          }
        }
        ctx.lineJoin = 'round';
        ctx.beginPath(); caminhoHex(ctx, hx, hy, hr + 30);   // encosta de fora (mais escura)
        ctx.lineWidth = 46; ctx.strokeStyle = '#5a2a1a'; ctx.stroke();
        ctx.beginPath(); caminhoHex(ctx, hx, hy, hr + 12);   // crista iluminada
        ctx.lineWidth = 22; ctx.strokeStyle = '#b8653f'; ctx.stroke();
        ctx.beginPath(); caminhoHex(ctx, hx, hy, hr + 4);
        ctx.lineWidth = 6; ctx.strokeStyle = '#d98a5c'; ctx.stroke();
        ctx.beginPath(); caminhoHex(ctx, hx, hy, hr - 14);   // sombra da encosta no fundo da cratera
        ctx.lineWidth = 26; ctx.strokeStyle = 'rgba(40,14,8,0.35)'; ctx.stroke();
      }
      if (e) for (const cr of e.crateras ?? []) {   // crateras batizadas pelos colonos
        if (cr.x < vx0 - 4 || cr.x > vx1 + 4 || cr.y < vy0 - 4 || cr.y > vy1 + 4) continue;
        crateraBatizada(ctx, cr.x * CASA + 8, cr.y * CASA + 8, cr.r, cr.id);
      }

      const obraAtual = e?.obras.find((o) => o.status !== 'concluida') ?? null;
      const cantina = e?.obras.find((o) => o.slug === 'cantina' && o.status === 'concluida') ?? null;
      const oficina = e?.obras.find((o) => o.slug === 'oficina' && o.status === 'concluida') ?? null;
      if (e) {
        desenharTrilha(ctx, e.base, e.praca ? e.praca.y : CENTRO.y + 6);
        if ((e.episodio?.numero ?? 0) >= TRILHA_DUNAS_DESDE) desenharTrilhaDunas(ctx, e.base, t);   // o que o rover achou (ep. 6)
        if (e.praca) desenharPraca(ctx, e.praca, t);
        const energia = e.obras.some((o) => o.tipo === 'solar' && o.status === 'concluida');
        for (const o of e.obras) {
          if (o.status === 'planejada' && o !== obraAtual) continue;
          desenharObra(ctx, o, { p: o.status === 'concluida' ? 1 : o.progresso / 100, dem: true, energia: o.status === 'concluida' }, e.base, t);
        }
        desenharBase(ctx, e.base, t, energia);
      }

      // casas visíveis (por quarteirão) + quem mora nelas
      const pessoas: Pessoa[] = [];
      const casas: PersonagemPublico[] = [];
      const lb = limitesDoBairro(n);
      const cx0 = Math.max(-LIMITE_CHUNKS, Math.floor(Math.max(vx0, lb.x0) / CHUNK)), cx1 = Math.min(LIMITE_CHUNKS, Math.floor(Math.min(vx1, lb.x1) / CHUNK));
      const cy0 = Math.max(-LIMITE_CHUNKS, Math.floor(Math.max(vy0, lb.y0) / CHUNK)), cy1 = Math.min(LIMITE_CHUNKS, Math.floor(Math.min(vy1, lb.y1) / CHUNK));
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++) {
          carregarChunk(cx, cy);
          const ch = chunks.current.get(`${cx},${cy}`);
          if (!ch || ch === 'carregando') continue;
          for (const p of ch.dados) {
            const id = idDoCodigo(p.codigo);
            const s = situacao(id, Math.max(n, 1), agoraS, e?.praca ?? null, obraAtual, cantina);
            const casaVisivel = p.pos_x >= vx0 - 1 && p.pos_x <= vx1 + 1 && p.pos_y >= vy0 - 1 && p.pos_y <= vy1 + 1;
            if (casaVisivel) casas.push(p);
            pessoas.push({ p, id, s });
          }
        }
      {   // quem mora na Vila das Cápsulas: carrega o chunk do lote antigo (os dados dele) mesmo fora da vista
        const ja = new Set(pessoas.map((x) => x.p.codigo));
        for (const k of e?.capsulas ?? []) {
          if (ja.has(k.codigo)) continue;
          const cx = Math.floor(k.pos_x / CHUNK), cy = Math.floor(k.pos_y / CHUNK);
          carregarChunk(cx, cy);
          const ch = chunks.current.get(`${cx},${cy}`);
          if (!ch || ch === 'carregando') continue;
          const p = ch.dados.find((d) => d.codigo === k.codigo);
          if (!p) continue;
          const id = idDoCodigo(p.codigo);
          pessoas.push({ p, id, s: situacao(id, Math.max(n, 1), agoraS, e?.praca ?? null, obraAtual, cantina) });
        }
      }
      virarParaConversar(pessoas, agoraS);   // quem está parado perto de alguém vira para ele e os dois conversam
      if (agoraS - achadosCache.current.em > 3) {
        achadosCache.current = { em: agoraS, lista: achados(pessoas.map((x) => x.id), Math.max(n, 1), agoraS, e?.praca ?? null, obraAtual, cantina) };
      }
      for (const a of achadosCache.current.lista)
        if (a.x > camX - 10 && a.x < camX + w / zoom + 10 && a.y > camY - 10 && a.y < camY + h / zoom + 10) desenharAchado(ctx, a, agoraS, t);
      const naCapsula = new Set((e?.capsulas ?? []).map((k) => k.codigo));
      void desenharFio;   // casas ligadas pelas ruas dos anéis (sem fio nem trilha torta: pedido do dono)
      // a casinha grátis some do lote de quem comprou a cápsula (o colono se mudou para a Vila)
      for (const p of casas) {
        if (naCapsula.has(p.codigo)) continue;
        const pessoa = pessoas.find((x) => x.p === p);
        desenharCasinha(ctx, p.pos_x, p.pos_y, p.seed, !!pessoa && pessoa.s.tipo === 'casa', melhoriasDaCasa(idDoCodigo(p.codigo), agoraS));
      }
      // Vila das Cápsulas: placa na entrada e uma cápsula grande (2x2) em cada lote ocupado
      if (e && e.capsulas?.length) {
        const vx = VILA.x * CASA, vy = VILA.y * CASA;
        if (vx < (vx1 + 2) * CASA && vx + 15 * CASA > (vx0 - 2) * CASA) {
          ctx.fillStyle = '#1b1530'; ctx.fillRect(vx - 22, vy - 2, 3, 18);
          ctx.fillStyle = '#6b6f86'; ctx.fillRect(vx - 21, vy - 2, 1, 18);
          ctx.fillStyle = '#1b1530'; ctx.fillRect(vx - 34, vy - 12, 27, 11);
          ctx.fillStyle = '#ffd85a'; ctx.fillRect(vx - 33, vy - 11, 25, 9);
          ctx.fillStyle = '#1b1530'; ctx.font = 'bold 3px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('VILA DAS', vx - 20.5, vy - 8.6); ctx.fillText('CÁPSULAS', vx - 20.5, vy - 4.8);
          ctx.textBaseline = 'alphabetic';
        }
        for (const k of e.capsulas) {
          if (k.x < vx0 - 3 || k.x > vx1 + 1 || k.y < vy0 - 3 || k.y > vy1 + 1) continue;
          const dono = pessoas.find((x) => x.p.codigo === k.codigo);
          const cor = TELHADOS[((dono?.p.seed ?? idDoCodigo(k.codigo)) >>> 0) % TELHADOS.length];
          desenharCapsulaGrande(ctx, k.x * CASA, k.y * CASA, k.variante, cor, !!dono && dono.s.tipo === 'casa', t);
          // a plaquinha "Cápsula do Fulano" é desenhada depois, em pixels da tela (nítida em qualquer zoom)
        }
      }

      // Vega e Lia: vão da casa até a obra, trabalham e voltam
      const atores: { x: number; y: number; desenha: () => void; nome?: string; ehFundador?: boolean }[] = [];
      if (e) e.fundadores.forEach((f, i) => {
        const casa = { x: f.casa[0] * CASA, y: f.casa[1] * CASA };
        const alvo = obraAtual
          ? { x: (obraAtual.x + obraAtual.w / 2 + (i ? 1.2 : -1.2)) * CASA, y: (obraAtual.y + obraAtual.h + 0.6) * CASA }
          : { x: casa.x + (i ? 24 : -24), y: casa.y + 10 };
        void alvo;
        // agenda própria (lib/vida.ts): obra com passos pelo canteiro, passada na praça, volta ao Módulo
        const sf = situacaoFundador(i, casa, agoraS, obraAtual, e.praca ?? null);
        const px = sf.x, py = sf.y, andando = sf.andando, dir = sf.dir, k = sf.trabalhando ? 1 : 0;
        atores.push({
          x: px, y: py, nome: f.curto, ehFundador: true,
          desenha: () => {
            const pulo = andando && Math.floor(t * 8) % 2 ? -1 : (k === 1 && Math.floor(t * 3 + i) % 2 ? -1 : 0);
            ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px - 4, py - 1, 8, 2);
            ctx.save(); ctx.translate(Math.round(px), Math.round(py + pulo)); if (dir < 0) ctx.scale(-1, 1);
            ctx.drawImage(spriteMapa(f.sprite), -6, -12, 12, 12); ctx.restore();
            if (k === 1 && obraAtual && Math.floor(t * 4 + i) % 3 === 0) { ctx.fillStyle = COR.ouro; ctx.fillRect(px + (i ? -7 : 5), py - 8, 2, 2); }
          },
        });
      });

      // itens da casa: cada tipo num canto da moradia (casinha 1x1 ou cápsula 2x2); o rover anda com o dono
      const comRover = new Set<string>(), comTraje = new Set<string>();
      if (e) {
        const porDono = new Map<string, typeof e.compras>();
        for (const cp of e.compras) {
          if (/rover/.test(cp.produto_slug)) { comRover.add(cp.codigo); continue; }
          if (/traje/.test(cp.produto_slug)) { comTraje.add(cp.codigo); continue; }
          porDono.set(cp.codigo, [...(porDono.get(cp.codigo) ?? []), cp]);
        }
        const ORDEM = ['monumento', 'foguete', 'outdoor', 'bandeira', 'comercio'];
        for (const [codigo, itens] of porDono) {
          const m = moradiaDe(idDoCodigo(codigo));
          if (m.x < vx0 - 3 || m.x > vx1 + 3 || m.y < vy0 - 3 || m.y > vy1 + 3) continue;
          const bx = m.x * CASA, by = m.y * CASA;
          const cantos = m.grande
            ? [[4, 34], [29, 34], [-3, 26], [36, 26], [16, 37]]
            : [[-3, 16], [19, 16], [-4, 9], [20, 9], [8, 20]];
          itens.sort((a, b) => ORDEM.indexOf(iconeDoProduto(a.produto_slug)) - ORDEM.indexOf(iconeDoProduto(b.produto_slug)));
          itens.slice(0, cantos.length).forEach((cp, i) => {
            const ix = bx + cantos[i][0], iy = by + cantos[i][1], tipo = iconeDoProduto(cp.produto_slug);
            const cor = TELHADOS[(cp.seed >>> 0) % TELHADOS.length];
            atores.push({ x: ix, y: iy, desenha: () => {
              if (tipo === 'monumento') ctx.drawImage(spriteEstatua(cp.seed || 1), ix - 7, iy - 17, 14, 17);   // estátua do colono
              else if (tipo === 'foguete') desenharFoguete(ctx, ix, iy, t, cor);
              else if (tipo === 'outdoor') desenharOutdoor(ctx, ix, iy, t, cp.texto);
              else if (tipo === 'bandeira') desenharBandeira(ctx, ix, iy, t, cp.opcao, cor);
              else if (tipo === 'comercio') desenharComercio(ctx, ix, iy, t, cor);
              else ctx.drawImage(spriteContornado(tipo), ix - 5, iy - 10, 10, 10);
            } });
          });
        }
      }

      // Pets: vivem no quintal do dono (comem, fazem xixi e cocô, brincam, cochilam) e vão junto no passeio
      const emotesPet: { x: number; y: number; emote: string }[] = [];
      if (e) for (const pt of e.pets) {
        const idDono = idDoCodigo(pt.codigo);
        const sp = situacaoPet(idDono, agoraS, (tt) => {
          const so = situacao(idDono, Math.max(n, 1), tt, e.praca ?? null, obraAtual, cantina);
          return { x: so.x, y: so.y, dir: so.dir, fora: so.tipo !== 'casa' && so.tipo !== 'recebe', andando: so.andando };
        });
        if (sp.x < camX - 40 || sp.x > camX + w / zoom + 40 || sp.y < camY - 40 || sp.y > camY + h / zoom + 40) continue;
        // chão: tigela, poça de xixi secando, cocô esperando o dono limpar
        const tg = sp.tigela;
        if (tg.x > camX - 20 && tg.x < camX + w / zoom + 20 && tg.y > camY - 20 && tg.y < camY + h / zoom + 20) {
        ctx.fillStyle = '#5b6b8c'; ctx.fillRect(tg.x - 2, tg.y - 1, 4, 2);
        if (tg.racao > 0) { ctx.fillStyle = '#a0613f'; ctx.fillRect(tg.x - 2 + (1 - tg.racao) * 2, tg.y - 2, Math.max(1, 4 * tg.racao), 1); }
        if (sp.poca) { ctx.globalAlpha = 0.75 * (1 - sp.poca.seca); ctx.fillStyle = '#f2d14b'; ctx.fillRect(sp.poca.x - 2, sp.poca.y - 1, 4, 2); ctx.fillRect(sp.poca.x - 1, sp.poca.y, 3, 1); ctx.globalAlpha = 1; }
        if (sp.coco) { ctx.fillStyle = '#5a3a22'; ctx.fillRect(sp.coco.x - 1, sp.coco.y - 1, 3, 2); ctx.fillRect(sp.coco.x, sp.coco.y - 2, 1, 1); }
        }
        // arte e animação em fabrica/pet.js (a mesma do vídeo); pelagem pelo id do dono
        atores.push({
          x: sp.x, y: sp.y,
          desenha: () => {
            if (sp.bola) desenharBola(ctx, sp.bola.x, sp.bola.y, sp.bola.alt);
            desenharPet(ctx, Math.round(sp.x * 2) / 2, Math.round(sp.y * 2) / 2, { pose: sp.pose, dir: sp.dir, t: agoraS, seed: idDono, pulo: sp.pulo, especie: pt.especie });
          },
        });
        if (sp.emote) emotesPet.push({ x: sp.x, y: sp.y - 6, emote: sp.emote });
      }

      // Oficina pronta: dois robôs de carga levam material da oficina até a obra do dia (ou até a base)
      if (oficina && e) for (let i = 0; i < 2; i++) {
        const de = { x: (oficina.x + oficina.w / 2) * CASA, y: (oficina.y + oficina.h) * CASA + 4 };
        const para = obraAtual ? { x: (obraAtual.x + obraAtual.w / 2) * CASA + (i ? 10 : -10), y: (obraAtual.y + obraAtual.h) * CASA + 10 }
          : { x: (e.base.x + e.base.w / 2) * CASA + (i ? 14 : -14), y: (e.base.y + e.base.h) * CASA + 6 };
        const sr = situacaoRobo(i, de, para, agoraS);   // viagens com carga/descarga de tempos diferentes e recarga
        const rx = sr.x, ry = sr.y, indo = sr.carregado;
        atores.push({
          x: rx, y: ry,
          desenha: () => {
            ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(rx - 5, ry - 1, 10, 2);
            ctx.save(); ctx.translate(Math.round(rx), Math.round(ry)); if (sr.dir < 0) ctx.scale(-1, 1);
            ctx.drawImage(spriteMapa('rover'), -5, -9, 10, 10); ctx.restore();
            if (indo) { ctx.fillStyle = '#a0613f'; ctx.fillRect(rx - 2, ry - 11, 4, 3); }   // caixa de material
          },
        });
      }

      // rover: estacionado na moradia quando o dono está em casa (quem está fora leva o rover junto, logo abaixo)
      for (const pe of pessoas) {
        if (!comRover.has(pe.p.codigo) || (pe.s.tipo !== 'casa' && pe.s.tipo !== 'recebe')) continue;
        const m = moradiaDe(pe.id);
        const rx = m.x * CASA + (m.grande ? 44 : 30), ry = m.y * CASA + (m.grande ? 30 : 15);
        if (rx < camX - 40 || rx > camX + w / zoom + 40 || ry < camY - 40 || ry > camY + h / zoom + 40) continue;
        atores.push({ x: rx, y: ry, desenha: () => desenharRover(ctx, rx, ry, -1, t, false, null) });
      }

      // colonos (onde estão agora, segundo a rotina)
      for (const pe of pessoas) {
        const { s, p } = pe;
        if (s.x < camX - 40 || s.x > camX + w / zoom + 40 || s.y < camY - 40 || s.y > camY + h / zoom + 40) continue;
        // dentro de casa: não aparece (a janela acesa mostra que tem gente), a não ser que seja o colono procurado
        if (s.dentro && selecionadoRef.current?.codigo !== p.codigo) continue;
        const fora = s.tipo !== 'casa' && s.tipo !== 'recebe';
        if (comRover.has(p.codigo) && fora) {   // saiu de casa: vai de rover (dirigindo) e estaciona do lado dele
          const cabeca = spriteColono(p.seed, p.lideranca, p.traje_moedas);
          if (s.andando) { atores.push({ x: s.x, y: s.y, desenha: () => desenharRover(ctx, s.x, s.y, s.dir, t, true, cabeca) }); continue; }
          const rx = s.x - s.dir * 20, ry = s.y + 2;
          atores.push({ x: rx, y: ry, desenha: () => desenharRover(ctx, rx, ry, s.dir, t, false, null) });
        }
        atores.push({
          x: s.x, y: s.y,
          desenha: () => {
            if (s.dentro) ctx.globalAlpha = 0.35;   // o selecionado está lá dentro: aparece "fantasma" na porta
            let img: HTMLImageElement | undefined;
            if (p.sprite_url) {
              img = imagens.current.get(p.sprite_url);
              if (!img) { img = new Image(); img.src = p.sprite_url; imagens.current.set(p.sprite_url, img); }
            }
            const pulo = s.andando ? (Math.floor(t * 8 + pe.id) % 2 ? -1 : 0)
              : (s.tipo === 'praca' && Math.sin(t * 4 + pe.id) > 0.8 ? -2 : (s.acao === 'faisca' || s.acao === 'reforma') && Math.floor(t * 3 + pe.id) % 2 ? -1 : 0);
            const agachado = s.acao === 'agacha' || s.acao === 'escava';
            ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(s.x - 4, s.y - 1, 8, 2);
            if (s.acao === 'escava') {   // buraco + terra voando
              ctx.fillStyle = '#5a2414'; ctx.fillRect(s.x + 3 * s.dir - 2, s.y - 1, 5, 2);
              const f = Math.floor(t * 6 + pe.id);
              for (let i = 0; i < 3; i++) { const q = ((t * 1.5 + i / 3 + pe.id * 0.1) % 1); ctx.fillStyle = i % 2 ? '#a24c30' : '#7a3520'; ctx.fillRect(s.x + 3 * s.dir + (i - 1) * 2 + q * 3 * s.dir, s.y - 2 - Math.sin(q * Math.PI) * 6, 1, 1); }
              void f;
            }
            ctx.save(); ctx.translate(Math.round(s.x), Math.round(s.y + pulo)); if (s.dir < 0) ctx.scale(-1, 1);
            if (agachado) { ctx.translate(0, 0); ctx.scale(1, 0.8); }
            if (img && img.complete && img.naturalWidth && !p.lideranca && !p.traje_moedas) ctx.drawImage(img, -6, -12, 12, 12);
            else ctx.drawImage(spriteColono(p.seed, p.lideranca, p.traje_moedas), -6, -12, 12, 12);
            ctx.restore();
            if (comTraje.has(p.codigo)) {   // traje espacial: capacete de vidro em volta da cabeça
              const hx = Math.round(s.x), hy = Math.round(s.y + pulo) - 13;
              ctx.globalAlpha = 0.28; ctx.fillStyle = '#bfe9ff'; ctx.fillRect(hx - 5, hy, 10, 8); ctx.globalAlpha = 0.9;
              ctx.fillStyle = '#e8f6ff'; ctx.fillRect(hx - 4, hy - 1, 8, 1); ctx.fillRect(hx - 6, hy + 1, 1, 6); ctx.fillRect(hx + 5, hy + 1, 1, 6);
              ctx.fillStyle = '#ffffff'; ctx.fillRect(hx - 4, hy + 1, 1, 2);
              ctx.fillStyle = '#9aa0b5'; ctx.fillRect(hx - 5, hy + 7, 10, 1); ctx.globalAlpha = 1;
            }
            if (onlineRef.current.has(p.codigo)) { ctx.fillStyle = '#4ed37a'; ctx.fillRect(s.x - 1, s.y - 16, 2.5, 2.5); }   // online agora
            if (p.status === 'estreou') { ctx.fillStyle = '#ffd84a'; ctx.fillRect(s.x + 4, s.y - 13, 2.5, 2.5); }
            if (s.acao === 'faisca' && Math.floor(t * 4 + pe.id) % 3 === 0) { ctx.fillStyle = COR.ouro; ctx.fillRect(s.x + 5 * s.dir, s.y - 7, 2, 2); }
            if (s.acao === 'reforma' && Math.floor(t * 3 + pe.id) % 2 === 0) { ctx.fillStyle = '#c9ced9'; ctx.fillRect(s.x + 5 * s.dir, s.y - 9, 1, 3); ctx.fillStyle = '#8a5a34'; ctx.fillRect(s.x + 4 * s.dir, s.y - 9, 3, 1); }   // martelo
            if (s.acao === 'tablet') { ctx.fillStyle = '#1b1530'; ctx.fillRect(s.x + 4 * s.dir - 1, s.y - 7, 3, 2); ctx.fillStyle = Math.floor(t * 2 + pe.id) % 2 ? '#3fd0c9' : '#8ff0ea'; ctx.fillRect(s.x + 4 * s.dir - 1, s.y - 7, 2, 1); }
            ctx.globalAlpha = 1;
            if (s.carga) { const cy = Math.round(s.y + pulo) - 15; ctx.fillStyle = '#6b4a2e'; ctx.fillRect(s.x - 3, cy, 6, 4); ctx.fillStyle = s.carga; ctx.fillRect(s.x - 2, cy - 1, 4, 2); }   // caixa na cabeça
          },
        });
      }
      // andarilhos: entraram pelos comentários e ainda não têm casa; andam de um ponto a outro em volta da base
      // (mesma ideia do vídeo: caminho fixo pelo seed) com uma mochila nas costas
      if (e) (e.andarilhos ?? []).forEach((a, i) => {
        const cx = (e.base.x + e.base.w / 2) * CASA, cy = (e.base.y + e.base.h / 2) * CASA + 4 * CASA;
        const sa = situacaoAndarilho((a.seed % 9973) + i * 17, i, { x: cx, y: cy }, agoraS);   // zanza, para, olha, segue
        const ax = sa.x, ay = sa.y, anda = sa.andando, dir = sa.dir;
        if (ax < camX - 40 || ax > camX + w / zoom + 40 || ay < camY - 40 || ay > camY + h / zoom + 40) return;
        atores.push({
          x: ax, y: ay,
          desenha: () => {
            const pulo = anda && Math.floor(t * 8 + i) % 2 ? -1 : 0;
            ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(ax - 4, ay - 1, 8, 2);
            ctx.save(); ctx.translate(Math.round(ax), Math.round(ay + pulo)); if (dir < 0) ctx.scale(-1, 1);
            ctx.drawImage(spriteColono(a.seed), -6, -12, 12, 12);
            ctx.fillStyle = '#8a5a34'; ctx.fillRect(-6, -8, 3, 5); ctx.fillStyle = '#b07a48'; ctx.fillRect(-6, -8, 3, 1);   // mochila
            const corRede = COR_REDE[a.rede];
            if (corRede) { ctx.fillStyle = corRede; ctx.fillRect(-5, -6, 1, 2); }   // remendo sutil da rede de origem
            ctx.restore();
            if (zoom >= 5) {   // nome igual ao dos outros colonos (só com zoom): quem só comentou não ganha destaque,
              // apenas o quadradinho discreto da rede de onde veio, antes do nome (pedido do dono)
              const s = Math.min(12, 2.6 * zoom) / zoom, nome = `@${a.handle}`;
              ctx.font = `${s}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
              ctx.fillText(nome, ax, ay + 6, CASA * 1.6);
              if (corRede) {
                const lx = ax - Math.min(CASA * 1.6, ctx.measureText(nome).width) / 2 - s * 0.7;
                ctx.globalAlpha = 0.8; ctx.fillStyle = corRede; ctx.fillRect(lx - s * 0.25, ay + 6 - s * 0.6, s * 0.5, s * 0.5); ctx.globalAlpha = 1;
              }
            }
          },
        });
      });
      atores.sort((a, b) => a.y - b.y);
      for (const a of atores) a.desenha();
      pessoasRef.current = pessoas;

      // ---- tela (pixels da tela)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tela = (wx: number, wy: number) => ({ x: (wx - camX) * zoom, y: (wy - camY) * zoom });
      const sel = selecionadoRef.current;
      // ★ quem se destaca: cargo de liderança ou quem apoia a colônia com compras (cápsula, pet, itens)
      const apoia = new Set(e ? [...e.compras.map((c) => c.codigo), ...e.pets.map((p) => p.codigo), ...(e.capsulas ?? []).map((k) => k.codigo)] : []);
      const destaque = (p: PersonagemPublico) => !!p.lideranca || apoia.has(p.codigo);

      if (zoom >= 5) {   // nomes (com zoom, para não embolar na multidão)
        ctx.font = `${Math.min(12, 2.6 * zoom)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        for (const pe of pessoas) {
          if ((sel && sel.codigo === pe.p.codigo) || destaque(pe.p)) continue;
          const s = tela(pe.s.x, pe.s.y + 6);
          const cg = cargoDe(pe.p.cargo);
          const lid = liderancaDe(pe.p.lideranca);
          const nome = nomeComTitulo(pe.p.nome, pe.p.lideranca);
          ctx.fillStyle = lid ? lid.cor : '#fff';
          if (s.x > -50 && s.x < w + 50 && s.y > -20 && s.y < h + 20) ctx.fillText(cg && !lid ? `${cg.emoji} ${nome}` : nome, s.x, s.y, CASA * zoom * 1.6);
        }
        ctx.fillStyle = '#fff';
      }
      if (zoom >= 2.5) {   // tag dos cargos de liderança (LÍDER, VICE...) em cima da cabeça, na cor do cargo
        ctx.font = `bold ${Math.min(11, 2.2 * zoom)}px system-ui, sans-serif`; ctx.textAlign = 'center';
        for (const pe of pessoas) {
          const lid = liderancaDe(pe.p.lideranca);
          if (!lid) continue;
          const s = tela(pe.s.x, pe.s.y - 13);
          if (s.x < -60 || s.x > w + 60 || s.y < -20 || s.y > h + 20) continue;
          const lw = ctx.measureText(lid.tag).width + 8;
          ctx.fillStyle = '#140f26dd'; ctx.fillRect(s.x - lw / 2, s.y - 14, lw, 13);
          ctx.fillStyle = lid.cor; ctx.fillRect(s.x - lw / 2, s.y - 14, lw, 1.5); ctx.fillText(lid.tag, s.x, s.y - 4);
        }
      }
      if (e && zoom >= 1.2) {   // placa com o nome das crateras batizadas
        ctx.textAlign = 'center';
        for (const cr of e.crateras ?? []) {
          const s = tela(cr.x * CASA + 8, cr.y * CASA + 8 - cr.r * 0.62 - 24);   // acima da bandeirinha
          if (s.x < -150 || s.x > w + 150 || s.y < -40 || s.y > h + 60) continue;
          ctx.font = 'bold 12px system-ui, sans-serif';
          const lw = Math.max(ctx.measureText(cr.nome).width, 0) + 14;
          ctx.fillStyle = '#140f26dd'; ctx.fillRect(s.x - lw / 2, s.y - 36, lw, 30);
          ctx.fillStyle = COR.ouro; ctx.fillRect(s.x - lw / 2, s.y - 36, lw, 2);
          ctx.fillText(cr.nome, s.x, s.y - 22);
          ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = COR.areia;
          ctx.fillText(`batizada por ${cr.dono}`, s.x, s.y - 10);
        }
      }
      // placas com o nome das construções (prontas ou em obra), do módulo e da praça
      const placa = (txt: string, x: number, y: number, fundo: string, letra: string, faixa: string, px = 10) => {
        if (x < -160 || x > w + 160 || y < -30 || y > h + 30) return;
        ctx.font = `${px}px ${fontePixel()}`; ctx.textAlign = 'center';
        const lw = ctx.measureText(txt).width + 12;
        ctx.fillStyle = '#000a'; ctx.fillRect(x - lw / 2 + 2, y - px - 8 + 2, lw, px + 9);
        ctx.fillStyle = fundo; ctx.fillRect(x - lw / 2, y - px - 8, lw, px + 9);
        ctx.fillStyle = faixa; ctx.fillRect(x - lw / 2, y - px - 8, lw, 2);
        ctx.fillStyle = letra; ctx.fillText(txt, x, y - 3);
      };
      if (e && zoom >= 1.4) {
        const pz = zoom >= 3 ? 10 : 8;
        const cons = [{ nome: e.base.nome, x: e.base.x, y: e.base.y, w: e.base.w, alto: 34 },
          ...(e.praca ? [{ nome: e.praca.nome, x: e.praca.x, y: e.praca.y, w: e.praca.w, alto: 0 }] : []),
          ...e.obras.filter((o) => o.status !== 'planejada' || o === obraAtual)
            .map((o) => ({ nome: o.nome, x: o.x, y: o.y, w: o.w, alto: o.colina ? 44 : 2 }))];
        for (const c of cons) {
          const s = tela((c.x + c.w / 2) * CASA, c.y * CASA - c.alto);
          placa(c.nome.toUpperCase(), s.x, s.y, '#140f26e6', COR.areia, COR.ouro, pz);
        }
      }
      // cápsulas compradas: "Cápsula do Fulano" embaixo de cada uma
      if (e && zoom >= 1.6) for (const k of e.capsulas ?? []) {
        const s = tela(k.x * CASA + 16, k.y * CASA + 40);
        placa(`Cápsula do ${k.nome}`, s.x, s.y + 12, '#f3eefe', '#140f26', '#e2603b', zoom >= 3 ? 9 : 7);
      }
      // ★ quem se destaca (cargo de liderança ou quem apoia a colônia com compras): nome sempre à vista
      if (e && zoom >= 1.2) {
        for (const pe of pessoas) {
          if (!destaque(pe.p)) continue;
          if (sel && sel.codigo === pe.p.codigo) continue;
          const s = tela(pe.s.x, pe.s.y + 3);
          if (s.x < -120 || s.x > w + 120 || s.y < -20 || s.y > h + 40) continue;
          const lid = liderancaDe(pe.p.lideranca), rot = `★ ${pe.p.nome}`;
          ctx.font = `bold ${zoom >= 3 ? 13 : 11}px system-ui, sans-serif`; ctx.textAlign = 'center';
          const lw = ctx.measureText(rot).width + 14, lh = zoom >= 3 ? 20 : 17;
          ctx.fillStyle = '#000a'; ctx.fillRect(s.x - lw / 2 + 2, s.y + 2, lw, lh);
          ctx.fillStyle = '#140f26'; ctx.fillRect(s.x - lw / 2 - 2, s.y - 2, lw + 4, lh + 4);
          ctx.fillStyle = lid ? lid.cor : COR.ouro; ctx.fillRect(s.x - lw / 2, s.y, lw, lh);
          ctx.fillStyle = '#140f26'; ctx.fillText(rot, s.x, s.y + lh - 5);
        }
      }

      if (zoom >= 2) {
        ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center';
        for (const a of atores) {
          if (!a.ehFundador || !a.nome) continue;
          const s = tela(a.x, a.y - 14);
          const lw = ctx.measureText(a.nome).width + 10;
          ctx.fillStyle = '#140f26cc'; ctx.fillRect(s.x - lw / 2, s.y - 16, lw, 15);
          ctx.fillStyle = COR.areia; ctx.fillText(a.nome, s.x, s.y - 5);
        }
      }

      // balões de conversa (emojis da rotina) — o chat de verdade tem prioridade
      const agora = performance.now();
      const doChat = new Map<string, MensagemChat>();
      for (const m of mensagensRef.current) if (agora - (chegada.current.get(m.id) ?? -1e9) < BALAO_MS) doChat.set(m.codigo, m);
      if (zoom >= 1.5) {
        const tam = Math.round(Math.min(16, 4 + zoom * 2.4));
        ctx.font = `${tam}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = 'center';
        for (const pe of pessoas) {
          if (!pe.s.emote || doChat.has(pe.p.codigo)) continue;
          const s = tela(pe.s.x, pe.s.y - 13);
          if (s.x < -30 || s.x > w + 30 || s.y < -30 || s.y > h + 30) continue;
          const bw = tam + 10, bh = tam + 6, bx = Math.round(s.x - bw / 2), by = Math.round(s.y - bh - 6);
          ctx.fillStyle = '#f3eefe'; ctx.fillRect(bx, by, bw, bh); ctx.fillRect(Math.round(s.x) - 2, by + bh, 4, 4);
          ctx.fillText(pe.s.emote, s.x, by + bh - 4);
        }
      }

      if (zoom >= 2.5) {
        const tam = Math.round(Math.min(12, 3 + zoom * 1.6));
        ctx.font = `${tam}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = 'center';
        for (const em of emotesPet) {
          const s = tela(em.x, em.y);
          if (s.x < -30 || s.x > w + 30 || s.y < -30 || s.y > h + 30) continue;
          ctx.fillText(em.emote, s.x, s.y - 2);
        }
      }

      if (sel) {
        const pe = pessoas.find((x) => x.p.codigo === sel.codigo);
        const mor = moradiaDe(idDoCodigo(sel.codigo)), lado = (mor.grande ? 2 : 1) * CASA * zoom;
        const casa = tela(mor.x * CASA, mor.y * CASA);
        if (Math.floor(ms / 400) % 2 === 0) { ctx.strokeStyle = COR.agua; ctx.lineWidth = 2; ctx.strokeRect(casa.x + 1, casa.y + 1, lado - 2, lado - 2); }
        const s = pe ? tela(pe.s.x, pe.s.y - 14) : tela((sel.pos_x + 0.5) * CASA, sel.pos_y * CASA);
        const rot = `${sel.nome} @${sel.handle}`;
        ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center';
        const lw = ctx.measureText(rot).width + 12;
        ctx.fillStyle = COR.ceu; ctx.fillRect(s.x - lw / 2, s.y - 38, lw, 20);
        ctx.fillStyle = COR.agua; ctx.fillText(rot, s.x, s.y - 23);
      }

      // mensagens do rádio em cima de quem escreveu (onde a pessoa estiver)
      ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left';
      for (const m of doChat.values()) {
        const pe = pessoas.find((x) => x.p.codigo === m.codigo);
        const ondeX = pe ? pe.s.x : m.pos_x * CASA + 8, ondeY = pe ? pe.s.y - 14 : m.pos_y * CASA;
        const s = tela(ondeX, ondeY);
        if (s.x < -200 || s.x > w + 200 || s.y < -60 || s.y > h + 60) continue;
        const idade = (agora - (chegada.current.get(m.id) ?? 0)) / BALAO_MS;
        ctx.globalAlpha = idade > 0.85 ? (1 - idade) / 0.15 : 1;
        const linhas = quebrarLinhas(ctx, m.texto, 190, 3);
        const lw = Math.max(...linhas.map((l) => ctx.measureText(l).width)) + 14, lh = linhas.length * 15 + 7;
        const bx = Math.round(s.x - lw / 2), by = Math.round(s.y - 8 - lh);
        ctx.fillStyle = '#f3eefe'; ctx.fillRect(bx, by, lw, lh); ctx.fillRect(Math.round(s.x) - 3, by + lh, 6, 5);
        ctx.fillStyle = '#140f26';
        linhas.forEach((l, i) => ctx.fillText(l, bx + 7, by + 15 + i * 15));
        ctx.globalAlpha = 1;
      }

      if (e) desenharClima(ctx, e.estacao.efeito, e.problema?.categoria === 'clima', t, w, h);

      raf = requestAnimationFrame(desenhar);
    };
    raf = requestAnimationFrame(desenhar);
    return () => cancelAnimationFrame(raf);
  }, [carregarChunk]);

  // ---------- arrastar / zoom / clique ----------
  useEffect(() => {
    const cv = canvasRef.current!;
    const ponteiros = new Map<number, { x: number; y: number }>();
    let arrastou = false;
    let distPinca = 0;

    const zoomEm = (fator: number, px: number, py: number) => {
      const c = cam.current;
      const novoZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.zoom * fator));
      c.x += px / c.zoom - px / novoZoom;
      c.y += py / c.zoom - py / novoZoom;
      c.zoom = novoZoom;
    };
    const local = (e: PointerEvent | WheelEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      ponteiros.set(e.pointerId, local(e));
      arrastou = false;
      if (ponteiros.size === 2) { const [a, b] = [...ponteiros.values()]; distPinca = Math.hypot(a.x - b.x, a.y - b.y); }
    };
    const move = (e: PointerEvent) => {
      const ant = ponteiros.get(e.pointerId);
      if (!ant) return;
      const p = local(e);
      if (ponteiros.size === 2) {
        ponteiros.set(e.pointerId, p);
        const [a, b] = [...ponteiros.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (distPinca) zoomEm(d / distPinca, (a.x + b.x) / 2, (a.y + b.y) / 2);
        distPinca = d; arrastou = true;
        return;
      }
      const dx = p.x - ant.x, dy = p.y - ant.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) { arrastou = true; seguindo.current = null; }   // arrastou: para de seguir
      const c = cam.current;
      const r = raioHex(totalRef.current) * CASA, hx = (CENTRO.x + 0.5) * CASA, hy = (CENTRO.y + 0.5) * CASA;
      const vw = cv.clientWidth / c.zoom, vh = cv.clientHeight / c.zoom;   // o centro da tela não sai do hexágono
      c.x = Math.max(hx - r - vw / 2, Math.min(hx + r - vw / 2, c.x - dx / c.zoom));
      c.y = Math.max(hy - r - vh / 2, Math.min(hy + r - vh / 2, c.y - dy / c.zoom));
      ponteiros.set(e.pointerId, p);
    };
    const up = (e: PointerEvent) => {
      const p = local(e);
      ponteiros.delete(e.pointerId);
      if (ponteiros.size < 2) distPinca = 0;
      if (arrastou) return;
      const c = cam.current;
      const wx = p.x / c.zoom + c.x, wy = p.y / c.zoom + c.y;
      // 1º: alguém andando/parado ali? (o boneco ocupa ~12 px acima dos pés)
      let melhor: Pessoa | null = null, dist = 9;
      for (const pe of pessoasRef.current) {
        const d = Math.hypot(pe.s.x - wx, pe.s.y - 6 - wy);
        if (d < dist) { dist = d; melhor = pe; }
      }
      if (melhor) { selecionar(melhor.p, false); seguindo.current = melhor.p.codigo; return; }
      seguindo.current = null;
      // 2º: a casa clicada
      const tx = Math.floor(wx / CASA), ty = Math.floor(wy / CASA);
      const ch = chunks.current.get(`${Math.floor(tx / CHUNK)},${Math.floor(ty / CHUNK)}`);
      const achado = ch && ch !== 'carregando' ? ch.dados.find((d) => d.pos_x === tx && d.pos_y === ty) : undefined;
      selecionar(achado ?? null, false);
    };
    const roda = (e: WheelEvent) => { e.preventDefault(); const p = local(e); zoomEm(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y); };

    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', roda, { passive: false });
    return () => {
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
      cv.removeEventListener('wheel', roda);
    };
  }, [selecionar]);

  const zoomBotao = (fator: number) => {
    const cv = canvasRef.current; if (!cv) return;
    const c = cam.current; const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.zoom * fator));
    c.x += cv.clientWidth / 2 / c.zoom - cv.clientWidth / 2 / nz; c.y += cv.clientHeight / 2 / c.zoom - cv.clientHeight / 2 / nz; c.zoom = nz;
  };

  const e = estado;
  const busca = (
    <form className="busca" onSubmit={(ev) => { ev.preventDefault(); buscar(q, true); }} role="search">
      <input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Procure seu nome, @ ou código (NM000123)" aria-label="Procurar personagem" />
      <button className="btn">Procurar</button>
    </form>
  );
  const listaBusca = resultados && (
    resultados.length ? (
      <ul className="resultados">
        {resultados.map((p) => <li key={p.codigo}><button onClick={() => { selecionar(p); setResultados(null); }}>{p.nome} · @{p.handle}</button></li>)}
      </ul>
    ) : <p className="mudo">Ninguém com esse nome ainda. <a href="/">Crie seu personagem</a>.</p>
  );
  return (
    <div className={telaCheia ? 'mundo mundo-cheio' : 'mundo'}>
      {!telaCheia && busca}
      {!telaCheia && listaBusca}

      {novo && selecionado && <p className="pixel" style={{ fontSize: 12, color: 'var(--areia)' }}>Bem-vindo à Operação Marte Zero! Essa é a sua casa.</p>}

      {!telaCheia && (
        <div className="acoes-mundo">
          <LojaModal />
          <BotaoComentar />
        </div>
      )}

      <div className="mundo-palco">
        {/* barra de notícias: episódio, população, quem está online e quem acabou de chegar */}
        <div className="barra-vivo" aria-live="polite">
          <span className="barra-titulo">MARTE ZERO <b>AO VIVO</b></span>
          {total !== null && <span className="barra-num">{total.toLocaleString('pt-BR')} COLONOS</span>}
          {onlineN !== undefined && <span className="barra-online"><i /> {Math.max(1, onlineN)} ONLINE AGORA</span>}
          <span className="barra-rolando">
            <span>
              {e?.episodio && <>EP. {e.episodio.numero} · {e.episodio.titulo.replace(/^Episódio \d+ · /, '')}{total !== null ? ` · a colônia chegou a ${total.toLocaleString('pt-BR')} colonos` : ''}</>}
              {ultimos.length > 0 && <> · Acabaram de chegar: {ultimos.map((u) => u.nome).join(', ')}</>}
            </span>
          </span>
          {telaCheia && <button className="barra-fechar" aria-label="Sair da tela cheia" onClick={() => setTelaCheia(false)}>✕</button>}
        </div>

        <div className="mundo-tela">
          <canvas ref={canvasRef} aria-label="Mapa ao vivo da colônia Operação Marte Zero. Arraste para andar, role para dar zoom." />
          <div className="hud-vivo" aria-live="polite">
            {telaCheia && <div className="hud-busca">{busca}{listaBusca}</div>}
            <span className="selo-vivo"><i /> AO VIVO</span>
            {e && (
              <span className="selo">
                {e.estacao.nome.toUpperCase()} · DIA {e.estacao.dia}{e.estacao.temp !== null ? ` · ${e.estacao.temp}°C` : ''}
              </span>
            )}
            {e?.obra_atual && <span className="selo">OBRA: {e.obra_atual.nome.toUpperCase()} {e.obra_atual.progresso}%</span>}
            {e?.problema && (
              <span className="selo selo-ok">
                ✔ {e.problema.titulo}
                {e.problema.heroi && (e.problema.heroi_codigo
                  ? <> · resolvido por <a href={`/colono/${e.problema.heroi_codigo}`}>{e.problema.heroi}</a></>
                  : ` · resolvido por ${e.problema.heroi}`)}
              </span>
            )}
          </div>

          {visitante && !conviteFechado && (
            <div className="convite-mapa">
              <a href="/">👀 <b>Você ainda não tem boneco aqui</b><br />toque pra criar o seu · é grátis</a>
              <button aria-label="Fechar o convite" onClick={() => setConviteFechado(true)}>×</button>
            </div>
          )}

          <div className="zoom-botoes">
            <button aria-label="Aproximar" onClick={() => zoomBotao(1.4)}>+</button>
            <button aria-label="Afastar" onClick={() => zoomBotao(1 / 1.4)}>−</button>
            <button aria-label="Voltar para a colônia" onClick={() => centralizarEm((CENTRO.x + 0.5) * CASA, (CENTRO.y + 7) * CASA)}>⌂</button>
            <button aria-label={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'} title={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
                    onClick={() => setTelaCheia((v) => !v)}>{telaCheia ? '⤡' : '⛶'}</button>
            {chat && (
              <button className="botao-chat" aria-label="Rádio da colônia (chat)" title="Rádio da colônia" aria-expanded={chatAberto} onClick={aoChat}>
                💬{naoLidas > 0 && !chatAberto && <span className="nao-lidas">{naoLidas > 9 ? '9+' : naoLidas}</span>}
              </button>
            )}
          </div>
          {telaCheia && <div className="loja-cheia"><LojaModal /></div>}

          {chat && <div className={chatAberto ? 'chat-gaveta aberta' : 'chat-gaveta'} aria-hidden={!chatAberto}>{chat}</div>}

          {selecionado && (
            <div className="ficha">
              <strong style={liderancaDe(selecionado.lideranca) ? { color: liderancaDe(selecionado.lideranca)!.cor } : undefined}>
                {nomeComTitulo(selecionado.nome, selecionado.lideranca)}</strong> · @{selecionado.handle} ({selecionado.plataforma})<br />
              {liderancaDe(selecionado.lideranca) && <span className="selo-cargo" style={{ margin: '4px 0', borderColor: liderancaDe(selecionado.lideranca)!.cor }}>🎖️ {liderancaDe(selecionado.lideranca)!.nome}</span>}
              {cargoDe(selecionado.cargo) && <span className="selo-cargo" style={{ margin: '4px 0' }}>{cargoDe(selecionado.cargo)!.emoji} {cargoDe(selecionado.cargo)!.nome}</span>}
              {cargoDe(selecionado.cargo) && <br />}
              {fazendo && <span style={{ color: 'var(--areia)' }}>Agora: {fazendo}<br /></span>}
              <span className="mudo">
                {selecionado.codigo} · {selecionado.status === 'estreou' ? '★ já apareceu num episódio'
                  : selecionado.status === 'desenhado' ? 'arte pronta, esperando o episódio' : 'na fila para ser desenhado'}
              </span><br />
              <a href={`/colono/${selecionado.codigo}`}>Ver perfil →</a>
              {' · '}
              <button type="button" className="link" onClick={() => { const m = moradiaDe(idDoCodigo(selecionado.codigo)); centralizarEm((m.x + (m.grande ? 1 : 0.5)) * CASA, (m.y + (m.grande ? 1 : 0.5)) * CASA, 4); }}>ver a casa</button>
            </div>
          )}
        </div>
      </div>

      <p className="mudo">
        Arraste para andar · role ou faça pinça para dar zoom · toque num colono para ver o que ele está fazendo · ⌂ volta para a colônia · ⛶ tela cheia · 💬 rádio da colônia
      </p>
    </div>
  );
}

