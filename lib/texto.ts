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
