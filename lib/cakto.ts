import 'server-only';
import { db } from './supabase';
import { chaveTelefone } from './texto';

/**
 * Tradução do webhook da Cakto para a tabela `pedidos`.
 *
 * ATENÇÃO: os nomes de campo abaixo cobrem os formatos mais comuns, mas
 * confirme com um "Enviar teste" no painel da Cakto e olhe o JSON salvo em
 * `webhook_eventos.payload`. Se algum campo vier com outro nome, ajuste só
 * as listas de caminhos em `CAMPOS` — o resto do sistema não muda.
 */
const CAMPOS = {
  evento:      ['event', 'type', 'evento'],
  pedidoId:    ['data.id', 'data.refId', 'data.order_id', 'data.orderId', 'id'],
  status:      ['data.status', 'status'],
  valor:       ['data.amount', 'data.baseAmount', 'data.total', 'data.value', 'amount'],
  metodo:      ['data.paymentMethod', 'data.payment_method', 'data.paymentMethodName'],
  produtoIds:  ['data.product.id', 'data.product.short_id', 'data.offer.id', 'data.product_id'],
  produtoNome: ['data.product.name', 'data.product_name'],
  nome:        ['data.customer.name', 'data.customer_name', 'customer.name'],
  email:       ['data.customer.email', 'data.customer_email', 'customer.email'],
  telefone:    ['data.customer.phone', 'data.customer_phone', 'customer.phone'],
  utmSource:   ['data.utm_source', 'data.utm.source', 'data.tracking.utm_source', 'data.checkoutUrl.utm_source'],
  utmCampaign: ['data.utm_campaign', 'data.utm.campaign', 'data.tracking.utm_campaign'],
  src:         ['data.src', 'data.sck', 'data.tracking.src', 'data.utm_content'],
  segredo:     ['secret', 'data.secret'],
};

function get(obj: unknown, caminho: string): unknown {
  return caminho.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}
