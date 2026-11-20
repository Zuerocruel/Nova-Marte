import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { codigoDaSessao } from '@/lib/sessao';
import { cargoDe } from '@/lib/cargos';

/** POST { cargo } → o colono logado que ainda não tem cargo escolhe o seu. O cargo é escolhido UMA vez só (sem troca). */
export async function POST(req: NextRequest) {
  const codigo = await codigoDaSessao();
  if (!codigo) return NextResponse.json({ erro: 'Entre na sua conta de colono.' }, { status: 401 });
  let b: { cargo?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 }); }
  const cargo = cargoDe(String(b.cargo ?? ''));
  if (!cargo) return NextResponse.json({ erro: 'Escolha um cargo da lista.' }, { status: 400 });

  const { data: p, error } = await db().from('personagens').select('id, cargo, oculto').eq('codigo', codigo).maybeSingle();
  if (error?.code === '42703') return NextResponse.json({ erro: 'Os cargos ainda estão sendo instalados. Volte daqui a pouco!' }, { status: 503 });
  if (!p || p.oculto) return NextResponse.json({ erro: 'Colono não encontrado.' }, { status: 404 });
  if (p.cargo) return NextResponse.json({ erro: 'Seu cargo já foi escolhido e não pode ser trocado.' }, { status: 409 });

  // "is cargo null" no próprio update: dois cliques ao mesmo tempo não gravam dois cargos
  const { data: feito, error: e2 } = await db().from('personagens')
    .update({ cargo: cargo.id, cargo_em: new Date().toISOString() }).eq('id', p.id).is('cargo', null).select('id');
  if (!e2 && !feito?.length) return NextResponse.json({ erro: 'Seu cargo já foi escolhido e não pode ser trocado.' }, { status: 409 });
  if (e2) return NextResponse.json({ erro: 'Não foi possível salvar agora.' }, { status: 500 });
  return NextResponse.json({ ok: true, cargo: cargo.id });
}
