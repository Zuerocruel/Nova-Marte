'use client';
import { useState } from 'react';

/** Entrar como colono em outro aparelho: nick + WhatsApp do cadastro (quem não tem nick usa o código NM…). */
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
        body: JSON.stringify({ apelido: f.get('apelido'), whatsapp: f.get('whatsapp') }),
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
      <label htmlFor="entrar-nick">Seu nick</label>
      <input id="entrar-nick" name="apelido" placeholder="seu_nick" autoComplete="username" autoCapitalize="none" maxLength={24} required />
      <label htmlFor="entrar-whats">WhatsApp do cadastro</label>
      <input id="entrar-whats" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-8888" required />
      {erro && <p className="erro" role="alert">{erro}</p>}
      <p style={{ marginTop: 14 }}><button className="btn" disabled={carregando}>{carregando ? 'Entrando...' : 'Entrar'}</button></p>
      <p className="mudo">Entrou antes dos nicks? Use o seu código de colono (NM000123) no lugar do nick. Ainda não é colono? <a href="/">Crie seu personagem</a>.</p>
    </form>
  );
}
