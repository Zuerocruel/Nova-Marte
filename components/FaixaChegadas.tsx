'use client';

import { useEffect, useState } from 'react';

type Chegada = { codigo: string; nome: string | null; handle: string | null };

/** Faixa rolando com os últimos colonos que chegaram (mesma fonte do contador). */
export default function FaixaChegadas() {
  const [lista, setLista] = useState<Chegada[]>([]);
  useEffect(() => {
    fetch('/api/mundo/resumo').then((r) => r.json()).then((j) => setLista(j.ultimos ?? [])).catch(() => {});
  }, []);
  if (lista.length === 0) return null;
  const nomes = lista.map((c) => (c.handle ? `@${c.handle.replace(/^@/, '')}` : c.nome || c.codigo));
  const item = (sufixo: string) => nomes.map((n, i) => <span key={sufixo + i}><i aria-hidden>▲</i>{n}</span>);
  return (
    <div className="faixa-chegadas" aria-label={`Acabaram de chegar: ${nomes.join(', ')}`}>
      <b className="faixa-rotulo">ACABOU DE POUSAR</b>
      <div className="faixa-trilho" aria-hidden="true">
        <div className="faixa-rolo">{item('a')}{item('b')}</div>
      </div>
    </div>
  );
}
