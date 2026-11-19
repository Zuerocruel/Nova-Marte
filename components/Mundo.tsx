'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { gerarSprite } from '@/lib/sprite';
import { CHUNK, CHUNKS_POR_LINHA, LARGURA_MUNDO, type PersonagemPublico } from '@/lib/mundo';
import {
  BLOCO, CASA, COR, blocoDeTerreno, desenharBase, desenharClima, desenharObra, desenharTrilha,
  iconeDoProduto, spriteContornado, spriteMapa,
} from '@/lib/colonia-arte';
import type { EstadoColonia } from '@/lib/colonia';
import type { MensagemChat } from '@/app/api/chat/route';

/**
 * Mundo ao vivo: a colônia como no vídeo (módulo de pouso, obras, Vega e Lia trabalhando, clima da
 * estação) + as casas de todos os colonos, carregadas por quarteirão. Recarrega sozinho e mostra
 * balões com as mensagens do chat em cima da casa de quem escreveu.
 */
const RECARREGA_MS = 30_000;
const ZOOM_MIN = 0.75, ZOOM_MAX = 8;
const BALAO_MS = 12_000;

type Chunk = { dados: PersonagemPublico[]; em: number } | 'carregando';

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const suave = (k: number) => (k = clamp(k), k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

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

  const [selecionado, setSelecionado] = useState<PersonagemPublico | null>(null);
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
      chunks.current.set(k, { dados: Array.isArray(dados) ? dados : [], em: Date.now() });
    } catch {
      chunks.current.delete(k);
    }
  }, []);

  useEffect(() => {
    const resumo = () =>
      fetch('/api/mundo/resumo').then((r) => r.json()).then((j) => {
        setTotal(j.total);
        setUltimos(j.ultimos ?? []);
        if (j.total !== totalRef.current) {
          totalRef.current = j.total;
          for (const k of [...terreno.current.keys()]) if (!k.startsWith('n')) terreno.current.delete(k);   // lotes cresceram
        }
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

  // ---------- desenho ----------
  useEffect(() => {
    const cv = canvasRef.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;

    const lotes = () => {   // área dos lotes dos colonos (igual ao vídeo)
      const n = totalRef.current;
      if (!n) return null;
      const linhas = Math.ceil(n / LARGURA_MUNDO);
      return { x1: linhas > 1 ? LARGURA_MUNDO - 1 : Math.min(LARGURA_MUNDO - 1, Math.max(15, ((n - 1) % LARGURA_MUNDO) + 3)), y1: linhas - 1 };
    };

    const blocoTerreno = (bx: number, by: number) => {
      const lt = lotes();
      const k = by < 0 ? `n${bx},${by}` : `${bx},${by}`;
      let c = terreno.current.get(k);
      if (c) return c;
      const e = estadoRef.current;
      const reservados = e ? [e.base, ...e.obras].map((o) => ({ x0: o.x - 1, y0: o.y - 1, x1: o.x + o.w + 1, y1: o.y + o.h + 1 })) : [];
      const lote = (x: number, y: number) => !!lt && y >= 0 && y <= lt.y1 && x >= 0 && x <= lt.x1;
      const livre = (x: number, y: number) => !reservados.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)
        && !(lt && y >= -1 && y <= lt.y1 + 1 && x >= -1 && x <= lt.x1 + 1);
      c = blocoDeTerreno(bx, by, livre, lote);
      if (terreno.current.size > 160) terreno.current.clear();
      terreno.current.set(k, c);
      return c;
    };

    const desenhar = (ms: number) => {
      const t = ms / 1000;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      }
      const e = estadoRef.current;
      const c = cam.current;
      if (!c.pronta && e && w > 0) {   // começa olhando a colônia (base + obras + primeiras casas)
        c.zoom = w < 600 ? 2.2 : 3;
        c.x = (e.base.x + e.base.w / 2) * CASA - w / 2 / c.zoom;
        c.y = (e.base.y + e.base.h + 2.5) * CASA - h / 2 / c.zoom;   // entre a base e as primeiras casas
        c.pronta = true;
      }
      const { x: camX, y: camY, zoom } = c;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#b85a37';
      ctx.fillRect(0, 0, w, h);

      // ---- mundo (coordenadas em pixels do mundo)
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -camX * zoom * dpr, -camY * zoom * dpr);
      const vx0 = Math.floor(camX / CASA), vx1 = Math.ceil((camX + w / zoom) / CASA);
      const vy0 = Math.floor(camY / CASA), vy1 = Math.ceil((camY + h / zoom) / CASA);
      const TB = BLOCO * CASA;
      for (let by = Math.floor(vy0 / BLOCO); by <= Math.floor(vy1 / BLOCO); by++)
        for (let bx = Math.floor(vx0 / BLOCO); bx <= Math.floor(vx1 / BLOCO); bx++)
          ctx.drawImage(blocoTerreno(bx, by), bx * TB, by * TB, TB + 0.5, TB + 0.5);

      if (e) {
        desenharTrilha(ctx, e.base);
        const energia = e.obras.some((o) => o.tipo === 'solar' && o.status === 'concluida');
        const atual = e.obras.find((o) => o.status !== 'concluida');
        for (const o of e.obras) {
          if (o.status === 'planejada' && o !== atual) continue;
          desenharObra(ctx, o, { p: o.status === 'concluida' ? 1 : o.progresso / 100, dem: true, energia: o.status === 'concluida' }, e.base, t);
        }
        desenharBase(ctx, e.base, t, energia);
      }

      // casas dos colonos (só existem de y = 0 para baixo)
      const sel = selecionadoRef.current;
      const visiveis: PersonagemPublico[] = [];
      if (vy1 >= 0) {
        const x0 = Math.max(0, vx0), x1 = Math.min(LARGURA_MUNDO - 1, vx1), y0 = Math.max(0, vy0);
        const linhasMax = Math.ceil((totalRef.current || 1) / LARGURA_MUNDO) + 1;
        const cx0 = Math.floor(x0 / CHUNK), cx1 = Math.min(CHUNKS_POR_LINHA - 1, Math.floor(x1 / CHUNK));
        const cy0 = Math.floor(y0 / CHUNK), cy1 = Math.min(Math.floor(vy1 / CHUNK), Math.floor(linhasMax / CHUNK));
        for (let cy = cy0; cy <= cy1; cy++)
          for (let cx = cx0; cx <= cx1; cx++) {
            carregarChunk(cx, cy);
            const ch = chunks.current.get(`${cx},${cy}`);
            if (!ch || ch === 'carregando') continue;
            for (const p of ch.dados) {
              if (p.pos_x < vx0 - 1 || p.pos_x > vx1 + 1 || p.pos_y < vy0 - 1 || p.pos_y > vy1 + 1) continue;
              visiveis.push(p);
              const x = p.pos_x * CASA, y = p.pos_y * CASA;
              ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + 4, y + 14, 8, 1.5);
              let img: HTMLImageElement | undefined;
              if (p.sprite_url) {
                img = imagens.current.get(p.sprite_url);
                if (!img) { img = new Image(); img.src = p.sprite_url; imagens.current.set(p.sprite_url, img); }
              }
              const pula = Math.sin(t * 2 + p.pos_x * 1.7 + p.pos_y) > 0.97 ? -1 : 0;   // de vez em quando alguém dá um pulinho
              if (img && img.complete && img.naturalWidth) ctx.drawImage(img, x + 2, y + 2 + pula, 12, 12);
              else ctx.drawImage(spriteColono(p.seed), x + 2, y + 2 + pula, 12, 12);
              if (p.status === 'estreou') { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x + 12.5, y + 0.5, 2.5, 2.5); }
            }
          }
      }
      if (e) for (const cp of e.compras) {
        if (cp.pos_x < vx0 - 1 || cp.pos_x > vx1 + 1 || cp.pos_y < vy0 - 1 || cp.pos_y > vy1 + 1) continue;
        const x = cp.pos_x * CASA + 4, y = cp.pos_y * CASA + 14;
        ctx.drawImage(spriteContornado(iconeDoProduto(cp.produto_slug)), x - 1, y, 12.5, 12.5);
      }

      // Vega e Lia: vão da casa até a obra, trabalham e voltam (ciclo de ~32 s, cada um no seu ritmo)
      const trabalhando: { x: number; y: number; nome: string }[] = [];
      if (e) {
        const atual = e.obras.find((o) => o.status !== 'concluida');
        e.fundadores.forEach((f, i) => {
          const casa = { x: f.casa[0] * CASA, y: f.casa[1] * CASA };
          const alvo = atual
            ? { x: (atual.x + atual.w / 2 + (i ? 1.2 : -1.2)) * CASA, y: (atual.y + atual.h + 0.6) * CASA }
            : { x: casa.x + (i ? 24 : -24), y: casa.y + 10 };
          const fase = ((t + i * 13) / 32) % 1;
          let k = 0;
          if (fase < 0.3) k = 0; else if (fase < 0.45) k = suave((fase - 0.3) / 0.15);
          else if (fase < 0.8) k = 1; else if (fase < 0.95) k = 1 - suave((fase - 0.8) / 0.15); else k = 0;
          const andando = (fase > 0.3 && fase < 0.45) || (fase > 0.8 && fase < 0.95);
          const dir = (fase < 0.6 ? alvo.x - casa.x : casa.x - alvo.x) >= 0 ? 1 : -1;
          const px = lerp(casa.x, alvo.x, k), py = lerp(casa.y, alvo.y, k);
          const pulo = andando && Math.floor(t * 8) % 2 ? -1 : (k === 1 && Math.floor(t * 3 + i) % 2 ? -1 : 0);
          ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px - 4, py - 1, 8, 2);
          ctx.save(); ctx.translate(Math.round(px), Math.round(py + pulo)); if (dir < 0) ctx.scale(-1, 1);
          ctx.drawImage(spriteMapa(f.sprite), -6, -12, 12, 12); ctx.restore();
          if (k === 1 && atual && Math.floor(t * 4 + i) % 3 === 0) { ctx.fillStyle = COR.ouro; ctx.fillRect(px + (i ? -7 : 5), py - 8, 2, 2); }   // faísca da ferramenta
          trabalhando.push({ x: px, y: py - 14, nome: f.curto });
        });
      }

      // ---- tela (pixels da tela)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tela = (wx: number, wy: number) => ({ x: (wx - camX) * zoom, y: (wy - camY) * zoom });

      if (zoom >= 4) {
        ctx.font = `${Math.min(12, 2.6 * zoom)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        for (const p of visiveis) {
          if (sel && sel.codigo === p.codigo) continue;
          const s = tela(p.pos_x * CASA + 8, p.pos_y * CASA + 16.8);
          ctx.fillText(p.nome, s.x, s.y, CASA * zoom);
        }
      }
      if (zoom >= 2.5) {
        ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center';
        for (const f of trabalhando) {
          const s = tela(f.x, f.y);
          const lw = ctx.measureText(f.nome).width + 10;
          ctx.fillStyle = '#140f26cc'; ctx.fillRect(s.x - lw / 2, s.y - 16, lw, 15);
          ctx.fillStyle = COR.areia; ctx.fillText(f.nome, s.x, s.y - 5);
        }
      }

      if (sel) {
        const s = tela(sel.pos_x * CASA, sel.pos_y * CASA);
        if (Math.floor(ms / 400) % 2 === 0) { ctx.strokeStyle = COR.agua; ctx.lineWidth = 3; ctx.strokeRect(s.x + 1, s.y + 1, CASA * zoom - 2, CASA * zoom - 2); }
        const rot = `${sel.nome} @${sel.handle}`;
        ctx.font = 'bold 13px system-ui, sans-serif';
        const lw = ctx.measureText(rot).width + 12;
        ctx.fillStyle = COR.ceu; ctx.fillRect(s.x + (CASA * zoom) / 2 - lw / 2, s.y - 26, lw, 20);
        ctx.fillStyle = COR.agua; ctx.textAlign = 'center'; ctx.fillText(rot, s.x + (CASA * zoom) / 2, s.y - 11);
      }

      // balões do chat em cima da casa de quem escreveu
      const agora = performance.now();
      const porCasa = new Map<string, MensagemChat>();
      for (const m of mensagensRef.current) if (agora - (chegada.current.get(m.id) ?? -1e9) < BALAO_MS) porCasa.set(`${m.pos_x},${m.pos_y}`, m);
      ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left';
      for (const m of porCasa.values()) {
        const s = tela(m.pos_x * CASA + 8, m.pos_y * CASA);
        if (s.x < -200 || s.x > w + 200 || s.y < -60 || s.y > h + 60) continue;
        const idade = (agora - (chegada.current.get(m.id) ?? 0)) / BALAO_MS;
        ctx.globalAlpha = idade > 0.85 ? (1 - idade) / 0.15 : 1;
        const txt = m.texto.length > 42 ? m.texto.slice(0, 40) + '…' : m.texto;
        const lw = Math.min(260, ctx.measureText(txt).width + 14), bx = Math.round(s.x - lw / 2), by = Math.round(s.y - 34);
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
      c.x = Math.max(-80 * CASA, Math.min((LARGURA_MUNDO + 40) * CASA, c.x - dx / c.zoom));
      c.y = Math.max(-90 * CASA, Math.min((Math.ceil((totalRef.current || 1) / LARGURA_MUNDO) + 60) * CASA, c.y - dy / c.zoom));
      ponteiros.set(e.pointerId, p);
    };
    const up = (e: PointerEvent) => {
      const p = local(e);
      ponteiros.delete(e.pointerId);
      if (ponteiros.size < 2) distPinca = 0;
      if (arrastou) return;
      const c = cam.current;
      const tx = Math.floor((p.x / c.zoom + c.x) / CASA), ty = Math.floor((p.y / c.zoom + c.y) / CASA);
      const ch = ty >= 0 ? chunks.current.get(`${Math.floor(tx / CHUNK)},${Math.floor(ty / CHUNK)}`) : undefined;
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
          <button aria-label="Aproximar" onClick={() => { const cv = canvasRef.current!; const c = cam.current; const nz = Math.min(ZOOM_MAX, c.zoom * 1.4); c.x += cv.clientWidth / 2 / c.zoom - cv.clientWidth / 2 / nz; c.y += cv.clientHeight / 2 / c.zoom - cv.clientHeight / 2 / nz; c.zoom = nz; }}>+</button>
          <button aria-label="Afastar" onClick={() => { const cv = canvasRef.current!; const c = cam.current; const nz = Math.max(ZOOM_MIN, c.zoom / 1.4); c.x += cv.clientWidth / 2 / c.zoom - cv.clientWidth / 2 / nz; c.y += cv.clientHeight / 2 / c.zoom - cv.clientHeight / 2 / nz; c.zoom = nz; }}>−</button>
          <button aria-label="Voltar para a colônia" onClick={() => { if (e) centralizarEm((e.base.x + e.base.w / 2) * CASA, (e.base.y + e.base.h) * CASA); }}>⌂</button>
        </div>
        {selecionado && (
          <div className="ficha">
            <strong>{selecionado.nome}</strong> · @{selecionado.handle} ({selecionado.plataforma})<br />
            <span className="mudo">
              {selecionado.codigo} · {selecionado.status === 'estreou' ? '★ já apareceu num episódio'
                : selecionado.status === 'desenhado' ? 'arte pronta, esperando o episódio' : 'na fila para ser desenhado'}
            </span><br />
            <a href={`/colono/${selecionado.codigo}`}>Ver perfil →</a>
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
      <p className="mudo">Arraste para andar · role ou faça pinça para dar zoom · ★ = já apareceu num episódio · ⌂ volta para a colônia</p>
    </div>
  );
}
