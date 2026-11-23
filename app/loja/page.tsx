import { db } from '@/lib/supabase';
import { reais } from '@/lib/texto';
import { lerOpcoes } from '@/lib/opcoes';

export const metadata = { title: 'Loja — Operação Marte Zero' };
export const revalidate = 60;

type Produto = {
  slug: string; nome: string; descricao: string | null; preco_centavos: number; tipo: 'pago' | 'gratis';
  opcoes: unknown; pergunta_texto: string | null;
  imagem_url: string | null; episodios: { numero: number; titulo: string } | null;
};

export default async function Loja() {
  let produtos: Produto[] = [];
  try {
    const { data } = await db()
      .from('produtos')
      .select('slug, nome, descricao, preco_centavos, tipo, opcoes, pergunta_texto, imagem_url, episodios(numero, titulo)')
      .eq('ativo', true)
      .order('ordem').order('id', { ascending: false });
    produtos = (data ?? []) as unknown as Produto[];
  } catch (e) {
    console.error('loja', e); // sem banco configurado (ex.: build local) → loja vazia
  }

  return (
    <main className="pagina-ferrugem">
     <div className="wrap">
      <p className="etiqueta">ENTREPOSTO DA COLÔNIA</p>
      <h1 className="titulo-secao">Loja</h1>
      <p className="sub-secao">
        Itens que aparecem nos episódios. Pagamento seguro pela Cakto (Pix ou cartão).
        Já comprou? Escolha ou personalize em <a href="/meus-itens">Meus itens</a>.
      </p>
      {produtos.length === 0 && <p>Nenhum item à venda agora. Volte depois do próximo episódio.</p>}
      <div className="grade">
        {produtos.map((p) => (
          <article key={p.slug} id={p.slug} className="papel produto">
            {p.imagem_url
              ? <img src={p.imagem_url} alt={p.nome} loading="lazy" />
              : <div className="sem-img" aria-hidden="true" />}
            <h3 style={{ marginTop: 12 }}>{p.nome}</h3>
            {p.episodios && <p className="mudo">Aparece no ep. {p.episodios.numero}: {p.episodios.titulo}</p>}
            {p.descricao && <p style={{ fontSize: 19 }}>{p.descricao}</p>}
            {p.tipo === 'gratis' ? (
              <>
                <div className="preco">GRÁTIS · 1 por pessoa</div>
                <a className="btn" href={`/resgatar/${p.slug}`}>Resgatar</a>
              </>
            ) : lerOpcoes(p.opcoes).length > 0 ? (
              // produto com opções: escolhe antes de ir para a Cakto
              <form action={`/comprar/${p.slug}`} method="get">
                <div className="preco">{reais(p.preco_centavos)}</div>
                <label htmlFor={`op-${p.slug}`} style={{ marginTop: 0 }}>Escolha:</label>
                <select id={`op-${p.slug}`} name="opcao" required defaultValue="">
                  <option value="" disabled>selecione…</option>
                  {lerOpcoes(p.opcoes).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                </select>
                {p.pergunta_texto && <p className="mudo" style={{ fontSize: 16 }}>Depois do pagamento você conta os detalhes em “Meus itens”.</p>}
                <p style={{ marginTop: 12 }}><button className="btn">Comprar</button></p>
              </form>
            ) : (
              <>
                <div className="preco">{reais(p.preco_centavos)}</div>
                <a className="btn" href={`/comprar/${p.slug}`} rel="nofollow">Comprar</a>
              </>
            )}
          </article>
        ))}
      </div>
     </div>
    </main>
  );
}
