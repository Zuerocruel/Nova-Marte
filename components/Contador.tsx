'use client';
import { useEffect, useState } from 'react';

export default function Contador() {
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    let vivo = true;
    const carregar = () =>
      fetch('/api/mundo/resumo').then((r) => r.json()).then((j) => vivo && setTotal(j.total)).catch(() => {});
    carregar();
    const t = setInterval(carregar, 20_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  return <div className="contador">{total === null ? '...' : total.toLocaleString('pt-BR')}</div>;
}
