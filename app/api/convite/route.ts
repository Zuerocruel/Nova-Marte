import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { colonoLogado } from '@/lib/jogo';

/** Meu link de convite + quantas pessoas ele já trouxe (só para quem está logado). */
export async function GET() {
  const eu = await colonoLogado();
  if (!eu) return NextResponse.json({ logado: false });
  const { count } = await db().from('personagens').select('id', { count: 'exact', head: true }).eq('convidado_por', eu.id);
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://operacao-marte-zero.vercel.app';
  return NextResponse.json({ logado: true, codigo: eu.codigo, link: `${base}/c/${eu.codigo}`, trouxe: count ?? 0 });
}
