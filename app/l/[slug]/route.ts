import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { gravarToque } from '@/lib/origem';

/**
 * Link rastreável:  site.com/l/ig-bio  →  registra clique + origem → redireciona.
 * Crie um slug por lugar onde o link aparece (bio, episódio, story, comentário).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: link } = await db().from('links').select('*').eq('slug', slug.toLowerCase()).maybeSingle();
  const base = req.nextUrl.origin;
  if (!link) return NextResponse.redirect(new URL('/', base));

  const destino = /^https?:\/\//.test(link.destino) ? link.destino : new URL(link.destino, base).toString();
  const res = NextResponse.redirect(destino, 302);

  let refHost: string | undefined;
  try { const r = req.headers.get('referer'); if (r) refHost = new URL(r).host; } catch {}

  const vid = gravarToque(req, res, {
    s: link.plataforma,
    m: 'link',
    c: link.campanha ?? undefined,
    l: link.slug,
    r: refHost,
    p: `/l/${link.slug}`,
    at: new Date().toISOString(),
  });

  await db().from('cliques').insert({
    tipo: 'link',
    alvo: link.slug,
    visitante_id: vid,
    source: link.plataforma,
    campaign: link.campanha,
    referer: refHost ?? null,
    user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
  });

  return res;
}
