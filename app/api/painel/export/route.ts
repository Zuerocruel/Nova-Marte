import { db } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const COLUNAS = [
  'codigo', 'nome', 'handle', 'handle_plataforma', 'whatsapp', 'aceita_whatsapp', 'status',
  'origem_source', 'origem_medium', 'origem_campaign', 'origem_link_slug', 'origem_referer',
  'ultimo_source', 'ultimo_campaign', 'created_at',
] as const;

function csv(v: unknown) {
  const s = v === null || v === undefined ? '' : String(v);
  // aspas + proteção contra fórmula no Excel/Sheets
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
}

/** CSV de cadastros (protegido pelo login do painel via middleware). ?status=fila filtra. */
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get('status');
  const linhas: string[] = [COLUNAS.join(',')];
  const PAGINA = 1000;
  for (let de = 0; ; de += PAGINA) {
    let q = db().from('personagens').select(COLUNAS.join(',')).order('id').range(de, de + PAGINA - 1);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return new Response(error.message, { status: 500 });
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) linhas.push(COLUNAS.map((c) => csv(r[c])).join(','));
    if (!data || data.length < PAGINA) break;
  }
  return new Response('﻿' + linhas.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="personagens-${status ?? 'todos'}.csv"`,
    },
  });
}
