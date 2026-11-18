import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { chaveTelefone } from '@/lib/texto';
import { lerOpcoes } from '@/lib/opcoes';
import { ipDe, permitido } from '@/lib/limite';

/**
 * "Meus itens": o comprador vê os pedidos aprovados e escolhe/personaliza.
 * Identificação = telefone + e-mail usados NA COMPRA (os dois vêm da Cakto).
 *   { acao: "listar", whatsapp, email }
 *   { acao: "salvar", whatsapp, email, pedido, opcao?, texto? }
 */
type Body = { acao?: string; whatsapp?: string; email?: string; pedido?: number; opcao?: string; texto?: string };

export async function POST(req: NextRequest) {
  if (!permitido(`itens:${ipDe(req.headers)}`, 20, 10 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Espere alguns minutos.' }, { status: 429 });
  }
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 }); }

  const chave = chaveTelefone(String(b.whatsapp ?? ''));
  const email = String(b.email ?? '').trim().toLowerCase();
  if (!chave || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ erro: 'Informe o telefone e o e-mail usados na compra.' }, { status: 400 });
  }

  const { data: pedidos, error } = await db()
    .from('pedidos')
    .select('id, opcao, texto_personalizado, created_at, cliente_email, produtos(nome, opcoes, pergunta_texto)')
    .eq('cliente_telefone_chave', chave)
    .eq('status', 'aprovado')
    .order('id', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ erro: 'Erro ao buscar pedidos.' }, { status: 500 });

  // e-mail comparado sem diferenciar maiúsculas (ilike trataria "_" e "%" como curinga)
  const meus = (pedidos ?? []).filter((p) => (p.cliente_email ?? '').trim().toLowerCase() === email);

  if (b.acao === 'salvar') {
    const alvo = meus.find((p) => p.id === Number(b.pedido));
    if (!alvo) return NextResponse.json({ erro: 'Pedido não encontrado.' }, { status: 404 });
    const produto = alvo.produtos as unknown as { opcoes: unknown; pergunta_texto: string | null } | null;
    const opcoes = lerOpcoes(produto?.opcoes);
    const mudanca: Record<string, unknown> = { personalizado_em: new Date().toISOString() };
    if (opcoes.length) {
      if (!opcoes.some((o) => o.valor === b.opcao)) return NextResponse.json({ erro: 'Escolha uma opção.' }, { status: 400 });
      mudanca.opcao = b.opcao;
    }
    if (produto?.pergunta_texto) {
      const texto = String(b.texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      mudanca.texto_personalizado = texto || null;
    }
    const { error: e2 } = await db().from('pedidos').update(mudanca).eq('id', alvo.id);
    if (e2) return NextResponse.json({ erro: 'Não foi possível salvar.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({
    itens: meus.map((p) => {
      const produto = p.produtos as unknown as { nome: string; opcoes: unknown; pergunta_texto: string | null } | null;
      return {
        pedido: p.id,
        nome: produto?.nome ?? 'Item',
        comprado_em: p.created_at,
        opcoes: lerOpcoes(produto?.opcoes),
        pergunta_texto: produto?.pergunta_texto ?? null,
        opcao: p.opcao,
        texto: p.texto_personalizado,
      };
    }),
  });
}
