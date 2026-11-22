'use client';
import { useCallback, useState } from 'react';
import Mundo from './Mundo';
import Chat from './Chat';
import ConviteBox from './ConviteBox';
import OnlineAgora, { useOnline } from './OnlineAgora';
import type { MensagemChat } from '@/app/api/chat/route';

/** Mapa ao vivo + chat da colônia lado a lado (as mensagens viram balões em cima das casas), quem está online
 * agora (pontinho verde na casa) e o link de convite de quem está logado. */
export default function MundoAoVivo({ codigoInicial, novo }: { codigoInicial?: string; novo?: boolean }) {
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const aoMudar = useCallback((m: MensagemChat[]) => setMensagens(m), []);
  const online = useOnline();
  return (
    <>
      <OnlineAgora o={online} />
      <div className="mundo-vivo">
        <Mundo codigoInicial={codigoInicial} novo={novo} mensagens={mensagens} online={online?.colonos_online} />
        <div style={{ display: 'grid', gap: 16 }}>
          <Chat aoMudar={aoMudar} />
          <ConviteBox />
        </div>
      </div>
    </>
  );
}
