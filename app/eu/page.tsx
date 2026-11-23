import { redirect } from 'next/navigation';
import Entrar from '@/components/Entrar';
import { codigoDaSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Meu perfil — Operação Marte Zero' };

/** "Meu perfil": logado vai direto para /colono/NM…; senão, entra com nick + WhatsApp. */
export default async function Eu() {
  const codigo = await codigoDaSessao();
  if (codigo) redirect(`/colono/${codigo}`);
  return (
    <main className="wrap" style={{ maxWidth: 520 }}>
      <p className="etiqueta">ACESSO DO COLONO</p>
      <h1 className="titulo-secao">Meu perfil</h1>
      <div className="caixa"><Entrar /></div>
    </main>
  );
}
