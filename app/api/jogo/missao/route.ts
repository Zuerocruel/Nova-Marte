import { NextResponse, type NextRequest } from 'next/server';
import { colonoLogado, missoes, movimentar, saldo } from '@/lib/jogo';

/** Resgata uma missão diária ou épica JÁ cumprida (conferida no banco; cada uma paga uma vez só). */
export async function POST(req: NextRequest) {
  const eu = await colonoLogado();
  if (!eu) return NextResponse.json({ erro: 'Entre na sua conta de colono.' }, { status: 401 });
  const { id } = await req.json().catch(() => ({ id: '' }));
  const ms = await missoes(eu.id, eu.codigo);
  const diaria = ms.diarias.find((m) => m.id === id), epica = ms.epicas.find((m) => m.id === id);
  const m = diaria ?? epica;
  if (!m) return NextResponse.json({ erro: 'Missão não encontrada.' }, { status: 404 });
  if (!m.feita) return NextResponse.json({ erro: 'Essa missão ainda não foi cumprida.' }, { status: 400 });
  if (m.resgatada) return NextResponse.json({ erro: 'Você já resgatou essa missão.' }, { status: 409 });
  try {
    await movimentar(eu.id, diaria ? 'missao' : 'epica', m.id, m.moedas, m.xp);
  } catch {
    return NextResponse.json({ erro: 'Você já resgatou essa missão.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, ...(await saldo(eu.id)), ganhou: { moedas: m.moedas, xp: m.xp } });
}
