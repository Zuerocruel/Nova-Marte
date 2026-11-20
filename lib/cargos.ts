import dados from '@/fabrica/cargos.json';

/** Cargos da colônia (fabrica/cargos.json — a mesma lista que a fábrica usa para escolher o herói do dia). */
export type Cargo = { id: string; emoji: string; nome: string; equipe: string; descricao: string; categorias: string[] };
export const CARGOS: Cargo[] = dados.cargos;
const POR_ID = new Map(CARGOS.map((c) => [c.id, c]));
export const cargoDe = (id: string | null | undefined): Cargo | null => (id ? POR_ID.get(id) ?? null : null);
