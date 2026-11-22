export type Opcao = { valor: string; rotulo: string };

/** Lê a coluna produtos.opcoes com segurança (jsonb vindo do banco). */
export function lerOpcoes(v: unknown): Opcao[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((o): o is Opcao => !!o && typeof o.valor === 'string' && typeof o.rotulo === 'string')
    .slice(0, 300);   // bandeira do colono: ~200 países
}

export function rotuloDe(opcoes: unknown, valor: string | null | undefined): string | null {
  if (!valor) return null;
  return lerOpcoes(opcoes).find((o) => o.valor === valor)?.rotulo ?? valor;
}
