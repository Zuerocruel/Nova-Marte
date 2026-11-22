import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { COOKIE_FT, COOKIE_LT, COOKIE_VID, lerToque } from '@/lib/origem';
import { COOKIE_CONVITE } from '@/lib/convite';
import { chaveApelido, erroApelido, limparApelido, normalizarBusca, normalizarHandle, normalizarWhatsapp } from '@/lib/texto';
import { ipDe, permitido } from '@/lib/limite';
import { gravarSessao } from '@/lib/sessao';
import { cargoDe } from '@/lib/cargos';

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
  const cargo = cargoDe(String(b.cargo ?? ''))?.id ?? null;
  const apelido = limparApelido(String(b.apelido ?? ''));

  const erros: string[] = [];
  if (nome.length < 2) erros.push('Digite seu nome.');
  const erroNick = erroApelido(apelido);
  if (erroNick) erros.push(erroNick);
  if (handle.length < 2) erros.push('Digite seu @.');
  if (!PLATAFORMAS.includes(plataforma)) erros.push('Escolha a rede do seu @.');
  if (!cargo) erros.push('Escolha o seu cargo na colônia.');
  if (!whatsapp) erros.push('WhatsApp inválido. Use DDD + número.');
  if (b.consentimento !== true) erros.push('É preciso aceitar a política de privacidade.');
  if (erros.length) return NextResponse.json({ erro: erros.join(' ') }, { status: 400 });

  // nick já usado por OUTRA pessoa? (o mesmo WhatsApp cai no "já existe" lá embaixo)
  const nick = await db().from('personagens').select('whatsapp').eq('apelido_chave', chaveApelido(apelido)).maybeSingle();
  if (nick.data && nick.data.whatsapp !== whatsapp) {
    return NextResponse.json({ erro: 'Esse nick já está em uso. Escolha outro.', campo: 'apelido' }, { status: 409 });
  }

  const ft = lerToque(req.cookies.get(COOKIE_FT)?.value);
  const lt = lerToque(req.cookies.get(COOKIE_LT)?.value);
  const vid = req.cookies.get(COOKIE_VID)?.value;

  const linha = {
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
  };
  const inserir = (l: Record<string, unknown>) => db().from('personagens').insert(l).select('codigo').single();
  let { data, error } = await inserir({ ...linha, cargo, cargo_em: new Date().toISOString(), apelido, apelido_chave: chaveApelido(apelido) });
  // sem a migração 008 (colunas cargo/apelido): cadastra mesmo assim, sem cargo e sem nick
  if (error && (error.code === 'PGRST204' || error.code === '42703')) ({ data, error } = await inserir(linha));

  if (error) {
    if (error.code === '23505' && /apelido/.test(`${error.message} ${error.details}`)) {
      return NextResponse.json({ erro: 'Esse nick já está em uso. Escolha outro.', campo: 'apelido' }, { status: 409 });
    }
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

  // veio pelo link de convite de outro colono (/c/NM...)? grava quem convidou (migração 013)
  const conv = req.cookies.get(COOKIE_CONVITE)?.value?.toUpperCase();
  if (conv && /^NM\d{6}$/.test(conv) && conv !== data!.codigo) {
    const { data: quem } = await db().from('personagens').select('id').eq('codigo', conv).maybeSingle();
    if (quem) await db().from('personagens').update({ convidado_por: quem.id }).eq('codigo', data!.codigo);
  }

  const res = NextResponse.json({ codigo: data!.codigo });
  gravarSessao(res, data!.codigo);   // já sai do cadastro logado (chat e "Meu perfil")
  return res;
}
