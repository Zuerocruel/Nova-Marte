import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { codigoDaSessao } from '@/lib/sessao';
import { COOKIE_VID } from '@/lib/origem';
import { permitido } from '@/lib/limite';

/**
 * Online agora.
 *   POST → "estou aqui" (o site manda a cada 45 s com a aba aberta). Logado: conta pelo código do colono.
 *   GET  → { online, colonos_online: [codigo...], total_colonos }  (online = visto nos últimos 2 minutos)
 */
const JANELA_MS = 2 * 60_000;

export async function POST(req: NextRequest) {
  const codigo = await codigoDaSessao();
  const vid = req.cookies.get(COOKIE_VID)?.value;
  const chave = codigo ?? (vid && /^[0-9a-f-]{36}$/i.test(vid) ? vid : null);
  if (!chave || !permitido(`presenca:${chave}`, 1, 20_000)) return NextResponse.json({ ok: true });
  await db().from('presenca').upsert({ visitante: chave, codigo, visto_em: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const [on, total] = await Promise.all([
    db().from('presenca').select('codigo').gte('visto_em', desde).limit(5000),
    db().from('personagens').select('id', { count: 'estimated', head: true }).eq('oculto', false),
  ]);
  const lista = on.data ?? [];
  return NextResponse.json(
    { online: lista.length, colonos_online: lista.map((x) => x.codigo).filter(Boolean), total_colonos: total.count ?? 0 },
    { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' } },
  );
}
