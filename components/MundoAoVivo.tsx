'use client';
import { useCallback, useRef, useState } from 'react';
import Mundo from './Mundo';
import Chat from './Chat';
import ConviteBox from './ConviteBox';
import { useOnline } from './OnlineAgora';
import type { MensagemChat } from '@/app/api/chat/route';

/** Mapa ao vivo com o Rádio da colônia numa gaveta (botão roxo 💬, com o número de mensagens novas) e o link de
 * convite de quem está logado embaixo. As mensagens viram balões em cima de quem escreveu, com o chat aberto ou não. */
export default function MundoAoVivo({ codigoInicial, novo }: { codigoInicial?: string; novo?: boolean }) {
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [aberto, setAberto] = useState(false);
  const visto = useRef<number | null>(null);   // maior id já visto (null = ainda não carregou o histórico)
  const [vistoId, setVistoId] = useState(0);
  const aoMudar = useCallback((m: MensagemChat[]) => {
    setMensagens(m);
    if (visto.current === null && m.length) { visto.current = Math.max(...m.map((x) => x.id)); setVistoId(visto.current); }
  }, []);
  const online = useOnline();
  const maior = mensagens.length ? Math.max(...mensagens.map((x) => x.id)) : 0;
  const naoLidas = aberto ? 0 : mensagens.filter((m) => m.id > vistoId).length;
  const alternar = () => {
    setAberto((a) => { if (!a) { visto.current = maior; setVistoId(maior); } return !a; });
  };
  return (
    <>
      <Mundo codigoInicial={codigoInicial} novo={novo} mensagens={mensagens} online={online?.colonos_online}
             onlineN={online?.online} naoLidas={naoLidas} chatAberto={aberto} aoChat={alternar}
             chat={<Chat aoMudar={aoMudar} aoFechar={() => setAberto(false)} />} />
      <div style={{ marginTop: 16, maxWidth: 520 }}><ConviteBox /></div>
    </>
  );
}
