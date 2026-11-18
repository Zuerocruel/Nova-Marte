import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cliente: SupabaseClient | null = null;

/** Cliente com service role. Só roda no servidor (rotas, server components, actions). */
export function db(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados');
  cliente = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cliente;
}
