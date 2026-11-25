import 'server-only';
import { db } from '@/lib/supabase';
import { textoPublico } from '@/lib/texto';
import colonia from '@/fabrica/colonia.json';
import marte from '@/fabrica/marte.json';
import { loteDaVila, posCratera, varianteDaCapsula } from '@/lib/mundo';

/**
 * Estado da colônia para o "Mundo ao vivo": a MESMA geometria do vídeo (fabrica/colonia.json),
 * o estágio das obras (colonia_obras), o episódio mais recente (estação e problema do dia,
 * gravados pela fábrica em episodios.resumo) e os itens comprados que aparecem nas casas.
 */
export type Obra = { slug: string; nome: string; tipo: string; x: number; y: number; w: number; h: number; status: string; progresso: number;
  colina?: { dx?: number; dy?: number; rx: number; ry: number } };
export type Fundador = { id: string; curto: string; casa: [number, number]; sprite: string };
export type Estacao = { id: string; nome: string; dia: number; temp: number | null; efeito: string };
export type ProblemaDoDia = { titulo: string; rotulo: string; categoria: string; heroi: string | null; heroi_codigo: string | null };
/** Item comprado que aparece na casa do colono (um de cada tipo; o rover anda com o dono). */
export type CompraNoMapa = { codigo: string; pos_x: number; pos_y: number; produto_slug: string; seed: number; opcao: string | null; texto: string | null };
/** Cápsula habitacional: o colono sai da casinha do lote (pos_x/pos_y) e mora na cápsula da Vila (x, y; 2x2 casas). */
export type CapsulaNoMapa = { codigo: string; nome: string; pos_x: number; pos_y: number; x: number; y: number; variante: string };
/** Pet do Colono: anda com o dono pelo mapa e vive no quintal dele (lib/pet.ts). */
export type PetNoMapa = { codigo: string; pos_x: number; pos_y: number; especie: 'cachorro' | 'gato' | 'macaco' };
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
  andarilhos: AndarilhoNoMapa[];   // entraram pelos comentários dizendo a profissão; ainda sem casa (migração 017)
};

export type AndarilhoNoMapa = { handle: string; rede: string; cargo: string | null; seed: number };

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
    db().from('pedidos').select('id, opcao, texto_personalizado, produtos(slug), personagens!inner(codigo, nome, apelido, pos_x, pos_y, seed, oculto)')
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
             status: est.status, progresso: Number(est.progresso) || 0,
             ...('colina' in o && o.colina ? { colina: o.colina as Obra['colina'] } : {}) };
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

  type LinhaCompra = { id: number; opcao: string | null; texto_personalizado: string | null; produtos: { slug: string } | null;
    personagens: { codigo: string; nome: string; apelido: string | null; pos_x: number; pos_y: number; seed: number } | null };
  const compras: CompraNoMapa[] = [];
  const pets: PetNoMapa[] = [];
  const vistos = new Set<string>();
  // cápsulas: a variante vale a da compra mais recente; o lote na Vila sai da ordem da 1ª compra (id menor)
  const capsulaDe = new Map<string, { primeiro: number; variante: string; linha: NonNullable<LinhaCompra['personagens']> }>();
  for (const c of (comprasDb.data ?? []) as unknown as LinhaCompra[]) {   // vem do mais novo para o mais antigo
    if (!c.produtos || !c.personagens) continue;
    const slug = c.produtos.slug, p = c.personagens;
    if (slug === 'eventos-furia-marte' || slug === 'destaque-proximo-ep') continue;   // não são objeto na casa
    if (slug === 'capsula-habitacional') {
      const k = capsulaDe.get(p.codigo);
      if (!k) capsulaDe.set(p.codigo, { primeiro: c.id, variante: varianteDaCapsula(c.opcao), linha: p });
      else k.primeiro = Math.min(k.primeiro, c.id);
      continue;
    }
    if (/pet/i.test(slug)) {        // um pet por dono (o mais recente); macaco é um produto próprio
      if (!pets.some((x) => x.codigo === p.codigo)) {
        const especie = /macaco/.test(slug) ? 'macaco' : c.opcao === 'gato' ? 'gato' : 'cachorro';
        pets.push({ codigo: p.codigo, pos_x: p.pos_x, pos_y: p.pos_y, especie });
      }
      continue;
    }
    const k = `${p.codigo}:${slug}`;
    if (vistos.has(k)) continue;      // um de cada item por colono (o mais recente)
    vistos.add(k);
    compras.push({ codigo: p.codigo, pos_x: p.pos_x, pos_y: p.pos_y, produto_slug: slug, seed: p.seed, opcao: c.opcao, texto: textoPublico(c.texto_personalizado, 40) });
  }
  const capsulas: CapsulaNoMapa[] = [...capsulaDe.entries()]
    .sort((a, b) => a[1].primeiro - b[1].primeiro)
    .map(([codigo, k], i) => {
      const v = loteDaVila(i);
      return { codigo, nome: k.linha.apelido?.trim() || nomeExibicao(k.linha.nome), pos_x: k.linha.pos_x, pos_y: k.linha.pos_y,
               x: v.x, y: v.y, variante: k.variante };
    });

  type LinhaCratera = { id: number; texto: string; personagens: { codigo: string; nome: string; apelido?: string | null } | null };
  const crateras: CrateraNoMapa[] = ((crateraDb.data ?? []) as unknown as LinhaCratera[])
    .filter((r) => r.personagens && r.texto?.trim())
    .map((r) => ({
      id: r.id, nome: nomeDaCratera(r.texto), codigo: r.personagens!.codigo,
      dono: r.personagens!.apelido?.trim() || nomeExibicao(r.personagens!.nome),   // como no vídeo: nick ou "Nome S."
      ...posCratera(r.id),
    }));

  // andarilhos: quem comentou com a profissão e ainda não se cadastrou (sem a tabela 017, nenhum)
  const andDb = await db().from('andarilhos').select('handle, rede, cargo, seed').is('personagem_codigo', null).order('id').limit(300);
  const andarilhos: AndarilhoNoMapa[] = andDb.error ? [] : (andDb.data ?? []) as AndarilhoNoMapa[];

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
    andarilhos,
  };
}
