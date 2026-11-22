import 'server-only';
import { db } from '@/lib/supabase';
import { codigoDaSessao } from '@/lib/sessao';

/**
 * Central do colono: moedas, XP, nível, missões diárias, missões épicas (semanais), minigames e ranking.
 * Tudo calculado no servidor (migração 013). Valores de economia num lugar só (ECONOMIA), equilibrados com a
 * loja de moedas: um dia bom rende ~150 moedas; cor ≈ 2 dias, traje ≈ 1 semana, especial ≈ 1 mês.
 */
export const ECONOMIA = {
  moedasPorPonto: 0.1,     // 10 pontos = 1 moeda (teto por partida em minigames.moedas_max)
  xpPorPartida: 10,
  travaHoras: 12,          // perdeu os 3 corações (ou saiu no meio) → aquele minigame trava 12 h
};

export type Missao = { id: string; titulo: string; moedas: number; xp: number; feita: boolean; resgatada: boolean; progresso?: string };

export const nivelDe = (xp: number) => Math.floor(Math.sqrt(xp / 50)) + 1;          // 50, 200, 450, 800... XP
export const xpDoNivel = (n: number) => 50 * (n - 1) * (n - 1);

export function inicioDoDiaBR(d = new Date()): Date {   // meia-noite de Brasília (UTC-3)
  const br = new Date(d.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3));
}
export function inicioDaSemanaBR(d = new Date()): Date {  // segunda-feira 00:00 de Brasília
  const dia = inicioDoDiaBR(d);
  const dow = (new Date(dia.getTime() - 3 * 3600_000).getUTCDay() + 6) % 7;
  return new Date(dia.getTime() - dow * 86400_000);
}
const chaveDia = (d = new Date()) => inicioDoDiaBR(d).toISOString().slice(0, 10);
const chaveSemana = (d = new Date()) => inicioDaSemanaBR(d).toISOString().slice(0, 10);

export async function colonoLogado() {
  const codigo = await codigoDaSessao();
  if (!codigo) return null;
  const { data } = await db().from('personagens').select('id, codigo, nome, apelido, seed, oculto').eq('codigo', codigo).maybeSingle();
  return data && !data.oculto ? data : null;
}

export async function saldo(pid: number) {
  const { data } = await db().from('jogo_saldo').select('moedas, xp').eq('personagem_id', pid).maybeSingle();
  return { moedas: data?.moedas ?? 0, xp: data?.xp ?? 0 };
}

export async function movimentar(pid: number, tipo: string, ref: string, moedas: number, xp: number) {
  const { data, error } = await db().rpc('jogo_movimentar', { p_id: pid, p_tipo: tipo, p_ref: ref, p_moedas: moedas, p_xp: xp });
  if (error) throw new Error(error.message);
  return data as { moedas: number; xp: number };
}

/** Missões do dia e épicas da semana, com o que já foi feito (verificado no banco, não no navegador). */
export async function missoes(pid: number, codigo: string): Promise<{ diarias: Missao[]; epicas: Missao[] }> {
  const hoje = inicioDoDiaBR().toISOString(), semana = inicioDaSemanaBR().toISOString();
  const [partHoje, partSemana, presente, extrato, convidados, diasSemana] = await Promise.all([
    db().from('minigame_partidas').select('minigame, pontos').eq('personagem_id', pid).gte('created_at', hoje),
    db().from('minigame_partidas').select('minigame').eq('personagem_id', pid).gte('created_at', semana),
    db().from('presenca').select('visto_em').eq('visitante', codigo).gte('visto_em', hoje).maybeSingle(),
    db().from('jogo_extrato').select('tipo, ref').eq('personagem_id', pid).in('tipo', ['missao', 'epica']).gte('created_at', semana),
    db().from('personagens').select('id', { count: 'exact', head: true }).eq('convidado_por', pid).gte('created_at', semana),
    db().from('jogo_extrato').select('ref').eq('personagem_id', pid).eq('tipo', 'missao').like('ref', 'entrar:%').gte('created_at', semana),
  ]);
  const ph = partHoje.data ?? [], ps = partSemana.data ?? [];
  const pagas = new Set((extrato.data ?? []).map((x) => `${x.tipo}:${x.ref}`));
  const d = chaveDia(), s = chaveSemana();
  const m = (id: string, titulo: string, moedas: number, xp: number, feita: boolean, tipo: 'missao' | 'epica', progresso?: string): Missao =>
    ({ id, titulo, moedas, xp, feita, resgatada: pagas.has(`${tipo}:${id}`), progresso });
  const melhor = Math.max(0, ...ph.map((x) => x.pontos));
  const jogos = new Set(ps.map((x) => x.minigame));
  const diasEntrou = new Set((diasSemana.data ?? []).map((x) => x.ref)).size;
  return {
    diarias: [
      m(`entrar:${d}`, 'Visitar a colônia hoje', 15, 10, !!presente.data, 'missao'),
      m(`jogar2:${d}`, 'Jogar 2 partidas de minigame', 20, 15, ph.length >= 2, 'missao', `${Math.min(ph.length, 2)}/2`),
      m(`pontos100:${d}`, 'Fazer 100 pontos numa partida', 25, 20, melhor >= 100, 'missao', `${Math.min(melhor, 100)}/100`),
    ],
    epicas: [
      m(`convite:${s}`, 'ÉPICA · Trazer 1 colono novo com o seu link de convite', 300, 150, (convidados.count ?? 0) >= 1, 'epica', `${Math.min(convidados.count ?? 0, 1)}/1`),
      m(`tresjogos:${s}`, 'ÉPICA · Jogar os 3 minigames na semana', 120, 80, jogos.size >= 3, 'epica', `${jogos.size}/3`),
      m(`semana5:${s}`, 'ÉPICA · Resgatar a visita diária em 5 dias da semana', 200, 120, diasEntrou >= 5, 'epica', `${Math.min(diasEntrou, 5)}/5`),
    ],
  };
}

/** Ranking da semana por XP ganho (só colonos visíveis; mostra nick ou "Nome S."). */
export async function ranking(limite = 10) {
  const { data } = await db().from('jogo_extrato').select('personagem_id, xp').gte('created_at', inicioDaSemanaBR().toISOString()).limit(20000);
  const soma = new Map<number, number>();
  for (const x of data ?? []) soma.set(x.personagem_id, (soma.get(x.personagem_id) ?? 0) + x.xp);
  const top = [...soma.entries()].sort((a, b) => b[1] - a[1]).slice(0, limite * 2);
  if (!top.length) return [];
  const { data: pers } = await db().from('personagens').select('id, codigo, nome, apelido, seed, oculto').in('id', top.map(([id]) => id));
  const por = new Map((pers ?? []).map((p) => [p.id, p]));
  return top.map(([id, xp]) => ({ p: por.get(id), xp })).filter((x) => x.p && !x.p.oculto).slice(0, limite)
    .map(({ p, xp }, i) => ({ posicao: i + 1, codigo: p!.codigo, nome: (p!.apelido || '').trim() || nomeCurto(p!.nome), seed: p!.seed, xp }));
}

export function nomeCurto(nome: string) {
  const p = (nome || '').trim().split(/\s+/);
  return p[0] ? p[0] + (p[1] ? ` ${p[1][0]}.` : '') : 'Colono';
}
