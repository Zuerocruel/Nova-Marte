import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { CHUNK, CHUNKS_POR_LINHA } from '@/lib/mundo';

/**
 * Personagens de um "quarteirão" (chunk) de 32x32 casas.
 * O mundo é carregado por pedaços → aguenta milhões de personagens,
 * e a resposta fica no cache da CDN por 15 s (o banco quase não sente o tráfego).
 */
export async function GET(req: NextRequest) {
  const cx = Math.max(0, Math.min(CHUNKS_POR_LINHA - 1, Number(req.nextUrl.searchParams.get('cx')) | 0));
  const cy = Math.max(0, Number(req.nextUrl.searchParams.get('cy')) | 0);

  const { data, error } = await db()
    .from('v_mundo_publico')
    .select('codigo, nome, handle, plataforma, status, pos_x, pos_y, seed, sprite_url')
    .gte('pos_x', cx * CHUNK).lt('pos_x', (cx + 1) * CHUNK)
    .gte('pos_y', cy * CHUNK).lt('pos_y', (cy + 1) * CHUNK)
    .limit(CHUNK * CHUNK);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60' },
  });
}
