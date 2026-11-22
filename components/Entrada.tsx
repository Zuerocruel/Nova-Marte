'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Animação de entrada do site: o foguete na plataforma em Marte liga os propulsores enquanto a barra carrega
 * (sem viagem Terra → Marte). A fumaça nasce no meio e some ANTES de chegar nas bordas (nunca é cortada).
 * Aparece uma vez por sessão; "pular" a qualquer momento. `previa` repete sem parar (aba do painel).
 */
const DURA = 3600;

export default function Entrada({ previa = false }: { previa?: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [visivel, setVisivel] = useState(previa);
  const [saindo, setSaindo] = useState(false);
  const caminho = usePathname();

  useEffect(() => {
    if (previa || /^\/(entrada|jogar|painel)/.test(caminho ?? '')) return;   // prévia e testes do painel: sem entrada
    try { if (sessionStorage.getItem('omz_entrada')) return; sessionStorage.setItem('omz_entrada', '1'); } catch { return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setVisivel(true);
  }, [previa, caminho]);

  useEffect(() => {
    if (!visivel) return;
    const c = cv.current!, x = c.getContext('2d')!;
    let raf = 0, t0 = performance.now();
    const fumaca: { x: number; y: number; vx: number; vy: number; r: number; v: number }[] = [];
    const estrelas = Array.from({ length: 70 }, (_, i) => ({ x: (i * 137.5) % 1, y: ((i * 61.7) % 1) * 0.55, b: (i % 4) / 4 }));

    const quadro = (agora: number) => {
      const W = c.width = c.clientWidth * Math.min(2, devicePixelRatio || 1), H = c.height = c.clientHeight * Math.min(2, devicePixelRatio || 1);
      const u = Math.min(W, H) / 100;   // unidade: 1% do menor lado (tudo escala junto)
      let t = agora - t0;
      if (previa && t > DURA + 1200) { t0 = agora; t = 0; fumaca.length = 0; }
      const k = Math.min(1, t / DURA);
      x.imageSmoothingEnabled = false;
      // céu de Marte
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#140f26'); g.addColorStop(0.55, '#3a1f3a'); g.addColorStop(0.8, '#a8492c'); g.addColorStop(1, '#c1673e');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      for (const e of estrelas) { x.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * e.b})`; x.fillRect(e.x * W, e.y * H, u * 0.35, u * 0.35); }
      x.fillStyle = '#d9b48c'; x.beginPath(); x.arc(W * 0.8, H * 0.18, u * 4, 0, 7); x.fill();   // Fobos
      x.fillStyle = '#b8936f'; x.fillRect(W * 0.8 - u, H * 0.18 - u * 1.5, u * 1.4, u * 1.2);
      // morros e chão
      x.fillStyle = '#7a2f1e';
      x.beginPath(); x.moveTo(0, H * 0.72);
      for (let i = 0; i <= 10; i++) x.lineTo((W * i) / 10, H * (0.68 + 0.05 * Math.sin(i * 1.7)));
      x.lineTo(W, H); x.lineTo(0, H); x.fill();
      x.fillStyle = '#a94f33'; x.fillRect(0, H * 0.82, W, H * 0.18);
      // plataforma
      const cx = W / 2, base = H * 0.82;
      x.fillStyle = '#3a3f5c'; x.fillRect(cx - u * 16, base - u * 2.5, u * 32, u * 2.5);
      x.fillStyle = '#6b6f86'; x.fillRect(cx - u * 16, base - u * 3, u * 32, u * 0.8);
      x.fillStyle = '#ffc83d'; for (let i = -14; i <= 14; i += 4) x.fillRect(cx + i * u, base - u * 2.2, u * 2, u * 0.6);
      x.fillStyle = '#6b6f86'; x.fillRect(cx + u * 10, base - u * 34, u * 2, u * 31);   // torre
      for (let y = 0; y < 30; y += 3) x.fillRect(cx + u * 6, base - u * (6 + y), u * 4, u * 0.5);
      // fumaça (cresce com a carga; some antes das bordas)
      const forca = Math.min(1, k * 1.4);
      for (let i = 0; i < Math.round(1 + forca * 5); i++) {
        fumaca.push({ x: cx + (Math.random() - 0.5) * u * 4, y: base - u * 1.5, vx: (Math.random() - 0.5) * u * (0.4 + forca * 1.6),
                      vy: -Math.random() * u * 0.25, r: u * (1.5 + Math.random() * 2), v: 1 });
      }
      const limite = Math.min(cx, W - cx) * 0.92;   // nunca passa de 92% da distância até a borda
      for (const f of fumaca) {
        f.x += f.vx; f.y += f.vy; f.r += u * 0.12; f.vx *= 0.985;
        const d = Math.abs(f.x - cx) + f.r;
        f.v -= 0.012 + (d > limite * 0.75 ? 0.05 : 0);
        if (d > limite) f.v = 0;
      }
      for (let i = fumaca.length - 1; i >= 0; i--) if (fumaca[i].v <= 0) fumaca.splice(i, 1);
      for (const f of fumaca) { x.fillStyle = `rgba(243,238,254,${Math.max(0, f.v) * 0.55})`; x.beginPath(); x.arc(f.x, f.y, f.r, 0, 7); x.fill(); }
      // foguete (treme quando os propulsores ligam)
      const treme = k > 0.35 ? (Math.random() - 0.5) * u * 0.35 * forca : 0;
      const fx = cx + treme, fy = base - u * 3;
      if (k > 0.2) {   // chamas
        const alt = u * (3 + forca * 9) * (0.85 + Math.random() * 0.3);
        x.fillStyle = '#ffc83d'; x.fillRect(fx - u * 2.4, fy, u * 4.8, alt);
        x.fillStyle = '#ff7a2f'; x.fillRect(fx - u * 1.6, fy, u * 3.2, alt * 0.75);
        x.fillStyle = '#fff6d0'; x.fillRect(fx - u * 0.8, fy, u * 1.6, alt * 0.45);
      }
      x.fillStyle = '#e4e6f0'; x.fillRect(fx - u * 3, fy - u * 22, u * 6, u * 22);
      x.fillStyle = '#c9ced9'; x.fillRect(fx + u * 1.5, fy - u * 22, u * 1.5, u * 22);
      x.fillStyle = '#e2603b'; x.fillRect(fx - u * 3, fy - u * 26, u * 6, u * 4); x.fillRect(fx - u * 2, fy - u * 28, u * 4, u * 2); x.fillRect(fx - u, fy - u * 29.5, u * 2, u * 1.5);
      x.fillStyle = '#3fd0c9'; x.fillRect(fx - u * 1.5, fy - u * 17, u * 3, u * 3);
      x.fillStyle = '#e2603b'; x.fillRect(fx - u * 6, fy - u * 6, u * 3, u * 6); x.fillRect(fx + u * 3, fy - u * 6, u * 3, u * 6);
      // título e barra de carregamento
      const fs = Math.max(12, u * 3.4);
      x.textAlign = 'center'; x.font = `${fs}px "Press Start 2P", monospace`;
      x.fillStyle = '#140f26'; x.fillText('OPERAÇÃO MARTE ZERO', W / 2 + 3, H * 0.12 + 3); x.fillStyle = '#ffc83d'; x.fillText('OPERAÇÃO MARTE ZERO', W / 2, H * 0.12);
      const bw = Math.min(W * 0.7, u * 70), bx = (W - bw) / 2, by = H * 0.9;
      x.fillStyle = '#140f26'; x.fillRect(bx - 4, by - 4, bw + 8, u * 2.6 + 8);
      x.fillStyle = '#3a2f63'; x.fillRect(bx, by, bw, u * 2.6);
      x.fillStyle = '#3fd0c9'; x.fillRect(bx, by, bw * k, u * 2.6);
      x.font = `${Math.max(9, u * 1.8)}px "Press Start 2P", monospace`; x.fillStyle = '#f3eefe';
      const txt = k < 0.35 ? 'CHECANDO OS SISTEMAS' : k < 0.75 ? 'LIGANDO OS PROPULSORES' : k < 1 ? 'PRONTO PARA A COLÔNIA' : 'BEM-VINDO A MARTE!';
      x.fillText(`${txt}  ${Math.round(k * 100)}%`, W / 2, by - u * 1.6);
      if (!previa && t > DURA + 350 && !saindo) setSaindo(true);
      raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
  }, [visivel, previa, saindo]);

  useEffect(() => { if (saindo) { const id = setTimeout(() => setVisivel(false), 450); return () => clearTimeout(id); } }, [saindo]);

  if (!visivel) return null;
  return (
    <div className={`entrada ${saindo ? 'saindo' : ''} ${previa ? 'previa' : ''}`} aria-hidden="true">
      <canvas ref={cv} />
      {!previa && <button type="button" className="entrada-pular" onClick={() => setSaindo(true)}>pular ›</button>}
    </div>
  );
}
