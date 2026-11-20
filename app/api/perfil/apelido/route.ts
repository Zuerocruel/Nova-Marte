import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { codigoDaSessao } from '@/lib/sessao';
import { chaveApelido, erroApelido, limparApelido } from '@/lib/texto';

/** POST { apelido } → quem entrou antes dos nicks escolhe o seu (uma vez; depois o login passa a ser nick + WhatsApp). */
export async function POST(req: NextRequest) {
  const codigo = await codigoDaSessao();
  if (!codigo) return NextResponse.json({ erro: 'Entre na sua conta de colono.' }, { status: 401 });
  let b: { apelido?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 }); }
  const apelido = limparApelido(String(b.apelido ?? ''));
  const erro = erroApelido(apelido);
  if (erro) return NextResponse.json({ erro }, { status: 400 });

  const { data, error } = await db().from('personagens')
    .update({ apelido, apelido_chave: chaveApelido(apelido) })
    .eq('codigo', codigo).is('apelido_chave', null).select('id');
  if (error?.code === '23505') return NextResponse.json({ erro: 'Esse nick já está em uso. Escolha outro.' }, { status: 409 });
  if (error?.code === '42703' || error?.code === 'PGRST204') return NextResponse.json({ erro: 'Os nicks ainda estão sendo instalados. Volte daqui a pouco!' }, { status: 503 });
  if (error) return NextResponse.json({ erro: 'Não foi possível salvar agora.' }, { status: 500 });
  if (!data?.length) return NextResponse.json({ erro: 'Você já tem um nick.' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
