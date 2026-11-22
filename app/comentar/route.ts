import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

/**
 * Botão "Comente no Instagram": leva ao último carrossel do episódio postado no @operacaomartezero.
 * O endereço fica em links.slug = 'ig-comentar' e é atualizado pelo celular a cada carrossel postado
 * (producao/celular.py). Sem o link, vai para o perfil.
 * Não grava origem: é um link de SAÍDA do site (não pode virar "de onde a pessoa veio").
 */
const PERFIL = 'https://www.instagram.com/operacaomartezero/';
export const dynamic = 'force-dynamic';

export async function GET() {
  let destino = PERFIL;
  try {
    const { data } = await db().from('links').select('destino').eq('slug', 'ig-comentar').maybeSingle();
    if (data?.destino && /^https:\/\/(www\.)?instagram\.com\//.test(data.destino)) destino = data.destino;
  } catch { /* sem banco: perfil */ }
  return NextResponse.redirect(destino, 302);
}
