'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { gerarSprite } from '@/lib/sprite';
import { vestirTraje, type Lideranca } from '@/lib/liderancas';

type Item = { slug: string; nome: string; tipo: 'cor' | 'traje' | 'especial'; preco: number; traje: { corpo?: string; detalhe?: string; calca?: string; cor?: string; acessorios?: string[] } };
type Dados = { logado?: boolean; indisponivel?: boolean; itens: Item[]; meus?: string[]; vestido?: string | null; seed?: number; moedas?: number };

/** Traje da loja de moedas no formato de vestirTraje (mesmo desenho dos cargos). */
export const comoTraje = (t: Item['traje']) => ({ traje: t, acessorios: t.acessorios ?? [], cor: t.cor ?? t.detalhe ?? '#ffc83d' }) as unknown as Lideranca;

function Previa({ seed, traje }: { seed: number; traje: Item['traje'] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    c.fillStyle = '#c1673e'; c.fillRect(0, 0, 16, 16);
    vestirTraje(gerarSprite(seed), comoTraje(traje)).forEach((l, j) => l.forEach((cor, i) => { if (cor) { c.fillStyle = cor; c.fillRect(i + 2, j + 3, 1, 1); } }));
  }, [seed, traje]);
  return <canvas ref={ref} width={16} height={16} className="previa-traje" />;
}

const TIPO = { cor: 'Cor', traje: 'Traje espacial', especial: '✨ Especial' };

export default function LojaMoedas() {
  const [d, setD] = useState<Dados | null>(null);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(() => fetch('/api/loja-moedas').then((r) => r.json()).then(setD), []);
  useEffect(() => { carregar(); }, [carregar]);

  async function agir(acao: 'comprar' | 'vestir', slug: string | null) {
    const r = await fetch('/api/loja-moedas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao, slug }) });
    const j = await r.json();
    setMsg(r.ok ? (acao === 'comprar' ? 'Comprado e vestido! Seu boneco já mudou no mapa.' : 'Pronto!') : j.erro);
    carregar();
  }

  if (!d) return <p className="mudo">Carregando a loja…</p>;
  if (d.indisponivel || !d.itens.length) return <p className="mudo">A loja de moedas abre em breve.</p>;
  const seed = d.seed ?? 7;

  return (
    <>
      <div className="caixa comparar-lojas">
        <div><b><i className="moeda" aria-label="moedas" /> Loja de moedas</b><small>Visual do seu boneco: cores e trajes. Você ganha as moedas jogando e cumprindo missões.</small></div>
        <div><b>💳 Loja da colônia</b><small>Muito mais: aparece no EPISÓDIO, muda a sua casa no mapa, eventos que mudam a história, outdoor com o seu texto, destaque no vídeo.</small>
          <a className="btn" href="/loja">Ver a loja da colônia</a></div>
      </div>
      {d.logado ? <p className="pixel" style={{ fontSize: 13 }}>Você tem <i className="moeda" aria-label="moedas" /> {d.moedas} moedas</p>
        : <p className="mudo">Entre na sua conta de colono para comprar com moedas.</p>}
      {msg && <p className="aviso-jogo">{msg}</p>}
      <div className="grade">
        {d.itens.map((it) => {
          const tenho = d.meus?.includes(it.slug), vestido = d.vestido === it.slug;
          return (
            <article key={it.slug} className="papel produto">
              <Previa seed={seed} traje={it.traje} />
              <h3 style={{ marginTop: 10 }}>{it.nome}</h3>
              <small className="mudo">{TIPO[it.tipo]}</small>
              <div className="preco"><i className="moeda" aria-label="moedas" /> {it.preco}</div>
              {!d.logado ? null : tenho
                ? <button type="button" className="btn sec" onClick={() => agir('vestir', vestido ? null : it.slug)}>{vestido ? 'Tirar' : 'Vestir'}</button>
                : <button type="button" className="btn" disabled={(d.moedas ?? 0) < it.preco} onClick={() => agir('comprar', it.slug)}>Comprar</button>}
            </article>
          );
        })}
      </div>
    </>
  );
}
