'use client';

import { useEffect, useRef, useState } from 'react';
import { gerarSprite, OPCOES_SPRITE, PENTEADOS, SEED_MAX, seedDosTracos, tracosDoSeed, type Tracos } from '@/lib/sprite';

/**
 * Monta o boneco (cadastro e troca única no perfil): pele, cabelo (ou chapéu), roupa e calça.
 * Guarda o resultado como um seed (campo escondido "seed"), o mesmo número que desenha o colono
 * no mapa, no painel e nos episódios.
 */
export default function MontarBoneco({ seedInicial, aoMudar }: { seedInicial?: number; aoMudar?: (seed: number) => void } = {}) {
  const [seed, setSeed] = useState<number | null>(null);
  const [t, setT] = useState<Tracos | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);

  const usar = (s: number) => { setSeed(s); setT(tracosDoSeed(s)); aoMudar?.(s); };
  const sortear = () => usar(1 + Math.floor(Math.random() * SEED_MAX));
  // começa pelo boneco atual (perfil) ou sorteia só no navegador (evita diferença entre servidor e cliente)
  useEffect(() => { if (seedInicial) usar(seedInicial); else sortear(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const x = cv.current?.getContext('2d');
    if (!x || seed === null) return;
    x.clearRect(0, 0, 12, 12);
    gerarSprite(seed).forEach((l, j) => l.forEach((c, i) => { if (c) { x.fillStyle = c; x.fillRect(i, j, 1, 1); } }));
  }, [seed]);

  const mudar = (parte: Partial<Tracos>) => {
    if (!t) return;
    const novo = { ...t, ...parte };
    const s = seedDosTracos(novo);
    if (s) usar(s);
  };

  const cores = (rotulo: string, lista: string[], atual: number, aoEscolher: (i: number) => void) => (
    <div className="boneco-linha">
      <span className="boneco-rotulo">{rotulo}</span>
      <div className="boneco-cores" role="radiogroup" aria-label={rotulo}>
        {lista.map((c, i) => (
          <button key={c} type="button" role="radio" aria-checked={atual === i} aria-label={`${rotulo} ${i + 1}`}
                  className={atual === i ? 'ativa' : ''} style={{ background: c }} onClick={() => aoEscolher(i)} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="boneco">
      <input type="hidden" name="seed" value={seed ?? ''} />
      <div className="boneco-palco">
        <canvas ref={cv} width={12} height={12} aria-label="Prévia do seu colono" role="img" />
        <button type="button" className="btn sec boneco-sortear" onClick={sortear}>🎲 Sortear</button>
      </div>
      {t && (
        <div className="boneco-opcoes">
          {cores('Pele', OPCOES_SPRITE.peles, t.pele, (i) => mudar({ pele: i }))}
          <div className="boneco-linha">
            <span className="boneco-rotulo">Cabeça</span>
            <div className="boneco-chips" role="radiogroup" aria-label="Cabeça">
              {PENTEADOS.map((p, i) => (
                <button key={p} type="button" role="radio" aria-checked={t.penteado === i}
                        className={t.penteado === i ? 'ativa' : ''} onClick={() => mudar({ penteado: i })}>{p}</button>
              ))}
            </div>
          </div>
          {t.penteado === 4
            ? cores('Chapéu', OPCOES_SPRITE.roupas, t.chapeu, (i) => mudar({ chapeu: i }))
            : cores('Cabelo', OPCOES_SPRITE.cabelos, t.cabelo, (i) => mudar({ cabelo: i }))}
          {cores('Roupa', OPCOES_SPRITE.roupas, t.roupa, (i) => mudar({ roupa: i }))}
          {cores('Calça', OPCOES_SPRITE.roupas, t.calca, (i) => mudar({ calca: i }))}
        </div>
      )}
    </div>
  );
}
