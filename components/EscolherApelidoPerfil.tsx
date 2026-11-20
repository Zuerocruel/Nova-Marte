'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Para quem entrou antes dos nicks: escolher o nick que passa a ser o login (nick + WhatsApp). */
export default function EscolherApelidoPerfil() {
  const router = useRouter();
  const [nick, setNick] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const r = await fetch('/api/perfil/apelido', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apelido: nick }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Erro');
      router.refresh();
    } catch (err) { setErro(err instanceof Error ? err.message : 'Erro'); }
    finally { setSalvando(false); }
  }

  return (
    <form className="caixa" style={{ marginTop: 12 }} onSubmit={salvar} noValidate>
      <strong>Crie o seu nick</strong>
      <p className="mudo" style={{ margin: '4px 0 0', fontSize: 13 }}>Agora você entra na conta com nick + WhatsApp. Cada nick é único.</p>
      <input value={nick} onChange={(e) => setNick(e.target.value.replace(/\s+/g, ''))} placeholder="ex.: astro_ana" maxLength={20}
             aria-label="Nick" autoCapitalize="none" style={{ marginTop: 8 }} />
      {erro && <p className="erro" role="alert">{erro}</p>}
      <p style={{ marginTop: 10 }}><button className="btn" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar nick'}</button></p>
    </form>
  );
}
