import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { normalizarWhatsapp } from '@/lib/texto';
import { ipDe, permitido } from '@/lib/limite';

/**
 * Resgate de item grátis. A pessoa prova que é ela pelo WhatsApp do cadastro
 * (que nunca aparece em público). O banco garante 1 resgate por personagem.
 */
export async function POST(req: NextRequest) {
  if (!permitido(`resg:${ipDe(req.headers)}`, 8, 10 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Espere alguns minutos.' }, { status: 429 });
  }
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 }); }

  const slug = String(b.produto ?? '');
  const whatsapp = normalizarWhatsapp(String(b.whatsapp ?? ''));
  const texto = String(b.texto ?? '').replace(/\s+/g, ' ').trim();

  if (!whatsapp) return NextResponse.json({ erro: 'WhatsApp inválido. Use DDD + número.' }, { status: 400 });
  if (texto.length < 2 || texto.length > 30) return NextResponse.json({ erro: 'O nome precisa ter de 2 a 30 caracteres.' }, { status: 400 });
  if (/https?:|www\.|@/i.test(texto)) return NextResponse.json({ erro: 'Sem links ou @ no nome.' }, { status: 400 });

  const { data: produto } = await db()
    .from('produtos').select('id, tipo, ativo').eq('slug', slug).maybeSingle();
  if (!produto || produto.tipo !== 'gratis' || !produto.ativo) {
    return NextResponse.json({ erro: 'Item indisponível.' }, { status: 404 });
  }

  const { data: p } = await db()
    .from('personagens').select('id, codigo').eq('whatsapp', whatsapp).maybeSingle();
  if (!p) {
    return NextResponse.json({ erro: 'Não achamos um personagem com esse WhatsApp. Crie o seu primeiro na página inicial.' }, { status: 404 });
  }

  const { error } = await db().from('resgates').insert({ produto_id: produto.id, personagem_id: p.id, texto });
  if (error) {
    if (error.code === '23505') return NextResponse.json({ erro: 'Você já resgatou este item. Ele vale 1 por pessoa.' }, { status: 409 });
    console.error('resgate', error);
    return NextResponse.json({ erro: 'Não foi possível resgatar agora.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, codigo: p.codigo });
}
