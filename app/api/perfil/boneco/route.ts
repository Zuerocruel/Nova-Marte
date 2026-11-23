import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { codigoDaSessao } from '@/lib/sessao';
import { ipDe, permitido } from '@/lib/limite';
import { SEED_MAX } from '@/lib/sprite';

/** POST { seed } → o colono logado troca o visual do boneco. Só UMA vez (boneco_trocado_em, migração 015). */
export async function POST(req: NextRequest) {
  if (!permitido(`boneco:${ipDe(req.headers)}`, 10, 10 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Espere alguns minutos.' }, { status: 429 });
  }
  const codigo = await codigoDaSessao();
  if (!codigo) return NextResponse.json({ erro: 'Entre na sua conta de colono.' }, { status: 401 });
  let b: { seed?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 }); }
  const seed = b.seed;
  if (!Number.isInteger(seed) || (seed as number) < 1 || (seed as number) > SEED_MAX) {
    return NextResponse.json({ erro: 'Monte o boneco antes de salvar.' }, { status: 400 });
  }

  const { data: p, error } = await db().from('personagens')
    .select('id, seed, oculto, sprite_url, boneco_trocado_em').eq('codigo', codigo).maybeSingle();
  if (error?.code === '42703') return NextResponse.json({ erro: 'A troca de boneco ainda está sendo instalada. Volte daqui a pouco!' }, { status: 503 });
  if (!p || p.oculto) return NextResponse.json({ erro: 'Colono não encontrado.' }, { status: 404 });
  if (p.sprite_url) return NextResponse.json({ erro: 'Seu colono já tem arte final desenhada.' }, { status: 409 });
  if (p.boneco_trocado_em) return NextResponse.json({ erro: 'Você já trocou o seu boneco. A troca é uma vez só.' }, { status: 409 });
  if (p.seed === seed) return NextResponse.json({ erro: 'Esse já é o seu boneco atual. Mude alguma coisa antes de salvar.' }, { status: 400 });

  // "boneco_trocado_em is null" no próprio update: dois cliques ao mesmo tempo não trocam duas vezes
  const { data: feito, error: e2 } = await db().from('personagens')
    .update({ seed, boneco_trocado_em: new Date().toISOString() })
    .eq('id', p.id).is('boneco_trocado_em', null).select('id');
  if (e2) return NextResponse.json({ erro: 'Não foi possível salvar agora.' }, { status: 500 });
  if (!feito?.length) return NextResponse.json({ erro: 'Você já trocou o seu boneco. A troca é uma vez só.' }, { status: 409 });
  return NextResponse.json({ ok: true, seed });
}
