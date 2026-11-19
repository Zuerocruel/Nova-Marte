'use client';
import { useEffect, useRef } from 'react';
import { gerarSprite } from '@/lib/sprite';

/** Boneco do colono em tamanho grande (arte final se houver; senão o sprite gerado pelo seed). */
export default function AvatarGrande({ seed, url, tamanho = 144 }: { seed: number; url: string | null; tamanho?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (url) return;
    const x = ref.current?.getContext('2d');
    if (!x) return;
    gerarSprite(seed).forEach((l, j) => l.forEach((c, i) => { if (c) { x.fillStyle = c; x.fillRect(i, j, 1, 1); } }));
  }, [seed, url]);
  const estilo = { width: tamanho, height: tamanho, imageRendering: 'pixelated' as const, background: 'var(--ceu)', border: '4px solid var(--borda)' };
  return url
    ? <img src={url} alt="" width={tamanho} height={tamanho} style={estilo} /> // eslint-disable-line @next/next/no-img-element
    : <canvas ref={ref} width={12} height={12} style={estilo} aria-hidden />;
}
