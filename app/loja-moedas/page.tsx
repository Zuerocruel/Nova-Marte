import type { Metadata } from 'next';
import LojaMoedas from '@/components/LojaMoedas';

export const metadata: Metadata = { title: 'Loja de moedas · Operação Marte Zero' };

export default function PaginaLojaMoedas() {
  return (
    <main className="pagina-ferrugem">
     <div className="wrap">
      <p className="etiqueta">TROCA DE MOEDAS</p>
      <h1 className="titulo-secao">Loja de moedas</h1>
      <p className="sub-secao">Gaste as moedas dos minigames e das missões em cores e trajes para o seu colono.</p>
      <LojaMoedas />
     </div>
    </main>
  );
}
