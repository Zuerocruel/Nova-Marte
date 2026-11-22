'use client';

import { useEffect, useState } from 'react';

export type Online = { online: number; colonos_online: string[]; total_colonos: number };

/** "Estou aqui" a cada 45 s (aba visível) + quantos estão online agora e quantos colonos a série tem. */
export function useOnline(): Online | null {
  const [o, setO] = useState<Online | null>(null);
  useEffect(() => {
    const ping = () => { if (document.visibilityState === 'visible') fetch('/api/presenca', { method: 'POST' }).catch(() => {}); };
    const ler = () => fetch('/api/presenca').then((r) => r.json()).then(setO).catch(() => {});
    ping(); setTimeout(ler, 800);
    const a = setInterval(ping, 45_000), b = setInterval(ler, 30_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);
  return o;
}

export default function OnlineAgora({ o }: { o: Online | null }) {
  if (!o) return null;
  return (
    <p className="online-agora">
      <span><span className="ponto" /> <b>{Math.max(1, o.online)}</b> online agora</span>
      <span>👨‍🚀 <b>{o.total_colonos}</b> colonos na série</span>
      <a href="/central">🎮 Central do colono</a>
    </p>
  );
}
