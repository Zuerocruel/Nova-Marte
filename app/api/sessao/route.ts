import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { chaveApelido, normalizarWhatsapp } from '@/lib/texto';
import { ipDe, permitido } from '@/lib/limite';
import { apagarSessao, codigoDaSessao, gravarSessao } from '@/lib/sessao';

/**
 * Sessão do colono.
 *   GET    → quem está logado ({ colono } ou { colono: null })
 *   POST   { whatsapp, apelido } → entra (nick + WhatsApp do cadastro; quem não tem nick usa o código NM…)
 *   DELETE → sai
 */
export async function GET() {
  const codigo = await codigoDaSessao();
  if (!codigo) return NextResponse.json({ colono: null }, { headers: { 'Cache-Control': 'no-store' } });
  const { data } = await db().from('v_mundo_publico')
    .select('codigo, nome, handle, plataforma, seed, sprite_url, pos_x, pos_y')
    .eq('codigo', codigo).maybeSingle();
  return NextResponse.json({ colono: data ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const ip = ipDe(req.headers);
  let b: { whatsapp?: string; apelido?: string; codigo?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 }); }
  // o campo aceita o nick ou, para quem entrou antes dos nicks, o código NM…
  const quem = String(b.apelido ?? b.codigo ?? '').trim().replace(/^@+/, '').replace(/\s+/g, '');
  const ehCodigo = /^NM\d{6,}$/i.test(quem);
  const chave = ehCodigo ? quem.toUpperCase() : chaveApelido(quem);
  const whatsapp = normalizarWhatsapp(String(b.whatsapp ?? ''));

  if (!permitido(`entrar:${ip}`, 8, 10 * 60_000) || !permitido(`entrar:${chave}`, 8, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Espere alguns minutos.' }, { status: 429 });
  }
  if (chave.length < 3 || !whatsapp) {
    return NextResponse.json({ erro: 'Informe o seu nick e o WhatsApp do cadastro.' }, { status: 400 });
  }

  const { data } = await db().from('personagens').select('codigo, oculto')
    .eq(ehCodigo ? 'codigo' : 'apelido_chave', chave).eq('whatsapp', whatsapp).maybeSingle();
  // mesma resposta para "nick não existe" e "WhatsApp não bate": não revela quem está cadastrado
  if (!data || data.oculto) return NextResponse.json({ erro: 'Nick ou WhatsApp não conferem.' }, { status: 401 });

  const res = NextResponse.json({ ok: true, codigo: data.codigo });
  gravarSessao(res, data.codigo);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  apagarSessao(res);
  return res;
}
