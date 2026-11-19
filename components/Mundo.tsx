'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { gerarSprite } from '@/lib/sprite';
import {
  CENTRO, CHUNK, LIMITE_CHUNKS, anelMaximo, ehRua, idDoCodigo, limitesDoBairro, noBairro,
  type PersonagemPublico,
} from '@/lib/mundo';
import {
  BLOCO, CASA, COR, blocoDeTerreno, desenharBase, desenharClima, desenharObra, desenharPraca, desenharTrilha,
  disco, iconeDoProduto, spriteContornado, spriteMapa,
} from '@/lib/colonia-arte';
import { situacao, type Situacao } from '@/lib/vida';
import type { EstadoColonia } from '@/lib/colonia';
import type { MensagemChat } from '@/app/api/chat/route';

/**
 * Mundo ao vivo: a colônia como no vídeo (módulo de pouso, praça, obras, Vega e Lia trabalhando, clima da
 * estação) + o bairro em espiral com a casa de cada colono. Os colonos vivem (lib/vida.ts): se visitam,
 * se encontram na praça, ajudam na obra e passeiam pelas ruas, conversando com balões. Quem escreve no
 * rádio ganha um balão com a mensagem. Tudo segue o relógio: todo mundo vê a mesma cena.
 */
const RECARREGA_MS = 30_000;
const ZOOM_MIN = 0.75, ZOOM_MAX = 8;
const BALAO_MS = 12_000;

type Chunk = { dados: PersonagemPublico[]; em: number } | 'carregando';
type Pessoa = { p: PersonagemPublico; id: number; s: Situacao };

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const suave = (k: number) => (k = clamp(k), k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const TELHADOS = ['#e04f5f', '#3f8efc', '#2bb673', '#f4b400', '#9b59b6', '#ff7f50', '#00b8a9', '#ec407a'];

const spritesColono = new Map<number, HTMLCanvasElement>();
function spriteColono(seed: number): HTMLCanvasElement {
  let c = spritesColono.get(seed);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 12;
    const x = c.getContext('2d')!;
    gerarSprite(seed).forEach((l, j) => l.forEach((cor, i) => { if (cor) { x.fillStyle = cor; x.fillRect(i, j, 1, 1); } }));
    spritesColono.set(seed, c);
  }
  return c;
}

/** Casinha do lote (cúpula com a porta e uma janela acesa quando tem gente em casa). */
function desenharCasinha(ctx: CanvasRenderingContext2D, cx: number, cy: number, seed: number, temGente: boolean) {
  const x = cx * CASA, y = cy * CASA;
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + 1, y + 12, 12, 2);
  disco(ctx, x + 7, y + 8, 6, '#6b6f86');
  disco(ctx, x + 7, y + 8, 5, '#e4e6f0');
  ctx.fillStyle = TELHADOS[seed % TELHADOS.length]; ctx.fillRect(x + 2, y + 8, 11, 2);
  ctx.fillStyle = '#3a2f63'; ctx.fillRect(x + 6, y + 9, 3, 4);
  ctx.fillStyle = temGente ? '#ffe58a' : '#2b2350'; ctx.fillRect(x + 4, y + 5, 2, 2);
}

