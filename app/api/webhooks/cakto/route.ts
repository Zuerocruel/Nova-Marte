import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/supabase';
import { eventoDoPayload, processarEventoCakto, segredoDoPayload } from '@/lib/cakto';

export const runtime = 'nodejs';

function igual(a: string | undefined | null, b: string | undefined) {
  if (!a || !b) return false;
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

/**
 * URL para cadastrar na Cakto:
 *   https://seudominio.com.br/api/webhooks/cakto?token=<CAKTO_WEBHOOK_TOKEN>
 * Fluxo: autentica → salva o JSON cru → processa → marca processado/erro.
 * Responde 200 mesmo quando o processamento falha (o evento fica salvo para
 * reprocessar), para a Cakto não ficar reenviando sem parar.
 */
export async function POST(req: NextRequest) {
  let payload: unknown;
  try { payload = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const tokenOk = igual(req.nextUrl.searchParams.get('token'), process.env.CAKTO_WEBHOOK_TOKEN);
  const segredoOk = igual(segredoDoPayload(payload), process.env.CAKTO_WEBHOOK_SECRET || undefined);
  if (!tokenOk && !segredoOk) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: ev, error } = await db()
    .from('webhook_eventos')
    .insert({ fonte: 'cakto', evento: eventoDoPayload(payload) ?? null, payload })
    .select('id').single();
  if (error) return NextResponse.json({ ok: false }, { status: 500 }); // aí sim a Cakto deve tentar de novo

  try {
    const resultado = await processarEventoCakto(payload);
    await db().from('webhook_eventos').update({ processado: true, erro: null }).eq('id', ev.id);
    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    await db().from('webhook_eventos').update({ erro: String(e).slice(0, 500) }).eq('id', ev.id);
    return NextResponse.json({ ok: true, guardado: ev.id });
  }
}
