'use client';
import { useState } from 'react';

export default function Resgate({ produto }: { produto: string }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro('');
    const f = new FormData(e.currentTarget);
    setEnviando(true);
    try {
      const r = await fetch('/api/resgatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto, whatsapp: f.get('whatsapp'), texto: f.get('texto') }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Erro ao resgatar');
      setFeito(j.codigo);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao resgatar');
    } finally {
      setEnviando(false);
    }
  }

  if (feito) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Pedido recebido!</h2>
        <p>O nome passa por uma revisão rápida e depois a cratera aparece num próximo episódio.</p>
        <a className="btn sec" href={`/mundo?c=${feito}`}>Ver meu personagem</a>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate>
      <label htmlFor="whatsapp">WhatsApp do seu cadastro</label>
      <input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-8888" required />
      <label htmlFor="texto">Nome da cratera</label>
      <input id="texto" name="texto" maxLength={30} placeholder="Cratera ..." required />
      <p className="mudo">Até 30 caracteres. Nomes ofensivos são recusados. Vale 1 por pessoa.</p>
      {erro && <p className="erro" role="alert">{erro}</p>}
      <p style={{ marginTop: 16 }}>
        <button className="btn" disabled={enviando}>{enviando ? 'Enviando...' : 'Resgatar grátis'}</button>
      </p>
      <p className="mudo">Ainda não é personagem? <a href="/">Crie o seu aqui</a>.</p>
    </form>
  );
}
