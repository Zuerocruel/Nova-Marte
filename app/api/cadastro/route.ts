import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { COOKIE_FT, COOKIE_LT, COOKIE_VID, lerToque } from '@/lib/origem';
import { normalizarBusca, normalizarHandle, normalizarWhatsapp } from '@/lib/texto';
import { ipDe, permitido } from '@/lib/limite';
import { gravarSessao } from '@/lib/sessao';

const PLATAFORMAS = ['instagram', 'tiktok', 'youtube'];

export async function POST(req: NextRequest) {
  if (!permitido(`cad:${ipDe(req.headers)}`, 5, 10 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Espere alguns minutos.' }, { status: 429 });
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 }); }

  // honeypot: campo invisível que só robô preenche
  if (b.site) return NextResponse.json({ codigo: 'NM000000' });

  const nome = String(b.nome ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const handle = normalizarHandle(String(b.handle ?? '')).slice(0, 40);
  const plataforma = String(b.plataforma ?? '');
  const whatsapp = normalizarWhatsapp(String(b.whatsapp ?? ''));

  const erros: string[] = [];
  if (nome.length < 2) erros.push('Digite seu nome.');
  if (handle.length < 2) erros.push('Digite seu @.');
  if (!PLATAFORMAS.includes(plataforma)) erros.push('Escolha a rede do seu @.');
  if (!whatsapp) erros.push('WhatsApp inválido. Use DDD + número.');
  if (b.consentimento !== true) erros.push('É preciso aceitar a política de privacidade.');
  if (erros.length) return NextResponse.json({ erro: erros.join(' ') }, { status: 400 });

  const ft = lerToque(req.cookies.get(COOKIE_FT)?.value);
  const lt = lerToque(req.cookies.get(COOKIE_LT)?.value);
  const vid = req.cookies.get(COOKIE_VID)?.value;

  const { data, error } = await db()
    .from('personagens')
    .insert({
      nome,
      nome_busca: normalizarBusca(nome),
      handle,
      handle_plataforma: plataforma,
      whatsapp,
      consentimento_lgpd: true,
      aceita_whatsapp: b.aceita_whatsapp === true,
      visitante_id: vid && /^[0-9a-f-]{36}$/i.test(vid) ? vid : null,
      origem_source: ft?.s ?? 'direto',
      origem_medium: ft?.m ?? null,
      origem_campaign: ft?.c ?? null,
      origem_content: ft?.t ?? null,
      origem_link_slug: ft?.l ?? null,
      origem_referer: ft?.r ?? null,
      origem_landing: ft?.p ?? null,
      origem_em: ft?.at ?? null,
      ultimo_source: lt?.s ?? null,
      ultimo_campaign: lt?.c ?? null,
      ultimo_link_slug: lt?.l ?? null,
    })
    .select('codigo')
    .single();

  if (error) {
    if (error.code === '23505') {
      // já existe: mesmo WhatsApp ou mesmo @ — devolve o personagem existente
      const { data: existente } = await db()
        .from('personagens').select('codigo, whatsapp')
        .or(`whatsapp.eq."${whatsapp}",and(handle.eq."${handle}",handle_plataforma.eq.${plataforma})`)
        .limit(1).maybeSingle();
      if (existente) {
        const res = NextResponse.json({ codigo: existente.codigo, jaExistia: true });
        // só entra na conta se o WhatsApp for o MESMO do cadastro (achar pelo @ não basta: o @ é público)
        if (existente.whatsapp === whatsapp) gravarSessao(res, existente.codigo);
        return res;
      }
    }
    console.error('cadastro', error);
    return NextResponse.json({ erro: 'Não foi possível cadastrar agora.' }, { status: 500 });
  }

  const res = NextResponse.json({ codigo: data.codigo });
  gravarSessao(res, data.codigo);   // já sai do cadastro logado (chat e "Meu perfil")
  return res;
}
