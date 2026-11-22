import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { colonoLogado, missoes, nivelDe, ranking, saldo, xpDoNivel } from '@/lib/jogo';

/** Central do colono: saldo, nível, missões, minigames ligados (com trava de 12 h) e ranking da semana. */
export async function GET() {
  const eu = await colonoLogado();
  const [{ data: jogos, error }, top] = await Promise.all([
    db().from('minigames').select('slug, nome, descricao, moedas_max, partidas_dia').eq('ativo', true).order('slug'),
    ranking(10),
  ]);
  if (error) return NextResponse.json({ indisponivel: true, ranking: [], minigames: [] });
  if (!eu) return NextResponse.json({ logado: false, minigames: jogos ?? [], ranking: top });
  const [s, ms, travas] = await Promise.all([
    saldo(eu.id), missoes(eu.id, eu.codigo),
    db().from('minigame_travas').select('minigame, ate').eq('personagem_id', eu.id).gt('ate', new Date().toISOString()),
  ]);
  const nivel = nivelDe(s.xp);
  const trava = new Map((travas.data ?? []).map((t) => [t.minigame, t.ate]));
  return NextResponse.json({
    logado: true, codigo: eu.codigo, nome: (eu.apelido || '').trim() || eu.nome.split(' ')[0],
    moedas: s.moedas, xp: s.xp, nivel, xp_nivel: xpDoNivel(nivel), xp_proximo: xpDoNivel(nivel + 1),
    ...ms, ranking: top,
    minigames: (jogos ?? []).map((j) => ({ ...j, travado_ate: trava.get(j.slug) ?? null })),
  });
}
