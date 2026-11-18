import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { COOKIE_LT, COOKIE_FT, gravarToque, lerToque, obterVisitante } from '@/lib/origem';
import { lerOpcoes } from '@/lib/opcoes';

/**
 * Botão "comprar" da loja:  site.com/comprar/<produto>
 * Registra o clique e manda para o checkout da Cakto levando junto a origem
 * (utm_*) e o visitante_id (src/sck), para o webhook conseguir ligar a venda
 * ao personagem. Se a Cakto não devolver esses campos no webhook, a ligação
 * cai no plano B: telefone do comprador = WhatsApp do cadastro.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: produto } = await db()
    .from('produtos').select('slug, checkout_url, ativo, tipo, opcoes').eq('slug', slug).maybeSingle();
  if (produto?.tipo === 'gratis') return NextResponse.redirect(new URL(`/resgatar/${produto.slug}`, req.nextUrl.origin));
  if (!produto || !produto.ativo || !produto.checkout_url) return NextResponse.redirect(new URL('/loja', req.nextUrl.origin));

  // Produto com opções: a escolha é obrigatória e precisa ser uma das cadastradas
  const opcoes = lerOpcoes(produto.opcoes);
  const opcao = req.nextUrl.searchParams.get('opcao');
  if (opcoes.length && !opcoes.some((o) => o.valor === opcao)) {
    return NextResponse.redirect(new URL(`/loja#${produto.slug}`, req.nextUrl.origin));
  }

  const toque = lerToque(req.cookies.get(COOKIE_LT)?.value) ?? lerToque(req.cookies.get(COOKIE_FT)?.value);
  const visitante = obterVisitante(req);

  const url = new URL(produto.checkout_url);
  url.searchParams.set('utm_source', toque?.s ?? 'site');
  url.searchParams.set('utm_medium', 'loja');
  url.searchParams.set('utm_campaign', toque?.c ?? produto.slug);
  url.searchParams.set('utm_content', visitante.vid);
  url.searchParams.set('src', visitante.vid);
  url.searchParams.set('sck', visitante.vid);

  const res = NextResponse.redirect(url, 302);
  gravarToque(req, res, null, visitante);

  await db().from('cliques').insert({
    tipo: 'checkout',
    alvo: produto.slug,
    visitante_id: visitante.vid,
    source: toque?.s ?? null,
    campaign: toque?.c ?? null,
    opcao: opcoes.length ? opcao : null,
    user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
  });

  return res;
}
