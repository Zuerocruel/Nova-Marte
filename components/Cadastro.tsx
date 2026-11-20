'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import EscolherCargo from '@/components/EscolherCargo';

export default function Cadastro() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [nick, setNick] = useState('');
  const [nickInfo, setNickInfo] = useState<{ livre: boolean; erro?: string } | null>(null);

  // confere o nick enquanto a pessoa digita (o servidor confere de novo ao cadastrar)
  useEffect(() => {
    setNickInfo(null);
    if (nick.trim().length < 3) return;
    let valendo = true;   // ignora a resposta de um nick que a pessoa já apagou
    const t = setTimeout(() => {
      fetch(`/api/apelido?n=${encodeURIComponent(nick)}`).then((r) => r.json())
        .then((j) => { if (valendo) setNickInfo(j); }).catch(() => {});
    }, 400);
    return () => { valendo = false; clearTimeout(t); };
  }, [nick]);

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
          apelido: f.get('apelido'),
          whatsapp: f.get('whatsapp'),
          handle: f.get('handle'),
          plataforma: f.get('plataforma'),
          cargo: f.get('cargo'),
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

      <label htmlFor="apelido">Seu nick (é com ele que você entra na sua conta)</label>
      <input id="apelido" name="apelido" autoComplete="username" autoCapitalize="none" placeholder="ex.: astro_ana" maxLength={20}
             value={nick} onChange={(e) => setNick(e.target.value.replace(/\s+/g, ''))} required
             aria-describedby="apelido-info" aria-invalid={nickInfo ? !nickInfo.livre : undefined} />
      <p id="apelido-info" className="mudo" style={{ margin: '4px 0 0', fontSize: 13, color: nickInfo ? (nickInfo.livre ? 'var(--agua)' : '#ff7b7b') : undefined }}>
        {nickInfo ? (nickInfo.livre ? '✓ Nick disponível' : nickInfo.erro) : '3 a 20 letras ou números, pode usar _ e . — cada nick é único.'}
      </p>

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

      <label style={{ marginTop: 18 }}>O que você quer ser na colônia?</label>
      <p className="mudo" style={{ margin: '0 0 4px', fontSize: 13 }}>
        Seu cargo aparece no seu perfil e no mapa. Quando um problema do dia for da sua área, você pode ser chamado para resolver no episódio! Escolha com carinho: o cargo não pode ser trocado depois.
      </p>
      <EscolherCargo />

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
