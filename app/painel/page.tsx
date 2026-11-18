import { db } from '@/lib/supabase';
import { reais } from '@/lib/texto';
import { rotuloDe } from '@/lib/opcoes';
import { atualizarAgora, atualizarPersonagem, lancarSeguidores, reprocessarWebhooks, revisarResgate } from './acoes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Painel — NovaMarte', robots: { index: false } };

type Linha = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const n = (v: unknown) => Number(v ?? 0).toLocaleString('pt-BR');
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—');
const mascarar = (w: string) => w.replace(/^(\+\d{2})(\d{2})\d+(\d{4})$/, '$1 $2 •••••-$3');

async function q(view: string, limite = 50): Promise<Linha[]> {
  const { data, error } = await db().from(view).select('*').limit(limite);
  if (error) throw new Error(`${view}: ${error.message}`);
  return data ?? [];
}

export default async function Painel() {
  const [[k], diarios, origens, funil, produtos, seguidores, status, recentes, pendentesWebhook, resgatesPendentes, pedidos] = await Promise.all([
    q('v_kpis', 1),
    q('v_cadastros_diarios', 30),
    q('v_origens', 30),
    q('v_funil_links', 50),
    q('v_produtos_desempenho', 30),
    q('v_seguidores', 3),
    q('v_status_personagens', 5),
    db().from('personagens')
      .select('codigo, nome, handle, handle_plataforma, whatsapp, status, origem_source, origem_campaign, created_at')
      .order('id', { ascending: false }).limit(15).then((r) => r.data ?? []),
    db().from('webhook_eventos').select('id', { count: 'exact', head: true })
      .eq('processado', false).then((r) => r.count ?? 0),
    db().from('resgates')
      .select('id, texto, created_at, produtos(nome), personagens(codigo, nome, handle)')
      .eq('status', 'pendente').order('id').limit(50).then((r) => (r.data ?? []) as Linha[]),
    db().from('pedidos')
      .select('id, status, valor_centavos, opcao, texto_personalizado, cliente_nome, created_at, produtos(nome, opcoes), personagens(codigo)')
      .order('id', { ascending: false }).limit(30).then((r) => (r.data ?? []) as Linha[]),
  ]);

  const totalSeguidores = seguidores.reduce((s, x) => s + Number(x.seguidores), 0);
  const maxDia = Math.max(1, ...diarios.map((d) => Number(d.cadastros)));
  const st = Object.fromEntries(status.map((s) => [s.status, Number(s.total)]));

  return (
    <main className="wrap painel">
      <h1>Painel</h1>

      <section className="kpis">
        <Kpi rotulo="Seguidores (3 redes)" valor={n(totalSeguidores)} />
        <Kpi rotulo="Cadastros" valor={n(k.cadastros_total)} sub={`+${n(k.cadastros_hoje)} hoje · +${n(k.cadastros_7d)} em 7 dias`} />
        <Kpi rotulo="Seguidor → cadastro" valor={pct(Number(k.cadastros_total), totalSeguidores)} sub="cadastros ÷ seguidores" />
        <Kpi rotulo="Receita aprovada" valor={reais(Number(k.receita_total_centavos))} sub={`${reais(Number(k.receita_30d_centavos))} nos últimos 30 dias`} />
        <Kpi rotulo="Vendas" valor={n(k.pedidos_aprovados)}
          sub={`ticket médio ${reais(Number(k.pedidos_aprovados) ? Number(k.receita_total_centavos) / Number(k.pedidos_aprovados) : 0)}`} />
        <Kpi rotulo="Cadastro → comprador" valor={pct(Number(k.compradores_cadastrados), Number(k.cadastros_total))}
          sub={`${n(k.compradores_cadastrados)} compradores ligados a um personagem`} />
      </section>

      <h2>Seguidores por rede</h2>
      <div className="tabela-rola">
        <table className="tabela">
          <thead><tr><th>Rede</th><th className="num">Seguidores</th><th className="num">7 dias</th><th>Atualizado</th><th>Fonte</th></tr></thead>
          <tbody>
            {seguidores.map((s) => (
              <tr key={s.plataforma}>
                <td>{s.plataforma}</td>
                <td className="num">{n(s.seguidores)}</td>
                <td className="num">{s.delta_7d === null ? '—' : `${Number(s.delta_7d) >= 0 ? '+' : ''}${n(s.delta_7d)}`}</td>
                <td>{new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td>{s.fonte}</td>
              </tr>
            ))}
            {seguidores.length === 0 && <tr><td colSpan={5} className="mudo">Sem dados ainda: configure as APIs ou lance à mão abaixo.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="acoes-linha">
        <form action={lancarSeguidores} className="form-inline">
          <input name="instagram" placeholder="Instagram" inputMode="numeric" aria-label="Seguidores no Instagram" />
          <input name="tiktok" placeholder="TikTok" inputMode="numeric" aria-label="Seguidores no TikTok" />
          <input name="youtube" placeholder="YouTube" inputMode="numeric" aria-label="Inscritos no YouTube" />
          <button className="btn sec">Lançar hoje</button>
        </form>
        <form action={atualizarAgora}><button className="btn sec">Buscar nas APIs agora</button></form>
      </div>

      <h2>Cadastros por dia (30 dias)</h2>
      <div className="barras" role="img" aria-label="Cadastros por dia nos últimos 30 dias">
        {diarios.map((d) => {
          const v = Number(d.cadastros);
          const dia = new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          return (
            <div key={d.dia} className="barra-col" title={`${dia}: ${n(v)} cadastros`}>
              <div className="barra" style={{ height: `${(v / maxDia) * 100}%` }} />
            </div>
          );
        })}
      </div>
      <div className="barras-eixo mudo">
        <span>{diarios[0] && new Date(diarios[0].dia + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
        <span>pico: {n(maxDia)}/dia</span>
        <span>hoje</span>
      </div>
      <details><summary className="mudo">Ver como tabela</summary>
        <table className="tabela"><tbody>
          {diarios.map((d) => <tr key={d.dia}><td>{d.dia}</td><td className="num">{n(d.cadastros)}</td></tr>)}
        </tbody></table>
      </details>

      <h2>De onde as pessoas vêm</h2>
      <div className="tabela-rola">
        <table className="tabela">
          <thead><tr><th>Origem</th><th>Campanha</th><th className="num">Cadastros</th><th className="num">Compradores</th><th className="num">Receita</th></tr></thead>
          <tbody>
            {origens.map((o, i) => (
              <tr key={i}><td>{o.source}</td><td>{o.campanha}</td><td className="num">{n(o.cadastros)}</td>
                <td className="num">{n(o.compradores)}</td><td className="num">{reais(Number(o.receita_centavos))}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Funil por link rastreável</h2>
      <div className="tabela-rola">
        <table className="tabela">
          <thead><tr><th>Link</th><th>Rede</th><th className="num">Cliques</th><th className="num">Cadastros</th><th className="num">Conv.</th><th className="num">Vendas</th><th className="num">Receita</th></tr></thead>
          <tbody>
            {funil.map((f) => (
              <tr key={f.slug}><td>/l/{f.slug}</td><td>{f.plataforma}</td><td className="num">{n(f.cliques)}</td>
                <td className="num">{n(f.cadastros)}</td><td className="num">{pct(Number(f.cadastros), Number(f.cliques))}</td>
                <td className="num">{n(f.pedidos)}</td><td className="num">{reais(Number(f.receita_centavos))}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Loja</h2>
      <div className="tabela-rola">
        <table className="tabela">
          <thead><tr><th>Produto</th><th className="num">Preço</th><th className="num">Cliques em comprar</th><th className="num">Vendas / resgates</th><th className="num">Conv.</th><th className="num">Receita</th></tr></thead>
          <tbody>
            {produtos.map((p) => (
              <tr key={p.slug}><td>{p.nome}{!p.ativo && <span className="mudo"> (inativo)</span>}</td>
                <td className="num">{p.tipo === 'gratis' ? 'grátis' : reais(Number(p.preco_centavos))}</td>
                <td className="num">{p.tipo === 'gratis' ? '—' : n(p.cliques_comprar)}</td>
                <td className="num">{p.tipo === 'gratis' ? `${n(p.resgates)} resgates` : n(p.vendas)}</td>
                <td className="num">{p.tipo === 'gratis' ? '—' : pct(Number(p.vendas), Number(p.cliques_comprar))}</td>
                <td className="num">{reais(Number(p.receita_centavos))}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 24 }}>Últimos pedidos</h3>
      {pedidos.length === 0 ? <p className="mudo">Nenhum pedido ainda.</p> : (
        <div className="tabela-rola">
          <table className="tabela">
            <thead><tr><th>Quando</th><th>Produto</th><th>Escolha</th><th>Detalhes</th><th>Cliente</th><th>Personagem</th><th>Status</th><th className="num">Valor</th></tr></thead>
            <tbody>
              {pedidos.map((p) => {
                const temOpcoes = Array.isArray(p.produtos?.opcoes) && p.produtos.opcoes.length > 0;
                return (
                  <tr key={p.id}>
                    <td>{new Date(p.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                    <td>{p.produtos?.nome ?? <span className="erro">produto não identificado</span>}</td>
                    <td>{temOpcoes ? (rotuloDe(p.produtos.opcoes, p.opcao) ?? <span className="erro">falta escolher</span>) : '—'}</td>
                    <td>{p.texto_personalizado ?? '—'}</td>
                    <td>{p.cliente_nome ?? '—'}</td>
                    <td>{p.personagens?.codigo ?? <span className="mudo">não ligado</span>}</td>
                    <td>{p.status}</td>
                    <td className="num">{reais(Number(p.valor_centavos))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3 style={{ marginTop: 24 }}>Resgates grátis para aprovar ({n(resgatesPendentes.length)})</h3>
      {resgatesPendentes.length === 0 ? <p className="mudo">Nada pendente.</p> : (
        <div className="tabela-rola">
          <table className="tabela">
            <thead><tr><th>Item</th><th>Texto</th><th>Personagem</th><th>Quando</th><th></th></tr></thead>
            <tbody>
              {resgatesPendentes.map((r) => (
                <tr key={r.id}>
                  <td>{r.produtos?.nome}</td>
                  <td><strong>{r.texto}</strong></td>
                  <td>{r.personagens?.codigo} · {r.personagens?.nome} · @{r.personagens?.handle}</td>
                  <td>{new Date(r.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                  <td>
                    <div className="form-inline">
                      <form action={revisarResgate}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="aprovado" /><button className="btn sec">Aprovar</button></form>
                      <form action={revisarResgate}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="recusado" /><input type="hidden" name="liberar" value="1" /><button className="btn sec" title="Recusa e deixa a pessoa tentar outro nome">Recusar</button></form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pendentesWebhook > 0 && (
        <form action={reprocessarWebhooks} className="acoes-linha">
          <span className="erro">⚠ {pendentesWebhook} webhook(s) da Cakto não processados.</span>
          <button className="btn sec">Reprocessar</button>
        </form>
      )}

      <h2>Produção de personagens</h2>
      <p>
        Na fila: <strong>{n(st.fila)}</strong> · Desenhados: <strong>{n(st.desenhado)}</strong> · Já estrearam: <strong>{n(st.estreou)}</strong>
        {' · '}<a href="/api/painel/export?status=fila">Baixar fila (CSV)</a>{' · '}<a href="/api/painel/export">Baixar todos</a>
      </p>
      <form action={atualizarPersonagem} className="form-inline">
        <input name="codigo" placeholder="Código NM000123" required aria-label="Código do personagem" />
        <select name="status" defaultValue="" aria-label="Novo status">
          <option value="">status…</option><option value="fila">fila</option>
          <option value="desenhado">desenhado</option><option value="estreou">estreou</option>
        </select>
        <input name="episodio" placeholder="Ep. nº" inputMode="numeric" aria-label="Número do episódio de estreia" />
        <input name="sprite_url" placeholder="URL da arte final" aria-label="URL do sprite final" />
        <select name="oculto" defaultValue="" aria-label="Visibilidade">
          <option value="">visível…</option><option value="sim">ocultar (moderação)</option><option value="nao">mostrar</option>
        </select>
        <button className="btn sec">Salvar</button>
      </form>

      <h3 style={{ marginTop: 24 }}>Últimos cadastros</h3>
      <div className="tabela-rola">
        <table className="tabela">
          <thead><tr><th>Código</th><th>Nome</th><th>@</th><th>WhatsApp</th><th>Origem</th><th>Status</th><th>Quando</th></tr></thead>
          <tbody>
            {recentes.map((r) => (
              <tr key={r.codigo}><td>{r.codigo}</td><td>{r.nome}</td><td>@{r.handle} <span className="mudo">({r.handle_plataforma})</span></td>
                <td>{mascarar(r.whatsapp)}</td><td>{r.origem_source}{r.origem_campaign ? ` / ${r.origem_campaign}` : ''}</td>
                <td>{r.status}</td><td>{new Date(r.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Kpi({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="caixa kpi">
      <div className="mudo">{rotulo}</div>
      <div className="kpi-valor">{valor}</div>
      {sub && <div className="mudo kpi-sub">{sub}</div>}
    </div>
  );
}
