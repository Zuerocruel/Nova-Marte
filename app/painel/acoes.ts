'use server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { db } from '@/lib/supabase';
import { processarEventoCakto } from '@/lib/cakto';
import { coletarTodos, salvarSnapshot, type Plataforma } from '@/lib/seguidores';

/** Server actions também passam pelo middleware (POST em /painel), mas conferimos de novo. */
async function exigirLogin() {
  const auth = (await headers()).get('authorization') ?? '';
  const esperado = 'Basic ' + Buffer.from(`${process.env.PAINEL_USER}:${process.env.PAINEL_PASS}`).toString('base64');
  if (!process.env.PAINEL_USER || auth !== esperado) throw new Error('não autorizado');
}

export async function lancarSeguidores(form: FormData) {
  await exigirLogin();
  for (const p of ['instagram', 'tiktok', 'youtube'] as Plataforma[]) {
    const v = String(form.get(p) ?? '').replace(/\D/g, '');
    if (v) await salvarSnapshot(p, Number(v), 'manual');
  }
  revalidatePath('/painel');
}

export async function atualizarAgora() {
  await exigirLogin();
  await coletarTodos();
  revalidatePath('/painel');
}

export async function atualizarPersonagem(form: FormData) {
  await exigirLogin();
  const codigo = String(form.get('codigo') ?? '').trim().toUpperCase();
  if (!codigo) return;
  const mudanca: Record<string, unknown> = {};
  const status = String(form.get('status') ?? '');
  if (['fila', 'desenhado', 'estreou'].includes(status)) mudanca.status = status;
  const sprite = String(form.get('sprite_url') ?? '').trim();
  if (sprite) mudanca.sprite_url = sprite;
  const ep = Number(form.get('episodio') ?? '');
  if (ep) {
    const { data } = await db().from('episodios').select('id').eq('numero', ep).maybeSingle();
    if (data) mudanca.episodio_estreia_id = data.id;
  }
  const oculto = String(form.get('oculto') ?? '');
  if (oculto === 'sim') mudanca.oculto = true;
  if (oculto === 'nao') mudanca.oculto = false;
  if (Object.keys(mudanca).length) await db().from('personagens').update(mudanca).eq('codigo', codigo);
  revalidatePath('/painel');
}

export async function revisarResgate(form: FormData) {
  await exigirLogin();
  const id = Number(form.get('id'));
  const status = String(form.get('status'));
  if (!id || !['aprovado', 'recusado'].includes(status)) return;
  // Recusar libera a pessoa para tentar de novo com outro nome (apaga o resgate)
  if (status === 'recusado' && form.get('liberar') === '1') {
    await db().from('resgates').delete().eq('id', id);
  } else {
    await db().from('resgates').update({ status, revisado_em: new Date().toISOString() }).eq('id', id);
  }
  revalidatePath('/painel');
}

export async function reprocessarWebhooks() {
  await exigirLogin();
  const { data } = await db()
    .from('webhook_eventos').select('id, payload').eq('fonte', 'cakto').eq('processado', false).limit(200);
  for (const ev of data ?? []) {
    try {
      await processarEventoCakto(ev.payload);
      await db().from('webhook_eventos').update({ processado: true, erro: null }).eq('id', ev.id);
    } catch (e) {
      await db().from('webhook_eventos').update({ erro: String(e).slice(0, 500) }).eq('id', ev.id);
    }
  }
  revalidatePath('/painel');
}
