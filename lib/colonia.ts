import 'server-only';
import { db } from '@/lib/supabase';
import colonia from '@/fabrica/colonia.json';
import marte from '@/fabrica/marte.json';
import { posCratera, varianteDaCapsula } from '@/lib/mundo';

/**
 * Estado da colônia para o "Mundo ao vivo": a MESMA geometria do vídeo (fabrica/colonia.json),
 * o estágio das obras (colonia_obras), o episódio mais recente (estação e problema do dia,
 * gravados pela fábrica em episodios.resumo) e os itens comprados que aparecem nas casas.
 */
export type Obra = { slug: string; nome: string; tipo: string; x: number; y: number; w: number; h: number; status: string; progresso: number };
export type Fundador = { id: string; curto: string; casa: [number, number]; sprite: string };
export type Estacao = { id: string; nome: string; dia: number; temp: number | null; efeito: string };
export type ProblemaDoDia = { titulo: string; rotulo: string; categoria: string; heroi: string | null; heroi_codigo: string | null };
export type CompraNoMapa = { pos_x: number; pos_y: number; produto_slug: string; seed: number };
/** Pet do Colono: vive no quintal do dono (lib/pet.ts) em vez de ficar parado como ícone. */
export type CapsulaNoMapa = { pos_x: number; pos_y: number; variante: string };
export type PetNoMapa = { codigo: string; pos_x: number; pos_y: number };
/** Cratera batizada por um colono (resgate aprovado de "Nomeie sua Cratera"). */
export type CrateraNoMapa = { id: number; nome: string; dono: string; codigo: string; x: number; y: number; r: number };
export type EstadoColonia = {
  base: { nome: string; x: number; y: number; w: number; h: number };
  praca: { nome: string; x: number; y: number; w: number; h: number } | null;
  obras: Obra[];
  fundadores: Fundador[];
  episodio: { numero: number; titulo: string; publicado_em: string } | null;
  estacao: Estacao;
  problema: ProblemaDoDia | null;
  obra_atual: { nome: string; progresso: number } | null;
  compras: CompraNoMapa[];
  pets: PetNoMapa[];
  crateras: CrateraNoMapa[];
  capsulas: CapsulaNoMapa[];   // casas trocadas pela cápsula comprada (só pedido pago)
};

/** "BuracoNegrote" → "Cratera BuracoNegrote" (quem já escreveu "Cratera ..." fica como escreveu). Igual a fabrica/episodio.py. */
function nomeExibicao(nome: string): string {
  const p = (nome || '').trim().split(/\s+/);
  return p[0] ? p[0] + (p[1] ? ` ${p[1][0]}.` : '') : 'Colono';
}

export function nomeDaCratera(texto: string): string {
  const t = texto.trim().replace(/\s+/g, ' ');
  return /^cratera/i.test(t) ? t : `Cratera ${t}`;
}

type ObraCat = (typeof colonia.obras)[number];

/** Estação do episódio n (mesma conta de fabrica/eventos.py; a temperatura exata vem do resumo do episódio). */
export function estacaoDoEpisodio(n: number): Estacao {
  const ests = marte.estacoes;
  let i = Math.max(0, ests.findIndex((e) => e.id === marte.inicio.estacao));
  let dia = marte.inicio.dia + (Math.max(1, n) - 1);
  while (dia > ests[i].episodios) { dia -= ests[i].episodios; i = (i + 1) % ests.length; }
  return { id: ests[i].id, nome: ests[i].nome, dia, temp: null, efeito: ests[i].efeito };
}

