'use client';

import { useEffect, useRef } from 'react';

/**
 * Paisagem da colônia em pixel art (capa da página inicial).
 * Desenha numa grade baixa (150 px de altura) e o CSS amplia sem suavizar.
 * Céu em faixas, estrelas piscando, Terra ao longe, morros, módulos da base, estufa, antena,
 * foguete na plataforma e colonos andando. Com "reduzir movimento", fica parada.
 */
const H = 150;
const VISOR = ['#3fd0c9', '#ffd04a', '#ff7aa8', '#8be36b', '#b48cff', '#ff9a3d'];
const ROUPA = ['#e8e9f0', '#ffcf5a', '#e2603b', '#5fa8ff', '#9be38a'];

function rnd(s: number) { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

export default function PaisagemHero({ colonos = 12 }: { colonos?: number }) {
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = cv.current!; const x = c.getContext('2d')!;
    const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, W = 300;
    const n = Math.max(6, Math.min(18, colonos));
    const gente = Array.from({ length: n }, (_, i) => ({
      x: rnd(i + 1), y: 0.74 + rnd(i + 9) * 0.2, v: (0.004 + rnd(i + 4) * 0.008) * (rnd(i + 7) > 0.5 ? 1 : -1),
      visor: VISOR[i % VISOR.length], roupa: ROUPA[(i * 3) % ROUPA.length], pausa: 0,
    }));

    const medir = () => {
      const r = c.getBoundingClientRect();
      W = Math.max(200, Math.round((H * r.width) / Math.max(1, r.height)));
      c.width = W; c.height = H;
    };
    medir();
    const ro = new ResizeObserver(medir); ro.observe(c);

    const px = (cor: string, a: number, b: number, w = 1, h = 1) => { x.fillStyle = cor; x.fillRect(Math.round(a), Math.round(b), w, h); };
    const chao = Math.round(H * 0.64);

    const quadro = (t: number) => {
      const s = t / 1000;
      // céu em faixas
      const faixas = ['#0b0918', '#110d24', '#181232', '#211741', '#2d1b4a', '#3d2050', '#55264f', '#73304a'];
      const fh = Math.ceil(chao / faixas.length);
      faixas.forEach((cor, i) => px(cor, 0, i * fh, W, fh + 1));
      // estrelas
      for (let i = 0; i < W * 0.35; i++) {
        const sx = rnd(i * 3.1) * W, sy = rnd(i * 7.7) * chao * 0.7;
        const brilho = rnd(i * 1.3 + Math.floor(s * 1.5 + i) * 0.01);
        px(brilho > 0.92 ? '#ffffff' : brilho > 0.5 ? '#c9c2ee' : '#6d64a3', sx, sy);
      }
      // estrela cadente de vez em quando
      const ciclo = s % 9;
      if (ciclo < 0.8) { const k = ciclo / 0.8; for (let j = 0; j < 6; j++) px(j ? '#ffe9a8' : '#fff', W * (0.2 + k * 0.4) - j * 2, 8 + k * 22 - j, 1, 1); }
      // Terra ao longe e Fobos
      const tx = Math.round(W * 0.88), ty = 9;
      for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) {
        if (a * a + b * b > 18) continue;
        const terra = (a > -2 && a < 2 && b > -3 && b < 1) || (a > 1 && b > 1);   // dois "continentes"
        px(terra ? '#5fd068' : a + b > 3 ? '#2b55b8' : '#3f7cf0', tx + a, ty + b);
      }
      px('#cfe2ff', tx - 3, ty - 2, 2, 1);
      px('#bba08a', W * 0.12, 30, 4, 3); px('#8f7461', W * 0.12 + 3, 31, 1, 2);
      // morros ao fundo e na frente
      for (let i = 0; i < W; i++) {
        const m1 = chao - 14 - Math.round(10 * Math.abs(Math.sin(i * 0.021)) + 6 * Math.sin(i * 0.067));
        px('#4a1f38', i, m1, 1, chao - m1);
        const m2 = chao - 4 - Math.round(5 * Math.abs(Math.sin(i * 0.043 + 1.3)));
        px('#6e2a2a', i, m2, 1, chao - m2);
      }
      // solo
      px('#9c3f24', 0, chao, W, H - chao);
      px('#b44c2a', 0, chao + 3, W, H - chao - 3);
      for (let i = 0; i < W * 0.5; i++) px(rnd(i * 5.3) > 0.5 ? '#8a3620' : '#c9623a', rnd(i * 2.9) * W, chao + 4 + rnd(i * 4.1) * (H - chao - 4), 2, 1);
      // crateras
      [[0.07, 0.86], [0.46, 0.93], [0.7, 0.82]].forEach(([cx, cy]) => { px('#7d311b', W * cx, H * cy, 9, 2); px('#d47248', W * cx + 1, H * cy + 2, 7, 1); });

      // antena com luz piscando
      const ax = Math.round(W * 0.08);
      px('#7d8590', ax, chao - 34, 2, 36);
      for (let y = 0; y < 30; y += 5) px('#4a505a', ax - 2, chao - 30 + y, 6, 1);
      px('#c9ced9', ax - 5, chao - 38, 12, 2); px('#c9ced9', ax - 3, chao - 40, 8, 2);
      if (Math.floor(s * 1.6) % 2 === 0 || parado) px('#ff4d4d', ax, chao - 43, 2, 2);

      // estufa (cúpula verde)
      const ex = Math.round(W * 0.22), ey = chao + 6;
      for (let a = -13; a <= 13; a++) { const h = Math.round(Math.sqrt(169 - a * a) * 0.75); px('#9fe6d6', ex + a, ey - h, 1, h); }
      for (let a = -11; a <= 11; a += 3) px('#3f9a4a', ex + a, ey - 4 - Math.round(rnd(a) * 4), 2, 4 + Math.round(rnd(a) * 4));
      px('#5a6170', ex - 14, ey, 29, 2);
      px('#e8fbf7', ex - 6, ey - 8, 2, 2);

      // módulos habitacionais ligados por tubo
      const mods = [[0.36, 18, 13], [0.5, 22, 16], [0.62, 16, 12]];
      px('#5a6170', W * 0.36, chao + 1, W * 0.28, 3);
      mods.forEach(([mx, w, h], i) => {
        const bx = Math.round(W * mx), by = chao + 4 - h;
        px('#2e323b', bx - 1, by - 1, w + 2, h + 2);
        px('#cfd3dc', bx, by, w, h);
        px('#a3a9b6', bx, by + h - 3, w, 3);
        px('#e2603b', bx, by, w, 2);
        for (let j = 0; j < Math.floor(w / 6); j++) px(Math.floor(s * 0.3 + i + j) % 5 === 0 ? '#ffd04a' : '#ffe9a0', bx + 3 + j * 6, by + 5, 3, 3);
      });

      // painéis solares
      for (let i = 0; i < 3; i++) { const sx = Math.round(W * 0.7) + i * 9; px('#2b3a8f', sx, chao - 1, 7, 4); px('#5f78e0', sx + 1, chao, 2, 1); px('#5a6170', sx + 3, chao + 3, 1, 3); }

      // foguete na plataforma
      const fx = Math.round(W * 0.9), fy = chao + 2;
      px('#3a3f5c', fx - 10, fy, 21, 3); px('#ffd04a', fx - 8, fy + 1, 2, 1); px('#ffd04a', fx + 7, fy + 1, 2, 1);
      px('#e4e6f0', fx - 2, fy - 20, 5, 20); px('#b9bfcc', fx + 2, fy - 20, 1, 20);
      px('#e2603b', fx - 2, fy - 23, 5, 3); px('#e2603b', fx - 1, fy - 25, 3, 2); px('#e2603b', fx, fy - 26, 1, 1);
      px('#3fd0c9', fx - 1, fy - 15, 3, 3);
      px('#e2603b', fx - 4, fy - 6, 2, 6); px('#e2603b', fx + 3, fy - 6, 2, 6);
      if (!parado && Math.floor(s * 6) % 2) px('#ffb347', fx - 1, fy - 1, 3, 1);

      // colonos (os de trás primeiro)
      const ordem = [...gente].sort((a, b) => a.y - b.y);
      for (const g of ordem) {
        if (!parado) {
          if (g.pausa > 0) g.pausa -= 1;
          else { g.x += g.v / 6; if (rnd(g.x * 999 + s) > 0.997) g.pausa = 90; }
          if (g.x < 0.03 || g.x > 0.97) { g.v *= -1; g.x = Math.min(0.97, Math.max(0.03, g.x)); }
        }
        const gx = Math.round(g.x * W), gy = Math.round(g.y * H);
        const passo = g.pausa > 0 || parado ? 0 : Math.floor(s * 6 + gx) % 2;
        px('#00000044', gx - 1, gy + 1, 6, 1);
        px(g.roupa, gx, gy - 6, 4, 4);                      // corpo
        px('#f3f4f8', gx, gy - 10, 4, 4);                   // capacete
        px(g.visor, g.v > 0 ? gx + 2 : gx, gy - 9, 2, 2);   // visor virado pra onde anda
        px('#4a505a', gx + (g.v > 0 ? -1 : 4), gy - 6, 1, 3); // mochila
        px('#2e323b', gx + (passo ? 0 : 1), gy - 2, 1, 2);
        px('#2e323b', gx + (passo ? 3 : 2), gy - 2, 1, 2);
      }
      // poeira
      for (let i = 0; i < 14; i++) {
        const dx = (rnd(i) * W + s * (6 + rnd(i + 2) * 10)) % W, dy = chao - 6 + rnd(i + 5) * (H - chao) + Math.sin(s + i) * 2;
        px('#e8a07a55', dx, dy);
      }
      if (!parado) raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [colonos]);

  return <canvas ref={cv} className="paisagem" aria-hidden="true" />;
}
