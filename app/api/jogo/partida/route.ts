import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase';
import { colonoLogado, ECONOMIA, inicioDoDiaBR, movimentar, saldo } from '@/lib/jogo';
import { permitido } from '@/lib/limite';

/**
 * Partidas dos minigames.
 *   { acao: 'iniciar', minigame }                 → confere se está ligado e sem trava; já grava a trava de 12 h
 *                                                    (se a pessoa fechar a aba no meio, perde os corações)
 *   { acao: 'fim', partida, pontos, resultado }   → 'terminou' tira a trava; 'perdeu_coracoes' ou 'abandonou'
 *                                                    mantém a trava de 12 h SÓ naquele minigame.
 *                                                    Moedas = pontos × 0,1 (teto do jogo), nas primeiras partidas do dia.
 */
export async function POST(req: NextRequest) {
  const eu = await colonoLogado();
  if (!eu) return NextResponse.json({ erro: 'Entre na sua conta de colono para jogar valendo moedas.' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!permitido(`partida:${eu.codigo}`, 20, 60_000)) return NextResponse.json({ erro: 'Calma!' }, { status: 429 });

  if (b.acao === 'iniciar') {
    const { data: jogo } = await db().from('minigames').select('slug, ativo').eq('slug', String(b.minigame)).maybeSingle();
    if (!jogo?.ativo) return NextResponse.json({ erro: 'Esse minigame ainda não está ligado.' }, { status: 404 });
    const { data: trava } = await db().from('minigame_travas').select('ate').eq('personagem_id', eu.id).eq('minigame', jogo.slug)
      .gt('ate', new Date().toISOString()).maybeSingle();
    if (trava) return NextResponse.json({ erro: 'Você perdeu os corações neste minigame.', travado_ate: trava.ate }, { status: 423 });
    const ate = new Date(Date.now() + ECONOMIA.travaHoras * 3600_000).toISOString();
    await db().from('minigame_travas').upsert({ personagem_id: eu.id, minigame: jogo.slug, ate });
    const { data: p } = await db().from('minigame_partidas')
      .insert({ personagem_id: eu.id, minigame: jogo.slug, resultado: 'abandonou' }).select('id').single();
    return NextResponse.json({ partida: p!.id });
  }

  if (b.acao === 'fim') {
    const { data: p } = await db().from('minigame_partidas').select('id, minigame, created_at, pontos, moedas')
      .eq('id', Number(b.partida)).eq('personagem_id', eu.id).maybeSingle();
    if (!p || p.pontos > 0 || p.moedas > 0 || Date.now() - Date.parse(p.created_at) > 30 * 60_000) {
      return NextResponse.json({ erro: 'Partida inválida.' }, { status: 400 });
    }
    const resultado = ['terminou', 'perdeu_coracoes', 'abandonou'].includes(b.resultado) ? b.resultado : 'abandonou';
    const segundos = (Date.now() - Date.parse(p.created_at)) / 1000;
    const pontos = Math.max(0, Math.min(Math.floor(Number(b.pontos) || 0), Math.floor(segundos * 25), 100000));   // nada de pontos impossíveis
    const { data: jogo } = await db().from('minigames').select('moedas_max, partidas_dia').eq('slug', p.minigame).single();
    const { count } = await db().from('minigame_partidas').select('id', { count: 'exact', head: true })
      .eq('personagem_id', eu.id).eq('minigame', p.minigame).gt('moedas', 0).gte('created_at', inicioDoDiaBR().toISOString());
    const valendo = resultado !== 'abandonou' && (count ?? 0) < jogo!.partidas_dia;
    const moedas = valendo ? Math.min(jogo!.moedas_max, Math.floor(pontos * ECONOMIA.moedasPorPonto)) : 0;
    await db().from('minigame_partidas').update({ pontos, resultado, moedas }).eq('id', p.id);
    if (resultado === 'terminou') await db().from('minigame_travas').delete().eq('personagem_id', eu.id).eq('minigame', p.minigame);
    if (resultado !== 'abandonou') await movimentar(eu.id, 'minigame', p.minigame, moedas, ECONOMIA.xpPorPartida);
    const { data: trava } = await db().from('minigame_travas').select('ate').eq('personagem_id', eu.id).eq('minigame', p.minigame).maybeSingle();
    const s = await saldo(eu.id);
    return NextResponse.json({ ok: true, pontos, ganhou: moedas, valendo, travado_ate: resultado === "terminou" ? null : trava?.ate ?? null, moedas: s.moedas, xp: s.xp });
  }
  return NextResponse.json({ erro: 'Ação inválida.' }, { status: 400 });
}
