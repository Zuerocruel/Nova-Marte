import { db } from '@/lib/supabase';
import { reais } from '@/lib/texto';
import { PET_MACACO, lerOpcoes } from '@/lib/opcoes';
import LojaModal from '@/components/LojaModal';
import BotaoPersonalizar from '@/components/BotaoPersonalizar';

export const metadata = { title: 'Loja — Operação Marte Zero' };
export const revalidate = 60;

type Produto = {
  slug: string; nome: string; descricao: string | null; preco_centavos: number; tipo: 'pago' | 'gratis';
  opcoes: unknown; pergunta_texto: string | null;
  imagem_url: string | null; episodios: { numero: number; titulo: string } | null;
};

/** Seções da loja (como a vitrine da colônia): o que vai para a casa, o que é do colono, eventos e grátis. */
const SECOES: { id: string; titulo: string; sub: string; teste: (p: Produto) => boolean }[] = [
  { id: 'casa', titulo: 'Para a sua casa', sub: 'Fica no seu lote no mapa ao vivo e aparece nos episódios.',
    teste: (p) => /capsula|foguete|bandeira|outdoor|monumento|comercio|satelite/.test(p.slug) },
  { id: 'colono', titulo: 'Para o seu colono', sub: 'Anda com você pela colônia.',
    teste: (p) => /pet|rover|traje|destaque/.test(p.slug) },
  { id: 'eventos', titulo: 'Eventos da colônia', sub: 'Acontecem com TODO MUNDO no próximo episódio.',
    teste: (p) => /evento|furia|festa/.test(p.slug) },
];
/** Etiqueta de onde o item aparece. */
function ondeAparece(p: Produto) {
  if (/evento|furia|destaque/.test(p.slug)) return 'no episódio';
  if (/pet|rover|traje/.test(p.slug)) return 'anda com você';
  return 'na sua casa';
}

export default async function Loja() {
  let produtos: Produto[] = [];
  try {
    const { data } = await db()
      .from('produtos')
      .select('slug, nome, descricao, preco_centavos, tipo, opcoes, pergunta_texto, imagem_url, episodios(numero, titulo)')
      .eq('ativo', true)
      .order('ordem').order('id', { ascending: false });
    produtos = ((data ?? []) as unknown as Produto[]).filter((p) => p.slug !== PET_MACACO);   // o macaco aparece no cartão do pet
  } catch (e) {
    console.error('loja', e); // sem banco configurado (ex.: build local) → loja vazia
  }
  const usados = new Set<string>();
  const grupos = SECOES.map((s) => {
    const lista = produtos.filter((p) => p.tipo !== 'gratis' && !usados.has(p.slug) && s.teste(p));
    lista.forEach((p) => usados.add(p.slug));
    return { ...s, lista };
  });
  const outros = produtos.filter((p) => p.tipo !== 'gratis' && !usados.has(p.slug));
  if (outros.length) grupos.push({ id: 'mais', titulo: 'Mais da colônia', sub: '', teste: () => true, lista: outros });
  const gratis = produtos.filter((p) => p.tipo === 'gratis');

  const cartao = (p: Produto) => {
    const temEscolha = lerOpcoes(p.opcoes).length > 0 || !!p.pergunta_texto || /pet|outdoor/.test(p.slug);
    return (
      <article key={p.slug} id={p.slug} className="papel produto">
        <span className="produto-onde">{ondeAparece(p)}</span>
        {p.imagem_url
          ? <img src={p.imagem_url} alt={p.nome} loading="lazy" />
          : <div className="sem-img" aria-hidden="true" />}
        <h3 style={{ marginTop: 12 }}>{p.nome}</h3>
        {p.episodios && <p className="mudo">Aparece no ep. {p.episodios.numero}: {p.episodios.titulo}</p>}
        {p.descricao && <p>{p.descricao}</p>}
        {/pet/.test(p.slug) && <p className="produto-variantes">🐶 Cachorro · 🐱 Gato · 🐒 Macaco</p>}
        {p.tipo === 'gratis' ? (
          <>
            <div className="preco">GRÁTIS · 1 por pessoa</div>
            <a className="btn ouro" href={`/resgatar/${p.slug}`}>Resgatar</a>
          </>
        ) : (
          <>
            <div className="preco">{/pet/.test(p.slug) ? 'a partir de ' : ''}{reais(p.preco_centavos)}</div>
            <BotaoPersonalizar slug={p.slug} rotulo={temEscolha ? 'Personalizar' : 'Comprar'} />
          </>
        )}
      </article>
    );
  };

  return (
    <main className="pagina-ferrugem">
     <div className="wrap">
      <p className="etiqueta">ENTREPOSTO DA COLÔNIA</p>
      <h1 className="titulo-secao">Loja</h1>
      <p className="sub-secao">
        Deixe sua marca em Marte: tudo o que você compra aparece de verdade no mapa ao vivo e nos próximos episódios.
        Pagamento seguro pela Cakto (Pix ou cartão). Já comprou? Veja em <a href="/meus-itens">Meus itens</a>.
      </p>
      <details className="papel regras-loja">
        <summary>📜 Regras da colônia <span className="mudo">(toque para ver)</span></summary>
        <ul>
          <li>Textos (outdoor, nomes) aparecem como você escreveu, mas sem links, telefones ou palavrões.</li>
          <li>Conteúdo ofensivo, político ou de propaganda é removido sem aviso.</li>
          <li>O item entra no mapa assim que o pagamento é aprovado e aparece no próximo episódio.</li>
        </ul>
      </details>
      {produtos.length === 0 && <p>Nenhum item à venda agora. Volte depois do próximo episódio.</p>}
      {grupos.filter((g) => g.lista.length).map((g) => (
        <section key={g.id} className="secao-loja" aria-labelledby={`sec-${g.id}`}>
          <h2 id={`sec-${g.id}`} className="secao-loja-titulo">{g.titulo}</h2>
          {g.sub && <p className="secao-loja-sub">{g.sub}</p>}
          <div className="grade">{g.lista.map(cartao)}</div>
        </section>
      ))}
      {gratis.length > 0 && (
        <section className="secao-loja" aria-labelledby="sec-gratis">
          <h2 id="sec-gratis" className="secao-loja-titulo">Grátis para colonos</h2>
          <div className="grade">{gratis.map(cartao)}</div>
        </section>
      )}
     </div>
     <LojaModal semBotao />
    </main>
  );
}
