import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { gravarToque } from '@/lib/origem';
import { COOKIE_CONVITE } from '@/lib/convite';

/**
 * Link de convite de cada colono: site/c/NM000123 (com UTM por pessoa: utm_source=convite&utm_medium=colono
 * &utm_campaign=NM000123). Grava o clique, marca quem convidou (cookie nm_conv, 30 dias) e leva para a home.
 * No cadastro, personagens.convidado_por recebe quem convidou (painel → aba Convites).
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const codigo = (await params).codigo.toUpperCase();
  const base = req.nextUrl.origin;
  if (!/^NM\d{6}$/.test(codigo)) return NextResponse.redirect(new URL('/', base));
  const { data: p } = await db().from('personagens').select('id, oculto').eq('codigo', codigo).maybeSingle();
  if (!p || p.oculto) return NextResponse.redirect(new URL('/', base));

  const res = NextResponse.redirect(new URL(`/?utm_source=convite&utm_medium=colono&utm_campaign=${codigo}`, base), 302);
  let refHost: string | undefined;
  try { const r = req.headers.get('referer'); if (r) refHost = new URL(r).host; } catch {}
  const vid = gravarToque(req, res, { s: 'convite', m: 'colono', c: codigo, l: `convite-${codigo}`, r: refHost, p: `/c/${codigo}`, at: new Date().toISOString() });
  res.cookies.set(COOKIE_CONVITE, codigo, { maxAge: 60 * 60 * 24 * 30, path: '/', sameSite: 'lax', httpOnly: true, secure: true });
  await db().from('cliques').insert({
    tipo: 'link', alvo: `convite-${codigo}`, visitante_id: vid, source: 'convite', campaign: codigo,
    referer: refHost ?? null, user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
  });
  return res;
}
