import Mundo from '@/components/Mundo';

export const metadata = { title: 'Mundo ao vivo — NovaMarte' };

export default async function MundoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <main className="wrap">
      <h1>Mundo ao vivo</h1>
      <Mundo codigoInicial={sp.c} novo={sp.novo === '1'} />
    </main>
  );
}
