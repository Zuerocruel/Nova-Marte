'use client';

import { useCallback, useEffect, useState } from 'react';
import Minigame, { type ResultadoPartida } from './Minigame';
import ConviteBox from './ConviteBox';

type Missao = { id: string; titulo: string; moedas: number; xp: number; feita: boolean; resgatada: boolean; progresso?: string };
type Jogo = { slug: string; nome: string; descricao: string; moedas_max: number; travado_ate?: string | null };
type Dados = {
  logado?: boolean; indisponivel?: boolean; nome?: string; moedas?: number; xp?: number; nivel?: number; xp_nivel?: number; xp_proximo?: number;
  diarias?: Missao[]; epicas?: Missao[]; minigames: Jogo[]; ranking: { posicao: number; codigo: string; nome: string; xp: number }[];
};

const faltam = (iso: string) => {
  const m = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
};

/** Central do colono: moedas, XP, missões diárias e épicas, minigames e ranking da semana. */
export default function Central() {
  const [d, setD] = useState<Dados | null>(null);
  const [jogando, setJogando] = useState<{ slug: string; partida: number } | null>(null);
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(() => fetch('/api/jogo').then((r) => r.json()).then(setD).catch(() => setD({ indisponivel: true, minigames: [], ranking: [] })), []);
  useEffect(() => { carregar(); }, [carregar]);

  async function resgatar(id: string) {
    const r = await fetch('/api/jogo/missao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    const j = await r.json();
    setAviso(r.ok ? `+${j.ganhou.moedas} moedas e +${j.ganhou.xp} XP!` : j.erro);
    carregar();
  }

  async function jogar(slug: string) {
    setAviso('');
    const r = await fetch('/api/jogo/partida', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'iniciar', minigame: slug }) });
    const j = await r.json();
    if (!r.ok) { setAviso(j.erro); carregar(); return; }
    setJogando({ slug, partida: j.partida });
  }

  async function fim(r: { pontos: number; resultado: ResultadoPartida }) {
    if (!jogando) return;
    const res = await fetch('/api/jogo/partida', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'fim', partida: jogando.partida, pontos: Math.floor(r.pontos), resultado: r.resultado }) });
    const j = await res.json();
    if (res.ok) setAviso(j.ganhou > 0 ? `+${j.ganhou} moedas!` : j.valendo === false && r.resultado !== 'abandonou' ? 'Partida de treino: as moedas de hoje deste jogo já acabaram.' : '');
    carregar();
  }

  if (!d) return <p className="mudo">Carregando a central…</p>;
  if (d.indisponivel) return <p className="mudo">A central do colono abre em breve.</p>;

  const missao = (m: Missao) => (
    <li key={m.id} className={`missao ${m.resgatada ? 'feita' : ''}`}>
      <div><b>{m.titulo}</b><small><i className="moeda" aria-label="moedas" /> {m.moedas} · ⭐ {m.xp} XP{m.progresso ? ` · ${m.progresso}` : ''}</small></div>
      {m.resgatada ? <span className="selo-ok">✓ resgatada</span>
        : <button type="button" className="btn" disabled={!m.feita} onClick={() => resgatar(m.id)}>{m.feita ? 'Resgatar' : 'Em andamento'}</button>}
    </li>
  );

  return (
    <div className="central">
      {d.logado ? (
        <section className="caixa central-topo">
          <div><h2 style={{ margin: 0 }}>Olá, {d.nome}!</h2><p className="mudo" style={{ margin: '6px 0 0' }}>Nível {d.nivel}</p></div>
          <div className="saldo"><span><i className="moeda" aria-label="moedas" /> <b>{d.moedas}</b> moedas</span><span>⭐ <b>{d.xp}</b> XP</span></div>
          <div className="barra-xp" aria-label="Progresso do nível">
            <i style={{ width: `${Math.round(100 * ((d.xp! - d.xp_nivel!) / Math.max(1, d.xp_proximo! - d.xp_nivel!)))}%` }} />
          </div>
          <a className="btn sec" href="/loja-moedas">🛍️ Loja de moedas</a>
        </section>
      ) : (
        <section className="caixa"><p>Entre na sua conta de colono para ganhar moedas, XP e aparecer no ranking.</p>
          <a className="btn" href="/#cadastro">Virar colono</a> <a className="btn sec" href="/perfil">Entrar</a></section>
      )}
      {aviso && <p className="aviso-jogo">{aviso}</p>}

      {d.logado && (
        <div className="central-grade">
          <section className="caixa"><h3>Missões do dia</h3><ul className="missoes">{d.diarias!.map(missao)}</ul></section>
          <section className="caixa"><h3>Missões épicas da semana</h3><ul className="missoes">{d.epicas!.map(missao)}</ul></section>
        </div>
      )}

      <section className="caixa">
        <h3>Minigames</h3>
        {d.minigames.length ? (
          <div className="jogos">{d.minigames.map((g) => (
            <div key={g.slug} className="jogo-card">
              <b>{g.nome}</b><small>{g.descricao}</small><small>até <i className="moeda" aria-label="moedas" /> {g.moedas_max} por partida</small>
              {g.travado_ate ? <span className="mudo">💔 volta em {faltam(g.travado_ate)}</span>
                : <button type="button" className="btn" disabled={!d.logado} onClick={() => jogar(g.slug)}>Jogar</button>}
            </div>))}
          </div>
        ) : <p className="mudo">Os minigames estão chegando!</p>}
      </section>

      <section className="caixa">
        <h3>Ranking da semana</h3>
        {d.ranking.length ? <ol className="ranking">{d.ranking.map((r) => <li key={r.codigo}><span>{r.posicao}º</span><b>{r.nome}</b><small>{r.xp} XP</small></li>)}</ol>
          : <p className="mudo">Ninguém pontuou esta semana ainda. Seja o primeiro!</p>}
        <p className="mudo">Zera toda segunda-feira. Os 3 primeiros aparecem no episódio.</p>
      </section>

      {d.logado && <ConviteBox />}

      {jogando && (
        <div className="modal-fundo" role="dialog" aria-modal="true">
          <Minigame jogo={jogando.slug} aoTerminar={fim} aoFechar={() => { setJogando(null); carregar(); }} />
        </div>
      )}
    </div>
  );
}
