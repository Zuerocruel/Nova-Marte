import 'server-only';
import { db } from '@/lib/supabase';

/**
 * Perfil público do colono: só campos públicos (nunca WhatsApp, e-mail ou valores pagos).
 * Conquistas: as de "feitos" (gravadas pela fábrica, ex.: herói do problema do dia) + as calculadas aqui.
 */
export type Conquista = { id: string; icone: string; titulo: string; descricao: string; tem: boolean };
export type Perfil = {
  codigo: string; nome: string; handle: string; plataforma: string; status: string;
  seed: number; sprite_url: string | null; pos_x: number; pos_y: number; desde: string;
  cargo: string | null; cargo_em: string | null; apelido: string | null;
  dias: number; episodios_vividos: number; estreia: number | null;
  compras: { nome: string; slug: string; imagem_url: string | null; em: string }[];
  feitos: { tipo: string; titulo: string; episodio: number | null; em: string }[];
  mensagens: number;
  conquistas: Conquista[];
};

const PAGOS = ['aprovado', 'pago'];
const DIA_MS = 24 * 3600 * 1000;

function nomeExibicao(nome: string): string {
  const p = (nome || '').trim().split(/\s+/);
  return p[0] ? p[0] + (p[1] ? ` ${p[1][0]}.` : '') : 'Colono';
}

export async function perfilDe(codigoBruto: string): Promise<Perfil | null> {
  const codigo = codigoBruto.toUpperCase();
  if (!/^NM\d{6,}$/.test(codigo)) return null;
  const CAMPOS = 'id, codigo, nome, handle, handle_plataforma, status, seed, sprite_url, pos_x, pos_y, created_at, oculto, episodio_estreia_id';
  const buscar = (campos: string) => db().from('personagens').select(campos).eq('codigo', codigo).maybeSingle();
  let r = await buscar(`${CAMPOS}, cargo, cargo_em, apelido`);
  if (r.error?.code === '42703') r = await buscar(CAMPOS);   // sem a migração 008 (cargo)
  const p = r.data as unknown as {
    id: number; codigo: string; nome: string; handle: string; handle_plataforma: string; status: string; seed: number;
    sprite_url: string | null; pos_x: number; pos_y: number; created_at: string; oculto: boolean;
    episodio_estreia_id: number | null; cargo?: string | null; cargo_em?: string | null; apelido?: string | null;
  } | null;
  if (!p || p.oculto) return null;

  const [pedidos, feitos, chat, eps, estreia] = await Promise.all([
    db().from('pedidos').select('created_at, produtos(nome, slug, imagem_url)')
      .eq('personagem_id', p.id).in('status', PAGOS).order('created_at', { ascending: false }).limit(60),
    db().from('feitos').select('tipo, titulo, episodio, created_at').eq('personagem_id', p.id)
      .order('created_at', { ascending: false }).limit(60),
    db().from('chat_mensagens').select('id', { count: 'exact', head: true }).eq('personagem_id', p.id).eq('oculto', false),
    db().from('episodios').select('id', { count: 'exact', head: true }).gte('publicado_em', p.created_at),
    p.episodio_estreia_id
      ? db().from('episodios').select('numero').eq('id', p.episodio_estreia_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  type LinhaPedido = { created_at: string; produtos: { nome: string; slug: string; imagem_url: string | null } | null };
  const compras = ((pedidos.data ?? []) as unknown as LinhaPedido[])
    .filter((x) => x.produtos).map((x) => ({ ...x.produtos!, em: x.created_at }));
  const listaFeitos = feitos.error ? [] : (feitos.data ?? []).map((f) => ({ tipo: f.tipo, titulo: f.titulo, episodio: f.episodio, em: f.created_at }));
  const mensagens = chat.error ? 0 : chat.count ?? 0;
  const dias = Math.max(1, Math.floor((Date.now() - new Date(p.created_at).getTime()) / DIA_MS) + 1);
  const herois = listaFeitos.filter((f) => f.tipo === 'heroi').length;
  const numEstreia = (estreia.data as { numero: number } | null)?.numero ?? null;

  const conquistas: Conquista[] = [
    { id: 'pioneiro', icone: '🚀', titulo: 'Pioneiro', descricao: 'Um dos 100 primeiros colonos de Marte', tem: p.id <= 100 },
    { id: 'estreia', icone: '⭐', titulo: 'Estrela da série', descricao: numEstreia ? `Apareceu no episódio ${numEstreia}` : 'Aparecer num episódio', tem: p.status === 'estreou' },
    { id: 'heroi', icone: '🦸', titulo: herois > 1 ? `Herói ×${herois}` : 'Herói do dia', descricao: 'Resolver um problema do dia num episódio', tem: herois > 0 },
    { id: 'apoiador', icone: '🛒', titulo: 'Apoiador', descricao: 'Comprar um item para a colônia', tem: compras.length > 0 },
    { id: 'mecenas', icone: '💎', titulo: 'Mecenas', descricao: '5 itens comprados', tem: compras.length >= 5 },
    { id: 'semana', icone: '🌱', titulo: 'Criando raízes', descricao: '7 dias na colônia', tem: dias >= 7 },
    { id: 'veterano', icone: '🏅', titulo: 'Veterano', descricao: '30 dias na colônia', tem: dias >= 30 },
    { id: 'ano', icone: '🪐', titulo: 'Um ano marciano', descricao: '117 dias na colônia (um ano em Marte, na série)', tem: dias >= 117 },
    { id: 'radio', icone: '📻', titulo: 'Voz do rádio', descricao: '50 mensagens no chat', tem: mensagens >= 50 },
  ];

  return {
    codigo: p.codigo, nome: nomeExibicao(p.nome), handle: p.handle, plataforma: p.handle_plataforma,
    status: p.status, seed: p.seed, sprite_url: p.sprite_url, pos_x: p.pos_x, pos_y: p.pos_y,
    desde: p.created_at, cargo: p.cargo ?? null, cargo_em: p.cargo_em ?? null, apelido: p.apelido ?? null, dias, episodios_vividos: eps.count ?? 0, estreia: numEstreia,
    compras, feitos: listaFeitos, mensagens, conquistas,
  };
}
