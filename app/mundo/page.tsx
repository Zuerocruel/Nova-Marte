import MundoAoVivo from '@/components/MundoAoVivo';
import RedesSociais from '@/components/RedesSociais';

export const metadata = { title: 'Mundo ao vivo — Operação Marte Zero' };

export default async function MundoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <main className="wrap wrap-largo">
      <p className="etiqueta">TRANSMISSÃO DIRETA DA COLÔNIA</p>
      <h1 className="titulo-secao">Mundo ao vivo</h1>
      <RedesSociais titulo="Comente nos episódios: a Vega e a Lia respondem!" compacto />
      <MundoAoVivo codigoInicial={sp.c} novo={sp.novo === '1'} />
    </main>
  );
}
