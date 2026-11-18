/**
 * Rastreamento de origem ("de onde a pessoa veio").
 *
 * Três cookies, todos first-party:
 *   nm_vid  → id anônimo do visitante (uuid), dura ~400 dias
 *   nm_ft   → PRIMEIRO toque (gravado uma vez, nunca sobrescrito)
 *   nm_lt   → ÚLTIMO toque (sobrescrito a cada nova origem)
 *
 * Um "toque" nasce de: link rastreável /l/<slug>, parâmetros utm_* / ?ref=,
 * ou referer externo (instagram.com, tiktok.com, youtube.com, google...).
 * Este arquivo roda no edge (middleware) e no Node — sem dependências.
 */
import type { NextRequest, NextResponse } from 'next/server';

export type Toque = {
  s?: string;  // source
  m?: string;  // medium
  c?: string;  // campaign
  t?: string;  // content
  l?: string;  // link slug
  r?: string;  // referer host
  p?: string;  // landing path
  at: string;  // ISO
};

export const COOKIE_VID = 'nm_vid';
export const COOKIE_FT = 'nm_ft';
export const COOKIE_LT = 'nm_lt';
const UM_ANO = 60 * 60 * 24 * 400;

const REFERERS: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(facebook\.com|fb\.com)$/, 'facebook'],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp'],
  [/(^|\.)google\./, 'google'],
  [/(^|\.)(t\.co|x\.com|twitter\.com)$/, 'x'],
];

function corta(v: string | null | undefined, n = 80) {
  return v ? v.slice(0, n) : undefined;
}

/** Extrai um toque da URL/referer. Retorna null se a visita não traz origem nova. */
export function toqueDaRequisicao(req: NextRequest): Toque | null {
  const sp = req.nextUrl.searchParams;
  const utmSource = sp.get('utm_source') ?? sp.get('ref');
  let refHost: string | undefined;
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      const h = new URL(referer).host;
      if (h !== req.nextUrl.host) refHost = h;
    } catch {}
  }
  if (!utmSource && !refHost) return null;

  let source = utmSource ?? undefined;
  if (!source && refHost) source = REFERERS.find(([re]) => re.test(refHost!))?.[1] ?? refHost;

  return {
    s: corta(source?.toLowerCase()),
    m: corta(sp.get('utm_medium')),
    c: corta(sp.get('utm_campaign')),
    t: corta(sp.get('utm_content')),
    r: corta(refHost),
    p: corta(req.nextUrl.pathname, 200),
    at: new Date().toISOString(),
  };
}

export function lerToque(valor: string | undefined): Toque | null {
  if (!valor) return null;
  try {
    return JSON.parse(decodeURIComponent(valor)) as Toque;
  } catch {
    return null;
  }
}

/** visitante_id do cookie, ou um novo (ainda não gravado). */
export function obterVisitante(req: NextRequest): { vid: string; novo: boolean } {
  const atual = req.cookies.get(COOKIE_VID)?.value;
  return atual ? { vid: atual, novo: false } : { vid: crypto.randomUUID(), novo: true };
}

/** Grava os cookies de origem na resposta. Retorna o visitante_id em uso. */
export function gravarToque(
  req: NextRequest,
  res: NextResponse,
  toque: Toque | null,
  visitante = obterVisitante(req),
): string {
  const opts = { path: '/', maxAge: UM_ANO, sameSite: 'lax' as const, httpOnly: true, secure: true };
  const vid = visitante.vid;
  if (visitante.novo) res.cookies.set(COOKIE_VID, vid, opts);
  if (toque) {
    const v = encodeURIComponent(JSON.stringify(toque));
    if (!req.cookies.get(COOKIE_FT)) res.cookies.set(COOKIE_FT, v, opts);
    res.cookies.set(COOKIE_LT, v, opts);
  }
  return vid;
}
