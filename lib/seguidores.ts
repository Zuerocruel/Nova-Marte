import 'server-only';
import { db } from './supabase';

export type Plataforma = 'instagram' | 'tiktok' | 'youtube';

export function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export async function salvarSnapshot(plataforma: Plataforma, seguidores: number, fonte: 'api' | 'manual', data = hojeSP()) {
  const { error } = await db()
    .from('seguidores_snapshot')
    .upsert({ plataforma, data, seguidores, fonte }, { onConflict: 'plataforma,data' });
  if (error) throw new Error(error.message);
}

async function youtube(): Promise<number | null> {
  const { YOUTUBE_API_KEY: key, YOUTUBE_CHANNEL_ID: id } = process.env;
  if (!key || !id) return null;
  const r = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${id}&key=${key}`, { cache: 'no-store' });
  const j = await r.json();
  const n = Number(j?.items?.[0]?.statistics?.subscriberCount);
  if (!Number.isFinite(n)) throw new Error(`YouTube: ${JSON.stringify(j).slice(0, 200)}`);
  return n;
}

async function instagram(): Promise<number | null> {
  const { IG_USER_ID: id, IG_ACCESS_TOKEN: token } = process.env;
  if (!id || !token) return null;
  const v = process.env.IG_GRAPH_VERSION || 'v24.0';
  const r = await fetch(`https://graph.facebook.com/${v}/${id}?fields=followers_count&access_token=${token}`, { cache: 'no-store' });
  const j = await r.json();
  if (typeof j?.followers_count !== 'number') throw new Error(`Instagram: ${JSON.stringify(j).slice(0, 200)}`);
  return j.followers_count;
}

/** TikTok: access token dura 24h → renova com o refresh token a cada execução e guarda o novo. */
async function tiktok(): Promise<number | null> {
  const { TIKTOK_CLIENT_KEY: ck, TIKTOK_CLIENT_SECRET: cs } = process.env;
  if (!ck || !cs) return null;
  const { data: salvo } = await db().from('integracoes').select('valor').eq('chave', 'tiktok_refresh_token').maybeSingle();
  const refresh = salvo?.valor ?? process.env.TIKTOK_REFRESH_TOKEN;
  if (!refresh) return null;

  const tr = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: ck, client_secret: cs, grant_type: 'refresh_token', refresh_token: refresh }),
    cache: 'no-store',
  });
  const tok = await tr.json();
  if (!tok?.access_token) throw new Error(`TikTok token: ${JSON.stringify(tok).slice(0, 200)}`);
  if (tok.refresh_token && tok.refresh_token !== refresh) {
    await db().from('integracoes').upsert({ chave: 'tiktok_refresh_token', valor: tok.refresh_token, atualizado_em: new Date().toISOString() });
  }

  const r = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=follower_count', {
    headers: { Authorization: `Bearer ${tok.access_token}` },
    cache: 'no-store',
  });
  const j = await r.json();
  const n = j?.data?.user?.follower_count;
  if (typeof n !== 'number') throw new Error(`TikTok: ${JSON.stringify(j).slice(0, 200)}`);
  return n;
}

export async function coletarTodos() {
  const fontes: [Plataforma, () => Promise<number | null>][] = [
    ['youtube', youtube], ['instagram', instagram], ['tiktok', tiktok],
  ];
  const resultado: Record<string, string> = {};
  for (const [p, fn] of fontes) {
    try {
      const n = await fn();
      if (n === null) { resultado[p] = 'não configurado (use o lançamento manual no painel)'; continue; }
      await salvarSnapshot(p, n, 'api');
      resultado[p] = String(n);
    } catch (e) {
      resultado[p] = `erro: ${String(e)}`;
    }
  }
  return resultado;
}
