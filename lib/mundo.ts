/** Geometria do mundo — precisa bater com as colunas geradas pos_x/pos_y no banco. */
export const LARGURA_MUNDO = 256;   // casas por linha  ((id-1) % 256)
export const CHUNK = 32;            // quarteirão carregado de uma vez
export const CHUNKS_POR_LINHA = LARGURA_MUNDO / CHUNK;

export type PersonagemPublico = {
  codigo: string;
  nome: string;
  handle: string;
  plataforma: string;
  status: 'fila' | 'desenhado' | 'estreou';
  pos_x: number;
  pos_y: number;
  seed: number;
  sprite_url: string | null;
};
