import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { normalizarBusca } from '@/lib/texto';

/** Busca por nome, @ ou código (NM000123). Só devolve campos públicos. */
export async function GET(req: NextRequest) {
  const q = normalizarBusca(req.nextUrl.searchParams.get('q') ?? '').slice(0, 40);
  if (q.length < 2) return NextResponse.json([]);

  const { data, error } = await db().rpc('buscar_personagens', { q, lim: 20 });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
  });
}
