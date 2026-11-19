'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { desenharSprite } from '@/lib/sprite';
import { CHUNK, CHUNKS_POR_LINHA, LARGURA_MUNDO, type PersonagemPublico } from '@/lib/mundo';

const CASA = 16;            // tamanho de uma casa em "pixels do mundo"
const RECARREGA_MS = 30_000; // quarteirões visíveis são recarregados (mundo ao vivo)
const ZOOM_MIN = 0.75, ZOOM_MAX = 8;

type Chunk = { dados: PersonagemPublico[]; em: number } | 'carregando';

export default function Mundo({ codigoInicial, novo }: { codigoInicial?: string; novo?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ x: 0, y: 0, zoom: 3 });
  const chunks = useRef(new Map<string, Chunk>());
  const imagens = useRef(new Map<string, HTMLImageElement>());
  const selecionadoRef = useRef<PersonagemPublico | null>(null);
  const totalLinhas = useRef(1);

  const [selecionado, setSelecionado] = useState<PersonagemPublico | null>(null);
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<PersonagemPublico[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [ultimos, setUltimos] = useState<PersonagemPublico[]>([]);

  const selecionar = useCallback((p: PersonagemPublico | null, centralizar = true) => {
    selecionadoRef.current = p;
    setSelecionado(p);
    const cv = canvasRef.current;
    if (p && centralizar && cv) {
      const c = cam.current;
      c.zoom = Math.max(c.zoom, 4);
      c.x = (p.pos_x + 0.5) * CASA - cv.clientWidth / 2 / c.zoom;
      c.y = (p.pos_y + 0.5) * CASA - cv.clientHeight / 2 / c.zoom;
    }
  }, []);

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
        totalLinhas.current = Math.max(1, Math.ceil(j.total / LARGURA_MUNDO));
      }).catch(() => {});
    resumo();
    const t = setInterval(resumo, 15_000);
    return () => clearInterval(t);
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

    const desenhar = (t: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const { x: camX, y: camY, zoom } = cam.current;

      ctx.fillStyle = '#241a3d';
      ctx.fillRect(0, 0, w, h);

      const x0 = Math.max(0, Math.floor(camX / CASA)), x1 = Math.min(LARGURA_MUNDO - 1, Math.ceil((camX + w / zoom) / CASA));
      const y0 = Math.max(0, Math.floor(camY / CASA)), y1 = Math.ceil((camY + h / zoom) / CASA);
      const linhasMax = totalLinhas.current + 2;

      // chão (lotes)
      for (let y = y0; y <= Math.min(y1, linhasMax); y++)
        for (let x = x0; x <= x1; x++) {
          const sx = (x * CASA - camX) * zoom, sy = (y * CASA - camY) * zoom;
          ctx.fillStyle = (x + y) % 2 ? '#c4693f' : '#b85f39';
          ctx.fillRect(sx, sy, CASA * zoom + 0.5, CASA * zoom + 0.5);
        }

      // quarteirões visíveis
      const cx0 = Math.floor(x0 / CHUNK), cx1 = Math.min(CHUNKS_POR_LINHA - 1, Math.floor(x1 / CHUNK));
      const cy0 = Math.floor(y0 / CHUNK), cy1 = Math.min(Math.floor(y1 / CHUNK), Math.floor(linhasMax / CHUNK));
      const sel = selecionadoRef.current;
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++) {
          carregarChunk(cx, cy);
          const ch = chunks.current.get(`${cx},${cy}`);
          if (!ch || ch === 'carregando') continue;
          for (const p of ch.dados) {
            if (p.pos_x < x0 - 1 || p.pos_x > x1 + 1 || p.pos_y < y0 - 1 || p.pos_y > y1 + 1) continue;
            const sx = (p.pos_x * CASA - camX) * zoom, sy = (p.pos_y * CASA - camY) * zoom;
            const esc = zoom;
            // sombra
            ctx.fillStyle = '#0003';
            ctx.fillRect(sx + 4 * esc, sy + 14 * esc, 8 * esc, 1.5 * esc);
            if (p.sprite_url) {
              let img = imagens.current.get(p.sprite_url);
              if (!img) { img = new Image(); img.src = p.sprite_url; imagens.current.set(p.sprite_url, img); }
              if (img.complete && img.naturalWidth) ctx.drawImage(img, sx + 2 * esc, sy + 2 * esc, 12 * esc, 12 * esc);
              else desenharSprite(ctx, p.seed, sx + 2 * esc, sy + 2 * esc, esc);
            } else {
              desenharSprite(ctx, p.seed, sx + 2 * esc, sy + 2 * esc, esc);
            }
            if (p.status === 'estreou') { ctx.fillStyle = '#ffd84a'; ctx.fillRect(sx + 12.5 * esc, sy + 0.5 * esc, 2.5 * esc, 2.5 * esc); }
            if (zoom >= 4 && (!sel || sel.codigo !== p.codigo)) {
              ctx.font = `${Math.min(12, 2.6 * zoom)}px system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.fillStyle = '#fff';
              ctx.fillText(p.nome, sx + 8 * esc, sy + 16.8 * esc, CASA * esc);
            }
          }
        }

      // destaque do selecionado (pisca)
      if (sel) {
        const sx = (sel.pos_x * CASA - camX) * zoom, sy = (sel.pos_y * CASA - camY) * zoom;
        if (Math.floor(t / 400) % 2 === 0) {
          ctx.strokeStyle = '#3fd0c9'; ctx.lineWidth = 3;
          ctx.strokeRect(sx + 1, sy + 1, CASA * zoom - 2, CASA * zoom - 2);
        }
        const rot = `${sel.nome} @${sel.handle}`;
        ctx.font = 'bold 13px system-ui, sans-serif';
        const lw = ctx.measureText(rot).width + 12;
        const lx = sx + (CASA * zoom) / 2 - lw / 2, ly = sy - 26;
        ctx.fillStyle = '#140f26'; ctx.fillRect(lx, ly, lw, 20);
        ctx.fillStyle = '#3fd0c9'; ctx.textAlign = 'center';
        ctx.fillText(rot, sx + (CASA * zoom) / 2, ly + 15);
      }

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
      const novo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.zoom * fator));
      c.x += px / c.zoom - px / novo;
      c.y += py / c.zoom - py / novo;
      c.zoom = novo;
    };
    const local = (e: PointerEvent | WheelEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const down = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      ponteiros.set(e.pointerId, local(e));
      arrastou = false;
      if (ponteiros.size === 2) {
        const [a, b] = [...ponteiros.values()];
        distPinca = Math.hypot(a.x - b.x, a.y - b.y);
      }
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
        distPinca = d;
        arrastou = true;
        return;
      }
      const dx = p.x - ant.x, dy = p.y - ant.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) arrastou = true;
      cam.current.x -= dx / cam.current.zoom;
      cam.current.y -= dy / cam.current.zoom;
      ponteiros.set(e.pointerId, p);
    };
    const up = (e: PointerEvent) => {
      const p = local(e);
      ponteiros.delete(e.pointerId);
      if (ponteiros.size < 2) distPinca = 0;
      if (arrastou) return;
      // clique: qual casa?
      const c = cam.current;
      const tx = Math.floor((p.x / c.zoom + c.x) / CASA), ty = Math.floor((p.y / c.zoom + c.y) / CASA);
      const ch = chunks.current.get(`${Math.floor(tx / CHUNK)},${Math.floor(ty / CHUNK)}`);
      const achado = ch && ch !== 'carregando' ? ch.dados.find((d) => d.pos_x === tx && d.pos_y === ty) : undefined;
      selecionar(achado ?? null, false);
    };
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      zoomEm(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    };

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

  return (
    <div>
      <form className="busca" onSubmit={(e) => { e.preventDefault(); buscar(q, true); }} role="search">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Procure seu nome, @ ou código (NM000123)"
          aria-label="Procurar personagem"
        />
        <button className="btn">Procurar</button>
      </form>

      {resultados && (
        resultados.length ? (
          <ul className="resultados">
            {resultados.map((p) => (
              <li key={p.codigo}>
                <button onClick={() => selecionar(p)}>{p.nome} · @{p.handle}</button>
              </li>
            ))}
          </ul>
        ) : <p className="mudo">Ninguém com esse nome ainda. <a href="/">Crie seu personagem</a>.</p>
      )}

      {novo && selecionado && <p className="pixel" style={{ fontSize: 12, color: 'var(--areia)' }}>Bem-vindo à Operação Marte Zero! Essa é a sua casa.</p>}

      <div className="mundo-palco">
        <canvas ref={canvasRef} aria-label="Mapa do mundo Operação Marte Zero. Arraste para andar, role para dar zoom." />
        {selecionado && (
          <div className="ficha">
            <strong>{selecionado.nome}</strong> · @{selecionado.handle} ({selecionado.plataforma})<br />
            <span className="mudo">
              {selecionado.codigo} · casa {selecionado.pos_x},{selecionado.pos_y} ·{' '}
              {selecionado.status === 'estreou' ? '★ já apareceu num episódio'
                : selecionado.status === 'desenhado' ? 'arte pronta, esperando o episódio'
                : 'na fila para ser desenhado'}
            </span>
          </div>
        )}
      </div>

      <div className="ticker" aria-live="polite">
        <span>{total === null ? '' : `${total.toLocaleString('pt-BR')} moradores`}</span>
        {ultimos.length > 0 && <span>Acabaram de chegar:</span>}
        {ultimos.map((u) => (
          <button key={u.codigo} style={{ all: 'unset', cursor: 'pointer', color: 'var(--agua)' }}
            onClick={() => selecionar(u)}>
            {u.nome}
          </button>
        ))}
      </div>
      <p className="mudo">Arraste para andar · role ou faça pinça para dar zoom · ★ = já apareceu num episódio</p>
    </div>
  );
}
