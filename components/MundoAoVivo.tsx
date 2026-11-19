'use client';
import { useCallback, useState } from 'react';
import Mundo from './Mundo';
import Chat from './Chat';
import type { MensagemChat } from '@/app/api/chat/route';

/** Mapa ao vivo + rádio da colônia lado a lado (as mensagens viram balões em cima das casas). */
export default function MundoAoVivo({ codigoInicial, novo }: { codigoInicial?: string; novo?: boolean }) {
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const aoMudar = useCallback((m: MensagemChat[]) => setMensagens(m), []);
  return (
    <div className="mundo-vivo">
      <Mundo codigoInicial={codigoInicial} novo={novo} mensagens={mensagens} />
      <Chat aoMudar={aoMudar} />
    </div>
  );
}
