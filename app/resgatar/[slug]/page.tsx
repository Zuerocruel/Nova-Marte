import { notFound } from 'next/navigation';
import { db } from '@/lib/supabase';
import Resgate from '@/components/Resgate';

export const dynamic = 'force-dynamic';

export default async function ResgatarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: produto } = await db()
    .from('produtos').select('slug, nome, descricao, tipo, ativo, imagem_url').eq('slug', slug).maybeSingle();
  if (!produto || produto.tipo !== 'gratis' || !produto.ativo) notFound();

  return (
    <main className="wrap" style={{ maxWidth: 560 }}>
      <h1>{produto.nome}</h1>
      {produto.descricao && <p>{produto.descricao}</p>}
      <div className="caixa">
        <Resgate produto={produto.slug} />
      </div>
    </main>
  );
}
