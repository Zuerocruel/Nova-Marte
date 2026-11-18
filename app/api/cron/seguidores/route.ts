import { NextResponse, type NextRequest } from 'next/server';
import { coletarTodos } from '@/lib/seguidores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Chamado pela Vercel Cron 1x por dia (vercel.json). Também dá para chamar à mão com o mesmo header. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, resultado: await coletarTodos() });
}
