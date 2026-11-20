import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { ipDe, permitido } from '@/lib/limite';
import { chaveApelido, erroApelido, limparApelido } from '@/lib/texto';

/** GET ?n=<nick> → { livre, erro? } — o cadastro avisa na hora se o nick já tem dono. */
export async function GET(req: NextRequest) {
  if (!permitido(`nick:${ipDe(req.headers)}`, 40, 60_000)) return NextResponse.json({ livre: false, erro: 'Calma! Tente de novo em instantes.' }, { status: 429 });
  const apelido = limparApelido(req.nextUrl.searchParams.get('n') ?? '');
  const erro = erroApelido(apelido);
  if (erro) return NextResponse.json({ livre: false, erro });
  const { data, error } = await db().from('personagens').select('id').eq('apelido_chave', chaveApelido(apelido)).maybeSingle();
  if (error && error.code !== '42703') return NextResponse.json({ livre: false, erro: 'Não deu para conferir agora.' }, { status: 500 });
  return NextResponse.json(data ? { livre: false, erro: 'Esse nick já está em uso. Escolha outro.' } : { livre: true },
    { headers: { 'Cache-Control': 'no-store' } });
}
