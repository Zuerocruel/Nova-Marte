import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { lerOpcoes } from '@/lib/opcoes';

/** Produtos ativos para o pop-up de compra do Mundo ao vivo (a mesma lista da /loja). */
export const revalidate = 60;

export async function GET() {
  const { data, error } = await db()
    .from('produtos')
    .select('slug, nome, descricao, preco_centavos, tipo, opcoes, pergunta_texto, imagem_url')
    .eq('ativo', true)
    .order('ordem').order('id', { ascending: false });
  if (error) return NextResponse.json({ produtos: [] }, { status: 500 });
  return NextResponse.json({
    produtos: (data ?? []).map((p) => ({ ...p, opcoes: lerOpcoes(p.opcoes) })),
  });
}
