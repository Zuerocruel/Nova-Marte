import type { Metadata } from 'next';
import LojaMoedas from '@/components/LojaMoedas';

export const metadata: Metadata = { title: 'Loja de moedas · Operação Marte Zero' };

export default function PaginaLojaMoedas() {
  return (
    <main className="wrap">
      <h1>Loja de moedas</h1>
      <p className="mudo">Gaste as moedas dos minigames e das missões em cores e trajes para o seu colono.</p>
      <LojaMoedas />
    </main>
  );
}
