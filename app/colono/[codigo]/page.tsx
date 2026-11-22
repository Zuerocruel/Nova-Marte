import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import AvatarGrande from '@/components/AvatarGrande';
import IconeItem from '@/components/IconeItem';
import EscolherCargoPerfil from '@/components/EscolherCargoPerfil';
import EscolherApelidoPerfil from '@/components/EscolherApelidoPerfil';
import { cargoDe } from '@/lib/cargos';
import { perfilDe } from '@/lib/perfil';
import { codigoDaSessao } from '@/lib/sessao';
import BotaoComentar from '@/components/BotaoComentar';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ codigo: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await perfilDe((await params).codigo);
  return p
    ? { title: `${p.nome} — colono da Operação Marte Zero`, description: `${p.dias} dias em Marte. Veja a casa, os itens e as conquistas de ${p.nome}.` }
    : { title: 'Colono não encontrado — Operação Marte Zero' };
}

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const REDE: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' };

export default async function PerfilColono({ params }: Props) {
  const [p, eu] = await Promise.all([perfilDe((await params).codigo), codigoDaSessao()]);
  if (!p) notFound();
  const meu = eu === p.codigo;
  const tem = p.conquistas.filter((c) => c.tem).length;
  const cargo = cargoDe(p.cargo);

  return (
    <main className="wrap">
      <section className="perfil-topo">
        <AvatarGrande seed={p.seed} url={p.sprite_url} />
        <div>
          <h1 style={{ marginBottom: 6 }}>{p.nome}</h1>
          <p className="mudo" style={{ margin: 0 }}>{p.apelido && <>Nick: <strong>{p.apelido}</strong> · </>}@{p.handle} · {REDE[p.plataforma] ?? p.plataforma} · {p.codigo}</p>
          {cargo && <p style={{ margin: '10px 0 0' }}><span className="selo-cargo" title={cargo.descricao}>{cargo.emoji} {cargo.nome}</span></p>}
          <p style={{ margin: '10px 0 0' }}>
            {p.status === 'estreou' ? '★ Já apareceu na série' : p.status === 'desenhado' ? 'Arte pronta, esperando o episódio' : 'Na fila para ser desenhado'}
          </p>
          <p style={{ marginTop: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a className="btn sec" href={`/mundo?c=${p.codigo}`}>Ver casa no mapa</a>
            <BotaoComentar />
            {meu && <span className="selo-meu">Este é você</span>}
          </p>
          {meu && !p.apelido && <EscolherApelidoPerfil />}
          {meu && !p.cargo && <EscolherCargoPerfil />}
        </div>
      </section>

      <section className="perfil-numeros">
        <div className="caixa"><div className="kpi-valor">{p.dias}</div><div className="mudo">{p.dias === 1 ? 'dia' : 'dias'} na colônia</div><div className="mudo" style={{ fontSize: 12 }}>desde {data(p.desde)}</div></div>
        <div className="caixa"><div className="kpi-valor">{p.episodios_vividos}</div><div className="mudo">episódios vividos</div></div>
        <div className="caixa"><div className="kpi-valor">{p.compras.length}</div><div className="mudo">{p.compras.length === 1 ? 'item' : 'itens'} na casa</div></div>
        <div className="caixa"><div className="kpi-valor">{tem}/{p.conquistas.length}</div><div className="mudo">conquistas</div></div>
      </section>

      <h2>Conquistas</h2>
      <ul className="conquistas">
        {p.conquistas.map((c) => (
          <li key={c.id} className={c.tem ? 'tem' : 'falta'} title={c.descricao}>
            <span className="conquista-icone" aria-hidden>{c.icone}</span>
            <strong>{c.titulo}</strong>
            <span className="mudo">{c.descricao}</span>
          </li>
        ))}
      </ul>

      {p.feitos.length > 0 && (
        <>
          <h2>Feitos na série</h2>
          <ul className="lista-simples">
            {p.feitos.map((f, i) => (
              <li key={i}>{f.tipo === 'heroi' ? '🦸 Resolveu' : '•'} <strong>{f.titulo}</strong>{f.episodio ? ` · episódio ${f.episodio}` : ''}</li>
            ))}
          </ul>
        </>
      )}

      <h2>Itens da casa</h2>
      {p.compras.length ? (
        <div className="grade">
          {p.compras.map((c, i) => (
            <div key={i} className="caixa produto">
              {c.imagem_url ? <img src={c.imagem_url} alt="" /> : <IconeItem slug={c.slug} />}  {/* eslint-disable-line @next/next/no-img-element */}
              <h3 style={{ marginTop: 12 }}>{c.nome}</h3>
              <p className="mudo" style={{ margin: 0 }}>{data(c.em)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mudo">{meu ? <>Sua casa ainda não tem itens. <a href="/loja">Ver a loja</a></> : 'Nenhum item por enquanto.'}</p>
      )}
    </main>
  );
}
