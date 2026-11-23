/** minúsculo, sem acento, espaços colapsados — usado para busca */
export function normalizarBusca(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@._ -]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "@Fulano.Silva " → "fulano.silva" */
export function normalizarHandle(s: string): string {
  return s.trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9._]/g, '');
}

/**
 * WhatsApp → E.164. Aceita "(11) 99999-8888", "11999998888", "+55 11 9...".
 * Sem DDI assume Brasil. Retorna null se não parecer um número válido.
 */
export function normalizarWhatsapp(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (d.length < 12 || d.length > 15) return null;
  if (d.startsWith('55') && d.length !== 12 && d.length !== 13) return null;
  return '+' + d;
}

/** Mesma regra da coluna whatsapp_chave no banco: últimos 11 dígitos */
export function chaveTelefone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-11) : null;
}

export function reais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Nick do colono (login = nick + WhatsApp). 3 a 20 letras, números, "_" ou ".".
 * A chave (minúscula, sem acento) é única no banco: "Ána" e "ana" são o mesmo nick.
 */
const APELIDOS_RESERVADOS = new Set(['admin', 'adm', 'moderador', 'moderacao', 'suporte', 'sistema', 'colonia', 'vega', 'lia',
  'comandante', 'doutora', 'operacaomartezero', 'martezero', 'radio']);
export function chaveApelido(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_.]/g, '');
}
export function limparApelido(s: string): string {
  return s.trim().replace(/^@+/, '').replace(/\s+/g, '');
}
/** null se o nick é válido; senão a mensagem de erro. */
export function erroApelido(apelido: string): string | null {
  if (!/^[\p{L}\p{N}_.]{3,20}$/u.test(apelido)) return 'O nick precisa ter de 3 a 20 letras ou números (pode usar _ e .), sem espaço.';
  const k = chaveApelido(apelido);
  if (k.length < 3) return 'O nick precisa ter pelo menos 3 letras ou números.';
  if (/^nm\d+$/.test(k)) return 'O nick não pode parecer um código de colono.';
  if (APELIDOS_RESERVADOS.has(k.replace(/[_.]/g, ''))) return 'Esse nick é reservado. Escolha outro.';
  return null;
}

/**
 * Texto que vai aparecer em público (ex.: outdoor no mapa): sem links, sem telefone e com os palavrões
 * mais comuns mascarados. Filtro simples — a revisão do dono continua valendo para o episódio.
 */
const PALAVROES = ['porra', 'caralho', 'merda', 'puta', 'puto', 'fdp', 'buceta', 'cu', 'cuzao', 'cuzão', 'viado', 'arrombado',
  'piroca', 'pica', 'foder', 'fode', 'fodase', 'foda-se', 'vagabunda', 'vadia', 'corno', 'otario', 'otário', 'babaca', 'bosta', 'pau no cu'];
export function textoPublico(bruto: string | null | undefined, max = 60): string | null {
  let t = String(bruto ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  t = t.replace(/(https?:\/\/|www\.)\S+/gi, '').replace(/\S+\.(com|net|org|br|io|gg|me|ly)\b\S*/gi, '')   // links
       .replace(/\+?\d[\d\s().-]{7,}\d/g, '');                                                            // telefones
  for (const p of PALAVROES) {
    const re = new RegExp(String.raw`(^|[^\p{L}])(${p})(?=$|[^\p{L}])`, 'giu');
    t = t.replace(re, (_m, a: string, w: string) => a + w[0] + '*'.repeat(Math.max(1, w.length - 1)));
  }
  t = t.replace(/\s+/g, ' ').trim().slice(0, max);
  return t || null;
}
