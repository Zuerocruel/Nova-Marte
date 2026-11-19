import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { normalizarWhatsapp } from '@/lib/texto';
import { ipDe, permitido } from '@/lib/limite';
import { apagarSessao, codigoDaSessao, gravarSessao } from '@/lib/sessao';

/**
 * Sessão do colono.
 *   GET    → quem está logado ({ colono } ou { colono: null })
 *   POST   { whatsapp, codigo } → entra (WhatsApp do cadastro + código NM…)
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
  let b: { whatsapp?: string; codigo?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 }); }
  const codigo = String(b.codigo ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const whatsapp = normalizarWhatsapp(String(b.whatsapp ?? ''));

  if (!permitido(`entrar:${ip}`, 8, 10 * 60_000) || !permitido(`entrar:${codigo}`, 8, 60 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Espere alguns minutos.' }, { status: 429 });
  }
  if (!/^NM\d{6,}$/.test(codigo) || !whatsapp) {
    return NextResponse.json({ erro: 'Informe o código (NM000123) e o WhatsApp do cadastro.' }, { status: 400 });
  }

  const { data } = await db().from('personagens').select('codigo, oculto')
    .eq('codigo', codigo).eq('whatsapp', whatsapp).maybeSingle();
  // mesma resposta para "código não existe" e "WhatsApp não bate": não revela quem está cadastrado
  if (!data || data.oculto) return NextResponse.json({ erro: 'Código ou WhatsApp não conferem.' }, { status: 401 });

  const res = NextResponse.json({ ok: true, codigo });
  gravarSessao(res, codigo);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  apagarSessao(res);
  return res;
}
