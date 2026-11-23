'use client';

import { useEffect, useRef } from 'react';
import { desenharCapsulaGrande, desenharRover } from '@/lib/colonia-arte';
import { desenharPet, type EspeciePet } from '@/lib/pet-arte';
import type { PosePet } from '@/lib/pet';
import { gerarSprite } from '@/lib/sprite';

/**
 * Prévias animadas da loja, com a MESMA arte do Mundo ao vivo (lib/colonia-arte.ts, fabrica/pet.js).
 * Desenham numa grade pequena (pixels do mundo) e o CSS amplia sem suavizar.
 */
function useCena(w: number, h: number, quadro: (c: CanvasRenderingContext2D, t: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const desenha = (ms: number) => {
      c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = false;
      chao(c, w, h);
      quadro(c, ms / 1000);
      if (!parado) raf = requestAnimationFrame(desenha);
    };
    raf = requestAnimationFrame(desenha);
    return () => cancelAnimationFrame(raf);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

/** Céu em faixas + chão de Marte com pedrinhas (o fundo de todas as prévias). */
function chao(c: CanvasRenderingContext2D, w: number, h: number) {
  const ceu = ['#1a1236', '#2a1840', '#3d2050', '#5a2a4c'];
  const hc = Math.round(h * 0.5), fh = Math.ceil(hc / ceu.length);
  ceu.forEach((k, i) => { c.fillStyle = k; c.fillRect(0, i * fh, w, fh); });
  const r = (n: number) => { const v = Math.sin(n * 127.1) * 43758.5453; return v - Math.floor(v); };
  c.fillStyle = '#ffffff99'; for (let i = 1; i <= 12; i++) c.fillRect(Math.floor(r(i) * w), Math.floor(r(i + 50) * (hc - 4)), 1, 1);
  c.fillStyle = '#7d3a28'; c.fillRect(0, hc - 3, w, 3);
  c.fillStyle = '#b85a37'; c.fillRect(0, hc, w, h - hc);
  c.fillStyle = '#a24c30'; for (let i = 0; i < 14; i++) c.fillRect((i * 29 + 7) % w, hc + 3 + ((i * 17) % (h - hc - 4)), i % 3 ? 1 : 2, 1);
}

export function PreviaCapsula({ variante }: { variante: string }) {
  const ref = useCena(56, 48, (c, t) => desenharCapsulaGrande(c, 12, 10, variante, '#3f8efc', true, t), [variante]);
  return <canvas ref={ref} width={56} height={48} className="previa-loja" role="img" aria-label={`Prévia da cápsula ${variante}`} />;
}

const POSES: PosePet[] = ['andando', 'andando', 'sentado', 'parado', 'pulando', 'cocando', 'correndo', 'sentado'];
export function PreviaPet({ especie }: { especie: EspeciePet }) {
  const ref = useCena(48, 32, (c, t) => {
    const j = Math.floor(t / 1.6), pose = POSES[j % POSES.length];
    const anda = pose === 'andando' || pose === 'correndo';
    const x = 24 + (anda ? Math.sin(t * (pose === 'correndo' ? 2.2 : 1.2)) * 10 : 0);
    const dir = (anda ? (Math.cos(t * (pose === 'correndo' ? 2.2 : 1.2)) >= 0 ? 1 : -1) : 1) as 1 | -1;
    desenharPet(c, x, 26, { pose, dir, t, seed: 3, escala: 1, especie, pulo: pose === 'pulando' ? Math.abs(Math.sin(t * 7)) * 3 : 0 });
  }, [especie]);
  return <canvas ref={ref} width={48} height={32} className="previa-loja" role="img" aria-label={`Prévia do pet: ${especie}`} />;
}

let motorista: HTMLCanvasElement | null = null;   // colono de exemplo dirigindo (feito uma vez)
function spriteMotorista() {
  if (motorista) return motorista;
  motorista = document.createElement('canvas'); motorista.width = 12; motorista.height = 12;
  const x = motorista.getContext('2d')!;
  gerarSprite(42).forEach((l, j) => l.forEach((k, i) => { if (k) { x.fillStyle = k; x.fillRect(i, j, 1, 1); } }));
  return motorista;
}

export function PreviaRover() {
  const ref = useCena(56, 32, (c, t) => {
    const cab = spriteMotorista();
    const vai = Math.sin(t * 0.8), dir = (Math.cos(t * 0.8) >= 0 ? 1 : -1) as 1 | -1;
    desenharRover(c, 28 + vai * 9, 27, dir, t, true, cab);
  }, []);
  return <canvas ref={ref} width={56} height={32} className="previa-loja" role="img" aria-label="Prévia do rover" />;
}
