import { NextResponse, type NextRequest } from 'next/server';
import { gravarToque, toqueDaRequisicao } from './lib/origem';

/**
 * 1) Protege /painel e /api/painel com login básico.
 * 2) Em todas as páginas públicas: garante o visitante_id e grava a origem
 *    (utm_*, ?ref=, referer externo) nos cookies nm_ft / nm_lt.
 * /l/* e /comprar/* fazem o próprio rastreamento (ficam fora do matcher).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/painel') || pathname.startsWith('/api/painel')) {
    const user = process.env.PAINEL_USER;
    const pass = process.env.PAINEL_PASS;
    const auth = req.headers.get('authorization') ?? '';
    const [tipo, cred] = auth.split(' ');
    let ok = false;
    try { ok = !!user && !!pass && tipo === 'Basic' && !!cred && atob(cred) === `${user}:${pass}`; } catch {}
    if (!ok) {
      return new NextResponse('Acesso restrito', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Operacao Marte Zero painel", charset="UTF-8"' },
      });
    }
    return NextResponse.next();
  }

  const res = NextResponse.next();
  gravarToque(req, res, toqueDaRequisicao(req));
  return res;
}

export const config = {
  matcher: [
    '/((?!_next/|api/webhooks|api/cron|api/mundo|l/|comprar/|favicon|.*\\.(?:png|jpg|svg|ico|webp|txt)$).*)',
  ],
};
