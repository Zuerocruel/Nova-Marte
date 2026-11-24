'use client';
import { useEffect, useRef, useState } from 'react';
import { gerarSprite } from '@/lib/sprite';
import type { MensagemChat } from '@/app/api/chat/route';
import { CHAT_DURA_MS } from '@/lib/chat';
import Entrar from './Entrar';

/** Chat da colônia: todos leem, só colonos logados escrevem. Atualiza a cada 4 s; cada mensagem some 10 min depois. */
type Eu = { codigo: string; nome: string } | null;
const INTERVALO = 4_000;

function Avatar({ seed, url }: { seed: number; url: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (url) return;
    const x = ref.current?.getContext('2d');
    if (!x) return;
    x.clearRect(0, 0, 12, 12);
    gerarSprite(seed).forEach((l, j) => l.forEach((c, i) => { if (c) { x.fillStyle = c; x.fillRect(i, j, 1, 1); } }));
  }, [seed, url]);
  return url
    ? <img className="chat-avatar" src={url} alt="" width={24} height={24} /> // eslint-disable-line @next/next/no-img-element
    : <canvas ref={ref} className="chat-avatar" width={12} height={12} aria-hidden />;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function Chat({ aoMudar, aoFechar }: { aoMudar?: (m: MensagemChat[]) => void; aoFechar?: () => void }) {
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [eu, setEu] = useState<Eu | undefined>(undefined);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [entrar, setEntrar] = useState(false);
  const [indisponivel, setIndisponivel] = useState(false);
  const lista = useRef<HTMLOListElement>(null);
  const ultimoId = useRef(0);
  const colado = useRef(true);
  const enviandoRef = useRef(false);   // trava imediata contra envio duplo (Enter duplo / toque duplo)   // rolagem presa no fim (não puxa para baixo se a pessoa está lendo o histórico)

  const carregar = async () => {
    try {
      const r = await fetch(`/api/chat${ultimoId.current ? `?depois=${ultimoId.current}` : ''}`);
      const j = await r.json();
      if (j.indisponivel) setIndisponivel(true);
      const novas: MensagemChat[] = j.mensagens ?? [];
      if (!novas.length) return;
      ultimoId.current = Math.max(ultimoId.current, ...novas.map((m) => m.id));
      setMensagens((ant) => {
        const ids = new Set(ant.map((m) => m.id));
        return [...ant, ...novas.filter((m) => !ids.has(m.id))].slice(-150);
      });
    } catch { /* tenta de novo no próximo ciclo */ }
  };

  useEffect(() => {
    fetch('/api/sessao').then((r) => r.json()).then((j) => setEu(j.colono)).catch(() => setEu(null));
    carregar();
    const t = setInterval(() => {
      // tira da tela o que já passou de 10 minutos
      const limite = Date.now() - CHAT_DURA_MS;
      setMensagens((ant) => (ant.some((m) => Date.parse(m.em) < limite) ? ant.filter((m) => Date.parse(m.em) >= limite) : ant));
      if (document.visibilityState === 'visible') carregar();
    }, INTERVALO);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    aoMudar?.(mensagens);
    if (colado.current && lista.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, [mensagens, aoMudar]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim() || enviando || enviandoRef.current) return;
    enviandoRef.current = true;
    setErro(''); setEnviando(true);
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Erro');
      setTexto('');
      colado.current = true;
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    } finally {
      setEnviando(false);
      enviandoRef.current = false;
    }
  }

  async function sair() {
    await fetch('/api/sessao', { method: 'DELETE' });
    setEu(null);
  }

  return (
    <section className="chat caixa" aria-label="Chat da colônia">
      <div className="chat-topo">
        <h2 style={{ margin: '0 0 2px' }}>Rádio da colônia</h2>
        {aoFechar && <button type="button" className="chat-fechar" aria-label="Fechar o rádio" onClick={aoFechar}>×</button>}
      </div>
      <p className="mudo" style={{ margin: '0 0 8px', fontSize: 16 }}>As mensagens somem depois de 10 minutos.</p>
      <ol className="chat-lista" ref={lista} aria-live="polite"
          onScroll={(e) => { const el = e.currentTarget; colado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {indisponivel && <li className="mudo">O chat ainda está sendo instalado. Volte daqui a pouco!</li>}
        {!indisponivel && !mensagens.length && <li className="mudo">Ninguém falou nos últimos 10 minutos. Puxe assunto!</li>}
        {mensagens.map((m) => (
          <li key={m.id} className={eu && m.codigo === eu.codigo ? 'minha' : undefined}>
            <Avatar seed={m.seed} url={m.sprite_url} />
            <div>
              <a href={`/colono/${m.codigo}`} className="chat-nome">{m.nome}</a> <span className="chat-hora">{hora(m.em)}</span>
              <p>{m.texto}</p>
            </div>
          </li>
        ))}
      </ol>

      {eu === undefined ? null : eu ? (
        <form className="chat-envio" onSubmit={enviar}>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={280}
                 placeholder={`Falar como ${eu.nome}…`} aria-label="Mensagem" />
          <button className="btn" disabled={enviando || !texto.trim()}>Enviar</button>
          {erro && <p className="erro" role="alert" style={{ flexBasis: '100%' }}>{erro}</p>}
          <p className="mudo" style={{ flexBasis: '100%', margin: 0, fontSize: 16 }}>
            Sem links e sem ofensas: a moderação apaga. <button type="button" className="link" onClick={sair}>Sair</button>
          </p>
        </form>
      ) : entrar ? (
        <Entrar aoEntrar={async () => { const j = await fetch('/api/sessao').then((r) => r.json()); setEu(j.colono); setEntrar(false); }} />
      ) : (
        <p className="mudo" style={{ margin: '8px 0 0' }}>
          Só colonos falam no rádio. <a href="/">Crie seu personagem</a> ou <button type="button" className="link" onClick={() => setEntrar(true)}>entre</button>.
        </p>
      )}
    </section>
  );
}
