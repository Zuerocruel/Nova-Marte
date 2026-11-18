import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

/** Contador ao vivo + últimos que chegaram (faixa "acabou de chegar"). */
export async function GET() {
  const [{ count }, { data: ultimos }] = await Promise.all([
    db().from('personagens').select('id', { count: 'estimated', head: true }),
    db().from('v_mundo_publico')
      .select('codigo, nome, handle, pos_x, pos_y, seed')
      .order('pos_y', { ascending: false }).order('pos_x', { ascending: false })
      .limit(8),
  ]);
  return NextResponse.json(
    { total: count ?? 0, ultimos: ultimos ?? [] },
    { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } },
  );
}