export default function Mundo({ codigoInicial, novo, mensagens = [] }: {
  codigoInicial?: string; novo?: boolean; mensagens?: MensagemChat[];
}) {
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
  const nomes = useRef(new Map<number, string>());       // id → nome, de quem já foi carregado

  const [selecionado, setSelecionado] = useState<PersonagemPublico | null>(null);
  const [fazendo, setFazendo] = useState('');
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<PersonagemPublico[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [ultimos, setUltimos] = useState<PersonagemPublico[]>([]);
  const [estado, setEstado] = useState<EstadoColonia | null>(null);

  useEffect(() => {
    const agora = performance.now();
    for (const m of mensagens) if (!chegada.current.has(m.id)) chegada.current.set(m.id, mensagensRef.current.length ? agora : -1e9);
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
    if (p && centralizar) centralizarEm((p.pos_x + 0.5) * CASA, (p.pos_y + 0.5) * CASA, 4);
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
      const lista = Array.isArray(dados) ? dados : [];
      for (const p of lista) nomes.current.set(idDoCodigo(p.codigo), p.nome);
      chunks.current.set(k, { dados: lista, em: Date.now() });
    } catch {
      chunks.current.delete(k);
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
        if (j && j.base) { estadoRef.current = j; setEstado(j); }
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
      setFazendo(s.descricao((id) => nomes.current.get(id) ?? null));
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
      const lote = (x: number, y: number) => noBairro(x, y, n);
      const livre = (x: number, y: number) => !reservados.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)
        && !noBairro(x, y, n) && !(n > 0 && noBairro(x, y, n + 400));   // sem cratera no bairro nem logo em volta
      c = blocoDeTerreno(bx, by, livre, lote, ehRua);
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
        c.y = (CENTRO.y + 7) * CASA - h / 2 / c.zoom;
        c.pronta = true;
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

      const obraAtual = e?.obras.find((o) => o.status !== 'concluida') ?? null;
      const cantina = e?.obras.find((o) => o.slug === 'cantina' && o.status === 'concluida') ?? null;
      const oficina = e?.obras.find((o) => o.slug === 'oficina' && o.status === 'concluida') ?? null;
      if (e) {
        desenharTrilha(ctx, e.base, CENTRO.y + 13);
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
      for (const p of casas) {
        const pessoa = pessoas.find((x) => x.p === p);
        desenharCasinha(ctx, p.pos_x, p.pos_y, p.seed, !!pessoa && pessoa.s.tipo === 'casa');
      }
      if (e) for (const cp of e.compras) {
        if (cp.pos_x < vx0 - 1 || cp.pos_x > vx1 + 1 || cp.pos_y < vy0 - 1 || cp.pos_y > vy1 + 1) continue;
        ctx.drawImage(spriteContornado(iconeDoProduto(cp.produto_slug)), cp.pos_x * CASA - 4, cp.pos_y * CASA + 7, 9, 9);
      }

      // Vega e Lia: vão da casa até a obra, trabalham e voltam
      const atores: { x: number; y: number; desenha: () => void; nome?: string; ehFundador?: boolean }[] = [];
      if (e) e.fundadores.forEach((f, i) => {
        const casa = { x: f.casa[0] * CASA, y: f.casa[1] * CASA };
        const alvo = obraAtual
          ? { x: (obraAtual.x + obraAtual.w / 2 + (i ? 1.2 : -1.2)) * CASA, y: (obraAtual.y + obraAtual.h + 0.6) * CASA }
          : { x: casa.x + (i ? 24 : -24), y: casa.y + 10 };
        const fase = ((agoraS + i * 13) / 32) % 1;
        let k = 0;
        if (fase < 0.3) k = 0; else if (fase < 0.45) k = suave((fase - 0.3) / 0.15);
        else if (fase < 0.8) k = 1; else if (fase < 0.95) k = 1 - suave((fase - 0.8) / 0.15);
        const andando = (fase > 0.3 && fase < 0.45) || (fase > 0.8 && fase < 0.95);
        const dir = (fase < 0.6 ? alvo.x - casa.x : casa.x - alvo.x) >= 0 ? 1 : -1;
        const px = lerp(casa.x, alvo.x, k), py = lerp(casa.y, alvo.y, k);
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

      // Oficina pronta: dois robôs de carga levam material da oficina até a obra do dia (ou até a base)
      if (oficina && e) for (let i = 0; i < 2; i++) {
        const de = { x: (oficina.x + oficina.w / 2) * CASA, y: (oficina.y + oficina.h) * CASA + 4 };
        const para = obraAtual ? { x: (obraAtual.x + obraAtual.w / 2) * CASA + (i ? 10 : -10), y: (obraAtual.y + obraAtual.h) * CASA + 10 }
          : { x: (e.base.x + e.base.w / 2) * CASA + (i ? 14 : -14), y: (e.base.y + e.base.h) * CASA + 6 };
        const fase = ((agoraS + i * 11) / 26) % 1;
        const k = fase < 0.45 ? suave(fase / 0.45) : fase < 0.55 ? 1 : 1 - suave((fase - 0.55) / 0.45);
        const rx = lerp(de.x, para.x, k), ry = lerp(de.y, para.y, k), indo = fase < 0.5;
        atores.push({
          x: rx, y: ry,
          desenha: () => {
            ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(rx - 5, ry - 1, 10, 2);
            ctx.save(); ctx.translate(Math.round(rx), Math.round(ry)); if ((para.x - de.x) * (indo ? 1 : -1) < 0) ctx.scale(-1, 1);
            ctx.drawImage(spriteMapa('rover'), -5, -9, 10, 10); ctx.restore();
            if (indo) { ctx.fillStyle = '#a0613f'; ctx.fillRect(rx - 2, ry - 11, 4, 3); }   // caixa de material
          },
        });
      }

      // colonos (onde estão agora, segundo a rotina)
      for (const pe of pessoas) {
        const { s, p } = pe;
        if (s.x < camX - 40 || s.x > camX + w / zoom + 40 || s.y < camY - 40 || s.y > camY + h / zoom + 40) continue;
        atores.push({
          x: s.x, y: s.y,
          desenha: () => {
            let img: HTMLImageElement | undefined;
            if (p.sprite_url) {
              img = imagens.current.get(p.sprite_url);
              if (!img) { img = new Image(); img.src = p.sprite_url; imagens.current.set(p.sprite_url, img); }
            }
            const pulo = s.andando ? (Math.floor(t * 8 + pe.id) % 2 ? -1 : 0)
              : (s.tipo === 'praca' && Math.sin(t * 4 + pe.id) > 0.8 ? -2 : s.tipo === 'obra' && Math.floor(t * 3 + pe.id) % 2 ? -1 : 0);
            ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(s.x - 4, s.y - 1, 8, 2);
            ctx.save(); ctx.translate(Math.round(s.x), Math.round(s.y + pulo)); if (s.dir < 0) ctx.scale(-1, 1);
            if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -6, -12, 12, 12);
            else ctx.drawImage(spriteColono(p.seed), -6, -12, 12, 12);
            ctx.restore();
            if (p.status === 'estreou') { ctx.fillStyle = '#ffd84a'; ctx.fillRect(s.x + 4, s.y - 13, 2.5, 2.5); }
            if (s.tipo === 'obra' && Math.floor(t * 4 + pe.id) % 3 === 0) { ctx.fillStyle = COR.ouro; ctx.fillRect(s.x + 5 * s.dir, s.y - 7, 2, 2); }
          },
        });
      }
      atores.sort((a, b) => a.y - b.y);
      for (const a of atores) a.desenha();
      pessoasRef.current = pessoas;

      // ---- tela (pixels da tela)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tela = (wx: number, wy: number) => ({ x: (wx - camX) * zoom, y: (wy - camY) * zoom });
      const sel = selecionadoRef.current;

      if (zoom >= 5) {   // nomes (com zoom, para não embolar na multidão)
        ctx.font = `${Math.min(12, 2.6 * zoom)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        for (const pe of pessoas) {
          if (sel && sel.codigo === pe.p.codigo) continue;
          const s = tela(pe.s.x, pe.s.y + 6);
          if (s.x > -50 && s.x < w + 50 && s.y > -20 && s.y < h + 20) ctx.fillText(pe.p.nome, s.x, s.y, CASA * zoom * 1.4);
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

      if (sel) {
        const pe = pessoas.find((x) => x.p.codigo === sel.codigo);
        const casa = tela(sel.pos_x * CASA, sel.pos_y * CASA);
        if (Math.floor(ms / 400) % 2 === 0) { ctx.strokeStyle = COR.agua; ctx.lineWidth = 2; ctx.strokeRect(casa.x + 1, casa.y + 1, CASA * zoom - 2, CASA * zoom - 2); }
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
        const txt = m.texto.length > 42 ? m.texto.slice(0, 40) + '…' : m.texto;
        const lw = Math.min(260, ctx.measureText(txt).width + 14), bx = Math.round(s.x - lw / 2), by = Math.round(s.y - 30);
        ctx.fillStyle = '#f3eefe'; ctx.fillRect(bx, by, lw, 22); ctx.fillRect(Math.round(s.x) - 3, by + 22, 6, 5);
        ctx.fillStyle = '#140f26'; ctx.fillText(txt, bx + 7, by + 15, lw - 12);
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
      if (Math.abs(dx) + Math.abs(dy) > 3) arrastou = true;
      const c = cam.current;
      const lb = limitesDoBairro(Math.max(totalRef.current, 1));
      c.x = Math.max((lb.x0 - 40) * CASA, Math.min((lb.x1 + 40) * CASA, c.x - dx / c.zoom));
      c.y = Math.max((lb.y0 - 40) * CASA, Math.min((lb.y1 + 40) * CASA, c.y - dy / c.zoom));
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
      if (melhor) { selecionar(melhor.p, false); return; }
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
  return (
    <div>
      <form className="busca" onSubmit={(ev) => { ev.preventDefault(); buscar(q, true); }} role="search">
        <input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Procure seu nome, @ ou código (NM000123)" aria-label="Procurar personagem" />
        <button className="btn">Procurar</button>
      </form>

      {resultados && (
        resultados.length ? (
          <ul className="resultados">
            {resultados.map((p) => <li key={p.codigo}><button onClick={() => selecionar(p)}>{p.nome} · @{p.handle}</button></li>)}
          </ul>
        ) : <p className="mudo">Ninguém com esse nome ainda. <a href="/">Crie seu personagem</a>.</p>
      )}

      {novo && selecionado && <p className="pixel" style={{ fontSize: 12, color: 'var(--areia)' }}>Bem-vindo à Operação Marte Zero! Essa é a sua casa.</p>}

      <div className="mundo-palco">
        <canvas ref={canvasRef} aria-label="Mapa ao vivo da colônia Operação Marte Zero. Arraste para andar, role para dar zoom." />
        <div className="hud-vivo" aria-live="polite">
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
        <div className="zoom-botoes">
          <button aria-label="Aproximar" onClick={() => zoomBotao(1.4)}>+</button>
          <button aria-label="Afastar" onClick={() => zoomBotao(1 / 1.4)}>−</button>
          <button aria-label="Voltar para a colônia" onClick={() => centralizarEm((CENTRO.x + 0.5) * CASA, (CENTRO.y + 7) * CASA)}>⌂</button>
        </div>
        {selecionado && (
          <div className="ficha">
            <strong>{selecionado.nome}</strong> · @{selecionado.handle} ({selecionado.plataforma})<br />
            {fazendo && <span style={{ color: 'var(--areia)' }}>Agora: {fazendo}<br /></span>}
            <span className="mudo">
              {selecionado.codigo} · {selecionado.status === 'estreou' ? '★ já apareceu num episódio'
                : selecionado.status === 'desenhado' ? 'arte pronta, esperando o episódio' : 'na fila para ser desenhado'}
            </span><br />
            <a href={`/colono/${selecionado.codigo}`}>Ver perfil →</a>
            {' · '}
            <button type="button" className="link" onClick={() => centralizarEm((selecionado.pos_x + 0.5) * CASA, (selecionado.pos_y + 0.5) * CASA, 4)}>ver a casa</button>
          </div>
        )}
      </div>

      <div className="ticker">
        <span>{total === null ? '' : `${total.toLocaleString('pt-BR')} moradores`}</span>
        {ultimos.length > 0 && <span>Acabaram de chegar:</span>}
        {ultimos.map((u) => (
          <button key={u.codigo} style={{ all: 'unset', cursor: 'pointer', color: 'var(--agua)' }} onClick={() => selecionar(u)}>{u.nome}</button>
        ))}
      </div>
      <p className="mudo">
        Arraste para andar · role ou faça pinça para dar zoom · toque num colono para ver o que ele está fazendo · ⌂ volta para a colônia
      </p>
    </div>
  );
}

