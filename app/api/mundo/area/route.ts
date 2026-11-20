import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { CHUNK, LIMITE_CHUNKS } from '@/lib/mundo';

/**
 * Personagens de um "quarteirão" (chunk) de 32x32 casas.
 * O bairro (espiral em volta da base) é carregado por pedaços → aguenta milhões de personagens,
 * e a resposta fica no cache da CDN por 15 s (o banco quase não sente o tráfego).
 */
export async function GET(req: NextRequest) {
  const lim = (v: string | null) => Math.max(-LIMITE_CHUNKS, Math.min(LIMITE_CHUNKS, Number(v) | 0));
  const cx = lim(req.nextUrl.searchParams.get('cx'));
  const cy = lim(req.nextUrl.searchParams.get('cy'));   // pode ser negativo: o bairro cerca a base

  const consulta = (campos: string) => db()
    .from('v_mundo_publico')
    .select(campos)
    .gte('pos_x', cx * CHUNK).lt('pos_x', (cx + 1) * CHUNK)
    .gte('pos_y', cy * CHUNK).lt('pos_y', (cy + 1) * CHUNK)
    .limit(CHUNK * CHUNK);
  const CAMPOS = 'codigo, nome, handle, plataforma, status, pos_x, pos_y, seed, sprite_url';
  let { data, error } = await consulta(`${CAMPOS}, cargo`);
  if (error?.code === '42703') ({ data, error } = await consulta(CAMPOS));   // sem a migração 008 (cargo)

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60' },
  });
}
