'use client';
import { useState } from 'react';

/** Entrar como colono em outro aparelho: código NM… + WhatsApp do cadastro. */
export default function Entrar({ aoEntrar }: { aoEntrar?: (codigo: string) => void }) {
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro('');
    const f = new FormData(e.currentTarget);
    setCarregando(true);
    try {
      const r = await fetch('/api/sessao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: f.get('codigo'), whatsapp: f.get('whatsapp') }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Erro');
      if (aoEntrar) aoEntrar(j.codigo); else window.location.href = `/colono/${j.codigo}`;
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <label htmlFor="entrar-codigo">Seu código de colono</label>
      <input id="entrar-codigo" name="codigo" placeholder="NM000123" autoComplete="username" autoCapitalize="characters" required />
      <label htmlFor="entrar-whats">WhatsApp do cadastro</label>
      <input id="entrar-whats" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-8888" required />
      {erro && <p className="erro" role="alert">{erro}</p>}
      <p style={{ marginTop: 14 }}><button className="btn" disabled={carregando}>{carregando ? 'Entrando...' : 'Entrar'}</button></p>
      <p className="mudo">Não sabe seu código? Procure seu nome no <a href="/mundo">mapa</a>. Ainda não é colono? <a href="/">Crie seu personagem</a>.</p>
    </form>
  );
}
