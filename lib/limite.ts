/**
 * Limite de requisições simples, em memória, por instância.
 * Segura curiosos e scripts ingênuos. Em escala real (milhares de cadastros/hora,
 * várias instâncias), troque por Upstash Ratelimit ou Cloudflare Turnstile —
 * veja docs/ESCALA.md.
 */
const baldes = new Map<string, { n: number; ate: number }>();

export function permitido(chave: string, max: number, janelaMs: number): boolean {
  const agora = Date.now();
  const b = baldes.get(chave);
  if (!b || b.ate < agora) {
    baldes.set(chave, { n: 1, ate: agora + janelaMs });
    if (baldes.size > 50_000) baldes.clear();
    return true;
  }
  b.n++;
  return b.n <= max;
}

export function ipDe(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'desconhecido';
}
