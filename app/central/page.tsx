import type { Metadata } from 'next';
import Central from '@/components/Central';

export const metadata: Metadata = { title: 'Central do colono · Operação Marte Zero' };

export default function PaginaCentral() {
  return (
    <main className="wrap">
      <h1>Central do colono</h1>
      <p className="mudo">Missões, minigames, moedas e ranking. Volte todo dia: as missões renovam à meia-noite.</p>
      <Central />
    </main>
  );
}
