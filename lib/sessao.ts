import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

/**
 * Sessão do colono (chat e "Meu perfil"): cookie assinado com HMAC, sem tabela no banco.
 *   valor = CODIGO.EXPIRA.ASSINATURA
 * Chave: SESSAO_SEGREDO; sem ela, derivada da service role (nunca sai do servidor).
 * Trocar SESSAO_SEGREDO desloga todo mundo.
 */
export const COOKIE_SESSAO = 'omz_sessao';
const DURACAO_S = 180 * 24 * 3600;   // 180 dias

function chave(): Buffer {
  const segredo = process.env.SESSAO_SEGREDO;
  if (segredo && segredo.length >= 32) return Buffer.from(segredo);
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error('SESSAO_SEGREDO / SUPABASE_SERVICE_ROLE_KEY não configurados');
  return createHash('sha256').update('omz-sessao:' + base).digest();
}

const assinar = (dados: string) => createHmac('sha256', chave()).update(dados).digest('base64url');

export function criarValor(codigo: string): string {
  const dados = `${codigo}.${Math.floor(Date.now() / 1000) + DURACAO_S}`;
  return `${dados}.${assinar(dados)}`;
}

export function lerValor(valor: string | undefined | null): string | null {
  if (!valor) return null;
  const partes = valor.split('.');
  if (partes.length !== 3) return null;
  const [codigo, exp, sig] = partes;
  if (!/^NM\d{6,}$/.test(codigo) || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return null;
  const esperado = Buffer.from(assinar(`${codigo}.${exp}`));
  const recebido = Buffer.from(sig);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido) ? codigo : null;
}

export function gravarSessao(res: NextResponse, codigo: string) {
  res.cookies.set(COOKIE_SESSAO, criarValor(codigo), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: DURACAO_S,
  });
}

export function apagarSessao(res: NextResponse) {
  res.cookies.set(COOKIE_SESSAO, '', { httpOnly: true, path: '/', maxAge: 0 });
}

/** Código do colono logado (server components / route handlers). */
export async function codigoDaSessao(): Promise<string | null> {
  return lerValor((await cookies()).get(COOKIE_SESSAO)?.value);
}
