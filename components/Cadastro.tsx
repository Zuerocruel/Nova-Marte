'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Cadastro() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro('');
    const f = new FormData(e.currentTarget);
    setEnviando(true);
    try {
      const r = await fetch('/api/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: f.get('nome'),
          whatsapp: f.get('whatsapp'),
          handle: f.get('handle'),
          plataforma: f.get('plataforma'),
          consentimento: f.get('consentimento') === 'on',
          aceita_whatsapp: f.get('aceita_whatsapp') === 'on',
          site: f.get('site'),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Erro ao cadastrar');
      router.push(`/mundo?c=${encodeURIComponent(j.codigo)}${j.jaExistia ? '&volta=1' : '&novo=1'}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao cadastrar');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <label htmlFor="nome">Seu nome</label>
      <input id="nome" name="nome" autoComplete="name" maxLength={60} required />

      <label htmlFor="whatsapp">WhatsApp (com DDD)</label>
      <input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-8888" required />

      <label htmlFor="handle">Seu @</label>
      <div className="linha">
        <select name="plataforma" aria-label="Rede social" defaultValue="instagram">
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="youtube">YouTube</option>
        </select>
        <input id="handle" name="handle" placeholder="@seuperfil" autoCapitalize="none" maxLength={40} required />
      </div>

      {/* honeypot anti-robô: invisível para pessoas */}
      <div className="hp" aria-hidden="true">
        <label>Site<input name="site" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <label className="check">
        <input type="checkbox" name="consentimento" required />
        <span>
          Concordo com a <a href="/privacidade" target="_blank">política de privacidade</a> e autorizo usar meu nome e meu @
          no mundo e nos episódios.
        </span>
      </label>
      <label className="check">
        <input type="checkbox" name="aceita_whatsapp" />
        <span>Quero receber um aviso no WhatsApp quando meu personagem aparecer num episódio.</span>
      </label>

      {erro && <p className="erro" role="alert">{erro}</p>}
      <p style={{ marginTop: 20 }}>
        <button className="btn" disabled={enviando}>{enviando ? 'Criando...' : 'Virar personagem'}</button>
      </p>
    </form>
  );
}
