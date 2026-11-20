import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { ipDe, permitido } from '@/lib/limite';
import { codigoDaSessao } from '@/lib/sessao';
import { CHAT_DURA_MS } from '@/lib/chat';

/**
 * Chat da colônia.
 *   GET  ?depois=<id>  → mensagens novas (ou as últimas 50), só de colonos visíveis e só dos últimos 10 minutos
 *                        (o rádio não guarda histórico para o público; a moderação ainda vê tudo no painel)
 *   POST { texto }     → só colono logado (cookie de sessão). Sem links, até 280 caracteres.
 */
const LIMITE = 50;
const RE_LINK = /(https?:\/\/|www\.|\b[\w-]+\.(com|br|net|org|io|app|link|me|ly|gg|xyz|site|online|shop)\b)/i;

export type MensagemChat = {
  id: number; texto: string; em: string;
  codigo: string; nome: string; seed: number; sprite_url: string | null; pos_x: number; pos_y: number;
};

type Linha = {
  id: number; texto: string; created_at: string;
  personagens: { codigo: string; nome: string; seed: number; sprite_url: string | null; pos_x: number; pos_y: number; oculto: boolean } | null;
};

function nomeExibicao(nome: string): string {
  const p = (nome || '').trim().split(/\s+/);
  return p[0] ? p[0] + (p[1] ? ` ${p[1][0]}.` : '') : 'Colono';
}

export async function GET(req: NextRequest) {
  const depois = Number(req.nextUrl.searchParams.get('depois')) || 0;
  let q = db().from('chat_mensagens')
    .select('id, texto, created_at, personagens!inner(codigo, nome, seed, sprite_url, pos_x, pos_y, oculto)')
    .eq('oculto', false).eq('personagens.oculto', false)
    .gte('created_at', new Date(Date.now() - CHAT_DURA_MS).toISOString())
    .order('id', { ascending: false }).limit(LIMITE);
  if (depois > 0) q = q.gt('id', depois);
  const { data, error } = await q;
  if (error) {
    // tabela ainda não criada (falta a migração 006): chat vazio em vez de erro na tela
    if (error.code === '42P01' || error.code === 'PGRST205') return NextResponse.json({ mensagens: [], indisponivel: true });
    return NextResponse.json({ erro: 'Erro ao carregar o chat.' }, { status: 500 });
  }
  const mensagens: MensagemChat[] = ((data ?? []) as unknown as Linha[]).reverse().map((m) => ({
    id: m.id, texto: m.texto, em: m.created_at,
    codigo: m.personagens!.codigo, nome: nomeExibicao(m.personagens!.nome),
    seed: m.personagens!.seed, sprite_url: m.personagens!.sprite_url,
    pos_x: m.personagens!.pos_x, pos_y: m.personagens!.pos_y,
  }));
  return NextResponse.json({ mensagens }, { headers: { 'Cache-Control': 'public, s-maxage=2, stale-while-revalidate=4' } });
}

export async function POST(req: NextRequest) {
  const codigo = await codigoDaSessao();
  if (!codigo) return NextResponse.json({ erro: 'Entre na sua conta de colono para conversar.' }, { status: 401 });
  if (!permitido(`chat:${codigo}`, 1, 4_000) || !permitido(`chatmin:${codigo}`, 12, 60_000)
      || !permitido(`chatip:${ipDe(req.headers)}`, 30, 60_000)) {
    return NextResponse.json({ erro: 'Calma, colono! Espere uns segundos antes de mandar outra.' }, { status: 429 });
  }

  let b: { texto?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 }); }
  const texto = String(b.texto ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮]/g, '')   // controles e caracteres invisíveis
    .replace(/\s+/g, ' ').replace(/(.)\1{9,}/g, '$1$1$1').trim().slice(0, 280);
  if (!texto) return NextResponse.json({ erro: 'Escreva alguma coisa.' }, { status: 400 });
  if (RE_LINK.test(texto)) return NextResponse.json({ erro: 'Links não são permitidos no chat.' }, { status: 400 });

  const { data: p } = await db().from('personagens').select('id, oculto').eq('codigo', codigo).maybeSingle();
  if (!p || p.oculto) return NextResponse.json({ erro: 'Seu colono não pode usar o chat.' }, { status: 403 });

  const { data, error } = await db().from('chat_mensagens')
    .insert({ personagem_id: p.id, texto }).select('id').single();
  if (error) return NextResponse.json({ erro: 'Não foi possível enviar agora.' }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