function primeiro(obj: unknown, caminhos: string[]): string | undefined {
  for (const c of caminhos) {
    const v = get(obj, c);
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
}
function todos(obj: unknown, caminhos: string[]): string[] {
  return caminhos.map((c) => get(obj, c)).filter((v) => v !== undefined && v !== null && v !== '').map(String);
}

const MAPA_STATUS: Record<string, string> = {
  purchase_approved: 'aprovado', paid: 'aprovado', approved: 'aprovado',
  purchase_refused: 'recusado', refused: 'recusado',
  refund: 'reembolsado', refunded: 'reembolsado',
  chargeback: 'chargeback', chargedback: 'chargeback',
  waiting_payment: 'pendente', pix_gerado: 'pendente', boleto_gerado: 'pendente', pending: 'pendente',
  checkout_abandonment: 'abandonado',
  subscription_canceled: 'cancelado', canceled: 'cancelado',
};

export function segredoDoPayload(payload: unknown) {
  return primeiro(payload, CAMPOS.segredo);
}
export function eventoDoPayload(payload: unknown) {
  return primeiro(payload, CAMPOS.evento);
}

function paraCentavos(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(v.replace?.(',', '.') ?? v);
  if (!Number.isFinite(n)) return 0;
  return process.env.CAKTO_VALOR_EM_CENTAVOS === 'true' ? Math.round(n) : Math.round(n * 100);
}

/** Processa um evento já salvo. Lança erro se não der para gravar o pedido. */
export async function processarEventoCakto(payload: unknown): Promise<string> {
  const evento = eventoDoPayload(payload) ?? '';
  const pedidoId = primeiro(payload, CAMPOS.pedidoId);
  if (!pedidoId) return `ignorado: sem id de pedido (evento ${evento})`;

  const statusBruto = (primeiro(payload, CAMPOS.status) ?? '').toLowerCase();
  const status = MAPA_STATUS[evento] ?? MAPA_STATUS[statusBruto] ?? (evento || statusBruto || 'desconhecido');
  if (status === 'abandonado') return 'ignorado: abandono de checkout';

  // produto: casa pelo id da Cakto, senão pelo nome
  const ids = todos(payload, CAMPOS.produtoIds);
  let produtoId: number | null = null;
  if (ids.length) {
    const { data } = await db().from('produtos').select('id').in('cakto_product_id', ids).limit(1);
    produtoId = data?.[0]?.id ?? null;
  }
  const nomeProduto = primeiro(payload, CAMPOS.produtoNome);
  if (!produtoId && nomeProduto) {
    const { data } = await db().from('produtos').select('id').ilike('nome', nomeProduto).limit(1);
    produtoId = data?.[0]?.id ?? null;
  }

  // personagem: 1) WhatsApp = telefone do comprador  2) visitante repassado no checkout.
  // O telefone vem primeiro: o visitante é por NAVEGADOR, e duas contas criadas no mesmo navegador
  // dividem o mesmo visitante (a compra ia para a conta errada).
  const src = primeiro(payload, CAMPOS.src);
  const telefone = primeiro(payload, CAMPOS.telefone);
  let personagemId: number | null = null;
  const chave = chaveTelefone(telefone);
  if (chave) {
    const { data } = await db().from('personagens').select('id').eq('whatsapp_chave', chave).limit(1);
    personagemId = data?.[0]?.id ?? null;
  }
  if (!personagemId && src && /^[0-9a-f-]{36}$/i.test(src)) {
    const { data } = await db().from('personagens').select('id').eq('visitante_id', src).order('id', { ascending: false }).limit(1);
    personagemId = data?.[0]?.id ?? null;
  }

  const linha = {
    cakto_order_id: pedidoId,
    produto_id: produtoId,
    personagem_id: personagemId,
    status,
    valor_centavos: paraCentavos(primeiro(payload, CAMPOS.valor)),
    metodo: primeiro(payload, CAMPOS.metodo) ?? null,
    cliente_nome: primeiro(payload, CAMPOS.nome) ?? null,
    cliente_email: primeiro(payload, CAMPOS.email) ?? null,
    cliente_telefone: telefone ?? null,
    utm_source: primeiro(payload, CAMPOS.utmSource) ?? null,
    utm_campaign: primeiro(payload, CAMPOS.utmCampaign) ?? null,
    src_visitante: src ?? null,
    atualizado_em: new Date().toISOString(),
  };

  // Webhooks podem chegar fora de ordem: um "aguardando pagamento" atrasado não pode rebaixar um pedido
  // que já está pago (ele sumiria da colônia). Reembolso/chargeback/recusa continuam valendo por cima.
  if (status === 'pendente') {
    const { data: atual } = await db().from('pedidos').select('status').eq('cakto_order_id', pedidoId).maybeSingle();
    if (atual?.status === 'aprovado') linha.status = 'aprovado';
  }

  const { error } = await db().from('pedidos').upsert(linha, { onConflict: 'cakto_order_id' });
  if (error) throw new Error(error.message);

  const opcao = produtoId ? await ligarOpcao(pedidoId, produtoId, src, personagemId) : null;
  return `pedido ${pedidoId} → ${status}${personagemId ? ` (personagem ${personagemId})` : ''}${opcao ? ` [${opcao}]` : ''}`;
}

/**
 * O que a pessoa escolheu/escreveu na loja ou no pop-up do Mundo ao vivo (opção e texto, ex.: evento da Fúria
 * ou texto do outdoor): procura o último clique em "comprar" desse produto feito pelo mesmo visitante
 * (o `src` devolvido pela Cakto, ou o visitante do personagem comprador) e copia para o pedido.
 * Nunca sobrescreve o que já está no pedido. Se não achar, o comprador escolhe depois em /meus-itens.
 */
async function ligarOpcao(pedidoId: string, produtoId: number, src: string | undefined, personagemId: number | null) {
  const { data: produto } = await db().from('produtos').select('slug, opcoes, pergunta_texto').eq('id', produtoId).maybeSingle();
  const temOpcoes = !!produto && Array.isArray(produto.opcoes) && produto.opcoes.length > 0;
  if (!produto || (!temOpcoes && !produto.pergunta_texto)) return null;

  const { data: pedido } = await db().from('pedidos').select('opcao, texto_personalizado').eq('cakto_order_id', pedidoId).maybeSingle();
  const faltaOpcao = temOpcoes && !pedido?.opcao;
  const faltaTexto = !!produto.pergunta_texto && !pedido?.texto_personalizado;
  if (!faltaOpcao && !faltaTexto) return pedido?.opcao ?? null;

  const visitantes = new Set<string>();
  if (src && /^[0-9a-f-]{36}$/i.test(src)) visitantes.add(src);
  if (personagemId) {
    const { data: p } = await db().from('personagens').select('visitante_id').eq('id', personagemId).maybeSingle();
    if (p?.visitante_id) visitantes.add(p.visitante_id);
  }
  if (!visitantes.size) return pedido?.opcao ?? null;

  const busca = (campos: string) => db()
    .from('cliques').select(campos)
    .eq('tipo', 'checkout').eq('alvo', produto.slug).in('visitante_id', [...visitantes])
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  let { data: clique, error } = await busca('opcao, texto');
  if (error) ({ data: clique } = await busca('opcao'));   // sem a coluna texto (falta a migração 010)
  const c = (clique ?? {}) as { opcao?: string | null; texto?: string | null };

  if (faltaOpcao && c.opcao) {
    await db().from('pedidos').update({ opcao: c.opcao }).eq('cakto_order_id', pedidoId).is('opcao', null);
  }
  if (faltaTexto && c.texto) {
    await db().from('pedidos').update({ texto_personalizado: c.texto, personalizado_em: new Date().toISOString() })
      .eq('cakto_order_id', pedidoId).is('texto_personalizado', null);
  }
  return c.opcao ?? pedido?.opcao ?? null;
}
