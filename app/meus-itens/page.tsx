import MeusItens from '@/components/MeusItens';

export const metadata = { title: 'Meus itens — Operação Marte Zero' };

export default function MeusItensPage() {
  return (
    <main className="wrap" style={{ maxWidth: 680 }}>
      <p className="etiqueta">SEU INVENTÁRIO</p>
      <h1 className="titulo-secao">Meus itens</h1>
      <p className="mudo">Veja o que você comprou e escolha a opção ou os detalhes de cada item.</p>
      <MeusItens />
    </main>
  );
}