export async function estadoColonia(): Promise<EstadoColonia> {
  const [obrasDb, epDb, comprasDb, crateraDb] = await Promise.all([
    db().from('colonia_obras').select('slug, status, progresso'),
    db().from('episodios').select('numero, titulo, publicado_em, resumo')
      .not('publicado_em', 'is', null).order('numero', { ascending: false }).limit(1).maybeSingle()
      .then((r) => (r.error ? db().from('episodios').select('numero, titulo, publicado_em')   // sem a coluna resumo (falta a 006)
        .not('publicado_em', 'is', null).order('numero', { ascending: false }).limit(1).maybeSingle() : r)),
    db().from('pedidos').select('opcao, produtos(slug), personagens!inner(codigo, pos_x, pos_y, seed, oculto)')
      .eq('status', 'aprovado').eq('personagens.oculto', false).order('id', { ascending: false }).limit(400),
    db().from('resgates').select('id, texto, produtos!inner(slug), personagens!inner(codigo, nome, apelido, oculto)')
      .eq('status', 'aprovado').eq('produtos.slug', 'nomeie-sua-cratera').eq('personagens.oculto', false)
      .order('id').limit(400),
  ]);

  const estados = new Map((obrasDb.data ?? []).map((o) => [o.slug as string, o]));
  const ep = (epDb.data ?? null) as { numero: number; titulo: string; publicado_em: string; resumo?: Record<string, any> | null } | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  const numero = ep?.numero ?? 1;

  const obras: Obra[] = colonia.obras.map((o: ObraCat) => {
    let est = estados.get(o.slug) as { status: string; progresso: number } | undefined ?? o.estado_inicial;
    // sem a tabela colonia_obras: o episódio 1 já construiu a Fazenda Solar
    if (!obrasDb.data?.length && numero >= 1 && o.slug === 'fazenda-solar' && ep) est = { status: 'concluida', progresso: 100 };
    return { slug: o.slug, nome: o.nome, tipo: o.tipo, x: o.x, y: o.y, w: o.w, h: o.h,
             status: est.status, progresso: Number(est.progresso) || 0 };
  });
  const atual = obras.find((o) => o.status !== 'concluida');

  const resumo = ep?.resumo ?? null;
  const estacao: Estacao = resumo?.estacao
    ? { id: resumo.estacao.id, nome: resumo.estacao.nome, dia: resumo.estacao.dia, temp: resumo.estacao.temp ?? null, efeito: resumo.estacao.efeito }
    : estacaoDoEpisodio(numero);
  const problema: ProblemaDoDia | null = resumo?.problema
    ? { titulo: resumo.problema.titulo, rotulo: resumo.problema.rotulo, categoria: resumo.problema.categoria,
        heroi: resumo.problema.heroi ?? null, heroi_codigo: resumo.problema.heroi_codigo ?? null }
    : null;

  type LinhaCompra = { opcao: string | null; produtos: { slug: string } | null; personagens: { codigo: string; pos_x: number; pos_y: number; seed: number } | null };
  const compras: CompraNoMapa[] = [];
  const pets: PetNoMapa[] = [];
  const capsulas: CapsulaNoMapa[] = [];
  const vistos = new Set<string>();
  for (const c of (comprasDb.data ?? []) as unknown as LinhaCompra[]) {
    if (!c.produtos || !c.personagens) continue;
    if (c.produtos.slug === 'eventos-furia-marte' || c.produtos.slug === 'destaque-proximo-ep') continue;   // não são objeto na casa
    if (c.produtos.slug === 'capsula-habitacional') {   // a casa vira a cápsula (a compra mais recente vale)
      if (!capsulas.some((k) => k.pos_x === c.personagens!.pos_x && k.pos_y === c.personagens!.pos_y))
        capsulas.push({ pos_x: c.personagens.pos_x, pos_y: c.personagens.pos_y, variante: varianteDaCapsula(c.opcao) });
      continue;
    }
    if (/pet/i.test(c.produtos.slug)) {        // um pet por dono
      if (!pets.some((p) => p.codigo === c.personagens!.codigo)) pets.push({ codigo: c.personagens.codigo, pos_x: c.personagens.pos_x, pos_y: c.personagens.pos_y });
      continue;
    }
    const k = `${c.personagens.pos_x},${c.personagens.pos_y}`;
    if (vistos.has(k)) continue;      // um item por casa (o mais recente)
    vistos.add(k);
    compras.push({ pos_x: c.personagens.pos_x, pos_y: c.personagens.pos_y, produto_slug: c.produtos.slug, seed: c.personagens.seed });
  }

  type LinhaCratera = { id: number; texto: string; personagens: { codigo: string; nome: string; apelido?: string | null } | null };
  const crateras: CrateraNoMapa[] = ((crateraDb.data ?? []) as unknown as LinhaCratera[])
    .filter((r) => r.personagens && r.texto?.trim())
    .map((r) => ({
      id: r.id, nome: nomeDaCratera(r.texto), codigo: r.personagens!.codigo,
      dono: r.personagens!.apelido?.trim() || nomeExibicao(r.personagens!.nome),   // como no vídeo: nick ou "Nome S."
      ...posCratera(r.id),
    }));

  return {
    base: colonia.base,
    praca: (colonia as { praca?: EstadoColonia['praca'] }).praca ?? null,
    obras,
    fundadores: colonia.fundadores.map((f) => ({ id: f.id, curto: f.curto, casa: f.casa as [number, number], sprite: f.sprite })),
    episodio: ep ? { numero: ep.numero, titulo: ep.titulo, publicado_em: ep.publicado_em } : null,
    estacao,
    problema,
    obra_atual: atual ? { nome: atual.nome, progresso: atual.progresso } : null,
    compras,
    pets,
    crateras,
    capsulas,
  };
}
