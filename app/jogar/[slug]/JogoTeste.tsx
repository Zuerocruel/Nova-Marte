'use client';

import { useState } from 'react';
import Minigame from '@/components/Minigame';

export default function JogoTeste({ jogo }: { jogo: string }) {
  const [chave, setChave] = useState(0);
  return <Minigame key={chave} jogo={jogo} teste aoFechar={() => setChave((k) => k + 1)} />;
}
