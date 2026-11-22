'use client';

import { useEffect, useState } from 'react';

/** Link de convite do colono logado, com botão de copiar (Colônia ao vivo e Central). */
export default function ConviteBox() {
  const [c, setC] = useState<{ logado: boolean; link?: string; trouxe?: number } | null>(null);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => { fetch('/api/convite').then((r) => r.json()).then(setC).catch(() => setC(null)); }, []);
  if (!c?.logado || !c.link) return null;

  async function copiar() {
    try { await navigator.clipboard.writeText(c!.link!); } catch {
      const t = document.createElement('textarea'); t.value = c!.link!; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    setCopiado(true); setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <section className="caixa convite">
      <h3>🤝 Seu link de convite</h3>
      <p className="mudo" style={{ marginTop: 0 }}>Quem entrar pelo seu link vira colono e conta para você. Quem mais convida concorre a cargos: líder, embaixador, festas…</p>
      <div className="convite-linha">
        <input readOnly value={c.link} onFocus={(e) => e.currentTarget.select()} aria-label="Seu link de convite" />
        <button type="button" className="btn" onClick={copiar}>{copiado ? '✓ Copiado!' : 'Copiar'}</button>
      </div>
      <p className="mudo" style={{ marginBottom: 0 }}>Você já trouxe <b>{c.trouxe}</b> colono{c.trouxe === 1 ? '' : 's'}.</p>
    </section>
  );
}
