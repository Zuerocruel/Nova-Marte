'use client';
import { useEffect, useRef } from 'react';
import { iconeDoProduto, spriteContornado } from '@/lib/colonia-arte';

/** Ícone em pixel art do item (o mesmo da casa no mapa e no vídeo), para produtos sem imagem. */
export default function IconeItem({ slug }: { slug: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    const s = spriteContornado(iconeDoProduto(slug));
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, c.width, c.height);
    const esc = Math.floor(c.width / (s.width + 2));
    x.drawImage(s, (c.width - s.width * esc) / 2, (c.height - s.height * esc) / 2, s.width * esc, s.height * esc);
  }, [slug]);
  return <canvas ref={ref} width={120} height={120} className="sem-img" style={{ imageRendering: 'pixelated' }} aria-hidden />;
}
