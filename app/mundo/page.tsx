import MundoAoVivo from '@/components/MundoAoVivo';

export const metadata = { title: 'Mundo ao vivo — Operação Marte Zero' };

export default async function MundoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <main className="wrap wrap-largo">
      <p className="etiqueta">TRANSMISSÃO DIRETA DA COLÔNIA</p>
      <h1 className="titulo-secao">Mundo ao vivo</h1>
      <MundoAoVivo codigoInicial={sp.c} novo={sp.novo === '1'} />
    </main>
  );
}
