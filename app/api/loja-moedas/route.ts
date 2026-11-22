import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { colonoLogado, movimentar, saldo } from '@/lib/jogo';

/**
 * Loja de moedas (diferente da loja paga): trajes, cores e especiais, comprados com as moedas dos minigames.
 *   GET                                               → itens aprovados e ligados + o que eu tenho + o traje vestido
 *   POST { acao: 'comprar', slug } | { acao: 'vestir', slug|null }
 */
export async function GET() {
  const eu = await colonoLogado();
  const { data: itens, error } = await db().from('loja_moedas').select('slug, nome, tipo, preco, traje')
    .eq('ativo', true).not('aprovado_em', 'is', null).order('ordem').order('preco');
  if (error) return NextResponse.json({ indisponivel: true, itens: [] });
  if (!eu) return NextResponse.json({ logado: false, itens });
  const [{ data: meus }, s, { data: p }] = await Promise.all([
    db().from('loja_moedas_compras').select('item').eq('personagem_id', eu.id),
    saldo(eu.id),
    db().from('personagens').select('traje_moedas, seed').eq('id', eu.id).single(),
  ]);
  return NextResponse.json({ logado: true, itens, meus: (meus ?? []).map((x) => x.item), vestido: p?.traje_moedas ?? null, seed: p?.seed, moedas: s.moedas });
}

export async function POST(req: NextRequest) {
  const eu = await colonoLogado();
  if (!eu) return NextResponse.json({ erro: 'Entre na sua conta de colono.' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (b.acao === 'vestir') {
    if (b.slug) {
      const { data: tem } = await db().from('loja_moedas_compras').select('id').eq('personagem_id', eu.id).eq('item', b.slug).maybeSingle();
      if (!tem) return NextResponse.json({ erro: 'Você ainda não tem esse item.' }, { status: 403 });
    }
    await db().from('personagens').update({ traje_moedas: b.slug || null }).eq('id', eu.id);
    return NextResponse.json({ ok: true });
  }
  if (b.acao === 'comprar') {
    const { data: item } = await db().from('loja_moedas').select('slug, preco, ativo, aprovado_em').eq('slug', String(b.slug)).maybeSingle();
    if (!item?.ativo || !item.aprovado_em) return NextResponse.json({ erro: 'Item indisponível.' }, { status: 404 });
    const { data: tem } = await db().from('loja_moedas_compras').select('id').eq('personagem_id', eu.id).eq('item', item.slug).maybeSingle();
    if (tem) return NextResponse.json({ erro: 'Você já tem esse item.' }, { status: 409 });
    try {
      await movimentar(eu.id, 'loja', item.slug, -item.preco, 0);   // o banco recusa se faltar moeda
    } catch {
      return NextResponse.json({ erro: 'Moedas insuficientes. Jogue os minigames e cumpra missões!' }, { status: 402 });
    }
    await db().from('loja_moedas_compras').insert({ personagem_id: eu.id, item: item.slug, preco: item.preco });
    await db().from('personagens').update({ traje_moedas: item.slug }).eq('id', eu.id);
    return NextResponse.json({ ok: true, ...(await saldo(eu.id)) });
  }
  return NextResponse.json({ erro: 'Ação inválida.' }, { status: 400 });
}
