import { notFound } from 'next/navigation';
import JogoTeste from './JogoTeste';

/** Página do minigame em MODO TESTE (sem login, sem moedas, nada gravado). Usada pela aba Minigames do painel
 * para testar antes de ligar no site. Fora do teste, os jogos abrem pela Central do colono. */
export default async function PaginaJogo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!['laser', 'meteoros', 'reator'].includes(slug)) notFound();
  return (
    <main className="wrap" style={{ maxWidth: 520 }}>
      <JogoTeste jogo={slug} />
    </main>
  );
}
